import { FieldValue } from 'firebase-admin/firestore';

export const TRANSCRIPTION_DAILY_LIMIT = 5;
export const TRANSCRIPTION_MONTHLY_LIMIT = 50;

function utcPeriod(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);

  return {
    dayKey,
    monthKey,
    dayStart: new Date(Date.UTC(year, month, day)),
    dayReset: new Date(Date.UTC(year, month, day + 1)),
    monthStart: new Date(Date.UTC(year, month, 1)),
    monthReset: new Date(Date.UTC(year, month + 1, 1)),
  };
}

function periodRef(db, uid, periodId) {
  return db
    .collection('usage')
    .doc(uid)
    .collection('transcriptionLimits')
    .doc(periodId);
}

function countFromSnap(snap) {
  return snap.exists ? Number(snap.data().count || 0) : 0;
}

function limitError(type, used, limit, resetAt) {
  const noun = type === 'daily' ? 'daily' : 'monthly';
  const message = `You have reached your ${noun} transcription limit (${limit}). Try again after the limit resets.`;
  const err = new Error(message);
  err.code = 'TRANSCRIPTION_LIMIT_EXCEEDED';
  err.statusCode = 429;
  err.payload = {
    error: message,
    code: err.code,
    limitType: type,
    usage: {
      [type]: {
        used,
        limit,
        remaining: 0,
        resetAt: resetAt.toISOString(),
      },
    },
  };
  return err;
}

export function isTranscriptionLimitError(err) {
  return err?.code === 'TRANSCRIPTION_LIMIT_EXCEEDED';
}

export async function getTranscriptionUsage(db, uid, now = new Date()) {
  const period = utcPeriod(now);
  const dailyRef = periodRef(db, uid, `day_${period.dayKey}`);
  const monthlyRef = periodRef(db, uid, `month_${period.monthKey}`);
  const [dailySnap, monthlySnap] = await Promise.all([
    dailyRef.get(),
    monthlyRef.get(),
  ]);

  const dailyUsed = countFromSnap(dailySnap);
  const monthlyUsed = countFromSnap(monthlySnap);

  return {
    daily: {
      used: dailyUsed,
      limit: TRANSCRIPTION_DAILY_LIMIT,
      remaining: Math.max(0, TRANSCRIPTION_DAILY_LIMIT - dailyUsed),
      resetAt: period.dayReset.toISOString(),
    },
    monthly: {
      used: monthlyUsed,
      limit: TRANSCRIPTION_MONTHLY_LIMIT,
      remaining: Math.max(0, TRANSCRIPTION_MONTHLY_LIMIT - monthlyUsed),
      resetAt: period.monthReset.toISOString(),
    },
  };
}

export async function reserveTranscriptionUsage(db, uid, now = new Date()) {
  const period = utcPeriod(now);
  const dailyRef = periodRef(db, uid, `day_${period.dayKey}`);
  const monthlyRef = periodRef(db, uid, `month_${period.monthKey}`);

  const usage = await db.runTransaction(async (tx) => {
    const [dailySnap, monthlySnap] = await Promise.all([
      tx.get(dailyRef),
      tx.get(monthlyRef),
    ]);

    const dailyUsed = countFromSnap(dailySnap);
    const monthlyUsed = countFromSnap(monthlySnap);

    if (dailyUsed >= TRANSCRIPTION_DAILY_LIMIT) {
      throw limitError('daily', dailyUsed, TRANSCRIPTION_DAILY_LIMIT, period.dayReset);
    }

    if (monthlyUsed >= TRANSCRIPTION_MONTHLY_LIMIT) {
      throw limitError('monthly', monthlyUsed, TRANSCRIPTION_MONTHLY_LIMIT, period.monthReset);
    }

    const nextDaily = dailyUsed + 1;
    const nextMonthly = monthlyUsed + 1;

    tx.set(dailyRef, {
      periodType: 'day',
      periodKey: period.dayKey,
      count: nextDaily,
      limit: TRANSCRIPTION_DAILY_LIMIT,
      startsAt: period.dayStart,
      resetsAt: period.dayReset,
      updatedAt: FieldValue.serverTimestamp(),
      ...(dailySnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    tx.set(monthlyRef, {
      periodType: 'month',
      periodKey: period.monthKey,
      count: nextMonthly,
      limit: TRANSCRIPTION_MONTHLY_LIMIT,
      startsAt: period.monthStart,
      resetsAt: period.monthReset,
      updatedAt: FieldValue.serverTimestamp(),
      ...(monthlySnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    return {
      daily: {
        used: nextDaily,
        limit: TRANSCRIPTION_DAILY_LIMIT,
        remaining: TRANSCRIPTION_DAILY_LIMIT - nextDaily,
        resetAt: period.dayReset.toISOString(),
      },
      monthly: {
        used: nextMonthly,
        limit: TRANSCRIPTION_MONTHLY_LIMIT,
        remaining: TRANSCRIPTION_MONTHLY_LIMIT - nextMonthly,
        resetAt: period.monthReset.toISOString(),
      },
    };
  });

  return { uid, dailyRef, monthlyRef, usage };
}

export async function releaseTranscriptionUsage(db, reservation) {
  if (!db || !reservation) return;

  try {
    await db.runTransaction(async (tx) => {
      const [dailySnap, monthlySnap] = await Promise.all([
        tx.get(reservation.dailyRef),
        tx.get(reservation.monthlyRef),
      ]);

      if (dailySnap.exists) {
        tx.update(reservation.dailyRef, {
          count: Math.max(0, countFromSnap(dailySnap) - 1),
          updatedAt: FieldValue.serverTimestamp(),
          lastReleasedAt: FieldValue.serverTimestamp(),
        });
      }

      if (monthlySnap.exists) {
        tx.update(reservation.monthlyRef, {
          count: Math.max(0, countFromSnap(monthlySnap) - 1),
          updatedAt: FieldValue.serverTimestamp(),
          lastReleasedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (err) {
    console.error('[usage] failed to release transcription reservation:', err.message);
  }
}

# VoiceCast 🎙️

> Audio transcription web app powered by Whisper AI

**Live:** https://voicecast-topaz.vercel.app

## Stack

- **Frontend:** Vanilla HTML/CSS/JS — Space Mono + lime `#CAFF3C` on near-black `#0A0F08`
- **Proxy:** Vercel serverless functions (`/api/transcribe`, `/api/health`)
- **Auth:** Email/password and Google Sign-In with JWT HttpOnly sessions protecting `/app.html` and transcription
- **Backend:** Whisper AI transcription API on Railway

## Structure

```
api/
  transcribe.js   # Proxy POST /transcribe → Railway backend
  health.js       # Proxy GET /health → Railway backend
public/
  index.html      # Public landing page
  login.html      # Login page
  signup.html     # Signup page
protected/
  app.html        # Authenticated transcription app served by /api/app
vercel.json       # Routing config
```

## Development

Edit `protected/app.html` for authenticated app UI changes and `public/index.html` for landing-page changes. Push to `dev` branch — Vercel auto-deploys.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Backend health check |
| `POST` | `/api/transcribe` | Authenticated audio upload for transcription |
| `POST` | `/api/auth/login` | Log in and set the session cookie |
| `POST` | `/api/auth/signup` | Create an account and set the session cookie |
| `POST` | `/api/auth/google` | Verify Google ID token and set the session cookie |
| `GET` | `/api/auth/firebase-token` | Exchange the current session for a Firebase Auth custom token |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/auth/me` | Return the authenticated user profile |

## Environment Variables

Required for auth and persistence:

- `JWT_SECRET` — signs VoiceCast session tokens
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_WEB_API_KEY` — public Firebase web app API key for browser Firestore history
- `FIREBASE_AUTH_DOMAIN` — usually `<project-id>.firebaseapp.com`
- `GOOGLE_CLIENT_ID` — OAuth web client ID used by Google Identity Services

Transcript history is saved directly from the authenticated browser session to Firestore at:

```
users/{uid}/transcripts/{transcriptId}
```

Deploy `firestore.rules` so each Firebase Auth user can only read and write their own transcript history.

### POST /api/transcribe

Each authenticated user can run up to **5 transcriptions per UTC day** and **50 transcriptions per UTC month**. Successful responses include remaining usage in `usage.daily` and `usage.monthly`; limit failures return HTTP `429`.

**Body:** `multipart/form-data`
- `file` (required) — audio file `.m4a`, `.wav`, `.mp3`, `.ogg`, `.flac`
- `language` (optional) — ISO code e.g. `en`, `hi`, `es`
- `model` (optional) — `tiny`, `base`, `small`, `medium`, `large`

**Response:**
```json
{ "text": "transcribed content here", "language": "en" }
```

---
Built by [aj](https://www.instagram.com/hey__jay93)

/**
 * lib/mongodb.js
 *
 * Singleton MongoClient with connection caching across Vercel serverless
 * function invocations. Vercel preserves the Node.js module cache between
 * warm invocations, so this avoids opening a new connection on every request.
 *
 * Atlas free-tier M0 allows ~500 concurrent connections.
 * We cap the pool at 10 to stay well within limits.
 */

import { MongoClient, ServerApiVersion } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME     = process.env.MONGODB_DB || 'voicecast';

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable in your Vercel project settings.\n' +
    'Format: mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority'
  );
}

let cachedClient = null;
let cachedDb     = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version:           ServerApiVersion.v1,
      strict:            true,
      deprecationErrors: true,
    },
    maxPoolSize:     10,
    minPoolSize:     1,
    socketTimeoutMS:  30_000,
    connectTimeoutMS: 10_000,
  });

  await client.connect();
  const db = client.db(DB_NAME);
  await bootstrapIndexes(db);

  cachedClient = client;
  cachedDb     = db;

  return { client, db };
}

async function bootstrapIndexes(db) {
  const users       = db.collection('users');
  const transcripts = db.collection('transcripts');

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' }),
    users.createIndex({ firstName: 'text', lastName: 'text' }, { name: 'users_text' }),
    transcripts.createIndex({ userId: 1, createdAt: -1 }, { name: 'transcripts_by_user' }),
    transcripts.createIndex({ text: 'text', fileName: 'text' }, { name: 'transcripts_text' }),
    transcripts.createIndex({ userId: 1, language: 1 }, { name: 'transcripts_lang_facet' }),
    transcripts.createIndex({ userId: 1, model: 1 },    { name: 'transcripts_model_facet' }),
  ]);
}

export async function getDb() {
  const { db } = await connectToDatabase();
  return db;
}
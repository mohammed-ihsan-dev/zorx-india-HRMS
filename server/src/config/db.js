import mongoose from 'mongoose';
import { env } from './env.js';
import * as models from '../models/index.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDb,
  });

  console.log(`[db] connected to MongoDB database "${env.mongoDb}"`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  return mongoose.connection;
}

/**
 * Makes every collection visible in Compass / Atlas even before its first document.
 * Not needed to serve requests (MongoDB creates collections on first write), so the
 * server runs it in the background after it has started — it used to cost one
 * database round trip per model (~17) before the port opened on every cold start.
 */
export async function ensureCollections() {
  await Promise.all(
    Object.values(models)
      .filter((model) => model && typeof model.createCollection === 'function')
      .map((model) => model.createCollection().catch(() => {})) // already exists
  );
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

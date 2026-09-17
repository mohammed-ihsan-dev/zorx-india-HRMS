import mongoose from 'mongoose';
import { env } from './env.js';
import * as models from '../models/index.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDb,
  });

  console.log(`[db] connected to MongoDB database "${env.mongoDb}"`);

  // Ensure all collections exist in MongoDB (Compass / Atlas)
  const modelList = Object.values(models);
  for (const model of modelList) {
    if (model && typeof model.createCollection === 'function') {
      try {
        await model.createCollection();
      } catch {
        // Ignore if collection already exists
      }
    }
  }

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

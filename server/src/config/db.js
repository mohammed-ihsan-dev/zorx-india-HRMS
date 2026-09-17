import mongoose from 'mongoose';
import { env } from './env.js';

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

export async function disconnectDB() {
  await mongoose.disconnect();
}

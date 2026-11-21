import { createApp } from './app.js';
import { connectDB, ensureCollections } from './config/db.js';
import { env } from './config/env.js';
import { migrateContentCalendarClients } from './seed/migrateContentCalendarClients.js';
import { getMailProvider, mailConfigWarnings } from './services/mailService.js';

async function main() {
  // Cold start (Render Free wakes the instance on the first request): open the port
  // at once and connect to MongoDB in parallel. API requests wait for the database
  // (createApp's dbReady gate); /health and /api/version answer immediately.
  const dbReady = connectDB();
  dbReady
    .then(() =>
      // Housekeeping, off the request path.
      Promise.all([
        ensureCollections(),
        migrateContentCalendarClients().catch((err) => console.error('[server] Migration warning:', err)),
      ])
    )
    .catch((err) => {
      console.error('[server] Failed to connect to MongoDB:', err);
      process.exit(1);
    });
  const app = createApp({ dbReady });
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] ZORX INDIA API listening on port ${env.port} (${env.nodeEnv})`);
    console.log(`[mail] provider: ${getMailProvider() || 'none'}`);
    for (const w of mailConfigWarnings()) console.warn(`[mail] WARNING: ${w}`);
    // Names/cloud only — the API key and secret are never logged.
    if (env.cloudinary.enabled) {
      console.log(`[images] Cloudinary (cloud "${env.cloudinary.cloudName}", folder "${env.cloudinary.folder}")`);
    } else if (env.cloudinary.expected) {
      console.error(`[images] ERROR: Cloudinary is required but not usable — profile picture uploads are refused until fixed. ${env.cloudinary.problem}`);
    } else {
      console.warn(`[images] WARNING: Cloudinary not configured — profile pictures are stored on local disk (development only). ${env.cloudinary.problem}`);
    }
  });
}

main().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

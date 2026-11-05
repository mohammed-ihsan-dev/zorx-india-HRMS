import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { migrateContentCalendarClients } from './seed/migrateContentCalendarClients.js';
import { getMailProvider, mailConfigWarnings } from './services/mailService.js';

async function main() {
  await connectDB();
  await migrateContentCalendarClients().catch((err) => console.error('[server] Migration warning:', err));
  const app = createApp();
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

import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { migrateContentCalendarClients } from './seed/migrateContentCalendarClients.js';

async function main() {
  await connectDB();
  await migrateContentCalendarClients().catch((err) => console.error('[server] Migration warning:', err));
  const app = createApp();
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] ZORX INDIA API listening on port ${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

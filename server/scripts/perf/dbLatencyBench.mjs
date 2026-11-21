/**
 * DB-latency benchmark (local only — never touches a real database).
 *
 * Production runs the API on Render (US West) and MongoDB Atlas in Mumbai, so
 * every sequential query costs one trans-Pacific round trip. This starts an
 * in-memory MongoDB behind a TCP proxy that adds RTT_MS per round trip, then
 * times the real Express app's attendance-critical endpoints.
 *
 *   node scripts/perf/dbLatencyBench.mjs            # RTT 230 ms
 *   RTT_MS=0 node scripts/perf/dbLatencyBench.mjs   # no added latency
 */
import net from 'node:net';
import { MongoMemoryServer } from 'mongodb-memory-server';

const RTT_MS = Number(process.env.RTT_MS ?? 230);
const RUNS = Number(process.env.RUNS ?? 5);

const mongod = await MongoMemoryServer.create();
const target = new URL(mongod.getUri());
const half = RTT_MS / 2;
const proxy = net.createServer((client) => {
  const upstream = net.connect(Number(target.port), target.hostname);
  const pipe = (from, to) => from.on('data', (chunk) => (half ? setTimeout(() => to.write(chunk), half) : to.write(chunk)));
  pipe(client, upstream);
  pipe(upstream, client);
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on('error', close); upstream.on('error', close); client.on('close', close); upstream.on('close', close);
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));

// Configure BEFORE importing the app, so server/.env can never supply a real database.
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: `mongodb://127.0.0.1:${proxy.address().port}/`,
  MONGODB_DB: 'zorx-bench',
  JWT_SECRET: 'bench-secret',
  CLOUDINARY_URL: '', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
  // Production defaults for the short caches (NODE_ENV=test would turn them off).
  PRINCIPAL_CACHE_MS: process.env.PRINCIPAL_CACHE_MS ?? '15000',
  SETTINGS_CACHE_MS: process.env.SETTINGS_CACHE_MS ?? '30000',
  OFFICE_LATITUDE: '10.991401', OFFICE_LONGITUDE: '76.442772', OFFICE_ATTENDANCE_RADIUS: '200',
});
const { default: request } = await import('supertest');
const { connectDB, disconnectDB } = await import('../../src/config/db.js');
const { createApp } = await import('../../src/app.js');
const { User } = await import('../../src/models/User.js');
const { Employee } = await import('../../src/models/Employee.js');
const { OfficeSettings } = await import('../../src/models/OfficeSettings.js');

const t0 = performance.now();
await connectDB();
const connectMs = performance.now() - t0;

await OfficeSettings.create({ officeName: 'ZORX INDIA', latitude: 10.991401, longitude: 76.442772, attendanceRadius: 200, workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: 'Asia/Kolkata' });
const passwordHash = await User.hashPassword('Bench@12345');
const people = [];
for (let i = 0; i < RUNS; i++) {
  const user = await User.create({ email: `bench${i}@zorx.test`, passwordHash, role: 'EMPLOYEE' });
  const emp = await Employee.create({ userId: user._id, employeeCode: `B${i}`, firstName: `Bench${i}`, lastName: 'T', joiningDate: new Date('2024-01-01') });
  user.employeeId = emp._id;
  await user.save();
  people.push(user.email);
}

const app = createApp();
const NEW_CLIENT = { 'X-ZORX-Client': 'session', 'X-ZORX-CSRF': '1' };
const at = { latitude: 10.991401, longitude: 76.442772 };
const timings = {};
const time = async (name, fn) => {
  const s = performance.now();
  const res = await fn();
  (timings[name] ||= []).push(performance.now() - s);
  if (res.status >= 400) throw new Error(`${name} → ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
  return res;
};

for (const email of people) {
  const agent = request.agent(app);
  const login = await time('POST /auth/login', () => agent.post('/api/auth/login').set(NEW_CLIENT).send({ email, password: 'Bench@12345' }));
  let token = login.body.data.accessToken || login.body.data.token;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  // Session restore on app open: /auth/refresh where available, else /auth/me.
  const refresh = await agent.post('/api/auth/refresh').set(NEW_CLIENT);
  if (refresh.status === 404) await time('restore session', () => agent.get('/api/auth/me').set(auth()));
  else {
    await time('restore session', () => agent.post('/api/auth/refresh').set(NEW_CLIENT));
    await time('restore session + today', () => agent.post('/api/auth/refresh?include=today').set(NEW_CLIENT));
  }
  const again = await agent.post('/api/auth/refresh').set(NEW_CLIENT);
  if (again.status === 200) token = again.body.data.accessToken;
  await time('GET /auth/me', () => agent.get('/api/auth/me').set(auth()));
  await time('GET /attendance/me/today', () => agent.get('/api/attendance/me/today').set(auth()));
  await time('POST /attendance/check-in', () => agent.post('/api/attendance/check-in').set(auth()).send(at));
  await time('POST /attendance/check-out', () => agent.post('/api/attendance/check-out').set(auth()).send(at));
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`\nDB round trip ${RTT_MS} ms · ${RUNS} runs each (median)\n`);
console.log(`${'startup: connectDB'.padEnd(28)} ${connectMs.toFixed(0).padStart(6)} ms`);
for (const [k, v] of Object.entries(timings)) console.log(`${k.padEnd(28)} ${median(v).toFixed(0).padStart(6)} ms  ≈ ${(median(v) / (RTT_MS || 1)).toFixed(1)} round trips`);

await disconnectDB();
proxy.close();
await mongod.stop();
process.exit(0);

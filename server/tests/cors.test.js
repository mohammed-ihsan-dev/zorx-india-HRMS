import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('CORS policy configuration', () => {
  test('handles OPTIONS preflight for https://www.zorxindia.online correctly', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://www.zorxindia.online')
      .set('Access-Control-Request-Method', 'POST');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('https://www.zorxindia.online');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('handles OPTIONS preflight for https://zorxindia.online correctly', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://zorxindia.online')
      .set('Access-Control-Request-Method', 'POST');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('https://zorxindia.online');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('includes CORS headers on POST /api/auth/login for https://www.zorxindia.online', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://www.zorxindia.online')
      .send({ email: 'nonexistent@test.com', password: 'Password' });

    expect(res.headers['access-control-allow-origin']).toBe('https://www.zorxindia.online');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

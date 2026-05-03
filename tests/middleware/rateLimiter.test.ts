import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { globalLimiter, strictLimiter } from '../../src/middleware/rateLimiter';

describe('middleware/rateLimiter', () => {
  const createApp = (limiter: any) => {
    const app = express();
    app.set('trust proxy', 1); // Respect X-Forwarded-For
    app.use(limiter);
    app.get('/', (req, res) => res.status(200).send('OK'));
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // We need to test the logic with a non-localhost IP. 
    // supertest uses 127.0.0.1 by default, which skips the limiter.
  });

  it('should skip rate limiting for localhost (127.0.0.1)', async () => {
    const app = createApp(strictLimiter);
    // Send 40 requests (strictLimiter max is 30)
    for (let i = 0; i < 40; i++) {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
    }
  });

  it('should apply global rate limiting for non-localhost IPs', async () => {
    const app = createApp(globalLimiter);
    const ip = '203.0.113.1'; // Fake IP

    // Make 200 requests (the limit)
    const promises = [];
    for (let i = 0; i < 200; i++) {
      promises.push(request(app).get('/').set('X-Forwarded-For', ip));
    }
    const results = await Promise.all(promises);
    results.forEach(res => expect(res.status).toBe(200));

    // The 201st request should fail with 429
    const res = await request(app).get('/').set('X-Forwarded-For', ip);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: 'rate_limit_exceeded',
      message: 'Demasiadas peticiones. Por favor, espera antes de volver a intentarlo.',
      retry_after_seconds: expect.any(Number),
      source: 'internal',
      timestamp: expect.any(String),
    });
  });

  it('should apply strict rate limiting for non-localhost IPs (max 30)', async () => {
    const app = createApp(strictLimiter);
    const ip = '203.0.113.2'; // Another Fake IP

    // Make 30 requests (the limit)
    const promises = [];
    for (let i = 0; i < 30; i++) {
      promises.push(request(app).get('/').set('X-Forwarded-For', ip));
    }
    const results = await Promise.all(promises);
    results.forEach(res => expect(res.status).toBe(200));

    // The 31st request should fail with 429
    const res = await request(app).get('/').set('X-Forwarded-For', ip);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate_limit_exceeded');
  });
});

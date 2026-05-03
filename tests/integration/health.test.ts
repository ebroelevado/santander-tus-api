import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

// We can mock external calls if needed, but for /health we can test the degraded response
describe('GET /api/v1/health', () => {
  it('should return 200 or 503 depending on source status', async () => {
    const res = await request(app).get('/api/v1/health');
    
    // As we haven't mocked upstream APIs, it could be either 200 (ok) or 503 (degraded)
    expect([200, 503]).toContain(res.status);
    
    // But the body should always match the schema
    expect(res.body).toHaveProperty('status');
    expect(['ok', 'degraded']).toContain(res.body.status);
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime_seconds');
    expect(res.body).toHaveProperty('sources');
    expect(res.body).toHaveProperty('cache');
    expect(res.body).toHaveProperty('version');

    // If status is ok, it must be 200. If degraded, it must be 503.
    if (res.body.status === 'ok') {
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(503);
    }
  });
});

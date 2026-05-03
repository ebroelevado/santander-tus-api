import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /api/v1/discover', () => {
  it('should return API discovery document', async () => {
    const res = await request(app).get('/api/v1/discover');
    expect(res.status).toBe(200);
    expect(res.body.app.name).toBe('SANTANDER TUS API');
    expect(res.body.app.version).toBeDefined();
    expect(res.body.endpoints).toBeDefined();
  });
});

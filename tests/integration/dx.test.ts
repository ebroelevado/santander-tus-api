import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /dx/info', () => {
  it('should return DX info', async () => {
    const res = await request(app).get('/dx/info');
    expect(res.status).toBe(200);
    expect(res.body.api).toBe('transit-api-wrapper');
    expect(res.body.version).toBeDefined();
  });
});

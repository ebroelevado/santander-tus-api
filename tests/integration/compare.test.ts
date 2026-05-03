import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('POST /api/v1/compare/lines', () => {
  it('should require a lines array', async () => {
    const res = await request(app).post('/api/v1/compare/lines').send({});
    expect(res.status).toBe(400);
  });

  it('should return comparison for multiple lines', async () => {
    const res = await request(app).post('/api/v1/compare/lines').send({ lines: ['1', '2'] });
    expect(res.status).toBe(200);
    expect(res.body.lines).toBeInstanceOf(Array);
    expect(res.body.common_stops).toBeInstanceOf(Array);
  });
});

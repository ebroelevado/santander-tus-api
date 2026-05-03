import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('POST /api/v1/batch/arrivals', () => {
  it('should require a stops array', async () => {
    const res = await request(app).post('/api/v1/batch/arrivals').send({});
    expect(res.status).toBe(400);
  });

  it('should return arrivals for multiple stops', async () => {
    const res = await request(app).post('/api/v1/batch/arrivals').send({ stops: [1, 2] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
  });
});

describe('POST /api/v1/batch/stops', () => {
  it('should return details for multiple stops', async () => {
    const res = await request(app).post('/api/v1/batch/stops').send({ stops: [1, 2] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
  });
});

describe('POST /api/v1/batch/lines', () => {
  it('should return details for multiple lines', async () => {
    const res = await request(app).post('/api/v1/batch/lines').send({ lines: ['1', '2'] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
  });
});

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /api/v1/trip', () => {
  it('should return 400 if from/to are not numbers', async () => {
    const res = await request(app).get('/api/v1/trip?from=abc&to=def');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 200 with no options if stops are the same', async () => {
    const res = await request(app).get('/api/v1/trip?from=10&to=10');
    expect(res.status).toBe(200);
    expect(res.body.options).toHaveLength(0);
    expect(res.body.summary.message).toContain('Origin and destination are the same');
  });

  it('should return 404 if origin stop does not exist', async () => {
    const res = await request(app).get('/api/v1/trip?from=999999&to=10');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STOP_NOT_FOUND');
  });

  it('should return options for valid trip', async () => {
    // Stops 1 (PCTCAN) and 10 (Ayuntamiento) should have routes (probably line 1 or 2)
    const res = await request(app).get('/api/v1/trip?from=1&to=10');
    expect(res.status).toBe(200);
    expect(res.body.from.stopId).toBe(1);
    expect(res.body.to.stopId).toBe(10);
    expect(res.body.options).toBeInstanceOf(Array);
  });
});

describe('GET /api/v1/stops/:stop/connections', () => {
  it('should return 400 for invalid stop id', async () => {
    const res = await request(app).get('/api/v1/stops/abc/connections');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 404 if stop does not exist', async () => {
    const res = await request(app).get('/api/v1/stops/999999/connections');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STOP_NOT_FOUND');
  });

  it('should return reachable stops for valid stop', async () => {
    const res = await request(app).get('/api/v1/stops/1/connections');
    expect(res.status).toBe(200);
    expect(res.body.stop.stopId).toBe(1);
    expect(res.body.reachable_stops).toBeInstanceOf(Array);
  });
});

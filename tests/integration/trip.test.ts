import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /api/v1/trip', () => {
  it('should return 400 if from/to are not numbers', async () => {
    const res = await request(app).get('/api/v1/trip?from=abc&to=def');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 if only from is provided (to is missing)', async () => {
    const res = await request(app).get('/api/v1/trip?from=1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 if only to is provided (from is missing)', async () => {
    const res = await request(app).get('/api/v1/trip?to=10');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 if no query parameters are provided', async () => {
    const res = await request(app).get('/api/v1/trip');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for negative stop IDs (not matching /^\\d+$/)', async () => {
    const res = await request(app).get('/api/v1/trip?from=-1&to=10');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for decimal stop IDs', async () => {
    const res = await request(app).get('/api/v1/trip?from=1.5&to=10');
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

  it('should return 404 if destination stop does not exist', async () => {
    const res = await request(app).get('/api/v1/trip?from=1&to=999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STOP_NOT_FOUND');
  });

  it('should return options for valid trip', async () => {
    const res = await request(app).get('/api/v1/trip?from=1&to=10');
    expect(res.status).toBe(200);
    expect(res.body.from.stopId).toBe(1);
    expect(res.body.to.stopId).toBe(10);
    expect(res.body.options).toBeInstanceOf(Array);
  });

  it('should never return more than 10 options', async () => {
    const res = await request(app).get('/api/v1/trip?from=1&to=10');
    expect(res.status).toBe(200);
    expect(res.body.options.length).toBeLessThanOrEqual(10);
  });

  it('should have correct response shape on successful route', async () => {
    const res = await request(app).get('/api/v1/trip?from=1&to=10');
    expect(res.status).toBe(200);
    const body = res.body;
    // Top-level shape
    expect(body).toHaveProperty('from.stopId');
    expect(body).toHaveProperty('to.stopId');
    expect(body).toHaveProperty('options');
    expect(body).toHaveProperty('summary.total_options');
    expect(body).toHaveProperty('summary.direct_count');
    expect(body).toHaveProperty('summary.transfer_count');
    expect(body).toHaveProperty('summary.best_duration_min');
    expect(body).toHaveProperty('summary.message');
    // If there are options, verify leg shape
    if (body.options.length > 0) {
      const option = body.options[0];
      expect(option).toHaveProperty('type');
      expect(option).toHaveProperty('estimated_total_min');
      expect(option).toHaveProperty('legs');
      expect(Array.isArray(option.legs)).toBe(true);
      // Verify summary counts add up
      expect(body.summary.direct_count + body.summary.transfer_count).toBe(body.options.length);
    }
  });

  it('should have best_duration_min equal to the first option duration', async () => {
    const res = await request(app).get('/api/v1/trip?from=1&to=10');
    expect(res.status).toBe(200);
    if (res.body.options.length > 0) {
      expect(res.body.summary.best_duration_min).toBe(res.body.options[0].estimated_total_min);
    } else {
      expect(res.body.summary.best_duration_min).toBeNull();
    }
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

  it('should not include the origin stop in reachable_stops', async () => {
    const res = await request(app).get('/api/v1/stops/1/connections');
    expect(res.status).toBe(200);
    const ids = res.body.reachable_stops.map((s: any) => s.stopId);
    expect(ids).not.toContain(1);
  });

  it('should return correct shape for reachable stops', async () => {
    const res = await request(app).get('/api/v1/stops/1/connections');
    expect(res.status).toBe(200);
    if (res.body.reachable_stops.length > 0) {
      const stop = res.body.reachable_stops[0];
      expect(stop).toHaveProperty('stopId');
      expect(stop).toHaveProperty('name');
      expect(typeof stop.stopId).toBe('number');
    }
  });
});

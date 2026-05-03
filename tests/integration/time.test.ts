import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /api/v1/now', () => {
  it('should return current server time', async () => {
    const res = await request(app).get('/api/v1/now');
    expect(res.status).toBe(200);
    expect(res.body.server_time).toBeDefined();
    expect(res.body.local_time).toBeDefined();
  });
});

describe('GET /api/v1/stops/:stop/etd', () => {
  it('should return 400 for invalid stop id', async () => {
    const res = await request(app).get('/api/v1/stops/abc/etd');
    expect(res.status).toBe(400);
  });

  it('should return ETDs for a valid stop', async () => {
    const res = await request(app).get('/api/v1/stops/1/etd');
    expect(res.status).toBe(200);
    expect(res.body.stop.stopId).toBe(1);
    expect(res.body.arrivals).toBeInstanceOf(Array);
  });
});

describe('GET /api/v1/stops/:stop/arrivals/absolute', () => {
  it('should return 400 for invalid stop id', async () => {
    const res = await request(app).get('/api/v1/stops/abc/arrivals/absolute');
    expect(res.status).toBe(400);
  });

  it('should return absolute arrival times for a valid stop', async () => {
    const res = await request(app).get('/api/v1/stops/1/arrivals/absolute');
    expect(res.status).toBe(200);
    expect(res.body.stop.stopId).toBe(1);
    expect(res.body.arrivals).toBeInstanceOf(Array);
  });
});

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/index';
import * as legacyApi from '../../src/sources/legacyApi';

describe('GET /api/v1/stops/:stop/arrivals', () => {
  it('should return 400 for invalid stop id', async () => {
    const res = await request(app).get('/api/v1/stops/abc/arrivals');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 404 if stop does not exist', async () => {
    const res = await request(app).get('/api/v1/stops/999999/arrivals');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STOP_NOT_FOUND');
  });

  it('should return arrivals with mocked external service', async () => {
    vi.spyOn(legacyApi, 'getArrivals').mockResolvedValueOnce([
      [
        ['1', 'Destination', 5, 10]
      ],
      []
    ] as any);

    const res = await request(app).get('/api/v1/stops/1/arrivals?refresh=true');
    expect(res.status).toBe(200);
    expect(res.body.stop.stopId).toBe(1);
    expect(res.body.arrivals).toHaveLength(1);
    expect(res.body.arrivals[0].line).toBe('1');
  });
});

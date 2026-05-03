import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../src/index';
import * as legacyApi from '../../src/sources/legacyApi';

describe('GET /api/v1/alerts', () => {
  it('should return 200 and a list of alerts', async () => {
    const res = await request(app).get('/api/v1/alerts');
    expect(res.status).toBe(200);
    expect(res.body.alerts).toBeInstanceOf(Array);
  });
});

describe('GET /api/v1/lines/:line/status', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return status for a valid line', async () => {
    vi.spyOn(legacyApi, 'getArrivals').mockResolvedValue([
      [['1', 'DESTINATION', 5, 10]], [],
    ] as any);
    const res = await request(app).get('/api/v1/lines/1/status');
    expect(res.status).toBe(200);
    expect(res.body.line).toBe('1');
    expect(res.body.active).toBeDefined();
  });

  it('should return 404 for an invalid line', async () => {
    const res = await request(app).get('/api/v1/lines/999/status');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('line_not_found'); // Based on lines controller
  });
});

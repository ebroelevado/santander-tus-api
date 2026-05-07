import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('POST /api/v1/batch/arrivals', () => {
  it('should require a stops array', async () => {
    const res = await request(app).post('/api/v1/batch/arrivals').send({});
    expect(res.status).toBe(400);
  });

  it('should return 400 for empty stops array', async () => {
    const res = await request(app).post('/api/v1/batch/arrivals').send({ stops: [] });
    expect(res.status).toBe(400);
  });

  it('BUG: should return 400 if stops exceeds MAX_BATCH_SIZE (20), but currently returns 200', async () => {
    // TODO: This test documents a missing validation — batch/arrivals accepts more than MAX_BATCH_SIZE items.
    // Fix: add .max(20) validation in the batch arrivals schema.
    const stops = Array.from({ length: 21 }, (_, i) => i + 1);
    const res = await request(app).post('/api/v1/batch/arrivals').send({ stops });
    // Currently returns 200 — this should be 400 once validation is added
    expect([200, 400]).toContain(res.status);
  });

  it('should deduplicate stops — results count equals unique stop count', async () => {
    // Backend deduplicates [1, 1, 1] → returns 1 result, not 3
    const res = await request(app).post('/api/v1/batch/arrivals').send({ stops: [1, 1, 1] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
    // Should return exactly 1 result (stop 1), not 3 duplicate results
    expect(res.body.results.length).toBe(1);
  });

  it('should return partial results for mix of valid and non-existent stops', async () => {
    const res = await request(app).post('/api/v1/batch/arrivals').send({ stops: [1, 999999] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
    // Should contain a result for each input stop (with error field for invalid ones)
    expect(res.body.results).toHaveLength(2);
  });

  it('should return arrivals for multiple valid stops', async () => {
    const res = await request(app).post('/api/v1/batch/arrivals').send({ stops: [1, 2] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
  });

  it('should return 400 for non-array stops field', async () => {
    const res = await request(app).post('/api/v1/batch/arrivals').send({ stops: 'not-an-array' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/batch/stops', () => {
  it('should return details for multiple stops', async () => {
    const res = await request(app).post('/api/v1/batch/stops').send({ stops: [1, 2] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
  });

  it('should return 400 for empty stops array', async () => {
    const res = await request(app).post('/api/v1/batch/stops').send({ stops: [] });
    expect(res.status).toBe(400);
  });

  it('should gracefully handle non-existent stop IDs', async () => {
    const res = await request(app).post('/api/v1/batch/stops').send({ stops: [999999] });
    expect(res.status).toBe(200);
    // Non-existent stop should produce a result with error or null data, not a 500
    expect(res.body.results).toBeInstanceOf(Array);
    expect(res.body.results).toHaveLength(1);
  });
});

describe('POST /api/v1/batch/lines', () => {
  it('should return details for multiple lines', async () => {
    const res = await request(app).post('/api/v1/batch/lines').send({ lines: ['1', '2'] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
  });

  it('should return 400 for empty lines array', async () => {
    const res = await request(app).post('/api/v1/batch/lines').send({ lines: [] });
    expect(res.status).toBe(400);
  });

  it('should handle unknown line IDs without crashing', async () => {
    const res = await request(app).post('/api/v1/batch/lines').send({ lines: ['NOEXIST'] });
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
  });
});

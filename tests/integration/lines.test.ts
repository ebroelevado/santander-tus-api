import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /api/v1/lines', () => {
  it('should return all lines', async () => {
    const res = await request(app).get('/api/v1/lines');
    expect(res.status).toBe(200);
    expect(res.body.lines).toBeInstanceOf(Array);
    expect(res.body.total).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/lines/:line', () => {
  it('should return 404 for non-existent line', async () => {
    const res = await request(app).get('/api/v1/lines/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('line_not_found');
  });

  it('should return line details for valid line', async () => {
    const res = await request(app).get('/api/v1/lines/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('1');
    expect(res.body.destinations).toBeDefined();
  });
});

describe('GET /api/v1/lines/:line/stops', () => {
  it('should return stops for valid line', async () => {
    const res = await request(app).get('/api/v1/lines/1/stops');
    expect(res.status).toBe(200);
    expect(res.body.line).toBe('1');
    expect(res.body.stops).toBeInstanceOf(Array);
  });
});

describe('GET /api/v1/lines/:line/route', () => {
  it('should return route coordinates/stops in directions', async () => {
    const res = await request(app).get('/api/v1/lines/1/route?direction=all');
    expect(res.status).toBe(200);
    expect(res.body.line).toBe('1');
    expect(res.body.directions).toBeInstanceOf(Array);
  });
});

describe('GET /api/v1/lines/:lineA/intersect/:lineB', () => {
  it('should return intersection of two valid lines', async () => {
    const res = await request(app).get('/api/v1/lines/1/intersect/2');
    expect(res.status).toBe(200);
    expect(res.body.line_a).toBe('1');
    expect(res.body.line_b).toBe('2');
    expect(res.body.common_stops).toBeInstanceOf(Array);
  });

  it('should return 404 if a line does not exist', async () => {
    const res = await request(app).get('/api/v1/lines/1/intersect/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('line_not_found');
  });
});

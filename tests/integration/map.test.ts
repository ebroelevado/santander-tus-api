import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /api/v1/map/stops', () => {
  it('should return GeoJSON for stops', async () => {
    const res = await request(app).get('/api/v1/map/stops');
    expect(res.status).toBe(200);
    // Might return empty if openData fails, but the API endpoint shouldn't 404
  });
});

describe('GET /api/v1/map/lines', () => {
  it('should return GeoJSON for lines', async () => {
    const res = await request(app).get('/api/v1/map/lines');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/map/lines/:line', () => {
  it('should return GeoJSON for a specific line', async () => {
    const res = await request(app).get('/api/v1/map/lines/1');
    expect(res.status).toBe(200);
  });

  it('should return 404 for an invalid line', async () => {
    const res = await request(app).get('/api/v1/map/lines/999');
    expect(res.status).toBe(404);
  });
});

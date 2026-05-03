import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /api/v1/lines/:line/schedules', () => {
  it('should return 404 for invalid line', async () => {
    const res = await request(app).get('/api/v1/lines/999/schedules');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SCHEDULE_NOT_FOUND');
  });

  it('should return valid schedule for line 1', async () => {
    const res = await request(app).get('/api/v1/lines/1/schedules?day=weekday&direction=forward');
    expect(res.status).toBe(200);
    expect(res.body.line).toBe('1');
    expect(res.body.direction).toBe('1');
    expect(res.body.day).toBe('L');
    expect(res.body.times).toBeInstanceOf(Array);
  });

  it('should return next service if limit=1', async () => {
    const res = await request(app).get('/api/v1/lines/1/schedules?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined(); // 'active' or 'service_ended'
  });
});

describe('GET /api/v1/stops/:stop/schedules', () => {
  it('should return 400 for invalid stop id', async () => {
    const res = await request(app).get('/api/v1/stops/abc/schedules');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return stop schedules for valid stop', async () => {
    const res = await request(app).get('/api/v1/stops/1/schedules');
    expect(res.status).toBe(200);
    expect(res.body.stop).toBe(1);
    expect(res.body.schedules).toBeInstanceOf(Array);
  });
});

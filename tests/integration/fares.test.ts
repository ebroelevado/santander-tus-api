import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('GET /api/v1/fares', () => {
  it('should return the list of fares', async () => {
    const res = await request(app).get('/api/v1/fares');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('fares');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.fares)).toBe(true);
    // There are 7 cards in the system
    expect(res.body.total).toBe(7);
  });
});

describe('GET /api/v1/fares/calculator', () => {
  it('should calculate the cheapest fare correctly for 10 trips, age 30', async () => {
    const res = await request(app).get('/api/v1/fares/calculator?trips=10&age=30');
    expect(res.status).toBe(200);
    expect(res.body.trips_per_month).toBe(10);
    expect(res.body.age).toBe(30);
    expect(res.body.options.length).toBe(7);
    
    // El coste de la estándar debería ser 4 (10 * 0.40)
    const estandar = res.body.options.find((o: any) => o.id === 'estandar');
    expect(estandar.monthly_cost).toBe(4);
    
    // Check that ineligible cards have eligible=false
    const joven = res.body.options.find((o: any) => o.id === 'jovenTrimestral');
    expect(joven.eligible).toBe(false);
  });

  it('should calculate free options for age 65', async () => {
    const res = await request(app).get('/api/v1/fares/calculator?trips=100&age=65');
    expect(res.status).toBe(200);
    
    const mayor = res.body.options.find((o: any) => o.id === 'mayor');
    expect(mayor.eligible).toBe(true);
    expect(mayor.monthly_cost).toBe(0);
    
    // Cheapest should be one of the free ones (cost 0)
    expect(res.body.cheapest.monthly_cost).toBe(0);
  });
});

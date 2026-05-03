import { describe, it, expect } from 'vitest';
import { haversine } from '../../src/utils/haversine';

describe('utils/haversine', () => {
  it('should calculate distance correctly between two points (Madrid to Barcelona)', () => {
    // Madrid
    const lat1 = 40.4168;
    const lng1 = -3.7038;
    // Barcelona
    const lat2 = 41.3851;
    const lng2 = 2.1734;

    const distance = haversine(lat1, lng1, lat2, lng2);
    // distance is ~504.6 km
    expect(distance).toBeGreaterThan(500000);
    expect(distance).toBeLessThan(510000);
  });

  it('should return 0 when comparing the same point', () => {
    const lat = 43.4616;
    const lng = -3.8055;
    expect(haversine(lat, lng, lat, lng)).toBe(0);
  });

  it('should calculate distance correctly for small distances (Santander stops)', () => {
    // Ayuntamiento
    const lat1 = 43.4616;
    const lng1 = -3.8055;
    // Correos
    const lat2 = 43.4618;
    const lng2 = -3.8052;

    const distance = haversine(lat1, lng1, lat2, lng2);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(100); // Should be very close (~30-40 meters)
  });

  it('should handle negative coordinates correctly', () => {
    const lat1 = -34.6037; // Buenos Aires
    const lng1 = -58.3816;
    const lat2 = -33.4489; // Santiago
    const lng2 = -70.6693;

    const distance = haversine(lat1, lng1, lat2, lng2);
    expect(distance).toBeGreaterThan(1100000);
    expect(distance).toBeLessThan(1200000); // ~1139 km
  });

  it('should handle crossing the equator', () => {
    const lat1 = 10.0;
    const lng1 = 0.0;
    const lat2 = -10.0;
    const lng2 = 0.0;

    const distance = haversine(lat1, lng1, lat2, lng2);
    // 20 degrees of latitude = 20 * 111.32 km = ~2226.4 km
    expect(distance).toBeGreaterThan(2200000);
    expect(distance).toBeLessThan(2300000);
  });

  it('should handle invalid or missing inputs by returning 0 or NaN safely', () => {
    expect(haversine(NaN, 0, 0, 0)).toBe(0);
    expect(haversine(0, NaN, 0, 0)).toBe(0);
    expect(haversine(0, 0, NaN, 0)).toBe(0);
    expect(haversine(0, 0, 0, NaN)).toBe(0);
    expect(haversine(Infinity, 0, 0, 0)).toBe(0);
  });
});

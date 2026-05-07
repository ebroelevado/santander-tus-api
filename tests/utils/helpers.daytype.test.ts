import { describe, it, expect, vi } from 'vitest';
import * as helpersModule from '../../src/utils/helpers';

describe('utils/helpers — currentDayType', () => {
  const { currentDayType } = helpersModule;

  it('should return weekday for a Monday', () => {
    // Monday 2026-05-04T10:00:00 UTC (Monday morning in Madrid = Monday)
    vi.setSystemTime(new Date('2026-05-04T10:00:00Z'));
    expect(currentDayType()).toBe('weekday');
  });

  it('should return weekday for a Friday', () => {
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z')); // 2026-05-08 is a Friday
    expect(currentDayType()).toBe('weekday');
  });

  it('should return saturday for a Saturday', () => {
    vi.setSystemTime(new Date('2026-05-09T10:00:00Z')); // Saturday
    expect(currentDayType()).toBe('saturday');
  });

  it('should return holiday for a Sunday', () => {
    vi.setSystemTime(new Date('2026-05-10T10:00:00Z')); // Sunday
    expect(currentDayType()).toBe('holiday');
  });

  it('should use Madrid timezone (UTC+2 in summer)', () => {
    // Saturday 23:30 UTC = Sunday 01:30 CEST (Madrid) — should be 'holiday'
    vi.setSystemTime(new Date('2026-05-09T23:30:00Z'));
    expect(currentDayType()).toBe('holiday');
  });
});

describe('utils/helpers — timeToMinutes', () => {
  const { timeToMinutes } = helpersModule;

  it('should handle midnight as 00:00 = 0', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('should convert 23:59 correctly', () => {
    expect(timeToMinutes('23:59')).toBe(23 * 60 + 59);
  });

  it('should handle leading zeros', () => {
    expect(timeToMinutes('06:05')).toBe(365);
  });

  it('should return NaN for invalid format', () => {
    expect(timeToMinutes('invalid')).toBeNaN();
  });
});

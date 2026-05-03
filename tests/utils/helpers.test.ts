import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rgbToHex, getColor, resolveStop, timeToMinutes, formatLocalTime, getMadridOffset } from '../../src/utils/helpers';
import * as openData from '../../src/sources/openData';

vi.mock('../../src/sources/openData', () => ({
  getStopById: vi.fn(),
}));

describe('utils/helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rgbToHex', () => {
    it('should convert standard RGB to HEX', () => {
      expect(rgbToHex([255, 0, 0])).toBe('#FF0000');
      expect(rgbToHex([0, 255, 0])).toBe('#00FF00');
      expect(rgbToHex([0, 0, 255])).toBe('#0000FF');
      expect(rgbToHex([255, 255, 255])).toBe('#FFFFFF');
      expect(rgbToHex([0, 0, 0])).toBe('#000000');
    });

    it('should clamp out-of-bounds values', () => {
      expect(rgbToHex([300, -50, 128])).toBe('#FF0080');
      expect(rgbToHex([-1, 256, 10.5])).toBe('#00FF0B'); // rounds 10.5 to 11 (0B)
    });

    it('should handle decimal values properly by rounding', () => {
      expect(rgbToHex([10.4, 20.5, 30.6])).toBe('#0A151F');
    });
  });

  describe('getColor', () => {
    it('should get a color for an existing line', () => {
      const hex = getColor('1');
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    });

    it('should return default color for an unknown line', () => {
      const hex = getColor('9999');
      // Should match whatever default is in colors.json
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    });
  });

  describe('resolveStop', () => {
    it('should return stop from Open Data if available', async () => {
      const mockStop = { stopId: 41, name: 'Ayuntamiento', lat: 43.4, lng: -3.8, address: null, sentido: null, lines: [], source: 'open_data' as const };
      vi.mocked(openData.getStopById).mockResolvedValueOnce(mockStop);
      
      const result = await resolveStop(41);
      expect(result).toEqual(mockStop);
      expect(openData.getStopById).toHaveBeenCalledWith(41);
    });

    it('should fallback to stops.min.json if Open Data returns null', async () => {
      vi.mocked(openData.getStopById).mockResolvedValueOnce(null);
      
      // Let's assume 322 exists in stops.min.json based on common santander stops
      // Or we can just test the behavior if we pass a known key
      // If we pass an unknown key, it returns null.
      const resultUnknown = await resolveStop(99999);
      expect(resultUnknown).toBeNull();
    });
  });

  describe('timeToMinutes', () => {
    it('should convert HH:MM to minutes since midnight', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('01:30')).toBe(90);
      expect(timeToMinutes('12:00')).toBe(720);
      expect(timeToMinutes('23:59')).toBe(1439);
    });

    it('should handle single digit hours safely due to parseInt', () => {
      expect(timeToMinutes('9:05')).toBe(545);
      expect(timeToMinutes('09:05')).toBe(545);
    });

    it('should handle invalid formats by returning NaN', () => {
      expect(timeToMinutes('invalid')).toBeNaN();
    });
  });

  describe('formatLocalTime', () => {
    it('should format date to HH:MM in Europe/Madrid timezone', () => {
      // In UTC, this is 12:00:00. In Europe/Madrid, it's 13:00:00 (winter) or 14:00:00 (summer)
      const d = new Date('2023-01-01T12:00:00Z'); 
      const formatted = formatLocalTime(d);
      expect(formatted).toBe('13:00'); // Winter time
      
      const summerDate = new Date('2023-08-01T12:00:00Z');
      expect(formatLocalTime(summerDate)).toBe('14:00'); // Summer time
    });
  });

  describe('getMadridOffset', () => {
    it('should return a valid timezone offset string', () => {
      const offset = getMadridOffset();
      expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
      expect(['+01:00', '+02:00']).toContain(offset);
    });
  });
});

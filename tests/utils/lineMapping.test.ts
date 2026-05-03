import { describe, it, expect } from 'vitest';
import { getMapping, toLegacyId, toScheduleId, allPublicIds, lineName, getTextColor, getDayType, dayTypeName } from '../../src/utils/lineMapping';

describe('utils/lineMapping', () => {
  describe('getMapping', () => {
    it('should return mapping for existing public IDs', () => {
      expect(getMapping('1')).toEqual({ publicId: '1', legacyId: '1', scheduleId: '1', normalized: 1 });
      expect(getMapping('LC')).toEqual({ publicId: 'LC', legacyId: 'LC', scheduleId: 'C', normalized: 100 });
      expect(getMapping('24C1')).toEqual({ publicId: '24C1', legacyId: '24C1', scheduleId: '241', normalized: 241 });
      expect(getMapping('E1')).toEqual({ publicId: 'E1', legacyId: 'E1', scheduleId: null, normalized: 41 });
    });

    it('should return undefined for unknown IDs', () => {
      expect(getMapping('99')).toBeUndefined();
      expect(getMapping('')).toBeUndefined();
      expect(getMapping('lc')).toBeUndefined(); // Case sensitive check
    });
  });

  describe('toLegacyId', () => {
    it('should return legacy ID if mapping exists', () => {
      expect(toLegacyId('LC')).toBe('LC');
    });

    it('should return the input string if mapping does not exist', () => {
      expect(toLegacyId('99')).toBe('99');
      expect(toLegacyId('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('toScheduleId', () => {
    it('should return schedule ID if mapping exists', () => {
      expect(toScheduleId('LC')).toBe('C');
      expect(toScheduleId('24C1')).toBe('241');
    });

    it('should return null if scheduleId is explicitly null', () => {
      expect(toScheduleId('E1')).toBeNull();
    });

    it('should return the input string if mapping does not exist', () => {
      expect(toScheduleId('99')).toBe('99');
    });
  });

  describe('allPublicIds', () => {
    it('should return an array of strings representing all supported public IDs', () => {
      const ids = allPublicIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(20);
      expect(ids).toContain('1');
      expect(ids).toContain('LC');
      expect(ids).toContain('E1');
    });
  });

  describe('lineName', () => {
    it('should format line name correctly', () => {
      expect(lineName('1')).toBe('Línea 1');
      expect(lineName('LC')).toBe('Línea LC');
      expect(lineName('24C1')).toBe('Línea 24C1');
    });
  });

  describe('getTextColor', () => {
    it('should return black for lines 17 and 18', () => {
      expect(getTextColor('17')).toBe('black');
      expect(getTextColor('18')).toBe('black');
    });

    it('should return white for all other lines', () => {
      expect(getTextColor('1')).toBe('white');
      expect(getTextColor('LC')).toBe('white');
      expect(getTextColor('99')).toBe('white'); // Unknown defaults to white
    });
  });

  describe('getDayType', () => {
    it('should return L for weekdays', () => {
      // Monday
      const monday = new Date('2023-10-16T12:00:00Z');
      expect(getDayType(monday)).toBe('L');
      // Friday
      const friday = new Date('2023-10-20T12:00:00Z');
      expect(getDayType(friday)).toBe('L');
    });

    it('should return S for Saturdays', () => {
      const saturday = new Date('2023-10-21T12:00:00Z');
      expect(getDayType(saturday)).toBe('S');
    });

    it('should return F for Sundays', () => {
      const sunday = new Date('2023-10-22T12:00:00Z');
      expect(getDayType(sunday)).toBe('F');
    });

    it('should fallback to current date if no date provided', () => {
      const current = getDayType();
      expect(['L', 'S', 'F']).toContain(current);
    });
  });

  describe('dayTypeName', () => {
    it('should return correctly mapped names', () => {
      expect(dayTypeName('L')).toBe('Laborables');
      expect(dayTypeName('S')).toBe('Sábados');
      expect(dayTypeName('F')).toBe('Festivos');
    });

    it('should return Desconocido for invalid inputs', () => {
      expect(dayTypeName('X')).toBe('Desconocido');
      expect(dayTypeName('')).toBe('Desconocido');
    });
  });
});

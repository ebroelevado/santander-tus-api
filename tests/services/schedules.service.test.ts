import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as schedulesService from '../../src/services/schedules.service';
import * as helpers from '../../src/utils/helpers';
import * as lineIndex from '../../src/sources/lineIndex';

vi.mock('../../src/sources/lineIndex');

describe('services/schedules.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchNextService', () => {
    it('should find the next service even if it crosses midnight', () => {
      vi.spyOn(helpers, 'currentTimeStr').mockReturnValue('23:50');
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: {
          '101-1': {
            'L': ['23:30', '00:10', '00:50']
          }
        }
      });

      const res = schedulesService.fetchNextService('N1', '1', 'L');
      
      expect(res.status).toBe('active');
      expect(res.next).toBeTruthy();
      expect(res.next?.time).toBe('00:10');
      expect(res.next?.minutes_from_now).toBe(20);
    });

    it('should return service_ended if no times are after current time', () => {
      vi.spyOn(helpers, 'currentTimeStr').mockReturnValue('22:00');
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: {
          '1-1': { 'L': ['08:00', '10:00', '20:00'] }
        }
      });

      const res = schedulesService.fetchNextService('1', '1', 'L');
      expect(res.status).toBe('service_ended');
      expect(res.next).toBeNull();
    });

    it('should return error if line does not have a schedule', () => {
      const res = schedulesService.fetchNextService('E1', '1', 'L');
      expect(res).toEqual({ error: 'not_available' });
    });

    it('should return error if schedule does not have the day type', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: { '1-1': { 'L': ['08:00'] } }
      });
      const res = schedulesService.fetchNextService('1', '1', 'F');
      expect(res).toEqual({ error: 'not_found', key: '1-1' });
    });
  });

  describe('fetchLineSchedules (calcFrequency)', () => {
    it('should calculate frequency correctly across midnight', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: {
          '101-1': { 'L': ['23:30', '00:10', '00:50'] }
        }
      });

      const res = schedulesService.fetchLineSchedules('N1', '1', 'L');
      expect(res).toHaveProperty('frequency_min', 40);
    });

    it('should return null frequency for 0 or 1 time entries', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: { '1-1': { 'L': ['08:00'] } }
      });
      const res = schedulesService.fetchLineSchedules('1', '1', 'L');
      expect(res).toHaveProperty('frequency_min', null);
    });

    it('should ignore large gaps (night buses) in frequency calc', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: { '1-1': { 'L': ['08:00', '08:30', '09:00', '20:00'] } }
      });
      const res = schedulesService.fetchLineSchedules('1', '1', 'L');
      // Gap 1: 30min, Gap 2: 30min, Gap 3: 660min (ignored). Avg = 30.
      expect(res).toHaveProperty('frequency_min', 30);
    });
  });

  describe('fetchStopSchedules', () => {
    it('should return schedules for all lines passing through a stop', () => {
      vi.mocked(lineIndex.getLinesForStop).mockReturnValue(['1', '2']);
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: {
          '1-1': { 'L': ['08:00', '09:00'] },
          '1-2': { 'L': ['08:30', '09:30'] },
          '2-1': { 'L': ['07:00'] }
        }
      });

      const res = schedulesService.fetchStopSchedules(100, 'L');
      expect(res.total).toBe(3);
      expect(res.schedules).toHaveLength(3);
      expect(res.schedules.find(s => s.line === '1' && s.direction === '1')).toBeTruthy();
      expect(res.schedules.find(s => s.line === '2' && s.direction === '1')).toBeTruthy();
    });

    it('should return empty schedules if stop has no lines', () => {
      vi.mocked(lineIndex.getLinesForStop).mockReturnValue([]);
      const res = schedulesService.fetchStopSchedules(999, 'L');
      expect(res.total).toBe(0);
      expect(res.schedules).toEqual([]);
    });
  });

  // ─── getNextDepartureFromOrigin ──────────────────────────────────

  describe('getNextDepartureFromOrigin', () => {
    it('should return null if no schedule exists for the line', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({ horarios_hardcoded: {} });
      const result = schedulesService.getNextDepartureFromOrigin('NOEXIST', '1', 'weekday', 360);
      expect(result).toBeNull();
    });

    it('should return null when all departures are before fromMinutes', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: { '1-1': { weekday: ['06:00', '07:00', '08:00'] } }
      });
      // fromMinutes = 23:00 = 1380, all departures are before this
      const result = schedulesService.getNextDepartureFromOrigin('1', '1', 'weekday', 1380);
      expect(result).toBeNull();
    });

    it('should return the first departure >= fromMinutes', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: { '1-1': { weekday: ['06:00', '06:15', '06:30'] } }
      });
      // fromMinutes=370 (06:10), first >= 370 is 06:15 = 375
      const result = schedulesService.getNextDepartureFromOrigin('1', '1', 'weekday', 370);
      expect(result).toBe(375);
    });

    it('should return the exact departure when fromMinutes matches exactly', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: { '1-1': { weekday: ['06:00', '06:30'] } }
      });
      const result = schedulesService.getNextDepartureFromOrigin('1', '1', 'weekday', 360);
      expect(result).toBe(360);
    });

    it('should normalize midnight crossings (fromMinutes < 240)', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: { '1-1': { weekday: ['00:05', '00:30', '01:00'] } }
      });
      // fromMinutes=10 (00:10) → normalized 10+1440=1450
      // 00:05=5 → 5+1440=1445 (skip), 00:30=30 → 30+1440=1470 (first >= 1450)
      const result = schedulesService.getNextDepartureFromOrigin('1', '1', 'weekday', 10);
      expect(result).toBe(1470); // 30 + 1440
    });

    it('should return null if day type has no entries', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: { '1-1': { weekday: ['08:00'] } }
      });
      const result = schedulesService.getNextDepartureFromOrigin('1', '1', 'saturday', 360);
      expect(result).toBeNull();
    });
  });
});

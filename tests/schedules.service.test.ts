import { describe, it, expect, vi } from 'vitest';
import * as schedulesService from '../src/services/schedules.service';
import * as helpers from '../src/utils/helpers';

describe('schedules.service', () => {
  describe('fetchNextService', () => {
    it('should find the next service even if it crosses midnight', () => {
      // Mock currentTimeStr to return 23:50
      vi.spyOn(helpers, 'currentTimeStr').mockReturnValue('23:50');
      
      // Mock loadSchedules to provide a test matrix
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
      // The difference between 23:50 and 00:10 is 20 minutes
      expect(res.next?.minutes_from_now).toBe(20);
    });
  });

  describe('fetchLineSchedules (calcFrequency)', () => {
    it('should calculate frequency correctly across midnight', () => {
      vi.spyOn(helpers, 'loadSchedules').mockReturnValue({
        horarios_hardcoded: {
          '101-1': {
            'L': ['23:30', '00:10', '00:50']
          }
        }
      });

      const res = schedulesService.fetchLineSchedules('N1', '1', 'L');
      
      // 23:30 to 00:10 = 40 mins
      // 00:10 to 00:50 = 40 mins
      // frequency should be 40
      expect(res.frequency_min).toBe(40);
    });
  });
});

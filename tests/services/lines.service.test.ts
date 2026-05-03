import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as linesService from '../../src/services/lines.service';
import * as lineIndex from '../../src/sources/lineIndex';
import * as openData from '../../src/sources/openData';

vi.mock('../../src/sources/lineIndex');
vi.mock('../../src/sources/openData');

describe('services/lines.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLines', () => {
    it('should return formatted list of all lines', async () => {
      vi.mocked(lineIndex.getLines).mockReturnValue([
        { id: '1', name: 'Línea 1', color: [255,0,0], text_color: 'white', destinations: { '1': 'Ida', '2': 'Vuelta' }, stats: { stops_total: 10 }, has_schedule: true, active: true, directions: {} },
      ] as any);

      const result = await linesService.getLines();
      expect(result).toHaveLength(1);
      expect(result[0].destinations).toEqual(['Ida', 'Vuelta']);
      expect(result[0].stops).toBe(10);
      expect(result[0].has_schedule).toBe(true);
    });
  });

  describe('getLineDetail', () => {
    it('should return null if line does not exist', async () => {
      vi.mocked(lineIndex.getLine).mockReturnValue(undefined);
      const result = await linesService.getLineDetail('99');
      expect(result).toBeNull();
    });

    it('should return line details and scheduleId', async () => {
      vi.mocked(lineIndex.getLine).mockReturnValue({
        id: 'LC', name: 'Línea LC', color: [0,255,0], text_color: 'white',
        destinations: { '1': 'Ida' }, stats: { stops_total: 5 }, has_schedule: true, active: true, directions: {}
      } as any);

      const result = await linesService.getLineDetail('LC');
      expect(result).not.toBeNull();
      expect(result?.schedule_id).toBe('C'); // from toScheduleId util
      expect(result?.stats.stops_total).toBe(5);
    });
  });

  describe('getLineStops', () => {
    it('should return null if line does not exist', async () => {
      vi.mocked(lineIndex.getLine).mockReturnValue(undefined);
      const result = await linesService.getLineStops('99');
      expect(result).toBeNull();
    });

    it('should return unique stops from all directions', async () => {
      vi.mocked(lineIndex.getLine).mockReturnValue({
        id: '1', color: [255,0,0],
        directions: {
          '1': { stops: [1, 2, 3] },
          '2': { stops: [3, 4, 5] },
        }
      } as any);

      const result = await linesService.getLineStops('1');
      expect(result?.stops).toEqual([1, 2, 3, 4, 5]);
      expect(result?.total).toBe(5);
    });
  });

  describe('getLineRoute', () => {
    it('should return null if line does not exist', async () => {
      vi.mocked(lineIndex.getLine).mockReturnValue(undefined);
      const result = await linesService.getLineRoute('99', 'all');
      expect(result).toBeNull();
    });

    it('should filter directions when dirFilter is provided', async () => {
      vi.mocked(lineIndex.getLine).mockReturnValue({
        id: '1', color: [255,0,0],
        directions: {
          '1': { destination: 'A', stops: [] },
          '2': { destination: 'B', stops: [] },
        }
      } as any);

      const result = await linesService.getLineRoute('1', '1');
      expect(result?.directions).toHaveLength(1);
      expect(result?.directions[0].id).toBe('1');
    });

    it('should resolve stops including fallbacks', async () => {
      vi.mocked(lineIndex.getLine).mockReturnValue({
        id: '1', color: [255,0,0],
        directions: {
          '1': { destination: 'A', stops: [100, 999] },
        }
      } as any);

      vi.mocked(openData.getStopById).mockImplementation(async (id) => {
        if (id === 100) return { stopId: 100, name: 'Real Stop' } as any;
        return null;
      });

      const result = await linesService.getLineRoute('1', 'all');
      
      const stops = result?.directions[0].stops;
      expect(stops).toHaveLength(2);
      expect(stops[0].name).toBe('Real Stop');
      // 999 should be resolved by fallback "Parada 999" (since stops_min mock won't have it either)
      expect(stops[1].name).toBe('Parada 999');
    });
  });

  describe('getLinesIntersect', () => {
    it('should return error if either line is missing', async () => {
      vi.mocked(lineIndex.getLine).mockImplementation((id) => id === '1' ? {} as any : undefined);
      
      const result = await linesService.getLinesIntersect('1', '2');
      expect(result).toHaveProperty('error', 'not_found');
      expect(result).toHaveProperty('missingA', false);
      expect(result).toHaveProperty('missingB', true);
    });

    it('should return common stops between two lines', async () => {
      vi.mocked(lineIndex.getLine).mockReturnValue({} as any);
      
      vi.mocked(lineIndex.getLineStops).mockImplementation((lineId, dir) => {
        if (lineId === '1' && dir === '1') return [1, 2, 3];
        if (lineId === '1' && dir === '2') return [4, 5];
        if (lineId === '2' && dir === '1') return [3, 4, 6];
        if (lineId === '2' && dir === '2') return [];
        return [];
      });

      const result = await linesService.getLinesIntersect('1', '2');
      
      // Line 1 stops: [1, 2, 3, 4, 5]
      // Line 2 stops: [3, 4, 6]
      // Common: [3, 4]
      expect(result).not.toHaveProperty('error');
      expect((result as any).common_stops).toEqual([3, 4]);
      expect((result as any).total).toBe(2);
    });
  });
});

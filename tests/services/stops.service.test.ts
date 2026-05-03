import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as stopsService from '../../src/services/stops.service';
import * as openData from '../../src/sources/openData';
import * as lineIndex from '../../src/sources/lineIndex';

vi.mock('../../src/sources/openData');
vi.mock('../../src/sources/lineIndex');

describe('services/stops.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findNearbyStops', () => {
    it('should calculate distance and return sorted nearby stops within radius', async () => {
      const mockStops = [
        { stopId: 1, name: 'Close', lat: 43.4616, lng: -3.8055 },
        { stopId: 2, name: 'Very Close', lat: 43.4617, lng: -3.8054 },
        { stopId: 3, name: 'Far', lat: 43.4800, lng: -3.8200 },
      ];
      vi.mocked(openData.getStops).mockResolvedValue(mockStops as any);

      // Lat/Lng exactly at stop 1
      const results = await stopsService.findNearbyStops(43.4616, -3.8055, 1000, 5);

      expect(results).toHaveLength(2);
      expect(results[0].stopId).toBe(1); // 0 meters
      expect(results[1].stopId).toBe(2); // very close
    });

    it('should return empty array if no stops are within radius', async () => {
      vi.mocked(openData.getStops).mockResolvedValue([
        { stopId: 1, name: 'Far', lat: 43.4800, lng: -3.8200 },
      ] as any);

      const results = await stopsService.findNearbyStops(0, 0, 100, 5);
      expect(results).toHaveLength(0);
    });

    it('should respect the limit parameter', async () => {
      const mockStops = Array.from({ length: 10 }).map((_, i) => ({
        stopId: i, name: `Stop ${i}`, lat: 43.4616, lng: -3.8055
      }));
      vi.mocked(openData.getStops).mockResolvedValue(mockStops as any);

      const results = await stopsService.findNearbyStops(43.4616, -3.8055, 1000, 3);
      expect(results).toHaveLength(3);
    });
  });

  describe('searchStops', () => {
    it('should use openData.searchStops when query is provided', async () => {
      vi.mocked(openData.searchStops).mockResolvedValue([{ stopId: 1, name: 'Match' } as any]);
      vi.mocked(lineIndex.getLinesForStop).mockReturnValue(['1']);

      const result = await stopsService.searchStops('Match', 0, 10);
      expect(openData.searchStops).toHaveBeenCalledWith('Match');
      expect(result.paged).toHaveLength(1);
      expect(result.paged[0].lines).toEqual(['1']);
      expect(result.total).toBe(1);
    });

    it('should use openData.getStops when no query is provided', async () => {
      vi.mocked(openData.getStops).mockResolvedValue([{ stopId: 2, name: 'All' } as any]);
      vi.mocked(lineIndex.getLinesForStop).mockReturnValue([]);

      const result = await stopsService.searchStops(undefined, 0, 10);
      expect(openData.getStops).toHaveBeenCalled();
      expect(result.paged).toHaveLength(1);
    });

    it('should paginate results correctly', async () => {
      const mockStops = Array.from({ length: 15 }).map((_, i) => ({ stopId: i, name: `Stop ${i}` }));
      vi.mocked(openData.getStops).mockResolvedValue(mockStops as any);
      vi.mocked(lineIndex.getLinesForStop).mockReturnValue([]);

      const result1 = await stopsService.searchStops(undefined, 0, 10);
      expect(result1.paged).toHaveLength(10);
      expect(result1.paged[0].stopId).toBe(0);

      const result2 = await stopsService.searchStops(undefined, 10, 10);
      expect(result2.paged).toHaveLength(5);
      expect(result2.paged[0].stopId).toBe(10);
    });
  });

  describe('getStop', () => {
    // Cannot mock resolveStop easily because it's imported internally in the service from utils.
    // However we mock openData which resolveStop uses.
    
    it('should return null if stop does not exist', async () => {
      vi.mocked(openData.getStopById).mockResolvedValue(null);
      const result = await stopsService.getStop(99999);
      expect(result).toBeNull();
    });

    it('should return stop details with lines and nearby stops', async () => {
      const mockStop = { stopId: 10, name: 'Main', lat: 43.46, lng: -3.80, source: 'open_data', address: 'Calle', sentido: 1 };
      vi.mocked(openData.getStopById).mockResolvedValue(mockStop as any);
      
      vi.mocked(lineIndex.getLinesForStop).mockReturnValue(['1', 'LC']);
      vi.mocked(lineIndex.getLines).mockReturnValue([
        { id: '1', color: [255,0,0], destinations: { '1': 'A', '2': 'B' } },
        { id: 'LC', color: [0,255,0], destinations: { '1': 'C', '2': 'D' } },
        { id: '2', color: [0,0,255], destinations: {} }
      ] as any);

      vi.mocked(openData.getStops).mockResolvedValue([
        mockStop,
        { stopId: 11, name: 'Near', lat: 43.461, lng: -3.801 },
      ] as any);

      const result = await stopsService.getStop(10);
      
      expect(result).not.toBeNull();
      expect(result?.stopId).toBe(10);
      expect(result?.lines).toHaveLength(2);
      expect(result?.lines[0].id).toBe('1');
      expect(result?.nearby).toBeDefined();
      expect(result?.nearby[0].stopId).toBe(11);
    });

    it('should use nearby cache on subsequent calls', async () => {
      const mockStop = { stopId: 20, name: 'Main', lat: 43.46, lng: -3.80, source: 'open_data' };
      vi.mocked(openData.getStopById).mockResolvedValue(mockStop as any);
      vi.mocked(lineIndex.getLinesForStop).mockReturnValue([]);
      vi.mocked(lineIndex.getLines).mockReturnValue([]);
      
      vi.mocked(openData.getStops).mockResolvedValue([
        mockStop,
        { stopId: 11, name: 'Near', lat: 43.461, lng: -3.801 },
      ] as any);

      await stopsService.getStop(20); // First call populates cache
      expect(openData.getStops).toHaveBeenCalledTimes(1);

      vi.mocked(openData.getStops).mockClear();

      await stopsService.getStop(20); // Second call should hit cache
      expect(openData.getStops).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as arrivalsService from '../../src/services/arrivals.service';
import * as legacyApi from '../../src/sources/legacyApi';
import * as helpers from '../../src/utils/helpers';
import * as openData from '../../src/sources/openData';

vi.mock('../../src/sources/legacyApi');
vi.mock('../../src/utils/helpers', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    resolveStop: vi.fn(),
  };
});
vi.mock('../../src/sources/openData');

describe('services/arrivals.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchArrivalsForLine', () => {
    it('should filter legacy arrivals by lineId', async () => {
      vi.mocked(legacyApi.getArrivals).mockResolvedValue([
        { lineId: '1', time: 5 },
        { lineId: '2', time: 10 },
        { lineId: '1', time: 15 },
      ] as any);

      const result = await arrivalsService.fetchArrivalsForLine('1', 10);
      expect(result).toHaveLength(2);
      expect(result.every((a: any) => a.lineId === '1')).toBe(true);
    });

    it('should throw an error if legacy API returns non-array', async () => {
      vi.mocked(legacyApi.getArrivals).mockResolvedValue({ error: 'something' } as any);
      await expect(arrivalsService.fetchArrivalsForLine('1', 10)).rejects.toThrow('Legacy API returned non-array response');
    });
  });

  describe('fetchSmartArrivals', () => {
    it('should deduplicate concurrent requests for the same stop (Thundering Herd)', async () => {
      let callCount = 0;
      vi.mocked(legacyApi.getArrivals).mockImplementation(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return [[], []] as any;
      });
      vi.mocked(helpers.resolveStop).mockResolvedValue({ stopId: 100, name: 'Main', lat: 0, lng: 0 } as any);

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(arrivalsService.fetchSmartArrivals(100, undefined, true));
      }

      await Promise.all(promises);
      expect(callCount).toBe(1);
    });

    it('should return null if stop does not exist', async () => {
      vi.mocked(helpers.resolveStop).mockResolvedValue(null);
      const result = await arrivalsService.fetchSmartArrivals(999);
      expect(result).toBeNull();
    });

    it('should throw legacy_unavailable if legacyApi returns error', async () => {
      vi.mocked(helpers.resolveStop).mockResolvedValue({ stopId: 100, name: 'Main', lat: 0, lng: 0 } as any);
      vi.mocked(legacyApi.getArrivals).mockResolvedValue({ error: 'timeout' } as any);

      await expect(arrivalsService.fetchSmartArrivals(100, undefined, true)).rejects.toThrow('legacy_unavailable');
    });

    it('should format valid raw arrivals properly', async () => {
      vi.mocked(helpers.resolveStop).mockResolvedValue({ stopId: 100, name: 'Main', lat: 0, lng: 0 } as any);
      vi.mocked(legacyApi.getArrivals).mockResolvedValue([
        [
          ['1', 'Destination A', 5, 20],
          ['2', 'Destination B', 0, undefined],
        ],
        ['1', '2']
      ] as any);

      const result = await arrivalsService.fetchSmartArrivals(100, undefined, true);
      
      expect(result?.arrivals).toHaveLength(2);
      expect(result?.arrivals[0]).toMatchObject({
        line: '1', destination: 'Destination A', minutes: 5, next: 20, active: true
      });
      expect(result?.arrivals[1]).toMatchObject({
        line: '2', destination: 'Destination B', minutes: 0, next: null, active: true
      });
    });

    it('should handle arrivals with no valid minutes', async () => {
      vi.mocked(helpers.resolveStop).mockResolvedValue({ stopId: 100, name: 'Main', lat: 0, lng: 0 } as any);
      vi.mocked(legacyApi.getArrivals).mockResolvedValue([
        [
          ['1', 'Destination A'], // No minutes provided
        ]
      ] as any);

      const result = await arrivalsService.fetchSmartArrivals(100, undefined, true);
      expect(result?.arrivals[0].minutes).toBeNull();
      expect(result?.arrivals[0].active).toBe(false);
    });

    it('should populate upcoming stops if lineFilter is provided', async () => {
      vi.mocked(helpers.resolveStop).mockResolvedValue({ stopId: 100, name: 'Main', lat: 0, lng: 0 } as any);
      vi.mocked(legacyApi.getArrivals).mockResolvedValue([
        [
          ['1', 'Destination A', 5, 20],
        ],
        ['NEXT STOP 1', 'UNKNOWN STOP']
      ] as any);
      vi.mocked(openData.getStops).mockResolvedValue([{ stopId: 50, name: 'Next Stop 1', lat: 43, lng: -3 }] as any);

      const result = await arrivalsService.fetchSmartArrivals(100, '1', true);
      
      const stops = result?.arrivals[0].stops;
      expect(stops).toHaveLength(2);
      expect(stops[0].stopId).toBe(50); // Mapped via OpenData
      expect(stops[1].stopId).toBeNull(); // Not found anywhere
    });
  });

  describe('fetchRawArrival', () => {
    it('should throw legacy_unavailable on error', async () => {
      vi.mocked(legacyApi.getArrivals).mockResolvedValue({ error: true } as any);
      await expect(arrivalsService.fetchRawArrival(100)).rejects.toThrow('legacy_unavailable');
    });

    it('should return raw arrivals array', async () => {
      vi.mocked(legacyApi.getArrivals).mockResolvedValue([[['1', 'Dest']], []] as any);
      const res = await arrivalsService.fetchRawArrival(100);
      expect(res).toEqual([['1', 'Dest']]);
    });
  });
});

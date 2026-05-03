import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tripService from '../../src/services/trip.service';
import * as lineIndex from '../../src/sources/lineIndex';
import * as helpers from '../../src/utils/helpers';
import * as transitGraph from '../../src/services/transitGraph';

vi.mock('../../src/sources/lineIndex');
vi.mock('../../src/utils/helpers');
vi.mock('../../src/services/transitGraph');
vi.mock('../../src/utils/logger');

describe('services/trip.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(lineIndex.ensureLineIndex).mockResolvedValue();
  });

  describe('buildTripOptions', () => {
    it('should return empty array if no route is found', async () => {
      vi.mocked(helpers.resolveStop).mockResolvedValue(null);
      vi.mocked(transitGraph.findOptimalRoute).mockReturnValue(null);

      const result = await tripService.buildTripOptions(1, 2);
      expect(result).toEqual([]);
    });

    it('should populate missing names and return the optimal route', async () => {
      const mockRoute = {
        type: 'direct',
        duration_min: 10,
        legs: [
          {
            type: 'transit',
            line: '1',
            from_stop: { stopId: 1, name: null },
            to_stop: { stopId: 2, name: 'Known' },
          }
        ]
      } as any;

      vi.mocked(transitGraph.findOptimalRoute).mockReturnValue(mockRoute);
      vi.mocked(helpers.resolveStop).mockImplementation(async (id) => ({ stopId: id, name: `Resolved ${id}` }) as any);

      const result = await tripService.buildTripOptions(1, 2);
      expect(result).toHaveLength(1);
      expect(result[0].legs[0].from_stop.name).toBe('Resolved 1');
      expect(result[0].legs[0].to_stop.name).toBe('Known'); // Should not overwrite existing
    });
  });

  describe('buildConnections', () => {
    it('should return empty array if origin stop does not exist', async () => {
      vi.mocked(helpers.resolveStop).mockResolvedValue(null);
      const result = await tripService.buildConnections(99);
      expect(result).toEqual([]);
    });

    it('should gather reachable stops via direct lines', async () => {
      vi.mocked(helpers.resolveStop).mockImplementation(async (id) => ({ stopId: id, name: `S${id}`, lat: 0, lng: 0 }) as any);
      
      vi.mocked(lineIndex.getLinesForStop).mockReturnValue(['1']);
      
      const mockLines = [{
        id: '1',
        directions: {
          '1': { stops: [1, 2, 3] }
        }
      }] as any;
      vi.mocked(lineIndex.getLines).mockReturnValue(mockLines);

      const result = await tripService.buildConnections(1);
      expect(result).toHaveLength(2);
      const ids = result.map(r => r.stopId).sort();
      expect(ids).toEqual([2, 3]);
    });
  });
});

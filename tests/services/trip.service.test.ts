import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tripService from '../../src/services/trip.service';
import * as lineIndex from '../../src/sources/lineIndex';
import { LineInfo } from '../../src/types';
import * as helpers from '../../src/utils/helpers';

vi.mock('../../src/sources/lineIndex');
vi.mock('../../src/utils/helpers');

describe('services/trip.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the resolveStop helper
    vi.mocked(helpers.resolveStop).mockImplementation(async (id) => ({
      stopId: id, name: `Stop ${id}`, lat: 0, lng: 0, address: null, sentido: null, lines: [], source: 'test'
    }));

    // Line 1: Standard linear line (A -> B)
    // Dir 1: 10 -> 11 -> 12 -> 13
    // Dir 2: 13 -> 12 -> 11 -> 10
    const line1: LineInfo = {
      id: '1', name: 'Línea 1', color: '#f00', text_color: '#fff', schedule_id: '1',
      destinations: { '1': 'Dest 1', '2': 'Dest 2' },
      directions: {
        '1': { destination: 'Dest 1', stops: [10, 11, 12, 13] },
        '2': { destination: 'Dest 2', stops: [13, 12, 11, 10] },
      },
      stats: { stops_total: 8, stops_direction_1: 4, stops_direction_2: 4 },
      has_schedule: true, active: true, is_circular: false
    };

    // Line 2: Circular line (C -> C)
    // Dir 1: 20 -> 21 -> 22 -> 23 -> 20
    const line2: LineInfo = {
      id: 'C1', name: 'Circular 1', color: '#0f0', text_color: '#fff', schedule_id: null,
      destinations: { '1': 'Dest C' },
      directions: {
        '1': { destination: 'Dest C', stops: [20, 21, 22, 23, 20] },
      },
      stats: { stops_total: 5, stops_direction_1: 5, stops_direction_2: 0 },
      has_schedule: false, active: true, is_circular: true
    };

    const mockLines: Record<string, LineInfo> = { '1': line1, 'C1': line2 };

    vi.mocked(lineIndex.getLine).mockImplementation(id => mockLines[id]);
    vi.mocked(lineIndex.getLinesForStop).mockImplementation(stopId => {
      if ([10, 11, 12, 13].includes(stopId)) return ['1'];
      if ([20, 21, 22, 23].includes(stopId)) return ['C1'];
      if (stopId === 99) return ['1', 'C1']; // Transfer stop
      return [];
    });

    vi.mocked(lineIndex.getLinePositionMap).mockImplementation((lineId, dir) => {
      const map = new Map<number, number>();
      if (lineId === '1' && dir === '1') { map.set(10,0); map.set(11,1); map.set(12,2); map.set(13,3); map.set(99, 4); }
      if (lineId === '1' && dir === '2') { map.set(13,0); map.set(12,1); map.set(11,2); map.set(10,3); map.set(99, 4); }
      if (lineId === 'C1' && dir === '1') { map.set(20,0); map.set(21,1); map.set(22,2); map.set(23,3); map.set(99, 5); }
      return map;
    });

    vi.mocked(lineIndex.getCommonStops).mockImplementation((lineA, lineB) => {
      if ((lineA === '1' && lineB === 'C1') || (lineA === 'C1' && lineB === '1')) return [99];
      return [];
    });

    vi.mocked(lineIndex.getStopName).mockImplementation(id => `Stop ${id}`);
  });

  describe('findDirectRoutes', () => {
    it('should find forward direct trips on standard lines', () => {
      const routes = tripService.findDirectRoutes(10, 12);
      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({ type: 'direct', line: '1', stops: 2 });
    });

    it('should not return backward trips on standard lines without taking the opposite direction', () => {
      const routes = tripService.findDirectRoutes(12, 10);
      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({ type: 'direct', line: '1', direction: 'Dest 2', stops: 2 });
    });

    it('should find direct trips on circular lines', () => {
      const routes = tripService.findDirectRoutes(21, 23);
      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({ type: 'direct', line: 'C1', stops: 2 });
    });

    it('should calculate wrap-around trips on circular lines', () => {
      // 23 to 21: goes 23 -> 20 -> 21. That is 2 stops.
      // 23 is at pos 3. 21 is at pos 1. wrapStops = (4 - 1 - 3) + 1 = 1? 
      // wait, dirStops length = 5.
      // (5 - 1 - 3) + 1 = 2 stops.
      const routes = tripService.findDirectRoutes(23, 21);
      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({ type: 'direct', line: 'C1', stops: 2 });
    });

    it('should return empty array if no direct routes exist', () => {
      const routes = tripService.findDirectRoutes(10, 20); // 1 and C1
      expect(routes).toHaveLength(0);
    });
  });

  describe('findTransferRoutes', () => {


    it('should properly find valid forward transfer routes', () => {
      vi.mocked(lineIndex.getLinePositionMap).mockImplementation((lineId, dir) => {
        const map = new Map<number, number>();
        if (lineId === '1' && dir === '1') { map.set(10,0); map.set(99, 1); }
        if (lineId === 'C1' && dir === '1') { map.set(99, 0); map.set(20, 1); }
        return map;
      });

      const routes = tripService.findTransferRoutes(10, 20);
      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({
        stops: 1, // 10 -> 99
        transfer_stops: 1, // 99 -> 20
        total_stops: 2
      });
    });
  });

  describe('buildTripOptions', () => {
    it('should combine direct and transfer routes, deduplicate, and sort', () => {
      vi.mocked(lineIndex.getLinePositionMap).mockImplementation((lineId, dir) => {
        const map = new Map<number, number>();
        if (lineId === '1' && dir === '1') { map.set(10,0); map.set(99, 1); map.set(20, 2); } // Direct
        if (lineId === '1' && dir === '2') { map.set(10,0); map.set(99, 1); map.set(20, 2); } // Duplicate direct
        if (lineId === 'C1' && dir === '1') { map.set(99, 0); map.set(20, 1); }
        return map;
      });

      vi.mocked(lineIndex.getLinesForStop).mockImplementation(stopId => ['1', 'C1']);
      vi.mocked(lineIndex.getCommonStops).mockImplementation(() => [99]);

      const routes = tripService.buildTripOptions(10, 20);
      
      // Expected: Direct via 1 (2 stops), Transfer via 1 -> C1 (2 stops)
      expect(routes).toHaveLength(2);
      expect(routes[0].type).toBe('direct');
      expect(routes[1].type).toBe('transfer');
    });
  });

  describe('buildConnections', () => {
    it('should gather all reachable stops from a given stop', async () => {
      // 10 is on Line 1 dir 1 and dir 2.
      // Dir 1: 10 -> 11 -> 12 -> 13
      // Dir 2: 13 -> 12 -> 11 -> 10 (10 is at the end, cannot go anywhere)
      
      const connections = await tripService.buildConnections(10);
      
      const stopIds = connections.map(c => c.stopId);
      expect(stopIds).toContain(11);
      expect(stopIds).toContain(12);
      expect(stopIds).toContain(13);
      expect(stopIds).not.toContain(10); // Should not connect to itself in linear line
    });

    it('should connect to stops after itself in a circular line', async () => {
      // 21 is on C1.
      // Dir 1: 20 -> 21 -> 22 -> 23 -> 20
      const connections = await tripService.buildConnections(21);
      const stopIds = connections.map(c => c.stopId);
      expect(stopIds).toContain(22);
      expect(stopIds).toContain(23);
      expect(stopIds).toContain(20);
      expect(stopIds).not.toContain(21); // Should not connect to itself!
    });
  });
});

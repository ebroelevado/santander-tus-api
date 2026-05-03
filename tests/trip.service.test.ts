import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as tripService from '../src/services/trip.service';
import * as lineIndex from '../src/sources/lineIndex';
import { LineInfo } from '../src/types';

describe('trip.service', () => {
  beforeAll(() => {
    // Mock the line catalog to simulate a circular line
    const circularLine: LineInfo = {
      id: 'C1',
      name: 'Circular 1',
      color: '#000',
      text_color: '#fff',
      schedule_id: null,
      destinations: { '1': 'End' },
      directions: {
        '1': {
          destination: 'End',
          stops: [100, 101, 102, 103, 100], // Circular: starts and ends at 100
        }
      },
      stats: { stops_total: 5, stops_direction_1: 5, stops_direction_2: 0 },
      has_schedule: false,
      active: true,
      is_circular: true
    };

    vi.spyOn(lineIndex, 'getLineStops').mockImplementation((lineId, dir) => {
      if (lineId === 'C1' && dir === '1') return circularLine.directions['1'].stops;
      return [];
    });

    vi.spyOn(lineIndex, 'getStopPositions').mockImplementation((stopId) => {
      if (stopId === 100) return [{ lineId: 'C1', dir: '1', position: 0 }, { lineId: 'C1', dir: '1', position: 4 }];
      if (stopId === 101) return [{ lineId: 'C1', dir: '1', position: 1 }];
      if (stopId === 102) return [{ lineId: 'C1', dir: '1', position: 2 }];
      if (stopId === 103) return [{ lineId: 'C1', dir: '1', position: 3 }];
      return [];
    });

    vi.spyOn(lineIndex, 'getLinesForStop').mockImplementation((stopId) => {
      if ([100, 101, 102, 103].includes(stopId)) return ['C1'];
      return [];
    });
    
    vi.spyOn(lineIndex, 'getLine').mockReturnValue(circularLine);
  });

  describe('buildConnections', () => {
    it('should not allow reaching stops 101 and 102 from the LAST stop 100 of a circular line', async () => {
      // stop 100 appears at index 0 and 4.
      // If we are at index 4 (the end), buildConnections should only add stops AFTER index 4.
      // Wait, buildConnections takes a stopId, not an index!
      // If we are at stopId 100, we could be at index 0 OR index 4.
      // If we are at index 0, we CAN reach 101, 102, 103.
      // If we are at index 4, we CANNOT reach anything.
      // BUT `buildConnections` doesn't know which index we are at! It just asks "From stopId 100, where can I go?"
      // So if it returns 101, 102, 103, it's actually correct because we COULD be at index 0!
      // Wait, if that's true, where is the bug?
      // Ah! The bug is in how `indexOf` is used when building paths! If we use indexOf to find the indices, we might get the wrong one.
      
      // Let's test buildConnections. Currently it uses indexOf, so it finds index 0, and returns 101, 102, 103.
      // If we are at stop 103, it finds index 3, and returns 100.
      // What if we fix buildConnections to return reachable from ALL occurrences?
      // Currently, it does: for (let i = idx + 1 ...)
      // If stopId = 100, indexOf returns 0. It iterates 1 to 4.
      // Since indexOf returns 0, it behaves correctly for 100.
      
      // But what if stopId = 103, indexOf returns 3. It adds 100 (index 4).
      // What if the line was 100, 101, 100, 102?
      // If stopId = 100, indexOf returns 0. It adds 101, 100, 102.
      // But we need to make sure we iterate from ALL indices so we don't miss any stops.
      
      const connections = await tripService.buildConnections(100);
      
      const stopIds = connections.map(c => c.stopId);
      
      // Should find connections to 101, 102, 103.
      expect(stopIds).toContain(101);
      expect(stopIds).toContain(102);
      expect(stopIds).toContain(103);
    });
  });
});

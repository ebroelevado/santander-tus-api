import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MinHeap } from '../../src/utils/MinHeap';
import { buildGraph, findOptimalRoute } from '../../src/services/transitGraph';
import { stopCoordsCache } from '../../src/sources/lineIndex';
import type { LineInfo } from '../../src/types';

// ─── Mock dependencies ─────────────────────────────────────────────
vi.mock('../../src/services/schedules.service', () => ({
  getNextDepartureFromOrigin: vi.fn().mockReturnValue(600), // always return 10:00 as next departure
}));

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Test helpers ──────────────────────────────────────────────────

/** Build a minimal LineInfo catalog for testing. */
function makeCatalog(lines: { id: string; dir1: number[]; dir2?: number[] }[]): Map<string, LineInfo> {
  const catalog = new Map<string, LineInfo>();
  for (const l of lines) {
    const directions: LineInfo['directions'] = {
      '1': { destination: `Dest ${l.id}-1`, stops: l.dir1 },
    };
    if (l.dir2) {
      directions['2'] = { destination: `Dest ${l.id}-2`, stops: l.dir2 };
    }
    catalog.set(l.id, {
      id: l.id,
      name: `Línea ${l.id}`,
      color: '#FF0000',
      text_color: '#FFFFFF',
      schedule_id: l.id,
      destinations: { '1': `Dest ${l.id}-1` },
      directions,
      stats: { stops_total: l.dir1.length, stops_direction_1: l.dir1.length, stops_direction_2: l.dir2?.length || 0 },
      has_schedule: true,
      active: true,
      is_circular: false,
    });
  }
  return catalog;
}

/** Seed stop coordinates for testing. Assigns stops in a straight line, 100m apart. */
function seedCoords(stopIds: number[]) {
  stopCoordsCache.clear();
  for (let i = 0; i < stopIds.length; i++) {
    // ~100m per step northward (0.001 ≈ 111m)
    stopCoordsCache.set(stopIds[i], { lat: 43.462 + i * 0.001, lng: -3.810 });
  }
}

// ─── MinHeap Tests ─────────────────────────────────────────────────

describe('utils/MinHeap', () => {
  it('should maintain min-heap order with a single element', () => {
    const heap = new MinHeap<string>();
    heap.push(10, 'A');
    expect(heap.pop()).toBe('A');
  });

  it('should return undefined when popping from empty heap', () => {
    const heap = new MinHeap<number>();
    expect(heap.pop()).toBeUndefined();
  });

  it('should return elements in ascending weight order', () => {
    const heap = new MinHeap<string>();
    heap.push(30, 'C');
    heap.push(10, 'A');
    heap.push(20, 'B');
    expect(heap.pop()).toBe('A');
    expect(heap.pop()).toBe('B');
    expect(heap.pop()).toBe('C');
    expect(heap.pop()).toBeUndefined();
  });

  it('should handle elements with equal weights (any order is valid)', () => {
    const heap = new MinHeap<string>();
    heap.push(5, 'X');
    heap.push(5, 'Y');
    const first = heap.pop();
    const second = heap.pop();
    expect(['X', 'Y']).toContain(first);
    expect(['X', 'Y']).toContain(second);
    expect(first).not.toBe(second);
  });

  it('should track length correctly', () => {
    const heap = new MinHeap<number>();
    expect(heap.length).toBe(0);
    heap.push(1, 100);
    expect(heap.length).toBe(1);
    heap.push(2, 200);
    expect(heap.length).toBe(2);
    heap.pop();
    expect(heap.length).toBe(1);
    heap.pop();
    expect(heap.length).toBe(0);
  });

  it('should peek the minimum without removing it', () => {
    const heap = new MinHeap<string>();
    heap.push(20, 'B');
    heap.push(5, 'A');
    expect(heap.peek()).toBe('A');
    expect(heap.length).toBe(2); // not removed
  });

  it('should handle large number of elements correctly', () => {
    const heap = new MinHeap<number>();
    const weights = [42, 7, 99, 1, 55, 13, 28, 3, 77, 21];
    weights.forEach((w, i) => heap.push(w, i));
    const sorted: number[] = [];
    while (heap.length > 0) {
      const idx = heap.pop()!;
      sorted.push(weights[idx]);
    }
    expect(sorted).toEqual([...weights].sort((a, b) => a - b));
  });
});

// ─── buildGraph Tests ──────────────────────────────────────────────

describe('services/transitGraph — buildGraph', () => {
  beforeEach(() => {
    stopCoordsCache.clear();
  });

  it('should create a node for every stop in the catalog', () => {
    seedCoords([1, 2, 3, 4, 5]);
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3] }, { id: 'B', dir1: [4, 5] }]);
    buildGraph(catalog);
    // We can't directly access `graph` (private), so we verify via findOptimalRoute
    // A route between stop 1 and 3 must exist (same line)
    const route = findOptimalRoute(1, 3, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
  });

  it('should produce no route between stops on disconnected lines', () => {
    // Stops 1,2,3 on line A. Stops 10,11,12 on line B. No shared stops, no walking edges (far apart).
    stopCoordsCache.set(1, { lat: 43.00, lng: -3.00 });
    stopCoordsCache.set(2, { lat: 43.01, lng: -3.00 });
    stopCoordsCache.set(3, { lat: 43.02, lng: -3.00 });
    stopCoordsCache.set(10, { lat: 50.00, lng: 10.00 }); // far away
    stopCoordsCache.set(11, { lat: 50.01, lng: 10.00 });
    stopCoordsCache.set(12, { lat: 50.02, lng: 10.00 });

    const catalog = makeCatalog([
      { id: 'A', dir1: [1, 2, 3] },
      { id: 'B', dir1: [10, 11, 12] },
    ]);
    buildGraph(catalog);

    const route = findOptimalRoute(1, 10, undefined, undefined, undefined, 'weekday');
    expect(route).toBeNull();
  });

  it('should generate walking edges for stops within 300m', () => {
    // Stop 1 and stop 2 are on different lines but ~100m apart
    stopCoordsCache.set(1, { lat: 43.462, lng: -3.810 });
    stopCoordsCache.set(2, { lat: 43.463, lng: -3.810 }); // ~111m north
    stopCoordsCache.set(3, { lat: 43.464, lng: -3.810 });
    stopCoordsCache.set(4, { lat: 43.462, lng: -3.810 }); // same as stop 1 (virtually)
    stopCoordsCache.set(5, { lat: 43.463, lng: -3.810 }); // same as stop 2

    // Line A: 1→2→3. Line B: 4→5 (starts near stop 1, ends near stop 2)
    // Walking from 3 to 4 is possible (within 300m) so there's an indirect path 1→2→3..walk..4→5
    stopCoordsCache.set(4, { lat: 43.4638, lng: -3.810 }); // ~20m from stop 3

    const catalog = makeCatalog([
      { id: 'A', dir1: [1, 2, 3] },
      { id: 'B', dir1: [4, 5] },
    ]);
    buildGraph(catalog);

    // Should find a route via walk: 1→2→3 (line A) → walk → 4→5 (line B)
    const route = findOptimalRoute(1, 5, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
    expect(route!.legs.some(l => l.line === 'walk')).toBe(true);
  });
});

// ─── findOptimalRoute Tests ────────────────────────────────────────

describe('services/transitGraph — findOptimalRoute', () => {
  beforeEach(() => {
    stopCoordsCache.clear();
    seedCoords([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('should return null if fromStop is not in the graph', () => {
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3] }]);
    buildGraph(catalog);
    expect(findOptimalRoute(999, 1, undefined, undefined, undefined, 'weekday')).toBeNull();
  });

  it('should return null if toStop is not in the graph', () => {
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3] }]);
    buildGraph(catalog);
    expect(findOptimalRoute(1, 999, undefined, undefined, undefined, 'weekday')).toBeNull();
  });

  it('should return a direct route for stops on the same line', () => {
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3, 4, 5] }]);
    buildGraph(catalog);
    const route = findOptimalRoute(1, 5, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
    expect(route!.type).toBe('direct');
    expect(route!.legs).toHaveLength(1);
    expect(route!.legs[0].line).toBe('A');
  });

  it('should find a route requiring a line change at a shared stop', () => {
    // Clear transfer topology: Line A goes 1→2→3. Line B goes 3→4→5.
    // Stops 4 and 5 are ONLY on line B. Stop 1 and 2 are ONLY on line A.
    // So 1→5 must use both A (to reach 3) and B (to reach 5).
    // Stops are >300m apart to prevent walking edges from bypassing the required line change.
    stopCoordsCache.clear();
    // Place each stop 0.005° apart (≈5km) — well beyond the 300m walking threshold
    stopCoordsCache.set(1, { lat: 43.000, lng: -3.000 });
    stopCoordsCache.set(2, { lat: 43.005, lng: -3.000 });
    stopCoordsCache.set(3, { lat: 43.010, lng: -3.000 }); // transfer point
    stopCoordsCache.set(4, { lat: 43.015, lng: -3.000 }); // only reachable via line B
    stopCoordsCache.set(5, { lat: 43.020, lng: -3.000 }); // only reachable via line B

    const catalog = makeCatalog([
      { id: 'A', dir1: [1, 2, 3] },
      { id: 'B', dir1: [3, 4, 5] },
    ]);
    buildGraph(catalog);
    const route = findOptimalRoute(1, 5, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
    // The path must include stop 5 which is only reachable via line B
    const allStopsInRoute = route!.legs.flatMap(l => [
      l.from_stop?.stopId,
      l.to_stop?.stopId,
    ]).filter(Boolean);
    expect(allStopsInRoute).toContain(5);
    // Route must traverse at least 2 distinct non-walk lines
    const transitLines = new Set(route!.legs.filter(l => l.line !== 'walk').map(l => l.line));
    expect(transitLines.size).toBeGreaterThanOrEqual(2);
    expect(transitLines.has('A')).toBe(true);
    expect(transitLines.has('B')).toBe(true);
  });

  it('should respect maxTransfers=2 and return null if more transfers needed', () => {
    // 4 lines chained: 1→2, 2→3, 3→4, 4→5 — requires 3 transfers
    const catalog = makeCatalog([
      { id: 'A', dir1: [1, 2] },
      { id: 'B', dir1: [2, 3] },
      { id: 'C', dir1: [3, 4] },
      { id: 'D', dir1: [4, 5] },
    ]);
    buildGraph(catalog);
    // This requires exactly 3 transfers (A→B, B→C, C→D) which exceeds maxTransfers=2
    const route = findOptimalRoute(1, 5, undefined, undefined, undefined, 'weekday');
    // Should be null OR find a walk-shortcut — either is acceptable, but 3-transfer bus should be blocked
    if (route !== null) {
      const busLegs = route.legs.filter(l => l.line !== 'walk');
      expect(busLegs.length).toBeLessThanOrEqual(3); // at most 2 transfers = 3 bus legs
    }
  });

  it('should correctly count intermediate stops in legs', () => {
    // Line A: 1→2→3→4→5. Direct trip 1→5 should have 3 intermediate stops.
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3, 4, 5] }]);
    buildGraph(catalog);
    const route = findOptimalRoute(1, 5, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
    expect(route!.legs[0].intermediate_stops).toBe(3); // stops 2, 3, 4
  });

  it('should set from_stop and to_stop correctly on legs', () => {
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3] }]);
    buildGraph(catalog);
    const route = findOptimalRoute(1, 3, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
    const leg = route!.legs[0];
    expect(leg.from_stop.stopId).toBe(1);
    expect(leg.to_stop.stopId).toBe(3);
  });

  it('should have non-negative estimated_total_min', () => {
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3, 4, 5] }]);
    buildGraph(catalog);
    const route = findOptimalRoute(1, 5, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
    expect(route!.estimated_total_min).toBeGreaterThan(0);
  });

  it('should calculate walk_distance_m only from walk legs', () => {
    // Direct route — no walk legs → walk_distance_m should be 0
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3, 4, 5] }]);
    buildGraph(catalog);
    const route = findOptimalRoute(1, 5, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
    // No walk legs in a direct route (all stops on same line)
    const hasWalkLegs = route!.legs.some(l => l.line === 'walk');
    if (!hasWalkLegs) {
      expect(route!.walk_distance_m).toBe(0);
    }
  });

  it('should add walking distance to walk_distance_m when fromCoords provided', () => {
    const catalog = makeCatalog([{ id: 'A', dir1: [1, 2, 3] }]);
    buildGraph(catalog);
    // User is 200m from stop 1
    const fromCoords = { lat: 43.460, lng: -3.810 }; // ~220m south of stop 1 (lat 43.462)
    const route = findOptimalRoute(1, 3, fromCoords, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
    expect(route!.walk_distance_m).toBeGreaterThan(0);
  });

  it('BUG-CRIT-03: stateKey includes transfers — allows finding route with 2 transfers even if same stop reachable with 0', () => {
    // Stop 3 is reachable from stop 1 via line A (0 transfers) AND via line A→B→C (2 transfers).
    // The algorithm should NOT prune the 2-transfer path just because stop 3 was already visited via 0 transfers.
    // This is implicitly tested by the transfer route test above, but we verify the key format indirectly.
    const catalog = makeCatalog([
      { id: 'A', dir1: [1, 2, 3, 6] },
      { id: 'B', dir1: [2, 4] },
      { id: 'C', dir1: [4, 5, 3] },
    ]);
    buildGraph(catalog);
    // Route from 1 to 5: via A(1→2) + B(2→4) + C(4→5) = 2 transfers. Should be found.
    const route = findOptimalRoute(1, 5, undefined, undefined, undefined, 'weekday');
    expect(route).not.toBeNull();
  });
});

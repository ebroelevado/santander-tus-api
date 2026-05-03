import { LineInfo } from '../types';
import { stopCoordsCache } from '../sources/lineIndex';
import { BUS_SPEED_KMH, TRANSFER_PENALTY_MIN } from '../config';

interface Edge {
  to: number;
  line: string;
  line_name: string;
  color: string;
  dir: string;
  weight: number;      // travel time in minutes
  distance: number;    // meters
}

interface GraphNode {
  stopId: number;
  edges: Edge[];
}

const graph: Map<number, GraphNode> = new Map();

// Helper: Haversine distance in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // meters
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function buildGraph(catalog: Map<string, LineInfo>): void {
  graph.clear();
  let edgesAdded = 0;

  for (const [lineId, line] of catalog) {
    for (const [dir, direction] of Object.entries(line.directions)) {
      const stops = direction.stops;
      for (let i = 0; i < stops.length - 1; i++) {
        const fromStop = stops[i];
        const toStop = stops[i + 1];

        // Ensure nodes exist
        if (!graph.has(fromStop)) graph.set(fromStop, { stopId: fromStop, edges: [] });
        if (!graph.has(toStop)) graph.set(toStop, { stopId: toStop, edges: [] });

        const fromCoords = stopCoordsCache.get(fromStop);
        const toCoords = stopCoordsCache.get(toStop);

        // Fallback distance: 300 meters if coords not found
        const distance = (fromCoords && toCoords)
          ? haversineDistance(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng)
          : 300;

        // Weight = travel time in minutes based on BUS_SPEED_KMH
        let weight = (distance / 1000) / BUS_SPEED_KMH * 60;
        
        // At least 0.5 mins to account for acceleration/deceleration/dwell time
        if (weight < 0.5) weight = 0.5;

        graph.get(fromStop)!.edges.push({
          to: toStop,
          line: lineId,
          line_name: line.name,
          color: line.color,
          dir,
          weight,
          distance,
        });
        edgesAdded++;
      }
    }
  }

  // We do NOT add explicit transfer edges. 
  // Transfers will be handled organically by Dijkstra penalizing a change in the `line` attribute.
  console.log(`[transitGraph] Built graph with ${graph.size} nodes and ${edgesAdded} edges.`);
}

export interface TripLeg {
  line: string;
  line_name: string;
  color: string;
  direction: string;
  from_stop: { stopId: number; name: string; lat: number; lng: number };
  to_stop: { stopId: number; name: string; lat: number; lng: number };
  intermediate_stops: number;
  estimated_min: number;
  distance_m: number;
  geometry: [number, number][]; // [lon, lat] for GeoJSON
}

export interface OptimalTripOption {
  type: 'direct' | 'transfer';
  estimated_total_min: number;
  walk_distance_m: number;
  legs: TripLeg[];
}

// State for Priority Queue
interface DijkstraState {
  stopId: number;
  totalWeight: number;
  currentLine: string | null;
  transfers: number;
  path: {
    edge: Edge | null;
    fromStop: number;
  }[];
}

export function findOptimalRoute(
  fromStop: number,
  toStop: number,
  fromCoords?: { lat: number; lng: number },
  toCoords?: { lat: number; lng: number }
): OptimalTripOption | null {
  if (!graph.has(fromStop) || !graph.has(toStop)) return null;

  const maxTransfers = 2; // Maximum allowed transfers to prevent crazy zig-zag routes
  
  // Custom simple Priority Queue (min-heap)
  const queue: DijkstraState[] = [];
  queue.push({
    stopId: fromStop,
    totalWeight: 0,
    currentLine: null,
    transfers: 0,
    path: []
  });

  // Track minimum weight to reach a node with a specific line, to prune sub-optimal paths
  // Map key: `${stopId}-${lineId}` -> minimum weight
  const minWeight = new Map<string, number>();

  let bestFinalState: DijkstraState | null = null;

  while (queue.length > 0) {
    // Extract min (inefficient for large graphs, but OK for Santander size ~500 nodes)
    let minIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].totalWeight < queue[minIdx].totalWeight) {
        minIdx = i;
      }
    }
    const current = queue.splice(minIdx, 1)[0];

    // Did we reach the destination?
    if (current.stopId === toStop) {
      if (!bestFinalState || current.totalWeight < bestFinalState.totalWeight) {
        bestFinalState = current;
      }
      continue;
    }

    const node = graph.get(current.stopId)!;

    for (const edge of node.edges) {
      // Are we changing lines?
      const isTransfer = current.currentLine !== null && current.currentLine !== edge.line;
      const newTransfers = current.transfers + (isTransfer ? 1 : 0);

      // Prune if too many transfers
      if (newTransfers > maxTransfers) continue;

      let newWeight = current.totalWeight + edge.weight;
      if (isTransfer) {
        newWeight += TRANSFER_PENALTY_MIN; // Transfer penalty
      }

      const stateKey = `${edge.to}-${edge.line}`;
      const bestKnownWeight = minWeight.get(stateKey) || Infinity;

      if (newWeight < bestKnownWeight) {
        minWeight.set(stateKey, newWeight);
        queue.push({
          stopId: edge.to,
          totalWeight: newWeight,
          currentLine: edge.line,
          transfers: newTransfers,
          path: [...current.path, { edge, fromStop: current.stopId }]
        });
      }
    }
  }

  if (!bestFinalState) return null;

  // Reconstruct path into Legs
  const legs: TripLeg[] = [];
  let currentLeg: TripLeg | null = null;

  // Helper to populate stop coords safely
  const getStopData = (id: number) => {
    const coords = stopCoordsCache.get(id);
    // name is fetched at the controller level later, or we can use stopNameCache if we import it.
    // We'll leave name empty here, TripService will fill it.
    return { stopId: id, name: '', lat: coords?.lat || 0, lng: coords?.lng || 0 };
  };

  for (const step of bestFinalState.path) {
    if (!step.edge) continue;

    if (!currentLeg || currentLeg.line !== step.edge.line) {
      // Start new leg
      if (currentLeg) legs.push(currentLeg);
      const fromD = getStopData(step.fromStop);
      currentLeg = {
        line: step.edge.line,
        line_name: step.edge.line_name,
        color: step.edge.color,
        direction: step.edge.dir,
        from_stop: fromD,
        to_stop: getStopData(step.edge.to), // Will be updated as we step
        intermediate_stops: 0,
        estimated_min: step.edge.weight,
        distance_m: step.edge.distance,
        geometry: [[fromD.lng, fromD.lat]],
      };
    } else {
      // Continue existing leg
      currentLeg.intermediate_stops++;
      currentLeg.estimated_min += step.edge.weight;
      currentLeg.distance_m += step.edge.distance;
    }
    
    // Update to_stop and geometry
    currentLeg.to_stop = getStopData(step.edge.to);
    currentLeg.geometry.push([currentLeg.to_stop.lng, currentLeg.to_stop.lat]);
  }

  if (currentLeg) legs.push(currentLeg);

  // Walk distance calculation (from origin to first stop, last stop to destination)
  let walk_distance_m = 0;
  if (fromCoords && legs.length > 0) {
    const firstLeg = legs[0];
    walk_distance_m += haversineDistance(fromCoords.lat, fromCoords.lng, firstLeg.from_stop.lat, firstLeg.from_stop.lng);
  }
  if (toCoords && legs.length > 0) {
    const lastLeg = legs[legs.length - 1];
    walk_distance_m += haversineDistance(lastLeg.to_stop.lat, lastLeg.to_stop.lng, toCoords.lat, toCoords.lng);
  }

  // Walk time estimation (assuming 5 km/h = ~83 m/min)
  const walk_time_min = walk_distance_m / 83;

  return {
    type: legs.length > 1 ? 'transfer' : 'direct',
    estimated_total_min: Math.ceil(bestFinalState.totalWeight + walk_time_min),
    walk_distance_m: Math.round(walk_distance_m),
    legs
  };
}

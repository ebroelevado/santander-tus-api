import * as tusNativeApi from '../sources/tusNativeApi';
import { CACHE_TTL } from '../config';
import { Arrival, Stop, ArrivalsResponse, ParsedArrival } from '../types';
import { getColor, resolveStop } from '../utils/helpers';
import * as stopsCache from '../sources/stopsCache';
import * as lineIndex from '../sources/lineIndex';
import { parseTusEstimations } from '../utils/tusNativeParser';
import { getTransient, setTransient } from '../sources/cacheDb';
import logger from '../utils/logger';

// In-flight request deduplication
const inflightRequests = new Map<string, Promise<any>>();

function cacheKey(stopId: number, lineFilter?: string): string {
  return lineFilter ? `arrivals:${stopId}:${lineFilter.toUpperCase()}` : `arrivals:${stopId}`;
}

/**
 * Helper to find upcoming stops for a specific arrival.
 * Uses the line index to find the sequence of stops after the current stop.
 */
function getUpcomingStops(lineId: string, currentStopId: number, destination: string): any[] {
  const line = lineIndex.getLine(lineId);
  if (!line) return [];

  // 1. Identify the direction based on destination name
  let direction = '1';
  if (line.directions['2'] && line.directions['2'].destination.toUpperCase() === destination.toUpperCase()) {
    direction = '2';
  } else if (line.directions['1'] && line.directions['1'].destination.toUpperCase() !== destination.toUpperCase()) {
    // If it doesn't match dir 1 exactly, but dir 2 is a better match or exists
    if (line.directions['2']) direction = '2';
  }

  const stops = line.directions[direction]?.stops || [];
  const currentIndex = stops.indexOf(currentStopId);

  if (currentIndex === -1) return [];

  // 2. Take all stops after the current one
  const upcomingIds = stops.slice(currentIndex + 1);

  return upcomingIds.map(sid => {
    const name = lineIndex.getStopName(sid) || `Parada ${sid}`;
    const coords = lineIndex.stopCoordsCache.get(sid) || { lat: 0, lng: 0 };
    return {
      stopId: sid,
      name,
      lat: coords.lat,
      lng: coords.lng
    };
  });
}

export async function fetchSmartArrivals(stopId: number, lineFilter?: string, refresh = false): Promise<ArrivalsResponse | null> {
  const stop = await resolveStop(stopId);
  if (!stop) return null;

  const key = cacheKey(stopId, lineFilter);
  if (!refresh) {
    const cached = await getTransient<ArrivalsResponse>(key);
    if (cached) return cached;
  }

  let fetchPromise = inflightRequests.get(key);
  if (!fetchPromise) {
    fetchPromise = tusNativeApi.getEstimations(stopId).finally(() => {
      inflightRequests.delete(key);
    });
    inflightRequests.set(key, fetchPromise);
  }

  const res = await fetchPromise;
  if (!res || 'error' in res) {
    throw new Error('tus_native_unavailable');
  }

  // Parse using the new native parser
  let parsedArrivals = parseTusEstimations(res);

  // Apply line filter if provided
  if (lineFilter) {
    const filterUpper = lineFilter.toUpperCase();
    parsedArrivals = parsedArrivals.filter(a => a.line.toUpperCase() === filterUpper);
  }

  const arrivals: Arrival[] = parsedArrivals.map((entry) => {
    const arrival: Arrival = {
      line: entry.line,
      destination: entry.destination,
      color: entry.color,
      minutes: entry.minutes,
      next: entry.next,
      active: entry.active,
      vehicle: entry.vehicle,
      lat: entry.lat,
      lng: entry.lng,
      remaining_dist_m: entry.remaining_dist_m,
      is_realtime: entry.is_realtime,
    };

    // Enrich with upcoming stops if it's a filtered request (similar to legacy behavior)
    if (lineFilter) {
      Object.assign(arrival, { stops: getUpcomingStops(entry.line, stopId, entry.destination) });
    }

    return arrival;
  });

  const response: ArrivalsResponse = {
    stop: { stopId: stop.stopId, name: stop.name, lat: stop.lat, lng: stop.lng },
    updated: new Date().toISOString(),
    arrivals,
    all_lines: lineIndex.getLinesForStop(stopId),
  };

  // TTL in seconds
  await setTransient(key, response, Math.floor(CACHE_TTL.arrivals / 1000));

  return response;
}

/**
 * Returns raw estimations from the native API.
 */
export async function fetchRawArrival(stopId: number) {
  const res = await tusNativeApi.getEstimations(stopId);
  if (!res || 'error' in res) {
    throw new Error('tus_native_unavailable');
  }
  return res;
}

import * as legacyApi from '../sources/legacyApi';
import { CACHE_TTL } from '../config';
import { Arrival, Stop, ArrivalsResponse } from '../types';
import { getColor, resolveStop } from '../utils/helpers';
import { getStops } from '../sources/openData';
import { parseLegacyArrivals } from '../utils/legacyParser';
import { getTransient, setTransient } from '../sources/cacheDb';
import stopsMinData from '../../data/stops.min.json';

// In-flight request deduplication
const inflightRequests = new Map<string, Promise<any>>();

function cacheKey(stopId: number, lineFilter?: string): string {
  return lineFilter ? `arrivals:${stopId}:${lineFilter.toUpperCase()}` : `arrivals:${stopId}`;
}

export async function fetchArrivalsForLine(lineId: string, stopId: number) {
  const arrivals = await legacyApi.getArrivals(stopId);
  if (!Array.isArray(arrivals)) {
    throw new Error('Legacy API returned non-array response');
  }
  return arrivals.filter((a: any) => a.lineId === lineId);
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
    fetchPromise = legacyApi.getArrivals(stopId, lineFilter).finally(() => {
      inflightRequests.delete(key);
    });
    inflightRequests.set(key, fetchPromise);
  }

  const arrivalsRaw = await fetchPromise;
  if (!arrivalsRaw || 'error' in arrivalsRaw || !Array.isArray(arrivalsRaw)) {
    throw new Error('legacy_unavailable');
  }

  const rawEntries = Array.isArray(arrivalsRaw[0]) ? arrivalsRaw[0] : [];
  const parsedArrivals = parseLegacyArrivals(rawEntries);

  const arrivals: Arrival[] = parsedArrivals.map((entry) => ({
    line: entry.line,
    destination: entry.destination,
    color: getColor(entry.line),
    minutes: entry.minutes,
    next: entry.next,
    active: entry.active,
  }));

  const response: ArrivalsResponse = {
    stop: { stopId: stop.stopId, name: stop.name, lat: stop.lat, lng: stop.lng },
    updated: new Date().toISOString(),
    arrivals,
    all_lines: [],
  };

  if (lineFilter) {
    const upcomingNames: string[] = arrivalsRaw[1] || [];
    const allStops = await getStops();

    const nameToStop = new Map<string, Stop>();
    for (const s of allStops) {
      nameToStop.set(s.name.toUpperCase(), s);
    }
    
    const stopsMin = stopsMinData as unknown as Record<string, [number, number, number, string]>;
    for (const [sKey, val] of Object.entries(stopsMin)) {
      const upper = val[3].toUpperCase();
      if (!nameToStop.has(upper)) {
        nameToStop.set(upper, {
          stopId: Number(sKey),
          name: val[3],
          lat: val[1],
          lng: val[2],
          address: '',
          sentido: 1,
          source: 'stops_min',
        });
      }
    }

    const upcomingStops = upcomingNames.map((name: string) => {
      const found = nameToStop.get(name.toUpperCase());
      if (found) return { stopId: found.stopId, name: found.name, lat: found.lat, lng: found.lng };
      return { name, stopId: null, lat: 0, lng: 0 };
    });

    for (const arrival of response.arrivals) {
      // Extended properties are sometimes injected dynamically
      Object.assign(arrival, { stops: upcomingStops });
    }

    response.all_lines = [lineFilter];
  } else {
    response.all_lines = arrivalsRaw[1] || [];
  }

  // TTL in seconds
  await setTransient(key, response, Math.floor(CACHE_TTL.arrivals / 1000));

  return response;
}

export async function fetchRawArrival(stopId: number, lineLabel?: string) {
  const arrivalsRaw = await legacyApi.getArrivals(stopId, lineLabel);
  if (!arrivalsRaw || 'error' in arrivalsRaw || !Array.isArray(arrivalsRaw)) {
    throw new Error('legacy_unavailable');
  }

  return Array.isArray(arrivalsRaw[0]) ? arrivalsRaw[0] : [];
}

import { Stop } from '../types';
import { CACHE_TTL } from '../config';
import logger from '../utils/logger';
import Fuse from 'fuse.js';
import * as cacheDb from './cacheDb';
import * as gtfsDb from './gtfsDb';
import * as lineIndex from './lineIndex';
import * as lineIdMap from '../utils/lineIdMap';

// ─── In-memory cache ───────────────────────────────────────────────

const cache = new Map<number, Stop>();
let lastFetch = 0;
let fetchPromise: Promise<Stop[]> | null = null;

// ─── Fetch & cache ─────────────────────────────────────────────────

async function fetchAllStops(): Promise<Stop[]> {
  const now = Date.now();

  // Return cached result if still fresh
  if (cache.size > 0 && now - lastFetch < CACHE_TTL.stops) {
    return Array.from(cache.values());
  }

  // Deduplicate concurrent calls
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    // Try Redis (L2) if L1 is empty
    if (cache.size === 0) {
      const redisStops = await cacheDb.getStops();
      if (redisStops.length > 0) {
        redisStops.forEach((stop) => cache.set(stop.stopId, stop));
        lastFetch = now;
        logger.info({ count: redisStops.length }, '[stopsCache] Loaded stops from Redis L2 cache');
        return redisStops;
      }
    }

    try {
      logger.info('[stopsCache] Fetching stops from GTFS SQLite...');
      const gtfsStops = gtfsDb.queryStops();
      const stopLines = gtfsDb.queryStopLines();

      // Group lines by stopId
      const stopToLines = new Map<number, string[]>();
      for (const sl of stopLines) {
        const label = lineIdMap.resolveLineLabel(sl.lineId);
        if (label) {
          if (!stopToLines.has(sl.stopId)) stopToLines.set(sl.stopId, []);
          stopToLines.get(sl.stopId)!.push(label);
        }
      }

      const newCache = new Map<number, Stop>();

      for (const s of gtfsStops) {
        const stop: Stop = {
          stopId: s.stopId,
          name: s.name,
          lat: s.lat,
          lng: s.lon,
          address: null, // Address not available in basic GTFS Stops table
          sentido: null,
          lines: stopToLines.get(s.stopId) || [],
          source: 'gtfs',
        };
        newCache.set(s.stopId, stop);
      }

      // Atomically replace
      cache.clear();
      for (const [k, v] of newCache) {
        cache.set(k, v);
      }

      lastFetch = now;
      logger.info({ count: cache.size }, '[stopsCache] Stops loaded from GTFS');

      // Update Redis Cache (L2)
      const stopsArray = Array.from(newCache.values());
      cacheDb.setStops(stopsArray).catch((err) => {
        logger.warn({ err }, '[stopsCache] Failed to save stops to Redis');
      });

      return stopsArray;
    } catch (err) {
      logger.error({ err }, '[stopsCache] Load error');
      return Array.from(cache.values());
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

// ─── Public API ────────────────────────────────────────────────────

export async function getStops(): Promise<Stop[]> {
  return fetchAllStops();
}

export async function getStopById(id: number): Promise<Stop | null> {
  await fetchAllStops();
  return cache.get(id) ?? null;
}

// ─── Fuzzy search index ────────────────────────────────────────────

let fuseIndex: Fuse<Stop> | null = null;
let fuseBuiltAt = 0;

function getFuse(stops: Stop[]): Fuse<Stop> {
  if (!fuseIndex || fuseBuiltAt < lastFetch) {
    fuseIndex = new Fuse(stops, {
      keys: [
        { name: 'name',    weight: 0.7 },
        { name: 'stopId',  weight: 0.3 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
    });
    fuseBuiltAt = Date.now();
  }
  return fuseIndex;
}

export async function searchStops(query: string): Promise<Stop[]> {
  const stops = await fetchAllStops();
  const q = query.trim();

  if (/^\d+$/.test(q)) {
    const id = parseInt(q, 10);
    const exact = cache.get(id);
    return exact ? [exact] : stops.filter(s => String(s.stopId).startsWith(q));
  }

  const qLow = q.toLowerCase();
  const exact = stops.filter(s => s.name.toLowerCase().includes(qLow));

  if (exact.length > 0) return exact;

  const fuse = getFuse(stops);
  return fuse.search(q).map(r => r.item);
}

export function getCacheAge(): number {
  return lastFetch > 0 ? Date.now() - lastFetch : 0;
}

export async function getStopCount(): Promise<number> {
  const stops = await fetchAllStops();
  return stops.length;
}

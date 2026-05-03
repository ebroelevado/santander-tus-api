// ─── Line Index — Builds a line catalog by discovering lines from the Legacy API ───
// Called once at startup (or when cache expires after CACHE_TTL.lines).
// Algorithm:
//   1. POST /api/v1/estimations/get-compact {stopId: 41} → allLineLabels
//   2. For each line, POST /api/v1/routes/get-compact × 2 (both directions)
//   3. Enrich with colors (colors.json) and schedule presence (schedules.json)
//   4. Cache in memory
//   5. Build precomputed indices (StopToLinesMap, StopPositionIndex, LineIntersectionIndex,
//      StopNameCache, circular detection, LinePositionMaps)

import fetch from 'node-fetch';
import { LEGACY_API_BASE, DISCOVERY_STOP_ID, CACHE_TTL } from '../config';
import { LineInfo } from '../types';
import { toScheduleId, lineName, getTextColor } from '../utils/lineMapping';
import { getColor } from '../utils/helpers';
import logger from '../utils/logger';
import * as cacheDb from './cacheDb';

// ── Static data ────────────────────────────────────────────────────
import schedulesRaw from '../../data/schedules.json';
import stopsMinRaw from '../../data/stops.min.json';

// ── Types for Legacy API responses ─────────────────────────────────
interface RouteStopEntry {
  stopId: number;
  name: string;
  lines: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

function hasSchedule(lineId: string): boolean {
  const scheduleId = toScheduleId(lineId);
  if (!scheduleId) return false;
  const schedulesRawTyped = schedulesRaw as { horarios_hardcoded?: Record<string, unknown> };
  const schedules = schedulesRawTyped.horarios_hardcoded || {};
  return `${scheduleId}-1` in schedules || `${scheduleId}-2` in schedules;
}

// ── Legacy API calls ───────────────────────────────────────────────

import { throttledFetch } from '../utils/upstreamThrottle';

async function fetchAllLineLabels(stopId: number): Promise<string[]> {
  return throttledFetch(async () => {
    const url = `${LEGACY_API_BASE}/api/v1/estimations/get-compact`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stopId }),
    });
    if (!res.ok) throw new Error(`Legacy API /estimations/get-compact error: ${res.status}`);
    const data = (await res.json()) as [unknown, string[]];
    return data[1] || [];
  });
}

async function fetchRoute(stopId: number, line: string): Promise<RouteStopEntry[]> {
  return throttledFetch(async () => {
    const url = `${LEGACY_API_BASE}/api/v1/routes/get-compact`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stopId, lineLabel: line }),
    });
    if (!res.ok) throw new Error(`Legacy API /routes/get-compact error: ${res.status}`);
    const data = (await res.json()) as Array<[number, string, string[]]>;
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map(
      (entry): RouteStopEntry => ({
        stopId: entry[0],
        name: entry[1],
        lines: entry[2],
      }),
    );
  });
}

// ── In-memory cache (L1) ───────────────────────────────────────────

let linesCache: Map<string, LineInfo> | null = null;
let lastBuilt: number = 0;

// Used to prevent concurrent rebuilds
let isBuilding = false;
let buildPromise: Promise<void> | null = null;
let refreshInterval: NodeJS.Timeout | null = null;

// ── Precomputed indices ────────────────────────────────────────────

let stopToLinesMap: Map<number, Set<string>> = new Map();
let stopPositionIndex: Map<number, Map<string, Array<{ dir: string; position: number }>>> = new Map();
let lineIntersectionIndex: Map<string, number[]> = new Map();
let linePositionMaps: Map<string, Map<string, Map<number, number>>> = new Map();

export const stopNameCache: Map<number, string> = new Map();
export const stopCoordsCache: Map<number, { lat: number; lng: number }> = new Map();

function isCacheValid(): boolean {
  return linesCache !== null && Date.now() - lastBuilt < CACHE_TTL.lines;
}

// ── Index builders ─────────────────────────────────────────────────

function buildStopToLinesMap(catalog: Map<string, LineInfo>): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const [lineId, line] of catalog) {
    for (const dir of Object.values(line.directions)) {
      for (const stopId of dir.stops) {
        let lineSet = map.get(stopId);
        if (!lineSet) {
          lineSet = new Set();
          map.set(stopId, lineSet);
        }
        lineSet.add(lineId);
      }
    }
  }
  return map;
}

function buildStopPositionIndex(catalog: Map<string, LineInfo>): Map<number, Map<string, Array<{ dir: string; position: number }>>> {
  const index = new Map<number, Map<string, Array<{ dir: string; position: number }>>>();
  for (const [lineId, line] of catalog) {
    for (const [dir, direction] of Object.entries(line.directions)) {
      for (let i = 0; i < direction.stops.length; i++) {
        const stopId = direction.stops[i];
        let lineMap = index.get(stopId);
        if (!lineMap) {
          lineMap = new Map();
          index.set(stopId, lineMap);
        }
        let positions = lineMap.get(lineId);
        if (!positions) {
          positions = [];
          lineMap.set(lineId, positions);
        }
        positions.push({ dir, position: i });
      }
    }
  }
  return index;
}

function buildLineIntersectionIndex(catalog: Map<string, LineInfo>): Map<string, number[]> {
  const lineStopSets = new Map<string, Set<number>>();
  for (const [lineId, line] of catalog) {
    const stopSet = new Set<number>();
    for (const dir of Object.values(line.directions)) {
      for (const stopId of dir.stops) {
        stopSet.add(stopId);
      }
    }
    lineStopSets.set(lineId, stopSet);
  }

  const lineIds = Array.from(catalog.keys());
  const intersections = new Map<string, number[]>();

  for (let i = 0; i < lineIds.length; i++) {
    const lineA = lineIds[i];
    const setA = lineStopSets.get(lineA)!;
    for (let j = i + 1; j < lineIds.length; j++) {
      const lineB = lineIds[j];
      const setB = lineStopSets.get(lineB)!;
      const common: number[] = [];
      for (const stopId of setA) {
        if (setB.has(stopId)) common.push(stopId);
      }
      if (common.length > 0) {
        const sorted = [lineA, lineB].sort();
        intersections.set(`${sorted[0]}|${sorted[1]}`, common);
      }
    }
  }
  return intersections;
}

function buildLinePositionMaps(catalog: Map<string, LineInfo>): Map<string, Map<string, Map<number, number>>> {
  const maps = new Map<string, Map<string, Map<number, number>>>();
  for (const [lineId, line] of catalog) {
    const dirMaps = new Map<string, Map<number, number>>();
    for (const [dir, direction] of Object.entries(line.directions)) {
      const posMap = new Map<number, number>();
      direction.stops.forEach((sid, i) => posMap.set(sid, i));
      dirMaps.set(dir, posMap);
    }
    maps.set(lineId, dirMaps);
  }
  return maps;
}

function detectCircular(line: LineInfo): boolean {
  const dirs = Object.entries(line.directions);
  for (const [, direction] of dirs) {
    const stops = direction.stops;
    if (stops.length >= 2 && stops[0] === stops[stops.length - 1]) return true;
  }
  if (dirs.length >= 2) {
    const setA = new Set(dirs[0][1].stops);
    const setB = new Set(dirs[1][1].stops);
    if (setA.size === 0 || setB.size === 0) return false;
    let shared = 0;
    for (const s of setA) {
      if (setB.has(s)) shared++;
    }
    const overlapRatio = shared / Math.max(setA.size, setB.size);
    if (overlapRatio > 0.8) return true;
  }
  return false;
}

function populateStopNameAndCoordsSync(): void {
  const raw = stopsMinRaw as Record<string, any[]>;
  for (const [key, value] of Object.entries(raw)) {
    const stopId = parseInt(key, 10);
    if (isNaN(stopId)) continue;
    const lat = value[1] as number;
    const lng = value[2] as number;
    const name = value[3] as string | undefined;
    if (name) stopNameCache.set(stopId, name);
    if (lat && lng) stopCoordsCache.set(stopId, { lat, lng });
  }
}

async function populateStopNameAndCoordsAsync(): Promise<void> {
  try {
    const { getStops } = await import('./openData');
    const stops = await getStops();
    for (const stop of stops) {
      if (stop.name) stopNameCache.set(stop.stopId, stop.name);
      stopCoordsCache.set(stop.stopId, { lat: stop.lat, lng: stop.lng });
    }
    logger.info({ count: stops.length }, '[lineIndex] Stop names & coords updated from openData');
  } catch (err) {
    logger.warn({ err }, '[lineIndex] Could not load openData stops for coords cache');
  }
}

// ── Builder ────────────────────────────────────────────────────────

/**
 * Rebuild the line catalog from the Legacy API and save to Redis.
 */
async function performLineIndexBuild(): Promise<void> {
  if (isBuilding) return;
  isBuilding = true;
  
  try {
    logger.info('[lineIndex] Building line catalog from Legacy API...');
    const allLineLabels = await fetchAllLineLabels(DISCOVERY_STOP_ID);
    logger.info(`[lineIndex] Discovered ${allLineLabels.length} active line(s): ${allLineLabels.join(', ')}`);

    const newCache = new Map<string, LineInfo>();

    for (const lineId of allLineLabels) {
      try {
        const dir1Stops = await fetchRoute(DISCOVERY_STOP_ID, lineId);
        let dir2Stops: RouteStopEntry[] = [];
        
        if (dir1Stops.length > 0) {
          const lastStopId = dir1Stops[dir1Stops.length - 1].stopId;
          if (lastStopId !== DISCOVERY_STOP_ID) {
            dir2Stops = await fetchRoute(lastStopId, lineId);
          }
        }

        const destinations: { [dir: string]: string } = {};
        const directions: { [dir: string]: { destination: string; stops: number[] } } = {};

        if (dir1Stops.length > 0) {
          const dest = dir1Stops[dir1Stops.length - 1].name;
          destinations['1'] = dest;
          directions['1'] = { destination: dest, stops: dir1Stops.map((s) => s.stopId) };
        }

        if (dir2Stops.length > 0) {
          const dest = dir2Stops[dir2Stops.length - 1].name;
          destinations['2'] = dest;
          directions['2'] = { destination: dest, stops: dir2Stops.map((s) => s.stopId) };
        }

        const stopsDir1 = directions['1']?.stops.length || 0;
        const stopsDir2 = directions['2']?.stops.length || 0;
        const scheduleId = toScheduleId(lineId);

        const lineInfo: LineInfo = {
          id: lineId,
          name: lineName(lineId),
          color: getColor(lineId),
          text_color: getTextColor(lineId),
          schedule_id: scheduleId || null,
          destinations,
          directions,
          stats: {
            stops_total: stopsDir1 + stopsDir2,
            stops_direction_1: stopsDir1,
            stops_direction_2: stopsDir2,
          },
          has_schedule: hasSchedule(lineId),
          active: true,
          is_circular: false,
        };

        newCache.set(lineId, lineInfo);
        logger.debug(`[lineIndex]   ${lineId}: dir1=${stopsDir1} stops, dir2=${stopsDir2} stops`);
      } catch (err) {
        logger.error({ err, lineId }, `[lineIndex] Failed to build route for line`);
      }
    }

    for (const line of newCache.values()) {
      line.is_circular = detectCircular(line);
    }

    // Assign to RAM L1
    linesCache = newCache;
    stopToLinesMap = buildStopToLinesMap(newCache);
    stopPositionIndex = buildStopPositionIndex(newCache);
    lineIntersectionIndex = buildLineIntersectionIndex(newCache);
    linePositionMaps = buildLinePositionMaps(newCache);

    if (stopNameCache.size === 0) {
      populateStopNameAndCoordsSync();
    }

    // Build the transit graph for the Trip Planner
    const { buildGraph } = await import('../services/transitGraph');
    buildGraph(newCache);

    lastBuilt = Date.now();
    
    logger.info(`[lineIndex] Catalog rebuilt: ${newCache.size} lines.`);
    
    // Persist to Redis (L2)
    try {
      await cacheDb.setLineCatalog(newCache);
      await cacheDb.setIndices(stopToLinesMap, lineIntersectionIndex, linePositionMaps);
      await cacheDb.setMetadata('last_line_build', lastBuilt.toString());
      logger.info('[lineIndex] Persisted catalog and indices to Redis.');
    } catch (err) {
      logger.warn({ err }, '[lineIndex] Failed to persist to Redis');
    }

    // Async tasks
    populateStopNameAndCoordsAsync().catch((err) => {
      logger.warn({ err }, '[lineIndex] Background coords cache update failed');
    });

  } finally {
    isBuilding = false;
  }
}

/**
 * Fast check. Used in HTTP requests. Returns immediately if data is in RAM or Redis.
 * Only blocks on a full cold start.
 */
export async function ensureLineIndex(): Promise<void> {
  // L1: RAM Cache
  if (linesCache && linesCache.size > 0) return;

  // Wait if it's already building from a cold start
  if (buildPromise) {
    await buildPromise;
    return;
  }

  buildPromise = (async () => {
    // L2: Redis Cache
    const redisLines = await cacheDb.getLineCatalog();
    const redisIndices = await cacheDb.getIndices();
    const redisLastBuilt = await cacheDb.getMetadata('last_line_build');

    if (redisLines && redisIndices && redisLastBuilt) {
      linesCache = redisLines;
      stopToLinesMap = redisIndices.stopToLines;
      lineIntersectionIndex = redisIndices.intersections;
      linePositionMaps = redisIndices.positions;
      // We must reconstruct stopPositionIndex because we didn't serialize it explicitly
      // (it can be derived quickly from linesCache)
      stopPositionIndex = buildStopPositionIndex(redisLines);
      lastBuilt = parseInt(redisLastBuilt, 10);
      
      populateStopNameAndCoordsSync();
      populateStopNameAndCoordsAsync().catch(() => {});
      
      logger.info('[lineIndex] Loaded catalog from Redis successfully.');
      return;
    }

    // L3: Cold Start (Fetch from Legacy API)
    logger.warn('[lineIndex] Cache miss in RAM and Redis. Performing cold start build...');
    await performLineIndexBuild();
  })();

  try {
    await buildPromise;
  } finally {
    buildPromise = null;
  }
}

/**
 * Starts a background interval to refresh the catalog every 24h.
 * This runs silently and doesn't block incoming requests.
 */
export function startBackgroundRefresh(): void {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    logger.info('[lineIndex] Triggering background catalog refresh...');
    performLineIndexBuild().catch(err => {
      logger.error({ err }, '[lineIndex] Background refresh failed');
    });
  }, CACHE_TTL.lines);
}

// ── Public accessors ───────────────────────────────────────────────
// Note: all accessors are synchronous and assume ensureLineIndex() was called by the route layer.

/** Return all cached lines (empty array if catalog hasn't been built yet). */
export function getLines(): LineInfo[] {
  if (!linesCache) return [];
  return Array.from(linesCache.values());
}

/** Look up a single line by its public ID (e.g. "LC", "1", "N1"). */
export function getLine(id: string): LineInfo | undefined {
  return linesCache?.get(id);
}

/** Return every line that passes through the given stop (O(1) using StopToLinesMap). */
export function getLinesForStop(stopId: number): string[] {
  const lineSet = stopToLinesMap.get(stopId);
  return lineSet ? Array.from(lineSet) : [];
}

/** Return the ordered stop IDs for a given line and direction ("1" or "2"). */
export function getLineStops(line: string, direction: string): number[] {
  const info = linesCache?.get(line);
  if (!info) return [];
  return info.directions[direction]?.stops || [];
}

/** Return all lineIds passing through a stop (alias for getLinesForStop, O(1)). */
export function getStopLines(stopId: number): string[] {
  return getLinesForStop(stopId);
}

/** Return all positions (lineId, dir, position) for a given stop across all lines (O(1)). */
export function getStopPositions(stopId: number): Array<{ lineId: string; dir: string; position: number }> {
  const lineMap = stopPositionIndex.get(stopId);
  if (!lineMap) return [];

  const results: Array<{ lineId: string; dir: string; position: number }> = [];
  for (const [lineId, positions] of lineMap) {
    for (const pos of positions) {
      results.push({
        lineId,
        dir: pos.dir,
        position: pos.position,
      });
    }
  }
  return results;
}

/** Return common stopIds between two lines (O(1), alphabetically sorted key). */
export function getCommonStops(lineA: string, lineB: string): number[] {
  const sorted = [lineA, lineB].sort();
  const key = `${sorted[0]}|${sorted[1]}`;
  return lineIntersectionIndex.get(key) || [];
}

/** Look up a stop's name from the precomputed cache (sync from stops.min.json, async from openData). */
export function getStopName(stopId: number): string | null {
  return stopNameCache.get(stopId) ?? null;
}

/** Return a Map<stopId, position> for a specific line and direction (O(1) from precomputed cache). */
export function getLinePositionMap(lineId: string, dir: string): Map<number, number> | null {
  const dirMaps = linePositionMaps.get(lineId);
  if (!dirMaps) return null;
  const posMap = dirMaps.get(dir);
  return posMap ?? null;
}

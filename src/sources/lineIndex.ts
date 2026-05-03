// ─── Line Index — Builds a line catalog by discovering lines from the Legacy API ───
// Called once at startup (or when cache expires after CACHE_TTL.lines).
// Algorithm:
//   1. POST /api/v1/estimations/get-compact {stopId: 41} → allLineLabels
//   2. For each line, POST /api/v1/routes/get-compact × 2 (both directions)
//   3. Enrich with colors (colors.json) and schedule presence (schedules.json)
//   4. Cache in memory

import fetch from 'node-fetch';
import { LEGACY_API_BASE, DISCOVERY_STOP_ID, CACHE_TTL } from '../config';
import { LineInfo } from '../types';
import { toScheduleId, lineName, getTextColor } from '../utils/lineMapping';

// ── Static data ────────────────────────────────────────────────────
import colorsRaw from '../../data/colors.json';
import schedulesRaw from '../../data/schedules.json';

// ── Types for Legacy API responses ─────────────────────────────────
interface RouteStopEntry {
  stopId: number;
  name: string;
  lines: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

/** Convert RGB array to hex string: [255,0,0] → '#FF0000' */
export function rgbToHex(rgb: number[]): string {
  const [r, g, b] = rgb;
  return (
    '#' +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function getColor(lineId: string): string {
  const colors = colorsRaw as Record<string, number[]>;
  const rgb = colors[lineId] || colors['default'];
  return rgbToHex(rgb);
}

function hasSchedule(lineId: string): boolean {
  const scheduleId = toScheduleId(lineId);
  if (!scheduleId) return false;
  const schedules = (schedulesRaw as any).horarios_hardcoded || {};
  return `${scheduleId}-1` in schedules || `${scheduleId}-2` in schedules;
}

// ── Legacy API calls ───────────────────────────────────────────────

/**
 * Fetch all line labels currently active at the discovery stop.
 * POST /api/v1/estimations/get-compact {stopId}
 * Response: [[arrivals...], [label1, label2, ...]]
 */
async function fetchAllLineLabels(stopId: number): Promise<string[]> {
  const url = `${LEGACY_API_BASE}/api/v1/estimations/get-compact`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stopId }),
  });
  if (!res.ok) throw new Error(`Legacy API /estimations/get-compact error: ${res.status}`);
  const data = (await res.json()) as any[];
  return data[1] || [];
}

/**
 * Fetch the route (ordered list of stops) for a given line from a given stop.
 * POST /api/v1/routes/get-compact {stopId, lineLabel}
 * Response: [[stopId, stopName, [lines...]], ...] or [] if stopId not on line.
 */
async function fetchRoute(stopId: number, line: string): Promise<RouteStopEntry[]> {
  const url = `${LEGACY_API_BASE}/api/v1/routes/get-compact`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stopId, lineLabel: line }),
  });
  if (!res.ok) throw new Error(`Legacy API /routes/get-compact error: ${res.status}`);
  const data = (await res.json()) as any[];
  if (!Array.isArray(data) || data.length === 0) return [];
  return data.map(
    (entry: any[]): RouteStopEntry => ({
      stopId: entry[0] as number,
      name: entry[1] as string,
      lines: entry[2] as string[],
    }),
  );
}

// ── In-memory cache ────────────────────────────────────────────────

let linesCache: Map<string, LineInfo> | null = null;
let lastBuilt: number = 0;

function isCacheValid(): boolean {
  return linesCache !== null && Date.now() - lastBuilt < CACHE_TTL.lines;
}

// ── Builder ────────────────────────────────────────────────────────

/**
 * Build (or refresh) the complete line catalog.
 * Safe to call multiple times — no-op if cache is still fresh.
 */
export async function buildLineIndex(): Promise<void> {
  if (isCacheValid()) return;

  console.log('[lineIndex] Building line catalog...');
  const allLineLabels = await fetchAllLineLabels(DISCOVERY_STOP_ID);
  console.log(`[lineIndex] Discovered ${allLineLabels.length} active line(s): ${allLineLabels.join(', ')}`);

  const newCache = new Map<string, LineInfo>();

  for (const lineId of allLineLabels) {
    try {
      // ── Direction 1: route from the discovery stop ──────────────
      const dir1Stops = await fetchRoute(DISCOVERY_STOP_ID, lineId);

      // ── Direction 2: route from the last stop of direction 1 ───
      let dir2Stops: RouteStopEntry[] = [];
      if (dir1Stops.length > 0) {
        const lastStopId = dir1Stops[dir1Stops.length - 1].stopId;
        if (lastStopId !== DISCOVERY_STOP_ID) {
          dir2Stops = await fetchRoute(lastStopId, lineId);
        }
      }

      // ── Build destinations and directions maps ─────────────────
      const destinations: { [dir: string]: string } = {};
      const directions: { [dir: string]: { destination: string; stops: number[] } } = {};

      if (dir1Stops.length > 0) {
        const dest = dir1Stops[dir1Stops.length - 1].name;
        destinations['1'] = dest;
        directions['1'] = {
          destination: dest,
          stops: dir1Stops.map((s) => s.stopId),
        };
      }

      if (dir2Stops.length > 0) {
        const dest = dir2Stops[dir2Stops.length - 1].name;
        destinations['2'] = dest;
        directions['2'] = {
          destination: dest,
          stops: dir2Stops.map((s) => s.stopId),
        };
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
      };

      newCache.set(lineId, lineInfo);
      console.log(`[lineIndex]   ${lineId}: dir1=${stopsDir1} stops → "${destinations['1'] || '?'}", dir2=${stopsDir2} stops → "${destinations['2'] || '?'}"`);
    } catch (err) {
      console.error(`[lineIndex] Failed to build route for line "${lineId}":`, err);
    }
  }

  linesCache = newCache;
  lastBuilt = Date.now();
  console.log(`[lineIndex] Catalog ready: ${newCache.size} lines cached (TTL: ${CACHE_TTL.lines}ms)`);
}

// ── Public accessors ───────────────────────────────────────────────

/** Return all cached lines (empty array if catalog hasn't been built yet). */
export function getLines(): LineInfo[] {
  if (!linesCache) return [];
  return Array.from(linesCache.values());
}

/** Look up a single line by its public ID (e.g. "LC", "1", "N1"). */
export function getLine(id: string): LineInfo | undefined {
  return linesCache?.get(id);
}

/** Return every line that passes through the given stop. */
export function getLinesForStop(stopId: number): string[] {
  if (!linesCache) return [];
  const result: string[] = [];
  for (const line of linesCache.values()) {
    for (const dir of Object.values(line.directions)) {
      if (dir.stops.includes(stopId)) {
        result.push(line.id);
        break; // don't duplicate the line
      }
    }
  }
  return result;
}

/** Return the ordered stop IDs for a given line and direction ("1" or "2"). */
export function getLineStops(line: string, direction: string): number[] {
  const info = linesCache?.get(line);
  if (!info) return [];
  return info.directions[direction]?.stops || [];
}

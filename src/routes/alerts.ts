import { Router, Request, Response } from 'express';
import * as lineIndex from '../sources/lineIndex';
import * as tusNativeApi from '../sources/tusNativeApi';
import { toScheduleId, getDayType } from '../utils/lineMapping';
import { timeToMinutes, currentTimeStr, loadSchedules } from '../utils/helpers';
import { parseTusEstimations } from '../utils/tusNativeParser';
import logger from '../utils/logger';

const router = Router();

// ─── Scratch cache for line status page with periodic cleanup ────────

let statusCache = new Map<string, { data: any; ts: number }>();
const STATUS_CACHE_TTL = 30_000; // 30 seconds

// Periodic cleanup
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanStatusCache(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - 2 * STATUS_CACHE_TTL;
  for (const [key, entry] of statusCache) {
    if (entry.ts < cutoff) {
      statusCache.delete(key);
    }
  }
}

// ─── GET /api/v1/alerts ─────────────────────────────────────────────

router.get('/alerts', (_req: Request, res: Response) => {
  res.json({
    alerts: [],
    total: 0,
    source: 'static',
    message: 'No active service alerts at this time. Check /lines/:line/status for per-line operational status.',
    updated: new Date().toISOString(),
  });
});

// ─── GET /api/v1/lines/:line/status ─────────────────────────────────

router.get('/lines/:line/status', async (req: Request, res: Response) => {
  const lineId = req.params.line as string;

  try {
    await lineIndex.ensureLineIndex();
    const info = lineIndex.getLine(lineId);

    if (!info) {
      return res.status(404).json({
        error: 'line_not_found', message: `La línea '${lineId}' no existe`,
        source: 'cache', timestamp: new Date().toISOString(),
      });
    }

    cleanStatusCache();

    const cached = statusCache.get(lineId);
    if (cached && Date.now() - cached.ts < STATUS_CACHE_TTL) {
      return res.json(cached.data);
    }

    let lastKnownBusMinutesAgo: number | null = null;
    let isActive = true;

    const firstDir = Object.keys(info.directions).sort()[0];
    const dirStops = firstDir ? info.directions[firstDir]?.[0]?.stops : undefined;
    if (dirStops && dirStops.length > 0) {
      const checkStop = dirStops[0];
      const resNative = await tusNativeApi.getEstimations(checkStop);

      if (!resNative || 'error' in resNative) {
        isActive = info.active;
      } else {
        const parsedArrivals = parseTusEstimations(resNative);
        const lineArrivals = parsedArrivals.filter((e) => e.line === lineId);
        if (lineArrivals.length > 0 && lineArrivals[0].minutes !== null) {
          lastKnownBusMinutesAgo = lineArrivals[0].minutes;
          isActive = true;
        } else {
          isActive = false;
        }
      }
    }

    // Get schedule info
    const scheduleId = toScheduleId(lineId);
    let scheduleStatus = 'unavailable';
    let nextScheduled: string | null = null;
    let serviceFirst: string | null = null;
    let serviceLast: string | null = null;

    if (scheduleId) {
      const schedules = loadSchedules().horarios_hardcoded;
      const day = getDayType();
      const key = `${scheduleId}-1`;
      const entry = schedules[key];
      if (entry && entry[day] && entry[day].length > 0) {
        const times = entry[day];
        serviceFirst = times[0];
        serviceLast = times[times.length - 1];

        const now = currentTimeStr();
        const nowMins = timeToMinutes(now);
        for (const t of times) {
          if (timeToMinutes(t) >= nowMins) {
            nextScheduled = t;
            break;
          }
        }
        scheduleStatus = nextScheduled ? 'active' : 'service_ended';
      }
    }

    const response = {
      line: lineId,
      active: isActive,
      frequency_min: 15,
      has_alerts: false,
      alerts: [] as never[],
      last_known_bus_minutes_ago: lastKnownBusMinutesAgo,
      schedule: {
        status: scheduleStatus,
        next_scheduled: nextScheduled,
        service_hours: serviceFirst && serviceLast
          ? { first: serviceFirst, last: serviceLast }
          : null,
      },
    };

    statusCache.set(lineId, { data: response, ts: Date.now() });

    res.json(response);
  } catch (err: any) {
    logger.error({ err, lineId }, '[alerts] Error in /status');
    res.status(500).json({
      error: 'internal_error',
      message: err?.message || 'Internal error',
      source: 'internal',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import * as tusNativeApi from '../sources/tusNativeApi';
import { CACHE_TTL } from '../config';
import { resolveStop, formatLocalTime, getMadridOffset } from '../utils/helpers';
import { parseTusEstimations } from '../utils/tusNativeParser';
import * as lineIndex from '../sources/lineIndex';
import logger from '../utils/logger';

const router = Router();

// ─── ETD cache ─────────────────────────────────────────────────────

const etdCache = new Map<string, { data: any; ts: number }>();

function etdCacheKey(stopId: number): string {
  return `etd:${stopId}`;
}

// ─── Shared ETD logic ──────────────────────────────────────────────

interface EtdEntry {
  line: string;
  destination: string;
  color: string;
  minutes: number | null;
  etd: string | null;
  etd_local: string | null;
  vehicle?: number;
  lat?: number;
  lng?: number;
  remaining_dist_m?: number;
  is_realtime?: boolean;
}

function computeEtds(res: tusNativeApi.TusNativeResponse, serverTime: Date): EtdEntry[] {
  const parsed = parseTusEstimations(res);
  return parsed.map((entry): EtdEntry => {
    const etdDate = entry.minutes !== null ? new Date(serverTime.getTime() + entry.minutes * 60 * 1000) : null;
    return {
      line: entry.line,
      destination: entry.destination,
      color: entry.color,
      minutes: entry.minutes,
      etd: etdDate ? etdDate.toISOString() : null,
      etd_local: etdDate ? formatLocalTime(etdDate) : null,
      vehicle: entry.vehicle,
      lat: entry.lat,
      lng: entry.lng,
      remaining_dist_m: entry.remaining_dist_m,
      is_realtime: entry.is_realtime,
    };
  });
}

// ─── GET /api/v1/now ────────────────────────────────────────────────

router.get('/now', (_req: Request, res: Response) => {
  const now = new Date();
  const madridParts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => madridParts.find(p => p.type === type)?.value || '00';
  const localTime = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${getMadridOffset()}`;

  res.json({
    server_time: now.toISOString(),
    timezone: 'Europe/Madrid',
    local_time: localTime,
  });
});

// ─── GET /api/v1/stops/:stop/etd ────────────────────────────────────

router.get('/stops/:stop/etd', async (req: Request, res: Response) => {
  try {
    const stopId = parseInt(req.params.stop as string, 10);
    if (isNaN(stopId)) {
      return res.status(400).json({
        error: 'invalid_params', message: 'stop must be a number', source: 'tus_native',
        timestamp: new Date().toISOString(),
      });
    }

    // Check ETD cache
    const key = etdCacheKey(stopId);
    const cached = etdCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL.arrivals) {
      return res.json(cached.data);
    }

    const stop = await resolveStop(stopId);
    if (!stop) {
      return res.status(404).json({
        error: 'stop_not_found', message: `La parada ${stopId} no existe`, source: 'gtfs',
        timestamp: new Date().toISOString(),
      });
    }

    const resNative = await tusNativeApi.getEstimations(stopId);

    if (!resNative || 'error' in resNative) {
      return res.status(503).json({
        error: 'tus_native_unavailable', message: 'TUS Native API no responde', source: 'tus_native',
        timestamp: new Date().toISOString(),
      });
    }

    const serverTime = new Date();
    const arrivals = computeEtds(resNative, serverTime);

    const response = {
      stop: { stopId: stop.stopId, name: stop.name, lat: stop.lat, lng: stop.lng },
      server_time: serverTime.toISOString(),
      arrivals,
    };

    // Cache
    etdCache.set(key, { data: response, ts: Date.now() });

    res.json(response);
  } catch (err: any) {
    logger.error({ err }, '[time] Error in /etd');
    res.status(500).json({
      error: 'internal_error', message: err?.message || 'Internal error', source: 'internal',
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── GET /api/v1/stops/:stop/arrivals/absolute ──────────────────────

router.get('/stops/:stop/arrivals/absolute', async (req: Request, res: Response) => {
  try {
    const stopId = parseInt(req.params.stop as string, 10);
    if (isNaN(stopId)) {
      return res.status(400).json({
        error: 'invalid_params', message: 'stop must be a number', source: 'tus_native',
        timestamp: new Date().toISOString(),
      });
    }

    const stop = await resolveStop(stopId);
    if (!stop) {
      return res.status(404).json({
        error: 'stop_not_found', message: `La parada ${stopId} no existe`, source: 'gtfs',
        timestamp: new Date().toISOString(),
      });
    }

    const resNative = await tusNativeApi.getEstimations(stopId);

    if (!resNative || 'error' in resNative) {
      return res.status(503).json({
        error: 'tus_native_unavailable', message: 'TUS Native API no responde', source: 'tus_native',
        timestamp: new Date().toISOString(),
      });
    }

    const serverTime = new Date();
    const arrivals = computeEtds(resNative, serverTime);

    res.json({
      stop: { stopId: stop.stopId, name: stop.name, lat: stop.lat, lng: stop.lng },
      server_time: serverTime.toISOString(),
      arrivals,
      all_lines: lineIndex.getLinesForStop(stopId),
    });
  } catch (err: any) {
    logger.error({ err }, '[time] Error in /arrivals/absolute');
    res.status(500).json({
      error: 'internal_error', message: err?.message || 'Internal error', source: 'internal',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

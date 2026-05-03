import { Request, Response } from 'express';
import * as openData from '../sources/openData';
import * as lineIndex from '../sources/lineIndex';
import { haversine } from '../utils/haversine';
import { NEARBY_RADIUS } from '../config';
import { resolveStop } from '../utils/helpers';
import { Stop } from '../types';

// ─── Nearby cache (stopId → nearby stops, TTL 5 min) ───────────────
const nearbyCache = new Map<number, { data: { stopId: number; name: string; meters: number }[]; ts: number }>();
const NEARBY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();
function cleanNearbyCache(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of nearbyCache) {
    if (now - entry.ts > NEARBY_CACHE_TTL) {
      nearbyCache.delete(key);
    }
  }
}

export async function searchStopsRedirect(req: Request, res: Response) {
  return res.redirect(307, `/api/v1/stops?q=${encodeURIComponent((req.query.q as string) || '')}`);
}

export async function getNearbyStops(req: Request, res: Response) {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'invalid_params', message: 'lat and lng query parameters are required and must be numbers' });
    }
    const radiusRaw = parseFloat(req.query.radius as string);
    const radius = Number.isNaN(radiusRaw) ? NEARBY_RADIUS : radiusRaw;
    
    const limitRaw = parseInt(req.query.limit as string);
    const limit = Number.isNaN(limitRaw) ? 10 : limitRaw;

    const allStops = await openData.getStops();
    const results = allStops
      .map(s => ({
        stopId: s.stopId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        meters: Math.round(haversine(lat, lng, s.lat, s.lng)),
      }))
      .filter(s => s.meters <= radius)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, limit);

    res.json({ results, total: results.length, center: { lat, lng }, radius, source: 'open_data' });
  } catch (err: any) {
    console.error('[stops/nearby] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
}

export async function listOrSearchStops(req: Request, res: Response) {
  try {
    const q = req.query.q as string | undefined;
    const limit = Number.isNaN(parseInt(req.query.limit as string)) ? 50 : parseInt(req.query.limit as string);
    const offset = Number.isNaN(parseInt(req.query.offset as string)) ? 0 : parseInt(req.query.offset as string);

    let results: Stop[];
    if (q) {
      results = await openData.searchStops(q);
    } else {
      results = await openData.getStops();
    }

    // Enrich with lines
    results = results.map(s => ({ ...s, lines: lineIndex.getLinesForStop(s.stopId) }));
    const paged = results.slice(offset, offset + limit);

    res.json({ results: paged, total: results.length, query: q || null, source: 'open_data' });
  } catch (err: any) {
    console.error('[stops] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
}

export async function getStopDetail(req: Request, res: Response) {
  try {
    const stopId = parseInt(req.params.stop as string);
    if (isNaN(stopId)) {
      return res.status(400).json({ error: 'invalid_params', message: 'stopId must be a number' });
    }

    const stop = await resolveStop(stopId);
    if (!stop) {
      return res.status(404).json({ error: 'stop_not_found', message: `La parada ${stopId} no existe` });
    }

    await lineIndex.buildLineIndex();
    const lines = lineIndex.getLinesForStop(stopId);
    const allLines = lineIndex.getLines().filter(l => lines.includes(l.id));

    cleanNearbyCache();

    // Nearby stops (cached per stopId, TTL 5 min)
    let nearby: { stopId: number; name: string; meters: number }[];
    const cached = nearbyCache.get(stopId);
    if (cached && Date.now() - cached.ts < NEARBY_CACHE_TTL) {
      nearby = cached.data;
    } else {
      const allStops = await openData.getStops();
      nearby = allStops
        .filter(s => s.stopId !== stopId)
        .map(s => ({ stopId: s.stopId, name: s.name, meters: Math.round(haversine(stop.lat, stop.lng, s.lat, s.lng)) }))
        .filter(s => s.meters <= NEARBY_RADIUS)
        .sort((a, b) => a.meters - b.meters)
        .slice(0, 10);
      nearbyCache.set(stopId, { data: nearby, ts: Date.now() });
    }

    res.json({
      stopId: stop.stopId,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      address: stop.address,
      sentido: stop.sentido,
      source: stop.source,
      lines: allLines.map(l => ({ id: l.id, color: l.color, destinations: Object.values(l.destinations) })),
      nearby,
    });
  } catch (err: any) {
    console.error('[stops/:stop] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
}

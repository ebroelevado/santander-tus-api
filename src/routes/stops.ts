import { Router, Request, Response } from 'express';
import * as openData from '../sources/openData';
import * as lineIndex from '../sources/lineIndex';
import { haversine } from '../utils/haversine';
import { NEARBY_RADIUS } from '../config';
import stopsMinRaw from '../../data/stops.min.json';
import { Stop } from '../types';

const router = Router();
const stopsMin = stopsMinRaw as unknown as Record<string, [number, number, number, string]>;

async function resolveStop(stopId: number): Promise<Stop | null> {
  const od = await openData.getStopById(stopId);
  if (od) return od;
  const key = String(stopId);
  if (stopsMin[key]) {
    const [, lat, lng, name] = stopsMin[key];
    return { stopId, name, lat, lng, address: null, sentido: null, lines: [], source: 'stops_min' };
  }
  return null;
}

router.get('/stops', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

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
});

router.get('/stops/:stop', async (req: Request, res: Response) => {
  try {
    const stopId = parseInt(req.params.stop as string);
    if (isNaN(stopId)) {
      return res.status(400).json({ error: 'invalid_params', message: 'stopId must be a number' });
    }

    const stop = await resolveStop(stopId);
    if (!stop) {
      return res.status(404).json({ error: 'stop_not_found', message: `La parada ${stopId} no existe` });
    }

    const lines = lineIndex.getLinesForStop(stopId);
    const allLines = lineIndex.getLines().filter(l => lines.includes(l.id));

    // Nearby stops
    const allStops = await openData.getStops();
    const nearby = allStops
      .filter(s => s.stopId !== stopId)
      .map(s => ({ stopId: s.stopId, name: s.name, meters: Math.round(haversine(stop.lat, stop.lng, s.lat, s.lng)) }))
      .filter(s => s.meters <= NEARBY_RADIUS)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 10);

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
    console.error('[stops] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
});

export default router;

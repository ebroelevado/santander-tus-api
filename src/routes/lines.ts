import { Router, Request, Response } from 'express';
import * as lineIndex from '../sources/lineIndex';
import * as openData from '../sources/openData';
import { toScheduleId } from '../utils/lineMapping';
import stopsMinRaw from '../../data/stops.min.json';
import { Stop } from '../types';

const router = Router();
const stopsMin = stopsMinRaw as unknown as Record<string, [number, number, number, string]>;

function getStopCoords(stopId: number): { name: string; lat: number; lng: number; source: string; sentido: string | null; address: string | null; lines: string[] } | null {
  const key = String(stopId);
  if (stopsMin[key]) {
    const [, lat, lng, name] = stopsMin[key];
    return { name, lat, lng, source: 'stops_min', sentido: null, address: null, lines: [] };
  }
  return null;
}

router.get('/lines', async (_req: Request, res: Response) => {
  try {
    await lineIndex.buildLineIndex();
    const lines = lineIndex.getLines();
    res.json({
      lines: lines.map(l => ({
        id: l.id,
        name: l.name,
        color: l.color,
        text_color: l.text_color,
        destinations: Object.values(l.destinations),
        stops: l.stats.stops_total,
        has_schedule: l.has_schedule,
        active: l.active,
      })),
      total: lines.length,
      updated: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[lines] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
});

router.get('/lines/:line', async (req: Request, res: Response) => {
  try {
    await lineIndex.buildLineIndex();
    const line = lineIndex.getLine(req.params.line as string);
    if (!line) {
      return res.status(404).json({ error: 'line_not_found', message: `La línea '${req.params.line}' no existe` });
    }
    res.json({
      id: line.id,
      name: line.name,
      color: line.color,
      text_color: line.text_color,
      schedule_id: toScheduleId(line.id) || null,
      destinations: line.destinations,
      stats: line.stats,
      has_schedule: line.has_schedule,
      active: line.active,
    });
  } catch (err: any) {
    console.error('[lines] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
});

router.get('/lines/:line/route', async (req: Request, res: Response) => {
  try {
    await lineIndex.buildLineIndex();
    const line = lineIndex.getLine(req.params.line as string);
    if (!line) {
      return res.status(404).json({ error: 'line_not_found', message: `La línea '${req.params.line}' no existe` });
    }

    const dir = (req.query.direction as string) || 'all';
    const directions: any[] = [];

    for (const [dId, dData] of Object.entries(line.directions)) {
      if (dir !== 'all' && dId !== dir) continue;
      const stops = await Promise.all(dData.stops.map(async (sid) => {
        const odStop = await openData.getStopById(sid);
        if (odStop) return odStop;
        const fallback = getStopCoords(sid);
        if (fallback) return { stopId: sid, ...fallback, lines: lineIndex.getLinesForStop(sid) };
        return { stopId: sid, name: `Parada ${sid}`, lat: 0, lng: 0, address: null, sentido: null, lines: [], source: 'stops_min' };
      }));
      directions.push({ id: dId, destination: dData.destination, stops });
    }

    res.json({ line: line.id, color: line.color, directions });
  } catch (err: any) {
    console.error('[lines] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
});

// Intersect endpoint (shared with compare.ts category but logically here)
router.get('/lines/:lineA/intersect/:lineB', (req: Request, res: Response) => {
  const a = req.params.lineA as string;
  const b = req.params.lineB as string;
  const stopsA = new Set(lineIndex.getLineStops(a, '1').concat(lineIndex.getLineStops(a, '2')));
  const stopsB = lineIndex.getLineStops(b, '1').concat(lineIndex.getLineStops(b, '2'));
  const common = stopsB.filter(s => stopsA.has(s));
  res.json({ line_a: a, line_b: b, common_stops: common, total: common.length });
});

export default router;

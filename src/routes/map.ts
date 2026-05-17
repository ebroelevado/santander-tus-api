import { Router, Request, Response } from 'express';
import * as stopsCache from '../sources/stopsCache';
import { getLines, getLine, ensureLineIndex, stopCoordsCache } from '../sources/lineIndex';
import { resolveStop } from '../utils/helpers';

const router = Router();

// ─── GET /api/v1/map/stops ─────────────────────────────────────────

router.get('/stops', async (_req: Request, res: Response) => {
  try {
    const stops = await stopsCache.getStops();
    const features = stops.map((s: any) => ({
      type: 'Feature',
      properties: {
        publicId: s.stopId,
        name: s.name,
      },
      geometry: {
        type: 'Point',
        coordinates: [s.lng, s.lat],
      },
    }));
    res.json({ type: 'FeatureCollection', features, total: stops.length, source: 'gtfs' });
  } catch (err) {
    res.status(500).json({ error: 'map_stops_error', message: 'Failed to fetch stops', source: 'open_data', timestamp: new Date().toISOString() });
  }
});

// ─── GET /api/v1/map/lines/:line ───────────────────────────────────

router.get('/lines/:line', async (req: Request, res: Response) => {
  try {
    await ensureLineIndex();
    const lineInfo = getLine(req.params.line as string);
    if (!lineInfo) {
      return res.status(404).json({ error: 'line_not_found', message: `La línea '${req.params.line}' no existe`, source: 'cache', timestamp: new Date().toISOString() });
    }

    const direction = (req.query.direction as string) || 'all';

    const features: any[] = [];

    const stopCoordsMap = stopCoordsCache;

    const buildFeature = async (dir: string, stops: number[], destination: string) => {
      const coordinates: [number, number][] = [];
      for (const sid of stops) {
        const c = stopCoordsMap.get(sid);
        if (c) coordinates.push([c.lng, c.lat]);
      }
      if (coordinates.length > 0) {
        features.push({
          type: 'Feature',
          properties: {
            line: lineInfo.id,
            direction: dir,
            destination,
            color: lineInfo.color,
          },
          geometry: {
            type: 'LineString',
            coordinates,
          },
        });
      }
    };

    for (const [dId, routes] of Object.entries(lineInfo.directions)) {
      if (direction !== 'all' && dId !== direction) continue;
      for (const route of routes) {
        await buildFeature(dId, route.stops, route.destination);
      }
    }

    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    res.status(500).json({ error: 'map_lines_error', message: 'Failed to build GeoJSON', source: 'cache', timestamp: new Date().toISOString() });
  }
});

// ─── GET /api/v1/map/lines ─────────────────────────────────────────

router.get('/lines', async (_req: Request, res: Response) => {
  try {
    await ensureLineIndex();
    const lines = getLines();
    const stopCoordsMap = stopCoordsCache;

    const features: any[] = [];

    for (const line of lines) {
      for (const dir of Object.keys(line.directions)) {
        const routes = line.directions[dir];
        for (const route of routes) {
          const coordinates: [number, number][] = [];
          for (const sid of route.stops) {
            const c = stopCoordsMap.get(sid);
            if (c) coordinates.push([c.lng, c.lat]);
          }
          
          if (coordinates.length > 0) {
            features.push({
              type: 'Feature',
              properties: {
                line: line.id,
                direction: dir,
                destination: route.destination,
                color: line.color,
              },
              geometry: {
                type: 'LineString',
                coordinates,
              },
            });
          }
        }
      }
    }

    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    res.status(500).json({ error: 'map_lines_error', message: 'Failed to build GeoJSON', source: 'cache', timestamp: new Date().toISOString() });
  }
});

// ─── GET /api/v1/map/vehicles ──────────────────────────────────────
router.get('/vehicles', async (_req: Request, res: Response) => {
  try {
    const { getVehicles } = await import('../sources/tusNativeApi');
    const vehicles = await getVehicles();
    
    const features = vehicles.map((v) => ({
      type: 'Feature',
      properties: {
        id: v.vehicle,
        line: v.line,
        destination: v.destination,
        delay: v.delay,
        heading: 0, // Native API doesn't seem to provide heading yet
      },
      geometry: {
        type: 'Point',
        coordinates: [v.lng, v.lat],
      },
    }));

    res.json({
      type: 'FeatureCollection',
      features,
      updated: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ 
      error: 'map_vehicles_error', 
      message: err?.message || 'Failed to fetch vehicles', 
      source: 'native', 
      timestamp: new Date().toISOString() 
    });
  }
});

export default router;

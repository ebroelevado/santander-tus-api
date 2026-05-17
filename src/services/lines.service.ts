import * as lineIndex from '../sources/lineIndex';
import * as gtfsDb from '../sources/gtfsDb';
import { resolveStop } from '../utils/helpers';
import { toScheduleId } from '../utils/lineMapping';
import * as lineIdMap from '../utils/lineIdMap';
import { LineSummary } from '../types';

export async function getLines(): Promise<LineSummary[]> {
  await lineIndex.ensureLineIndex();
  const lines = lineIndex.getLines();
  return lines.map(l => ({
    id: l.id,
    name: l.name,
    color: l.color,
    text_color: l.text_color,
    destinations: Object.values(l.destinations),
    stops: l.stats.stops_total,
    has_schedule: l.has_schedule,
    active: l.active,
  }));
}

export async function getLine(lineId: string) {
  await lineIndex.ensureLineIndex();
  const line = lineIndex.getLine(lineId);
  if (!line) return null;

  // Flatten directions for LineDetail compatibility (single route per dir).
  // The full multi-route list is available via getLineRoute().
  const flattenedDirections: Record<string, { destination: string; stops: number[] }> = {};
  for (const [dirId, routes] of Object.entries(line.directions)) {
    if (routes.length > 0) {
      // Pick the longest route as the representative
      const best = routes.reduce((a, b) => a.stops.length > b.stops.length ? a : b, routes[0]);
      flattenedDirections[dirId] = best;
    }
  }

  return {
    id: line.id,
    name: line.name,
    color: line.color,
    text_color: line.text_color,
    schedule_id: toScheduleId(line.id) || null,
    destinations: line.destinations,
    directions: flattenedDirections,
    stats: line.stats,
    has_schedule: line.has_schedule,
    active: line.active,
    is_circular: line.is_circular,
  };
}

export async function getLineStops(lineId: string) {
  await lineIndex.ensureLineIndex();
  const line = lineIndex.getLine(lineId);
  if (!line) return null;

  const stopsSet = new Set<number>();
  for (const routes of Object.values(line.directions)) {
    for (const route of routes) {
      for (const sid of route.stops) {
        stopsSet.add(sid);
      }
    }
  }

  const allStops = Array.from(stopsSet);
  return { line: line.id, color: line.color, stops: allStops, total: allStops.length };
}

export async function getLineRoute(lineId: string, dirFilter: string) {
  await lineIndex.ensureLineIndex();
  const line = lineIndex.getLine(lineId);
  if (!line) return null;

  const directions: any[] = [];
  for (const [dId, routes] of Object.entries(line.directions)) {
    if (dirFilter !== 'all') {
      // Accept raw direction ID ("1") or composite ID ("1-0", "1-1")
      if (dId !== dirFilter && !dirFilter.startsWith(`${dId}-`)) continue;
    }
    
    // If there are multiple routes in this direction, emit them as separate
    // direction entries with composite IDs (e.g. "1-0", "1-1")
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const routeId = routes.length > 1 ? `${dId}-${i}` : dId;
      const stops = await Promise.all(route.stops.map(async (sid) => {
        const stop = await resolveStop(sid);
        if (stop) return { ...stop, lines: lineIndex.getLinesForStop(sid) };
        return { stopId: sid, name: `Parada ${sid}`, lat: null, lng: null, address: null, sentido: null, lines: [], source: 'stops_min' };
      }));
      directions.push({ id: routeId, destination: route.destination, stops });
    }
  }

  return { line: line.id, color: line.color, directions };
}

export async function getLinesIntersect(a: string, b: string) {
  await lineIndex.ensureLineIndex();

  const lineA = lineIndex.getLine(a);
  const lineB = lineIndex.getLine(b);
  if (!lineA || !lineB) {
    return { error: 'not_found', missingA: !lineA, missingB: !lineB };
  }

  const stopsA = new Set(lineIndex.getLineStops(a, '1').concat(lineIndex.getLineStops(a, '2')));
  const stopsB = lineIndex.getLineStops(b, '1').concat(lineIndex.getLineStops(b, '2'));
  const common = stopsB.filter(s => stopsA.has(s));

  return { line_a: a, line_b: b, common_stops: common, total: common.length };
}

export async function getLineGeometry(lineId: string, dirFilter: string) {
  await lineIndex.ensureLineIndex();
  const line = lineIndex.getLine(lineId);
  if (!line) return null;

  const db = gtfsDb.openDb();
  const numericLineId = lineIdMap.resolveLineId(lineId);

  const features: any[] = [];
  for (const [dId, routes] of Object.entries(line.directions)) {
    if (dirFilter !== 'all' && dId !== dirFilter) continue;

    const gtfsDir = String(Number(dId) - 1);

    // For each unique destination in this direction, find the most common routeId
    for (const route of routes) {
      const routeIdRow = db.prepare(`
        SELECT routeId FROM Trips
        WHERE lineId = ? AND direction = ? AND destination = ?
        GROUP BY routeId
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `).get(numericLineId, gtfsDir, route.destination) as { routeId: number } | undefined;

      if (!routeIdRow) continue;

      const points = gtfsDb.queryRoutePoints(routeIdRow.routeId);
      if (points.length === 0) continue;

      features.push({
        type: 'Feature',
        properties: {
          direction: dId,
          destination: route.destination,
          line: lineId,
        },
        geometry: {
          type: 'LineString',
          coordinates: points.map(p => [p.lon, p.lat]),
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    line: line.id,
    color: line.color,
    features,
  };
}

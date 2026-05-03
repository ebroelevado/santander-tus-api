import { Request, Response } from 'express';
import { buildLineIndex, getLinesForStop, getLine, getStopName } from '../sources/lineIndex';
import { resolveStop } from '../utils/helpers';
import { findDirectRoutes, findTransferRoutes, TripOption } from '../services/trip.service';

export async function planTrip(req: Request, res: Response) {
  try {
    const fromId = parseInt(req.query.from as string, 10);
    const toId = parseInt(req.query.to as string, 10);

    if (isNaN(fromId) || isNaN(toId)) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Both "from" and "to" query parameters (stop IDs) are required',
        source: 'cache',
        timestamp: new Date().toISOString(),
      });
    }

    if (fromId === toId) {
      return res.status(200).json({
        from: { stopId: fromId, name: getStopName(fromId) || 'Unknown' },
        to: { stopId: toId, name: getStopName(toId) || 'Unknown' },
        options: [],
        summary: {
          total_options: 0,
          direct_count: 0,
          transfer_count: 0,
          best_duration_min: null,
          message: 'Origin and destination are the same',
        },
      });
    }

    await buildLineIndex();

    const fromStop = await resolveStop(fromId);
    const toStop = await resolveStop(toId);

    if (!fromStop) {
      return res.status(404).json({
        error: 'stop_not_found',
        message: `Origin stop ${fromId} not found`,
        source: 'cache',
        timestamp: new Date().toISOString(),
      });
    }
    if (!toStop) {
      return res.status(404).json({
        error: 'stop_not_found',
        message: `Destination stop ${toId} not found`,
        source: 'cache',
        timestamp: new Date().toISOString(),
      });
    }

    const directOptions = findDirectRoutes(fromId, toId);
    const transferOptions = findTransferRoutes(fromId, toId);
    let allOptions = [...directOptions, ...transferOptions];

    const seen = new Set<string>();
    allOptions = allOptions.filter(o => {
      const key = `${o.type}|${o.line}|${o.total_stops}|${o.transfer_at?.stopId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    allOptions.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'direct' ? -1 : 1;
      if (a.total_stops !== b.total_stops) return a.total_stops - b.total_stops;
      if (a.duration_min !== b.duration_min) return a.duration_min - b.duration_min;
      return a.line.localeCompare(b.line);
    });

    const topOptions = allOptions.slice(0, 10);

    if (topOptions.length === 0) {
      return res.status(200).json({
        from: { stopId: fromId, name: fromStop.name },
        to: { stopId: toId, name: toStop.name },
        options: [],
        summary: {
          total_options: 0,
          direct_count: 0,
          transfer_count: 0,
          best_duration_min: null,
          message: 'No route found',
        },
      });
    }

    const bestDuration = topOptions[0].duration_min;
    const directCount = topOptions.filter(o => o.type === 'direct').length;
    const transferCount = topOptions.filter(o => o.type === 'transfer').length;

    res.json({
      from: { stopId: fromId, name: fromStop.name },
      to: { stopId: toId, name: toStop.name },
      options: topOptions,
      summary: {
        total_options: topOptions.length,
        direct_count: directCount,
        transfer_count: transferCount,
        best_duration_min: bestDuration,
        message: `${topOptions.length} route(s) found`,
      },
    });
  } catch (err) {
    console.error('[trip] Error:', err);
    res.status(500).json({
      error: 'trip_error',
      message: 'Failed to plan trip',
      source: 'cache',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function getConnections(req: Request, res: Response) {
  try {
    const stopId = parseInt(req.params.stop as string, 10);
    if (isNaN(stopId)) {
      return res.status(400).json({ error: 'invalid_stop', message: 'Stop ID must be a number', source: 'cache', timestamp: new Date().toISOString() });
    }

    await buildLineIndex();

    const originStop = await resolveStop(stopId);
    if (!originStop) {
      return res.status(404).json({ error: 'stop_not_found', message: `Stop ${stopId} not found`, source: 'cache', timestamp: new Date().toISOString() });
    }

    const lines = getLinesForStop(stopId);

    interface ConnectionEntry {
      stopId: number;
      name: string;
      via_line: string;
      direction: string;
    }

    const connections: Map<number, ConnectionEntry[]> = new Map();

    for (const lineId of lines) {
      const lineInfo = getLine(lineId);
      if (!lineInfo) continue;

      for (const dir of Object.keys(lineInfo.directions)) {
        const stops = lineInfo.directions[dir].stops;
        const idx = stops.indexOf(stopId);
        if (idx === -1) continue;

        for (let i = idx + 1; i < stops.length; i++) {
          const targetId = stops[i];
          if (!connections.has(targetId)) {
            connections.set(targetId, []);
          }
          const resolved = await resolveStop(targetId);
          connections.get(targetId)!.push({
            stopId: targetId,
            name: resolved?.name || 'Unknown',
            via_line: lineId,
            direction: lineInfo.directions[dir].destination,
          });
        }
      }
    }

    const result: { stop: { stopId: number; name: string }; reachable_stops: any[] } = {
      stop: { stopId, name: originStop.name },
      reachable_stops: [],
    };

    for (const [sid, entries] of connections) {
      result.reachable_stops.push({
        stopId: sid,
        name: entries[0]?.name || 'Unknown',
        via_lines: entries.map((e) => ({ line: e.via_line, direction: e.direction })),
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'connections_error', message: 'Failed to get connections', source: 'cache', timestamp: new Date().toISOString() });
  }
}

import { Request, Response } from 'express';
import { toScheduleId, getDayType, dayTypeName } from '../utils/lineMapping';
import { getLinesForStop } from '../sources/lineIndex';
import { timeToMinutes, currentTimeStr, loadSchedules } from '../utils/helpers';

/** Build the lookup key: "{scheduleId}-{direction}" */
function scheduleKey(lineId: string, direction: string): string | null {
  const sId = toScheduleId(lineId);
  if (!sId) return null;
  return `${sId}-${direction}`;
}

/** Calculate approximate headway in minutes from sorted time array */
function calcFrequency(times: string[]): number | null {
  if (times.length < 2) return null;
  let totalGap = 0;
  let gaps = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = timeToMinutes(times[i]) - timeToMinutes(times[i - 1]);
    if (gap > 0 && gap < 120) {
      // ignore unreasonable gaps (e.g. night buses)
      totalGap += gap;
      gaps++;
    }
  }
  return gaps > 0 ? Math.round(totalGap / gaps) : null;
}

export async function getLineSchedules(req: Request, res: Response) {
  const line = req.params.line as string;
  const day = (req.query.day as string) || getDayType();
  const direction = (req.query.direction as string) || '1';

  if (!['L', 'S', 'F'].includes(day)) {
    return res.status(400).json({
      error: 'invalid_params',
      message: "day must be one of: L, S, F. L=Laborables, S=Sábados, F=Festivos",
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }
  if (!['1', '2'].includes(direction)) {
    return res.status(400).json({
      error: 'invalid_params',
      message: 'direction must be 1 or 2',
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }

  const key = scheduleKey(line, direction);
  if (!key) {
    return res.status(404).json({
      error: 'schedule_not_found',
      message: `La línea '${line}' no tiene horarios disponibles`,
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }

  const schedules = loadSchedules().horarios_hardcoded;
  const entry = schedules[key];

  if (!entry || !entry[day] || entry[day].length === 0) {
    return res.status(404).json({
      error: 'schedule_not_found',
      message: `No hay horarios para la línea '${line}' (${key}) en día ${dayTypeName(day)} dirección ${direction}`,
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }

  const times = entry[day];
  const frequency = calcFrequency(times);

  res.json({
    line,
    direction,
    day,
    day_name: dayTypeName(day),
    times,
    total: times.length,
    first: times[0],
    last: times[times.length - 1],
    frequency_min: frequency,
    source: 'static',
  });
}

export async function getNextLineSchedule(req: Request, res: Response) {
  const line = req.params.line as string;
  const day = (req.query.day as string) || getDayType();
  const direction = (req.query.direction as string) || '1';

  if (!['L', 'S', 'F'].includes(day)) {
    return res.status(400).json({
      error: 'invalid_params',
      message: "day must be one of: L, S, F",
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }
  if (!['1', '2'].includes(direction)) {
    return res.status(400).json({
      error: 'invalid_params',
      message: 'direction must be 1 or 2',
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }

  const key = scheduleKey(line, direction);
  if (!key) {
    return res.status(404).json({
      error: 'schedule_not_found',
      message: `La línea '${line}' no tiene horarios`,
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }

  const schedules = loadSchedules().horarios_hardcoded;
  const entry = schedules[key];

  if (!entry || !entry[day] || entry[day].length === 0) {
    return res.status(404).json({
      error: 'schedule_not_found',
      message: `No hay horarios para la línea '${line}' (${key}) en día ${dayTypeName(day)} dirección ${direction}`,
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }

  const times = entry[day];
  const now = currentTimeStr();
  const nowMinutes = timeToMinutes(now);

  // Find the next time >= now
  let nextTime: string | null = null;
  for (const t of times) {
    if (timeToMinutes(t) >= nowMinutes) {
      nextTime = t;
      break;
    }
  }

  if (!nextTime) {
    return res.json({
      line,
      direction,
      day,
      now,
      next: null,
      status: 'service_ended',
      message: 'No hay más servicios programados para hoy',
    });
  }

  const minutesFromNow = timeToMinutes(nextTime) - nowMinutes;

  res.json({
    line,
    direction,
    day,
    now,
    next: { time: nextTime, minutes_from_now: minutesFromNow },
    status: 'active',
  });
}

export async function getStopSchedules(req: Request, res: Response) {
  const stopId = parseInt(req.params.stop as string, 10);

  if (isNaN(stopId)) {
    return res.status(400).json({
      error: 'invalid_params',
      message: 'stop must be a number',
      source: 'static',
      timestamp: new Date().toISOString(),
    });
  }

  // Get all lines serving this stop
  const lineIds = getLinesForStop(stopId);

  if (lineIds.length === 0) {
    return res.json({
      stop: stopId,
      schedules: [],
      total: 0,
      source: 'static',
    });
  }

  const schedules = loadSchedules().horarios_hardcoded;
  const day = getDayType();
  const results: {
    line: string;
    direction: string;
    day: string;
    day_name: string;
    first: string | null;
    last: string | null;
    frequency_min: number | null;
    times: string[];
  }[] = [];

  for (const lineId of lineIds) {
    for (const dir of ['1', '2']) {
      const key = scheduleKey(lineId, dir);
      if (!key) continue;
      const entry = schedules[key];
      if (!entry || !entry[day] || entry[day].length === 0) continue;

      const times = entry[day];
      results.push({
        line: lineId,
        direction: dir,
        day,
        day_name: dayTypeName(day),
        first: times[0],
        last: times[times.length - 1],
        frequency_min: calcFrequency(times),
        times,
      });
    }
  }

  res.json({
    stop: stopId,
    schedules: results,
    total: results.length,
    source: 'static',
  });
}

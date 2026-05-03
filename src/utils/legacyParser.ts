import { ParsedArrival, LineStatusResponse } from '../types';

/**
 * Parses raw legacy arrival entries into strictly typed objects.
 * Input example: ["7C1", "Ojaiz", 5, 23]
 */
export function parseLegacyArrivals(raw: [string, string, number | null, number | null][]): ParsedArrival[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((entry) => {
    return {
      line: entry[0],
      destination: entry[1],
      color: '', // filled downstream if needed
      minutes: typeof entry[2] === 'number' ? entry[2] : null,
      next: typeof entry[3] === 'number' ? entry[3] : null,
      active: typeof entry[2] === 'number',
    };
  });
}

/**
 * Parses raw status endpoint results to ensure they match the LineStatusResponse schema.
 */
export function parseLegacyStatus(raw: any): LineStatusResponse {
  return {
    line: raw.line || '',
    active: !!raw.active,
    frequency_min: typeof raw.frequency_min === 'number' ? raw.frequency_min : 0,
    has_alerts: !!raw.has_alerts,
    alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
    last_known_bus_minutes_ago: typeof raw.last_known_bus_minutes_ago === 'number' ? raw.last_known_bus_minutes_ago : null,
    schedule: raw.schedule || {
      status: 'unknown',
      next_scheduled: null,
      service_hours: null,
    },
  };
}

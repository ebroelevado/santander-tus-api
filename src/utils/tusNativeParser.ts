import { TusNativeResponse } from '../sources/tusNativeApi';
import { ParsedArrival } from '../types';
import * as lineIdMap from './lineIdMap';
import { getColor } from './helpers';

/**
 * Parses the raw TUS Native response into the internal ParsedArrival format.
 * 
 * Handles:
 * 1. Mapping numeric line IDs to public labels ('1', 'LC', etc.)
 * 2. Converting seconds (remainingTime) to minutes
 * 3. Extracting GPS coordinates and vehicle ID
 * 4. Sorting arrivals by time
 */
export function parseTusEstimations(raw: TusNativeResponse): ParsedArrival[] {
  const results: ParsedArrival[] = [];

  for (const lineGroup of raw) {
    const label = lineIdMap.resolveLineLabel(lineGroup.line);
    if (!label) continue;

    for (const est of lineGroup.estimations) {
      const minutes = Math.round(est.remainingTime / 60);
      
      results.push({
        line: label,
        destination: est.destination,
        color: getColor(label),
        minutes: minutes,
        next: minutes, // For backward compatibility with legacy next field
        active: est.rt !== false, // If rt flag is false, it's not real-time (but might still be active)
        vehicle: est.vehicle,
        lat: est.lat,
        lng: est.lon,
        remaining_dist_m: est.remainingDist,
        is_realtime: est.rt,
      });
    }
  }

  // Sort by minutes ascending
  return results.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999));
}

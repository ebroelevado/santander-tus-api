import * as gtfsDb from '../sources/gtfsDb';
import logger from '../utils/logger';

let labelToIdMap = new Map<string, number>();
let idToLabelMap = new Map<number, string>();
let isInitialized = false;

/**
 * Initializes the line mapping from the GTFS database.
 * Should be called after GTFS is downloaded and line index is building.
 */
export function initLineMap() {
  try {
    const lines = gtfsDb.queryLines();
    labelToIdMap.clear();
    idToLabelMap.clear();

    for (const line of lines) {
      // Remove quotes from shortName if present (sqlite might return them as '1')
      const label = line.shortName.replace(/['"]/g, '');
      const id = Number(line.lineId);
      
      labelToIdMap.set(label, id);
      idToLabelMap.set(id, label);
    }

    if (labelToIdMap.size > 0) {
      isInitialized = true;
      logger.info({ count: labelToIdMap.size }, '[lineIdMap] Initialized line mappings');
    } else {
      logger.warn('[lineIdMap] No lines found in GTFS database, will retry on next call');
    }
  } catch (err) {
    logger.error({ err }, '[lineIdMap] Failed to initialize line mappings');
  }
}

/**
 * Resolves a public label (e.g. '1', 'LC') to its RedParsec numeric ID.
 */
export function resolveLineId(label: string): number | null {
  if (!isInitialized) initLineMap();
  return labelToIdMap.get(label) ?? null;
}

/**
 * Resolves a RedParsec numeric ID (e.g. 71) to its public label.
 */
export function resolveLineLabel(id: number): string | null {
  if (!isInitialized) initLineMap();
  return idToLabelMap.get(id) ?? null;
}

/**
 * Returns all known labels.
 */
export function getAllLabels(): string[] {
  if (!isInitialized) initLineMap();
  return Array.from(labelToIdMap.keys());
}

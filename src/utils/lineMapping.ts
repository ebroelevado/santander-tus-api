import { LineMapping } from '../types';
import * as lineIdMap from './lineIdMap';

// Note: Legacy mapping is now handled dynamically by lineIdMap via GTFS.
// We keep this module for utility functions and specific overrides.

export function getMapping(id: string): LineMapping | undefined {
  const nid = lineIdMap.resolveLineId(id);
  if (!nid) return undefined;
  return {
    publicId: id,
    legacyId: id,
    scheduleId: id,
    normalized: nid
  };
}

export function toLegacyId(id: string): string { return id; }

export function toScheduleId(id: string): string | null {
  // Map specific ones like LC -> C if needed for legacy compatibility
  if (id === 'LC') return 'C';
  return id;
}

export function lineName(id: string): string { return `Línea ${id}`; }

const TEXT_COLORS: Record<string, string> = { '17': 'black', '18': 'black' };
export function getTextColor(id: string): string { return TEXT_COLORS[id] || 'white'; }

export function getDayType(d?: Date): 'L' | 'S' | 'F' {
  const day = (d || new Date()).getDay();
  if (day === 0) return 'F';
  if (day === 6) return 'S';
  return 'L';
}

export function dayTypeName(d: string): string {
  const map: Record<string, string> = { 
    L: 'Laborables', 
    S: 'Sábados', 
    F: 'Festivos',
    laborable: 'Laborables',
    sabado: 'Sábados',
    domingo: 'Festivos'
  };
  return map[d] || 'Desconocido';
}

// ─── Model Types ───────────────────────────────────────────────────

export interface Stop {
  stopId: number;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  sentido: string | null;
  lines: string[];
  source: 'open_data' | 'stops_min';
}

export interface LineInfo {
  id: string;
  name: string;
  color: string;
  text_color: string;
  schedule_id: string | null;
  destinations: { [dir: string]: string };
  directions: { [dir: string]: { destination: string; stops: number[] } };
  stats: { stops_total: number; stops_direction_1: number; stops_direction_2: number };
  has_schedule: boolean;
  active: boolean;
  is_circular: boolean;
}

export interface Arrival {
  line: string;
  destination: string;
  color: string;
  minutes: number | null;
  next: number | null;
  active: boolean;
}

export interface ArrivalWithStops extends Arrival {
  stops: { stopId: number; name: string; lat: number; lng: number }[];
}

export interface ApiError {
  error: string;
  message: string;
  source: string;
  timestamp: string;
}

// ─── Line Mapping ──────────────────────────────────────────────────

export interface LineMapping {
  publicId: string;
  legacyId: string;
  scheduleId: string | null;
  normalized: number;
}

// ─── Schedules ─────────────────────────────────────────────────────

export interface SchedulesRaw {
  horarios_hardcoded: Record<string, Record<string, string[]>>;
}

// ─── Parsed Arrival (from legacyParser) ────────────────────────────

export interface ParsedArrival {
  line: string;
  destination: string;
  color: string;
  minutes: number | null;
  next: number | null;
  active: boolean;
}

// ─── Line Status (from legacyParser) ───────────────────────────────

export interface LineStatusResponse {
  line: string;
  active: boolean;
  frequency_min: number;
  has_alerts: boolean;
  alerts: string[];
  last_known_bus_minutes_ago: number | null;
  schedule: {
    status: string;
    next_scheduled: string | null;
    service_hours: string | null;
  };
}

// ─── Arrivals Response (from arrivals.service) ─────────────────────

export interface ArrivalsResponse {
  stop: { stopId: number; name: string; lat: number; lng: number };
  updated: string;
  arrivals: Arrival[];
  all_lines: string[];
}

// ─── Line Summary (lightweight version for listings) ───────────────

export interface LineSummary {
  id: string;
  name: string;
  color: string;
  text_color: string;
  destinations: string[];
  stops: number;
  has_schedule: boolean;
  active: boolean;
}

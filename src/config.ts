import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ── TUS Native API (RedParsec) — Primary source ───────────────────
export const TUS_NATIVE_BASE = process.env.TUS_NATIVE_BASE || 'https://tus.redparsec.com/tus/api/v1';
export const TUS_NATIVE_AUTH = process.env.TUS_NATIVE_AUTH || 'Basic bnpRSlhzOWVSM3g4dEtBczVCb0RiMkg2c01TZlc5d3E6';
export const TUS_GTFS_URL = process.env.TUS_GTFS_URL || 'https://tus.redparsec.com/tus/gtfs/db';
export const TUS_FARES_URL = 'https://tus.redparsec.com/fares.json';
export const GTFS_TIMESTAMP_KEY = 'gtfs_last_modified';

// ── Deprecated (kept during transition, will be removed) ──────────
/** @deprecated Use TUS_NATIVE_BASE */
export const LEGACY_API_BASE = 'https://transitserver.miguelripoll23.deno.net';
/** @deprecated Use stopsCache (GTFS) */
export const OPEN_DATA_URL = 'https://datos.santander.es/api/rest/datasets/paradas_bus.json';

// ── INS4G credentials must be set via environment variables ───────
export const INS4G_URL = process.env.INS4G_URL || 'http://158.179.210.240:7130';
export const INS4G_KEY = process.env.INS4G_KEY || '';

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
export const VERSION = '4.0.0';
export const NEARBY_RADIUS = 300;
export const BATCH_CONCURRENCY = 3;
export const MAX_BATCH_SIZE = 20;

// ── Redis ──────────────────────────────────────────────────────────
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// ── Upstream throttle ──────────────────────────────────────────────
export const MAX_UPSTREAM_CONCURRENT = 3;
export const UPSTREAM_MIN_DELAY_MS = 100;

// ── Trip planner ───────────────────────────────────────────────────
export const TRANSFER_PENALTY_MIN = 5;
export const BUS_SPEED_KMH = 18;

export const CACHE_TTL = {
  stops: 60 * 60 * 1000,
  lines: 60 * 60 * 1000,
  routes: 60 * 1000,
  arrivals: 15 * 1000,
  gtfs: 60 * 60 * 1000,
};

export const DATA_DIR = path.join(__dirname, '..', 'data');
export const GTFS_DB_PATH = path.join(DATA_DIR, 'tus.gtfs.sqlite');

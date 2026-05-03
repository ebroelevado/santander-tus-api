import Redis from 'ioredis';
import { REDIS_URL } from '../config';
import logger from '../utils/logger';
import { Stop, LineInfo } from '../types';

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 5) {
      logger.error('[cacheDb] Redis connection failed after 5 retries');
      return null; // Stop retrying
    }
    return Math.min(times * 50, 2000);
  },
});

redis.on('error', (err) => {
  logger.warn({ err }, '[cacheDb] Redis error');
});

// We keep track of whether Redis is connected to avoid hanging
// if the user doesn't have Redis running. The application should
// work gracefully without Redis.
let isConnected = false;

export async function connectRedis(): Promise<boolean> {
  if (isConnected) return true;
  try {
    await redis.connect();
    isConnected = true;
    logger.info('[cacheDb] Connected to Redis');
    return true;
  } catch (err) {
    logger.error({ err }, '[cacheDb] Failed to connect to Redis. Running without persistent cache.');
    isConnected = false;
    return false;
  }
}

// ─── Stops ─────────────────────────────────────────────────────────

export async function setStops(stops: Stop[]): Promise<void> {
  if (!isConnected) return;
  try {
    const pipeline = redis.pipeline();
    // Use a hash for stops
    stops.forEach((stop) => {
      pipeline.hset('tus:stops', stop.stopId.toString(), JSON.stringify(stop));
    });
    await pipeline.exec();
  } catch (err) {
    logger.warn({ err }, '[cacheDb] Failed to set stops');
  }
}

export async function getStops(): Promise<Stop[]> {
  if (!isConnected) return [];
  try {
    const stopsHash = await redis.hgetall('tus:stops');
    return Object.values(stopsHash).map((str) => JSON.parse(str) as Stop);
  } catch (err) {
    logger.warn({ err }, '[cacheDb] Failed to get stops');
    return [];
  }
}

// ─── Line Index ────────────────────────────────────────────────────

export async function setLineCatalog(lines: Map<string, LineInfo>): Promise<void> {
  if (!isConnected) return;
  try {
    const pipeline = redis.pipeline();
    // We clear the old hash to handle deleted lines
    pipeline.del('tus:lines');
    lines.forEach((line, id) => {
      pipeline.hset('tus:lines', id, JSON.stringify(line));
    });
    await pipeline.exec();
  } catch (err) {
    logger.warn({ err }, '[cacheDb] Failed to set line catalog');
  }
}

export async function getLineCatalog(): Promise<Map<string, LineInfo> | null> {
  if (!isConnected) return null;
  try {
    const linesHash = await redis.hgetall('tus:lines');
    const keys = Object.keys(linesHash);
    if (keys.length === 0) return null;

    const map = new Map<string, LineInfo>();
    keys.forEach((key) => {
      map.set(key, JSON.parse(linesHash[key]) as LineInfo);
    });
    return map;
  } catch (err) {
    logger.warn({ err }, '[cacheDb] Failed to get line catalog');
    return null;
  }
}

// ─── Precomputed Indices ───────────────────────────────────────────

export async function setIndices(
  stopToLines: Map<number, Set<string>>,
  intersections: Map<string, number[]>,
  positions: Map<string, Map<string, Map<number, number>>>
): Promise<void> {
  if (!isConnected) return;
  try {
    // We must serialize Map and Set
    const serializedStopToLines = JSON.stringify(
      Array.from(stopToLines.entries()).map(([k, v]) => [k, Array.from(v)])
    );

    const serializedIntersections = JSON.stringify(Array.from(intersections.entries()));

    const serializedPositions = JSON.stringify(
      Array.from(positions.entries()).map(([lineId, dirMaps]) => [
        lineId,
        Array.from(dirMaps.entries()).map(([dir, posMap]) => [
          dir,
          Array.from(posMap.entries()),
        ]),
      ])
    );

    await redis
      .pipeline()
      .set('tus:indices:stop_to_lines', serializedStopToLines)
      .set('tus:indices:intersections', serializedIntersections)
      .set('tus:indices:positions', serializedPositions)
      .exec();
  } catch (err) {
    logger.warn({ err }, '[cacheDb] Failed to set indices');
  }
}

export async function getIndices() {
  if (!isConnected) return null;
  try {
    const [stopToLinesRaw, intersectionsRaw, positionsRaw] = await Promise.all([
      redis.get('tus:indices:stop_to_lines'),
      redis.get('tus:indices:intersections'),
      redis.get('tus:indices:positions'),
    ]);

    if (!stopToLinesRaw || !intersectionsRaw || !positionsRaw) return null;

    // Deserialize
    const stopToLinesArr = JSON.parse(stopToLinesRaw) as [number, string[]][];
    const stopToLines = new Map<number, Set<string>>(
      stopToLinesArr.map(([k, v]) => [k, new Set(v)])
    );

    const intersectionsArr = JSON.parse(intersectionsRaw) as [string, number[]][];
    const intersections = new Map<string, number[]>(intersectionsArr);

    const positionsArr = JSON.parse(positionsRaw) as [
      string,
      [string, [number, number][]][]
    ][];
    const positions = new Map<string, Map<string, Map<number, number>>>(
      positionsArr.map(([lineId, dirMaps]) => [
        lineId,
        new Map<string, Map<number, number>>(
          dirMaps.map(([dir, posMap]) => [dir, new Map<number, number>(posMap)])
        ),
      ])
    );

    return { stopToLines, intersections, positions };
  } catch (err) {
    logger.warn({ err }, '[cacheDb] Failed to get indices');
    return null;
  }
}

// ─── Metadata ──────────────────────────────────────────────────────

export async function setMetadata(key: string, value: string): Promise<void> {
  if (!isConnected) return;
  try {
    await redis.set(`tus:meta:${key}`, value);
  } catch (err) {
    logger.warn({ err }, `[cacheDb] Failed to set metadata ${key}`);
  }
}

export async function getMetadata(key: string): Promise<string | null> {
  if (!isConnected) return null;
  try {
    return await redis.get(`tus:meta:${key}`);
  } catch (err) {
    logger.warn({ err }, `[cacheDb] Failed to get metadata ${key}`);
    return null;
  }
}

// ─── Transient Caches (Arrivals, ETD, Status) ──────────────────────

export async function setTransient(key: string, data: any, ttlSeconds: number): Promise<void> {
  if (!isConnected) return;
  try {
    await redis.setex(`tus:transient:${key}`, ttlSeconds, JSON.stringify(data));
  } catch (err) {
    logger.warn({ err }, `[cacheDb] Failed to set transient ${key}`);
  }
}

export async function getTransient<T>(key: string): Promise<T | null> {
  if (!isConnected) return null;
  try {
    const raw = await redis.get(`tus:transient:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err }, `[cacheDb] Failed to get transient ${key}`);
    return null;
  }
}

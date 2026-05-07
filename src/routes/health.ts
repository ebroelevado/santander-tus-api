import logger from '../utils/logger';
import { Router, Request, Response } from 'express';
import { VERSION, GTFS_TIMESTAMP_KEY } from '../config';
import * as stopsCache from '../sources/stopsCache';
import * as tusNativeApi from '../sources/tusNativeApi';
import * as lineIndex from '../sources/lineIndex';
import * as cacheDb from '../sources/cacheDb';

const router = Router();
const startTime = Date.now();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     tags: [Core]
 *     summary: Health check del wrapper y fuentes de datos nativas
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const stopCount = await stopsCache.getStopCount();
    const nativeHealth = await tusNativeApi.getHealth();
    const lines = lineIndex.getLines();
    const gtfsTimestamp = await cacheDb.getMetadata(GTFS_TIMESTAMP_KEY);

    const nativeOk = nativeHealth && !('error' in nativeHealth);
    const status = nativeOk && stopCount > 0 && lines.length > 0 ? 'ok' : 'degraded';
    const httpCode = status === 'ok' ? 200 : 503;

    res.status(httpCode).json({
      status,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      sources: {
        gtfs: {
          status: stopCount > 0 ? 'ok' : 'unavailable',
          stops_count: stopCount,
          last_modified: gtfsTimestamp,
          age_seconds: Math.floor(stopsCache.getCacheAge() / 1000),
        },
        tus_native: {
          status: nativeOk ? 'ok' : 'unavailable',
          latency_ms: 'latency_ms' in nativeHealth ? nativeHealth.latency_ms : null,
        },
      },
      cache: {
        stops: { loaded: stopCount > 0, count: stopCount, source: 'gtfs' },
        lines: { loaded: lines.length > 0, count: lines.length },
      },
      version: VERSION,
    });
  } catch (err: any) {
    logger.error({ err }, '[health] Error in /health');
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
});

export default router;

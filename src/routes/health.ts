import { Router, Request, Response } from 'express';
import { VERSION } from '../config';
import * as openData from '../sources/openData';
import * as legacyApi from '../sources/legacyApi';
import * as lineIndex from '../sources/lineIndex';
import { existsSync } from 'fs';
import { DATA_DIR } from '../config';

const router = Router();
const startTime = Date.now();

const staticFiles = ['stops.min.json', 'colors.json', 'cards.json', 'schedules.json'];

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const odCount = await openData.getStopCount();
    const legacy = await legacyApi.getHealth();
    const lines = lineIndex.getLines();

    const ok = legacy && !('error' in legacy);
    const status = ok && odCount > 0 && lines.length > 0 ? 'ok' : 'degraded';
    const httpCode = ok ? 200 : 503;

    res.status(httpCode).json({
      status,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      sources: {
        open_data: {
          status: odCount > 0 ? 'ok' : 'unavailable',
          stops_cached: odCount,
          age_seconds: 0,
        },
        legacy_api: {
          status: ok ? 'ok' : 'unavailable',
          latency_ms: ok && 'latency_ms' in legacy ? legacy.latency_ms : null,
        },
      },
      cache: {
        stops: { loaded: odCount > 0, count: odCount, source: 'open_data' },
        lines: { loaded: lines.length > 0, count: lines.length },
      },
      version: VERSION,
    });
  } catch (err: any) {
    console.error('[health] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
});

export default router;

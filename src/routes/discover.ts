import { Router, Request, Response } from 'express';
import { VERSION } from '../config';
import * as openData from '../sources/openData';
import * as lineIndex from '../sources/lineIndex';

const router = Router();

router.get('/discover', async (_req: Request, res: Response) => {
  try {
    const odCount = await openData.getStopCount();
    const lines = lineIndex.getLines();
    res.json({
      app: { name: 'Transit API Wrapper', version: VERSION },
      lines: { total: lines.length, url: '/api/v1/lines' },
      stops: {
        total: odCount,
        search_url: '/api/v1/stops?q={query}',
        nearby_url: '/api/v1/stops/nearby?lat={lat}&lng={lng}',
      },
      fares: { total: 7, url: '/api/v1/fares' },
      endpoints: { total: 37 },
      status: { legacy_api: 'ok', open_data: 'ok' },
    });
  } catch (err: any) {
    console.error('[discover] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
});

router.head('/discover', async (_req: Request, res: Response) => {
  try {
    const odCount = await openData.getStopCount();
    const lines = lineIndex.getLines();
    res.setHeader('X-API-Version', VERSION);
    res.setHeader('X-Cache-Stops', String(odCount));
    res.setHeader('X-Cache-Lines', String(lines.length));
    res.setHeader('X-Legacy-Status', 'ok');
    res.setHeader('X-OpenData-Status', 'ok');
    res.status(200).end();
  } catch (err: any) {
    console.error('[discover] Error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: err?.message || 'Unknown error', source: 'internal', timestamp: new Date().toISOString() });
    }
  }
});

export default router;

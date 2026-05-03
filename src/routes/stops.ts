import { Router } from 'express';
import * as stopsController from '../controllers/stops.controller';

const router = Router();

// MUST be registered before /stops/:stop to avoid captures
router.get('/stops/search', stopsController.searchStopsRedirect);
router.get('/stops/nearby', stopsController.getNearbyStops);

router.get('/stops', stopsController.listOrSearchStops);
router.get('/stops/:stop', stopsController.getStopDetail);

export default router;

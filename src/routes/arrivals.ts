import { Router } from 'express';
import * as arrivalsController from '../controllers/arrivals.controller';

const router = Router();

router.get('/arrivals/:line', arrivalsController.getArrivalsForLine);
router.get('/stops/:stop/arrivals', arrivalsController.getArrivalsForStop);
router.get('/stops/:stop/arrivals/:line', arrivalsController.getArrivalsForStopAndLine);
router.get('/stops/:stop/next', arrivalsController.getNextArrivalForStop);
router.get('/stops/:stop/next/:line', arrivalsController.getNextArrivalForStopAndLine);
router.get('/lines/:line/next-at/:stop', arrivalsController.getNextAtForLineAndStop);

export default router;


import { Router } from 'express';
import * as tripController from '../controllers/trip.controller';

const router = Router();

router.get('/trip', tripController.planTrip);
router.get('/stops/:stop/connections', tripController.getConnections);

export default router;


import { Router } from 'express';
import * as schedulesController from '../controllers/schedules.controller';

const router = Router();

router.get('/lines/:line', schedulesController.getLineSchedules);
router.get('/lines/:line/next', schedulesController.getNextLineSchedule);
router.get('/stops/:stop', schedulesController.getStopSchedules);

export default router;

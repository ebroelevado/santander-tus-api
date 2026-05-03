import { Router } from 'express';
import * as linesController from '../controllers/lines.controller';

const router = Router();

router.get('/lines', linesController.getLines);
router.get('/lines/:line', linesController.getLineDetail);
router.get('/lines/:line/stops', linesController.getLineStops);
router.get('/lines/:line/route', linesController.getLineRoute);
router.get('/lines/:lineA/intersect/:lineB', linesController.getLinesIntersect);

export default router;

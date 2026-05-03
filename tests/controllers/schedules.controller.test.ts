import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as schedulesController from '../../src/controllers/schedules.controller';
import * as schedulesService from '../../src/services/schedules.service';
import * as lineMapping from '../../src/utils/lineMapping';
import { ApiError } from '../../src/utils/ApiError';

vi.mock('../../src/services/schedules.service');

describe('controllers/schedules.controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let resJson: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resJson = vi.fn();
    mockRes = { json: resJson };
  });

  describe('getLineSchedules', () => {
    it('should throw 404 SCHEDULE_NOT_FOUND if limit 1 and not available', async () => {
      mockReq = { params: { line: 'E1' }, query: { limit: 1 as unknown as string } };
      vi.mocked(schedulesService.fetchNextService).mockReturnValue({ error: 'not_available' } as any);

      try {
        await schedulesController.getLineSchedules(mockReq as Request, mockRes as Response);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.message).toContain('no tiene horarios disponibles');
      }
    });

    it('should throw 404 if limit 1 and not found', async () => {
      mockReq = { params: { line: '1' }, query: { limit: 1 as unknown as string } };
      vi.mocked(schedulesService.fetchNextService).mockReturnValue({ error: 'not_found' } as any);

      try {
        await schedulesController.getLineSchedules(mockReq as Request, mockRes as Response);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.message).toContain('No hay horarios para la línea');
      }
    });

    it('should return next service if limit 1', async () => {
      mockReq = { params: { line: '1' }, query: { limit: 1 as unknown as string } };
      vi.mocked(schedulesService.fetchNextService).mockReturnValue({ next: 'time' } as any);

      await schedulesController.getLineSchedules(mockReq as Request, mockRes as Response);
      expect(resJson).toHaveBeenCalledWith({ next: 'time' });
    });

    it('should throw 404 if no limit and not available', async () => {
      mockReq = { params: { line: 'E1' }, query: {} };
      vi.mocked(schedulesService.fetchLineSchedules).mockReturnValue({ error: 'not_available' } as any);

      await expect(schedulesController.getLineSchedules(mockReq as Request, mockRes as Response)).rejects.toThrow(ApiError);
    });

    it('should map direction parameter correctly', async () => {
      mockReq = { params: { line: '1' }, query: { direction: 'backward' } };
      vi.mocked(schedulesService.fetchLineSchedules).mockReturnValue({ times: [] } as any);

      await schedulesController.getLineSchedules(mockReq as Request, mockRes as Response);
      
      // 'backward' -> '2'
      expect(schedulesService.fetchLineSchedules).toHaveBeenCalledWith('1', '2', expect.any(String));
    });
  });

  describe('getStopSchedules', () => {
    it('should call fetchStopSchedules and map dayParam', async () => {
      mockReq = { params: { stop: 1 as unknown as string }, query: { day: 'holiday' } };
      vi.mocked(schedulesService.fetchStopSchedules).mockReturnValue({ stop: 1, schedules: [] } as any);

      await schedulesController.getStopSchedules(mockReq as Request, mockRes as Response);

      expect(schedulesService.fetchStopSchedules).toHaveBeenCalledWith(1, 'F');
      expect(resJson).toHaveBeenCalledWith({ stop: 1, schedules: [] });
    });
  });
});

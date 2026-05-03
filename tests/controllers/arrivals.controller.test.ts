import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as arrivalsController from '../../src/controllers/arrivals.controller';
import * as arrivalsService from '../../src/services/arrivals.service';
import { ApiError } from '../../src/utils/ApiError';

vi.mock('../../src/services/arrivals.service');

describe('controllers/arrivals.controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let resJson: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resJson = vi.fn();
    mockRes = { json: resJson };
  });

  describe('getArrivals', () => {
    it('should throw ApiError 404 if stop not found', async () => {
      mockReq = { params: { stop: 99 as unknown as string }, query: {} };
      vi.mocked(arrivalsService.fetchSmartArrivals).mockResolvedValue(null);

      await expect(arrivalsController.getArrivals(mockReq as Request, mockRes as Response)).rejects.toThrow(ApiError);

      try {
        await arrivalsController.getArrivals(mockReq as Request, mockRes as Response);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('STOP_NOT_FOUND');
      }
    });

    it('should throw ApiError 503 if legacy_unavailable', async () => {
      mockReq = { params: { stop: 1 as unknown as string }, query: {} };
      vi.mocked(arrivalsService.fetchSmartArrivals).mockRejectedValue(new Error('legacy_unavailable'));

      try {
        await arrivalsController.getArrivals(mockReq as Request, mockRes as Response);
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('LEGACY_UNAVAILABLE');
      }
    });

    it('should return sliced arrivals if limit is passed', async () => {
      mockReq = { params: { stop: 1 as unknown as string }, query: { limit: 1 as unknown as string } };
      vi.mocked(arrivalsService.fetchSmartArrivals).mockResolvedValue({
        arrivals: [{ line: '1' }, { line: '2' }]
      } as any);

      await arrivalsController.getArrivals(mockReq as Request, mockRes as Response);

      expect(resJson).toHaveBeenCalledWith({
        arrivals: [{ line: '1' }]
      });
    });

    it('should return all arrivals if no limit', async () => {
      mockReq = { params: { stop: 1 as unknown as string }, query: {} };
      vi.mocked(arrivalsService.fetchSmartArrivals).mockResolvedValue({
        arrivals: [{ line: '1' }, { line: '2' }]
      } as any);

      await arrivalsController.getArrivals(mockReq as Request, mockRes as Response);

      expect(resJson).toHaveBeenCalledWith({
        arrivals: [{ line: '1' }, { line: '2' }]
      });
    });

    it('should pass refresh and lineFilter down to service', async () => {
      mockReq = { params: { stop: 1 as unknown as string }, query: { refresh: 'true', line: '2' } };
      vi.mocked(arrivalsService.fetchSmartArrivals).mockResolvedValue({ arrivals: [] } as any);

      await arrivalsController.getArrivals(mockReq as Request, mockRes as Response);

      expect(arrivalsService.fetchSmartArrivals).toHaveBeenCalledWith(1, '2', true);
    });
  });
});

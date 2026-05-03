import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as tripController from '../../src/controllers/trip.controller';
import * as tripService from '../../src/services/trip.service';
import * as helpers from '../../src/utils/helpers';
import * as lineIndex from '../../src/sources/lineIndex';
import { ApiError } from '../../src/utils/ApiError';

vi.mock('../../src/services/trip.service');
vi.mock('../../src/utils/helpers');
vi.mock('../../src/sources/lineIndex');

describe('controllers/trip.controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let resJson: ReturnType<typeof vi.fn>;
  let resStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resJson = vi.fn();
    resStatus = vi.fn().mockReturnValue({ json: resJson });
    mockRes = { json: resJson, status: resStatus };

    vi.mocked(lineIndex.ensureLineIndex).mockResolvedValue(undefined);
  });

  describe('planTrip', () => {
    it('should return immediate response if origin and destination are the same', async () => {
      mockReq = { query: { from: 10 as unknown as string, to: 10 as unknown as string } };
      vi.mocked(lineIndex.getStopName).mockReturnValue('Same Stop');

      await tripController.planTrip(mockReq as Request, mockRes as Response);

      expect(resStatus).toHaveBeenCalledWith(200);
      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({
        summary: expect.objectContaining({ message: 'Origin and destination are the same' })
      }));
    });

    it('should throw 404 if origin stop not found', async () => {
      mockReq = { query: { from: 1 as unknown as string, to: 2 as unknown as string } };
      vi.mocked(helpers.resolveStop).mockImplementation(async (id) => id === 1 ? null : {} as any);

      try {
        await tripController.planTrip(mockReq as Request, mockRes as Response);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.message).toContain('Origin stop');
      }
    });

    it('should throw 404 if destination stop not found', async () => {
      mockReq = { query: { from: 1 as unknown as string, to: 2 as unknown as string } };
      vi.mocked(helpers.resolveStop).mockImplementation(async (id) => id === 2 ? null : {} as any);

      try {
        await tripController.planTrip(mockReq as Request, mockRes as Response);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.message).toContain('Destination stop');
      }
    });

    it('should return empty options if no route found', async () => {
      mockReq = { query: { from: 1 as unknown as string, to: 2 as unknown as string } };
      vi.mocked(helpers.resolveStop).mockImplementation(async (id) => ({ name: `Stop ${id}` } as any));
      vi.mocked(tripService.buildTripOptions).mockReturnValue([]);

      await tripController.planTrip(mockReq as Request, mockRes as Response);

      expect(resStatus).toHaveBeenCalledWith(200);
      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({
        options: [],
        summary: expect.objectContaining({ message: 'No route found' })
      }));
    });

    it('should return sliced top options with correct summary', async () => {
      mockReq = { query: { from: 1 as unknown as string, to: 2 as unknown as string } };
      vi.mocked(helpers.resolveStop).mockImplementation(async (id) => ({ name: `Stop ${id}` } as any));
      
      const mockOptions = Array(15).fill(0).map((_, i) => ({
        type: i % 2 === 0 ? 'direct' : 'transfer',
        duration_min: 10 + i
      }));

      vi.mocked(tripService.buildTripOptions).mockReturnValue(mockOptions as any);

      await tripController.planTrip(mockReq as Request, mockRes as Response);

      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({
        options: expect.any(Array),
      }));

      const callArgs = resJson.mock.calls[0][0];
      expect(callArgs.options).toHaveLength(10); // Only top 10
      expect(callArgs.summary.direct_count).toBe(5);
      expect(callArgs.summary.transfer_count).toBe(5);
      expect(callArgs.summary.best_duration_min).toBe(10);
    });
  });

  describe('getConnections', () => {
    it('should throw 404 if origin stop not found', async () => {
      mockReq = { params: { stop: 99 as unknown as string } };
      vi.mocked(helpers.resolveStop).mockResolvedValue(null);

      await expect(tripController.getConnections(mockReq as Request, mockRes as Response)).rejects.toThrow(ApiError);
    });

    it('should return reachable stops', async () => {
      mockReq = { params: { stop: 1 as unknown as string } };
      vi.mocked(helpers.resolveStop).mockResolvedValue({ name: 'A' } as any);
      vi.mocked(tripService.buildConnections).mockResolvedValue([{ stopId: 2 } as any]);

      await tripController.getConnections(mockReq as Request, mockRes as Response);

      expect(resJson).toHaveBeenCalledWith({
        stop: { stopId: 1, name: 'A' },
        reachable_stops: [{ stopId: 2 }]
      });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as stopsController from '../../src/controllers/stops.controller';
import * as stopsService from '../../src/services/stops.service';
import { ApiError } from '../../src/utils/ApiError';
import { NEARBY_RADIUS } from '../../src/config';

vi.mock('../../src/services/stops.service');

describe('controllers/stops.controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let resJson: ReturnType<typeof vi.fn>;
  let resRedirect: ReturnType<typeof vi.fn>;
  let resStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resJson = vi.fn();
    resRedirect = vi.fn();
    resStatus = vi.fn().mockReturnValue({ json: resJson });
    mockRes = {
      json: resJson,
      redirect: resRedirect,
      status: resStatus,
    };
  });

  describe('searchStopsRedirect', () => {
    it('should redirect with query string', async () => {
      mockReq = { query: { q: 'centro' } };
      await stopsController.searchStopsRedirect(mockReq as Request, mockRes as Response);
      expect(resRedirect).toHaveBeenCalledWith(307, '/api/v1/stops?q=centro');
    });

    it('should redirect with empty query if none provided', async () => {
      mockReq = { query: {} };
      await stopsController.searchStopsRedirect(mockReq as Request, mockRes as Response);
      expect(resRedirect).toHaveBeenCalledWith(307, '/api/v1/stops?q=');
    });
  });

  describe('getNearbyStops', () => {
    it('should return nearby stops json', async () => {
      mockReq = { query: { lat: '43', lng: '-3', limit: '5' } };
      vi.mocked(stopsService.findNearbyStops).mockResolvedValue([{ stopId: 1, name: 'S1', meters: 10 }]);

      await stopsController.getNearbyStops(mockReq as Request, mockRes as Response);

      expect(stopsService.findNearbyStops).toHaveBeenCalledWith('43', '-3', NEARBY_RADIUS, '5');
      expect(resJson).toHaveBeenCalledWith({
        results: [{ stopId: 1, name: 'S1', meters: 10 }],
        total: 1,
        center: { lat: '43', lng: '-3' },
        radius: NEARBY_RADIUS,
        source: 'open_data'
      });
    });

    it('should pass custom radius', async () => {
      mockReq = { query: { lat: '43', lng: '-3', radius: '500' } };
      vi.mocked(stopsService.findNearbyStops).mockResolvedValue([]);

      await stopsController.getNearbyStops(mockReq as Request, mockRes as Response);

      expect(stopsService.findNearbyStops).toHaveBeenCalledWith('43', '-3', '500', undefined);
      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({ radius: '500' }));
    });
  });

  describe('listOrSearchStops', () => {
    it('should call searchStops and return paged results', async () => {
      mockReq = { query: { q: 'ayuntamiento', limit: '10', offset: '5' } };
      vi.mocked(stopsService.searchStops).mockResolvedValue({ paged: [{ stopId: 1, name: 'A' }], total: 100 });

      await stopsController.listOrSearchStops(mockReq as Request, mockRes as Response);

      expect(stopsService.searchStops).toHaveBeenCalledWith('ayuntamiento', '5', '10');
      expect(resJson).toHaveBeenCalledWith({
        results: [{ stopId: 1, name: 'A' }],
        total: 100,
        query: 'ayuntamiento',
        source: 'open_data'
      });
    });
  });

  describe('getStopDetail', () => {
    it('should return stop detail if found', async () => {
      mockReq = { params: { stop: '10' } };
      vi.mocked(stopsService.getStopDetails).mockResolvedValue({ stopId: 10, name: 'S10' } as any);

      await stopsController.getStopDetail(mockReq as Request, mockRes as Response);

      expect(stopsService.getStopDetails).toHaveBeenCalledWith('10');
      expect(resJson).toHaveBeenCalledWith({ stopId: 10, name: 'S10' });
    });

    it('should throw ApiError(404) if not found', async () => {
      mockReq = { params: { stop: '99' } };
      vi.mocked(stopsService.getStopDetails).mockResolvedValue(null);

      await expect(stopsController.getStopDetail(mockReq as Request, mockRes as Response))
        .rejects.toThrow(ApiError);

      try {
        await stopsController.getStopDetail(mockReq as Request, mockRes as Response);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('STOP_NOT_FOUND');
      }
    });
  });
});

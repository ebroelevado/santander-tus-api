import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as linesController from '../../src/controllers/lines.controller';
import * as linesService from '../../src/services/lines.service';

vi.mock('../../src/services/lines.service');

describe('controllers/lines.controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let resJson: ReturnType<typeof vi.fn>;
  let resStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resJson = vi.fn();
    resStatus = vi.fn().mockReturnValue({ json: resJson });
    mockRes = {
      json: resJson,
      status: resStatus,
      headersSent: false,
    };
  });

  describe('getLines', () => {
    it('should return all lines', async () => {
      mockReq = {};
      vi.mocked(linesService.getLines).mockResolvedValue([{ id: '1' }] as any);

      await linesController.getLines(mockReq as Request, mockRes as Response);

      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({
        lines: [{ id: '1' }],
        total: 1
      }));
    });

    it('should handle internal errors', async () => {
      mockReq = {};
      vi.mocked(linesService.getLines).mockRejectedValue(new Error('Crash'));

      await linesController.getLines(mockReq as Request, mockRes as Response);

      expect(resStatus).toHaveBeenCalledWith(500);
      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({
        error: 'internal_error',
        message: 'Crash'
      }));
    });
  });

  describe('getLineDetail', () => {
    it('should return 404 if line not found', async () => {
      mockReq = { params: { line: '99' } };
      vi.mocked(linesService.getLineDetail).mockResolvedValue(null);

      await linesController.getLineDetail(mockReq as Request, mockRes as Response);

      expect(resStatus).toHaveBeenCalledWith(404);
      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({ error: 'line_not_found' }));
    });

    it('should return line details if found', async () => {
      mockReq = { params: { line: '1' } };
      vi.mocked(linesService.getLineDetail).mockResolvedValue({ id: '1' } as any);

      await linesController.getLineDetail(mockReq as Request, mockRes as Response);

      expect(resJson).toHaveBeenCalledWith({ id: '1' });
    });
  });

  describe('getLineStops', () => {
    it('should return 404 if line not found', async () => {
      mockReq = { params: { line: '99' } };
      vi.mocked(linesService.getLineStops).mockResolvedValue(null);
      await linesController.getLineStops(mockReq as Request, mockRes as Response);
      expect(resStatus).toHaveBeenCalledWith(404);
    });

    it('should return line stops if found', async () => {
      mockReq = { params: { line: '1' } };
      vi.mocked(linesService.getLineStops).mockResolvedValue({ line: '1', stops: [] } as any);
      await linesController.getLineStops(mockReq as Request, mockRes as Response);
      expect(resJson).toHaveBeenCalledWith({ line: '1', stops: [] });
    });
  });

  describe('getLineRoute', () => {
    it('should return 404 if line not found', async () => {
      mockReq = { params: { line: '99' }, query: {} };
      vi.mocked(linesService.getLineRoute).mockResolvedValue(null);
      await linesController.getLineRoute(mockReq as Request, mockRes as Response);
      expect(resStatus).toHaveBeenCalledWith(404);
    });

    it('should return line route if found', async () => {
      mockReq = { params: { line: '1' }, query: { direction: '1' } };
      vi.mocked(linesService.getLineRoute).mockResolvedValue({ line: '1', coordinates: [] } as any);
      await linesController.getLineRoute(mockReq as Request, mockRes as Response);
      expect(resJson).toHaveBeenCalledWith({ line: '1', coordinates: [] });
      expect(linesService.getLineRoute).toHaveBeenCalledWith('1', '1');
    });
  });

  describe('getLinesIntersect', () => {
    it('should return 404 if missing line A', async () => {
      mockReq = { params: { lineA: 'A', lineB: 'B' } };
      vi.mocked(linesService.getLinesIntersect).mockResolvedValue({ error: 'line_not_found', missingA: true } as any);
      
      await linesController.getLinesIntersect(mockReq as Request, mockRes as Response);
      expect(resStatus).toHaveBeenCalledWith(404);
      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({ message: "La línea 'A' no existe" }));
    });

    it('should return 404 if missing line B', async () => {
      mockReq = { params: { lineA: 'A', lineB: 'B' } };
      vi.mocked(linesService.getLinesIntersect).mockResolvedValue({ error: 'line_not_found', missingB: true } as any);
      
      await linesController.getLinesIntersect(mockReq as Request, mockRes as Response);
      expect(resStatus).toHaveBeenCalledWith(404);
      expect(resJson).toHaveBeenCalledWith(expect.objectContaining({ message: "La línea 'B' no existe" }));
    });

    it('should return intersection details', async () => {
      mockReq = { params: { lineA: '1', lineB: '2' } };
      vi.mocked(linesService.getLinesIntersect).mockResolvedValue({ line_a: '1', line_b: '2', common_stops: [] } as any);
      
      await linesController.getLinesIntersect(mockReq as Request, mockRes as Response);
      expect(resJson).toHaveBeenCalledWith({ line_a: '1', line_b: '2', common_stops: [] });
    });
  });
});

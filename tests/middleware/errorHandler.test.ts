import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { ApiError } from '../../src/utils/ApiError';
import { errorHandler } from '../../src/middleware/errorHandler';
import logger from '../../src/utils/logger';

vi.mock('../../src/utils/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

describe('middleware/errorHandler', () => {
  const mockRequest = () => {
    return {
      path: '/test',
      method: 'GET',
    } as unknown as Request;
  };

  const mockResponse = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
  };

  const mockNext: NextFunction = vi.fn();

  it('should handle ZodError with 400 validation error format', () => {
    const req = mockRequest();
    const res = mockResponse();
    const zodIssues: ZodIssue[] = [
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['name'], message: 'Expected string' }
    ];
    const zodError = new ZodError(zodIssues);

    errorHandler(zodError, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: zodIssues,
      },
    });
  });

  it('should handle ApiError with the specified status and details', () => {
    const req = mockRequest();
    const res = mockResponse();
    const apiError = new ApiError(404, 'NOT_FOUND', 'Not found here', { missing: 'id' });

    errorHandler(apiError, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Not found here',
        details: { missing: 'id' },
      },
    });
  });

  it('should handle native Error as 500 INTERNAL_ERROR', () => {
    const req = mockRequest();
    const res = mockResponse();
    const error = new Error('Database goes boom');

    errorHandler(error, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Database goes boom',
      }),
    }));
    expect(logger.error).toHaveBeenCalled();
  });

  it('should provide default message if generic Error lacks one', () => {
    const req = mockRequest();
    const res = mockResponse();
    const error = new Error();
    error.message = ''; // Empty message

    errorHandler(error, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Unexpected internal error',
      }),
    }));
  });
});

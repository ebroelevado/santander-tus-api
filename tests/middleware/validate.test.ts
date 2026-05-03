import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { validate } from '../../src/middleware/validate';

describe('middleware/validate', () => {
  const mockResponse = () => ({} as Response);
  const mockNext: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass validation and update request with parsed data', async () => {
    const schema = z.object({
      query: z.object({
        age: z.string().transform(Number),
      }),
      body: z.object({
        name: z.string().trim(),
      }),
      params: z.object({
        id: z.string(),
      }),
    });

    const req = {
      query: { age: '25' },
      body: { name: '  John  ' },
      params: { id: '123' },
    } as unknown as Request;

    const res = mockResponse();
    const middleware = validate(schema);
    
    await middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(); // Called without error
    expect(req.query.age).toBe(25); // Transformed to number
    expect(req.body.name).toBe('John'); // Trimmed
    expect(req.params.id).toBe('123'); // Unchanged
  });

  it('should call next with ZodError when validation fails', async () => {
    const schema = z.object({
      body: z.object({
        email: z.string().email(),
      }),
    });

    const req = {
      query: {},
      body: { email: 'invalid-email' },
      params: {},
    } as unknown as Request;

    const res = mockResponse();
    const middleware = validate(schema);

    await middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const errArg = vi.mocked(mockNext).mock.calls[0][0];
    expect(errArg).toBeInstanceOf(ZodError);
    expect((errArg as ZodError).issues[0].message).toBe('Invalid email address');
  });

  it('should call next with generic error if something unexpected throws', async () => {
    const schema = {
      parseAsync: vi.fn().mockRejectedValue(new Error('Fatal schema crash')),
    } as unknown as z.ZodSchema<any>;

    const req = { query: {}, body: {}, params: {} } as unknown as Request;
    const res = mockResponse();
    const middleware = validate(schema);

    await middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const errArg = vi.mocked(mockNext).mock.calls[0][0];
    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toBe('Fatal schema crash');
  });
});

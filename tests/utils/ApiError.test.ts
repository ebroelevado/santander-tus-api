import { describe, it, expect } from 'vitest';
import { ApiError } from '../../src/utils/ApiError';

describe('utils/ApiError', () => {
  it('should instantiate correctly with code, message and statusCode', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Recurso no encontrado');
    expect(err.details).toBeUndefined();
  });

  it('should allow attaching extra details', () => {
    const details = { cause: 'timeout', ms: 5000 };
    const err = new ApiError(500, 'INTERNAL_ERROR', 'Algo falló', details);
    expect(err.details).toEqual(details);
  });

  it('should capture stack trace correctly', () => {
    const err = new ApiError(400, 'BAD_REQUEST', 'Malo');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('ApiError: Malo');
  });

  it('should preserve prototype chain', () => {
    const err = new ApiError(401, 'UNAUTHORIZED', 'No autorizado');
    expect(Object.getPrototypeOf(err)).toBe(ApiError.prototype);
  });
});

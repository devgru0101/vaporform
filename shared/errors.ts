/**
 * Custom error classes for Vaporform
 */

import { APIError, ErrCode } from 'encore.dev/api';

export class VaporformError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'VaporformError';
  }
}

export class UnauthorizedError extends VaporformError {
  constructor(message: string = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends VaporformError {
  constructor(message: string = 'Forbidden') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends VaporformError {
  constructor(message: string = 'Not Found') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends VaporformError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
    this.name = 'ValidationError';
  }
}

export class QuotaExceededError extends VaporformError {
  constructor(message: string) {
    super('QUOTA_EXCEEDED', message, 429);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Convert VaporformError to Encore APIError
 */
export function toAPIError(error: VaporformError): APIError {
  switch (error.code) {
    case 'UNAUTHORIZED':
      return APIError.unauthenticated(error.message);
    case 'FORBIDDEN':
      return APIError.permissionDenied(error.message);
    case 'NOT_FOUND':
      return APIError.notFound(error.message);
    case 'VALIDATION_ERROR':
      return APIError.invalidArgument(error.message);
    case 'QUOTA_EXCEEDED':
      return APIError.resourceExhausted(error.message);
    default:
      return APIError.internal(error.message);
  }
}

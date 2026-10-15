import type { ApiErrorCode, ApiErrorResponse } from '@ltw/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Error responses with fixed messages (docs/adr/0009-http-api-and-dev-authentication.md):
 * never input echoes, stack traces, internal errors, or anything that
 * differs between a hidden and a nonexistent resource.
 */
const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  INVALID_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
  RATE_LIMITED: 429,
};

const MESSAGE: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: 'Authentication required',
  INVALID_REQUEST: 'The request is invalid',
  FORBIDDEN: 'Not permitted',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  UNPROCESSABLE: 'The command was rejected',
  INTERNAL: 'Internal error',
  RATE_LIMITED: 'Too many requests',
};

export function errorBody(code: ApiErrorCode, requestId: string): ApiErrorResponse {
  return { error: { code, message: MESSAGE[code] }, requestId };
}

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  code: ApiErrorCode,
): FastifyReply {
  if (code === 'UNAUTHENTICATED') reply.header('www-authenticate', 'Bearer');
  return reply.code(STATUS[code]).send(errorBody(code, request.id));
}

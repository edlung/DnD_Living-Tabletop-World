import type { CommandResult } from '@ltw/contracts';

/**
 * HTTP status of a World Engine result (docs/adr/0009-http-api-and-dev-authentication.md):
 * schema problems are 400; outcomes that depend on what changed since the
 * caller looked (versions, IDs, races, a stale confirmation) are 409; other
 * domain rejections are 422.
 */
export function statusOf(result: CommandResult): number {
  if (result.status !== 'rejected') return 200;
  switch (result.code) {
    case 'INVALID_COMMAND':
      return 400;
    case 'VERSION_MISMATCH':
    case 'COMMAND_ID_CONFLICT':
    case 'CONCURRENCY_CONFLICT':
    case 'CONFIRMATION_REQUIRED':
      return 409;
    default:
      return 422;
  }
}

/**
 * Raised when stored history cannot be folded: an event that cannot apply
 * means the stream is corrupt, never that a user made a mistake.
 */
export class CorruptHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptHistoryError';
  }
}

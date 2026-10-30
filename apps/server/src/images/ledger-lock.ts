import { createHash } from 'node:crypto';

/** Shared by image accounting and its operator policy; nonnegative 63-bit key. */
export const IMAGE_LEDGER_LOCK_KEY =
  createHash('sha256')
    .update(JSON.stringify(['image-ledger']))
    .digest()
    .readBigUInt64BE(0) &
  ((1n << 63n) - 1n);

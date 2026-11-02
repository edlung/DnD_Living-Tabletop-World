import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Passwords of accounts (docs/adr/0041-accounts.md §1): scrypt with N = 2^15, r = 8, p = 3 (the
 * OWASP Password Storage Cheat Sheet's equivalent of N = 2^17 at a quarter of the memory), a
 * 16-byte salt per account and a 64-byte key, stored as `scrypt$N$r$p$salt$key` (base64url), so a
 * stored hash keeps its own parameters. A password exists in this process only while it is hashed
 * or compared; it is never logged.
 */
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
/** scrypt needs 128·N·r bytes (32 MiB here); the default ceiling is exactly that, too tight. */
const MAX_MEMORY = 64 * 1024 * 1024;

const derive = (password: string, salt: Buffer, options: ScryptOptions, bytes: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, bytes, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, { N, r: R, p: P, maxmem: MAX_MEMORY }, KEY_BYTES);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Whether `password` matches `stored`, compared in constant time; false for a malformed hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || salt === undefined || key === undefined)
    return false;
  const expected = Buffer.from(key, 'base64url');
  const options = { N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEMORY };
  if (![options.N, options.r, options.p].every(Number.isSafeInteger) || expected.length === 0) {
    return false;
  }
  const actual = await derive(password, Buffer.from(salt, 'base64url'), options, expected.length);
  return timingSafeEqual(actual, expected);
}

let decoy: Promise<string> | null = null;

/**
 * A hash to compare against when the login is unknown, so a refused sign-in takes as long whether
 * or not the login exists.
 */
export const decoyHash = (): Promise<string> =>
  (decoy ??= hashPassword(randomBytes(24).toString('hex')));

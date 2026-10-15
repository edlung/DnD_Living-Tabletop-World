import { describe, expect, it } from 'vitest';

import {
  PROVIDER_ERROR_CODES,
  ProviderError,
  failureCode,
  type ProviderErrorCode,
} from './providers.ts';

/**
 * `failureCode` turns any rejection into a fixed code (docs/adr/0032-live-ai.md, B1 repair 4). It
 * never throws and reads a code at most once. Only a genuine `ProviderError`, made by its
 * constructor, whose code is still the allowlisted code it was made with, keeps that code; every
 * other value, including a look-alike claiming `TRANSPORT_NOT_STARTED`, is `UNAVAILABLE`, so no
 * release proof is ever inferred from an unknown or unreadable rejection.
 */
const withCode = (code: ProviderErrorCode, descriptor: PropertyDescriptor) => {
  const error = new ProviderError(code, 'x');
  Object.defineProperty(error, 'code', descriptor);
  return error;
};

const revoked = (() => {
  const handle = Proxy.revocable(new ProviderError('TRANSPORT_NOT_STARTED', 'x'), {});
  handle.revoke();
  return handle.proxy;
})();

describe('failureCode', () => {
  it.each(PROVIDER_ERROR_CODES)('keeps the code %s of a genuine ProviderError', (code) => {
    expect(failureCode(new ProviderError(code, 'x'))).toBe(code);
  });

  it.each([
    ['a plain Error', new Error('TRANSPORT_NOT_STARTED')],
    [
      'a plain object claiming no transport',
      { name: 'ProviderError', code: 'TRANSPORT_NOT_STARTED' },
    ],
    ['a plain object claiming a timeout', { code: 'TIMEOUT' }],
    [
      'an object with the ProviderError prototype',
      Object.assign(Object.create(ProviderError.prototype) as object, {
        code: 'TRANSPORT_NOT_STARTED',
      }),
    ],
    [
      'a Proxy over a genuine ProviderError',
      new Proxy(new ProviderError('TRANSPORT_NOT_STARTED', 'x'), {}),
    ],
    [
      'a Proxy whose prototype read throws',
      new Proxy(new ProviderError('TIMEOUT', 'x'), {
        getPrototypeOf: () => {
          throw new Error('no prototype');
        },
      }),
    ],
    ['a revoked Proxy', revoked],
    [
      'a code getter that throws',
      withCode('TIMEOUT', {
        get: () => {
          throw new Error('code unreadable');
        },
      }),
    ],
    ['an unknown code', withCode('TIMEOUT', { value: 'INVENTED_CODE' })],
    ['a code that is not a string', withCode('TIMEOUT', { value: 42 })],
    [
      'a code changed to TRANSPORT_NOT_STARTED',
      withCode('TIMEOUT', { value: 'TRANSPORT_NOT_STARTED' }),
    ],
    ['a code it was never allowed', new ProviderError('NOPE' as ProviderErrorCode, 'x')],
    ['a string', 'TRANSPORT_NOT_STARTED'],
    ['undefined', undefined],
    ['null', null],
  ])('treats %s as UNAVAILABLE, without throwing', (_label, error) => {
    expect(() => failureCode(error)).not.toThrow();
    expect(failureCode(error)).toBe('UNAVAILABLE');
  });

  it('reads a code at most once', () => {
    let reads = 0;
    const error = withCode('TIMEOUT', {
      get: () => {
        reads += 1;
        return reads === 1 ? 'TIMEOUT' : 'TRANSPORT_NOT_STARTED';
      },
    });

    expect(failureCode(error)).toBe('TIMEOUT');
    expect(reads).toBe(1);
  });
});

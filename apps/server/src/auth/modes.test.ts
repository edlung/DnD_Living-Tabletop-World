import { describe, expect, it } from 'vitest';

import { ConfigError, DEFAULT_PERSONAS_FILE, loadConfig } from '../platform/config/config.ts';
import { composeAuthentication } from './composition.ts';
import { InMemoryCredentialStore } from './credential-store.ts';
import {
  clearedSessionCookie,
  presentedSessionCookies,
  secureCookies,
  sessionCookie,
  sessionTokenFrom,
} from './tokens.ts';

/**
 * Authentication modes and their configuration (docs/adr/0036-production-sign-in.md §5 and its
 * amendment 2026-10-16): invitations need a public origin and an explicit trusted proxy;
 * development personas run only on a loopback development server without a public origin, by
 * the configuration and again by the composition.
 */
const PRODUCTION = { NODE_ENV: 'production', DATABASE_URL: 'postgres://app:pw@db/ltw' };
const INVITATIONS = { AUTH_MODE: 'invitations', LTW_TRUST_PROXY: 'none' };

const configError = (env: Record<string, string>): ConfigError | null => {
  try {
    loadConfig(env);
  } catch (caught) {
    if (caught instanceof ConfigError) return caught;
    throw caught;
  }
  return null;
};

describe('the invitations mode', () => {
  it('needs PUBLIC_ORIGIN, an exact https origin (plain http for localhost in development)', () => {
    expect(
      loadConfig({ ...PRODUCTION, ...INVITATIONS, PUBLIC_ORIGIN: 'https://table.example' }).auth,
    ).toEqual({ mode: 'invitations', personasFile: null, publicOrigin: 'https://table.example' });
    expect(
      loadConfig({ ...INVITATIONS, PUBLIC_ORIGIN: 'http://127.0.0.1:4310' }).auth.publicOrigin,
    ).toBe('http://127.0.0.1:4310');
    expect(() => loadConfig({ ...PRODUCTION, ...INVITATIONS })).toThrow(
      /PUBLIC_ORIGIN: required in invitations mode/,
    );
    for (const origin of [
      'https://table.example/',
      'https://table.example/join',
      'https://user:pw@table.example',
      'HTTPS://TABLE.EXAMPLE',
      'http://table.example',
      'ftp://table.example',
      'table.example',
      'null',
    ]) {
      const error = configError({ ...PRODUCTION, ...INVITATIONS, PUBLIC_ORIGIN: origin });
      expect(error, origin).toBeInstanceOf(ConfigError);
      expect(error?.message).toContain('PUBLIC_ORIGIN');
      expect(error?.message).not.toContain(origin);
    }
    // Plain http is a development convenience for localhost only, never in production.
    expect(() =>
      loadConfig({ ...PRODUCTION, ...INVITATIONS, PUBLIC_ORIGIN: 'http://localhost:4310' }),
    ).toThrow(ConfigError);
  });

  it('refuses to start until the trusted proxy is set explicitly, none included', () => {
    const invitations = { AUTH_MODE: 'invitations', PUBLIC_ORIGIN: 'https://table.example' };
    expect(() => loadConfig(invitations)).toThrow(/LTW_TRUST_PROXY: required in invitations mode/);
    expect(() => loadConfig({ ...PRODUCTION, ...invitations })).toThrow(/LTW_TRUST_PROXY/);
    expect(loadConfig({ ...invitations, LTW_TRUST_PROXY: 'none' }).http.trustedProxies).toEqual([]);
    expect(
      loadConfig({ ...invitations, LTW_TRUST_PROXY: '10.0.0.5, fd00::/8' }).http.trustedProxies,
    ).toEqual(['10.0.0.5', 'fd00::/8']);
    for (const value of ['0.0.0.0/0', '::/0', 'all', 'loopback', '10.0.0.5,', 'none,10.0.0.5']) {
      const error = configError({ ...invitations, LTW_TRUST_PROXY: value });
      expect(error?.issues, value).toEqual([expect.stringMatching(/^LTW_TRUST_PROXY: /)]);
      expect(error?.message).not.toContain(value);
    }
    // Other modes trust no proxy unless told to.
    expect(loadConfig({}).http.trustedProxies).toEqual([]);
    expect(loadConfig(PRODUCTION).http.trustedProxies).toEqual([]);
    expect(loadConfig({ LTW_TRUST_PROXY: '127.0.0.1' }).http.trustedProxies).toEqual(['127.0.0.1']);
  });

  it('keeps today’s defaults: personas in development, nobody signed in in production', () => {
    expect(loadConfig({}).auth).toEqual({
      mode: 'dev-personas',
      personasFile: DEFAULT_PERSONAS_FILE,
    });
    expect(loadConfig(PRODUCTION).auth).toEqual({ mode: 'disabled', personasFile: null });
  });
});

describe('development personas', () => {
  it('are refused on a server with a public origin, whatever NODE_ENV says or omits', () => {
    // NODE_ENV forgotten on a public host: personas would sign anyone in as the DM.
    for (const env of [
      {
        PUBLIC_ORIGIN: 'https://table.example',
        DATABASE_URL: 'postgres://u:p@db.internal:5432/ltw',
        HTTP_HOST: '0.0.0.0',
      },
      { PUBLIC_ORIGIN: 'https://table.example' },
      { PUBLIC_ORIGIN: 'http://127.0.0.1:4310' },
      { NODE_ENV: 'test', PUBLIC_ORIGIN: 'https://table.example' },
      { NODE_ENV: 'development', AUTH_MODE: 'dev-personas', PUBLIC_ORIGIN: 'http://localhost:1' },
    ]) {
      const error = configError(env);
      expect(error?.issues, JSON.stringify(env)).toContainEqual(
        expect.stringMatching(/^AUTH_MODE: dev-personas is refused with PUBLIC_ORIGIN/),
      );
    }
  });

  it('are refused unless the server listens on loopback only', () => {
    for (const env of [
      { HTTP_HOST: '0.0.0.0' },
      { HTTP_HOST: '::' },
      { HTTP_HOST: '192.168.1.5', AUTH_MODE: 'dev-personas' },
      { NODE_ENV: 'test', HTTP_HOST: 'table.example' },
      { NODE_ENV: 'development', HTTP_HOST: '10.0.0.2', DEV_PERSONAS_FILE: '/tmp/p.json' },
    ]) {
      const error = configError(env);
      expect(error?.issues, JSON.stringify(env)).toEqual([
        expect.stringMatching(/^AUTH_MODE: dev-personas is refused unless HTTP_HOST is loopback/),
      ]);
      expect(error?.message).not.toContain(env.HTTP_HOST);
    }
    for (const host of ['127.0.0.1', 'localhost', '::1', '127.0.0.2']) {
      expect(loadConfig({ HTTP_HOST: host }).auth.mode, host).toBe('dev-personas');
      expect(loadConfig({ NODE_ENV: 'test', HTTP_HOST: host }).auth.mode, host).toBe(
        'dev-personas',
      );
    }
  });

  it('are refused in production, and other modes listen anywhere', () => {
    expect(() => loadConfig({ ...PRODUCTION, AUTH_MODE: 'dev-personas' })).toThrow(
      /AUTH_MODE: dev-personas is not allowed in production/,
    );
    expect(loadConfig({ HTTP_HOST: '0.0.0.0', AUTH_MODE: 'disabled' }).auth.mode).toBe('disabled');
    expect(loadConfig({ ...PRODUCTION, HTTP_HOST: '0.0.0.0' }).auth.mode).toBe('disabled');
    expect(
      loadConfig({ ...INVITATIONS, HTTP_HOST: '0.0.0.0', PUBLIC_ORIGIN: 'https://table.example' })
        .auth.mode,
    ).toBe('invitations');
  });
});

describe('composing authentication', () => {
  const personas = (nodeEnv: 'production' | 'development', host: string) =>
    composeAuthentication(
      {
        nodeEnv,
        http: { host, port: 3000, trustedProxies: [] },
        auth: { mode: 'dev-personas', personasFile: DEFAULT_PERSONAS_FILE },
      },
      () => new InMemoryCredentialStore(),
    );

  it('refuses development personas in production or off loopback, even past the configuration', async () => {
    await expect(personas('production', '127.0.0.1')).rejects.toThrow(/personas are refused/);
    await expect(personas('development', '0.0.0.0')).rejects.toThrow(/personas are refused/);
    await expect(personas('development', '192.168.1.5')).rejects.toThrow(/personas are refused/);
    expect((await personas('development', '127.0.0.1')).signIn).toBeUndefined();
  });

  it('gives invitation mode cookie sessions and sign-in, personas mode neither', async () => {
    const invitations = await composeAuthentication(
      loadConfig({ ...INVITATIONS, PUBLIC_ORIGIN: 'https://table.example' }),
      () => new InMemoryCredentialStore(),
    );
    expect(invitations.signIn?.publicOrigin).toBe('https://table.example');
    expect(
      await invitations.authenticator.authenticate({ authorization: 'Bearer dev-dm-ravenford' }),
    ).toBeNull();
    const personas = await composeAuthentication(loadConfig({}), () => {
      throw new Error('no credential store with personas');
    });
    expect(personas.signIn).toBeUndefined();
    expect(
      await personas.authenticator.authenticate({ authorization: 'Bearer dev-dm-ravenford' }),
    ).toMatchObject({ actor: { actorId: 'dm-ravenford' }, campaignId: null });
    const disabled = await composeAuthentication(loadConfig(PRODUCTION), () => {
      throw new Error('no credential store when disabled');
    });
    expect(await disabled.authenticator.authenticate({ authorization: 'Bearer x' })).toBeNull();
  });
});

describe('the session cookie', () => {
  it('is strict, and drops Secure only for a plain-http loopback origin', () => {
    expect(secureCookies('https://table.example')).toBe(true);
    expect(secureCookies('http://localhost:4310')).toBe(false);
    expect(secureCookies('http://127.0.0.1:4310')).toBe(false);
    expect(secureCookies('http://[::1]:4310')).toBe(false);
    const token = 'A'.repeat(43);
    expect(sessionCookie(token, 60, true)).toBe(
      `ltw_session=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=60; Secure`,
    );
    expect(clearedSessionCookie(false)).toBe(
      'ltw_session=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0',
    );
  });

  it('is read from a Cookie header only when present once and well formed', () => {
    const token = 'b'.repeat(43);
    expect(sessionTokenFrom(`theme=dark; ltw_session=${token}; x=1`)).toBe(token);
    expect(sessionTokenFrom(undefined)).toBeNull();
    expect(sessionTokenFrom(`ltw_session=${token}; ltw_session=${token}`)).toBeNull();
    expect(sessionTokenFrom('ltw_session=short')).toBeNull();
    expect(sessionTokenFrom(`xltw_session=${token}`)).toBeNull();
    expect(sessionTokenFrom(`ltw_session=${token}!`)).toBeNull();
  });

  it('counts as presented whenever the header names it, well formed or not', () => {
    const token = 'c'.repeat(43);
    expect(presentedSessionCookies(undefined)).toBe(0);
    expect(presentedSessionCookies('theme=dark; xltw_session=1')).toBe(0);
    expect(presentedSessionCookies(`ltw_session=${token}`)).toBe(1);
    expect(presentedSessionCookies('theme=dark;ltw_session=short')).toBe(1);
    expect(presentedSessionCookies('ltw_session=')).toBe(1);
    expect(presentedSessionCookies(`ltw_session=${token}; ltw_session=${token}`)).toBe(2);
  });
});

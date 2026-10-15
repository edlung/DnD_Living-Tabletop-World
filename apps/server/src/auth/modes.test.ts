import { describe, expect, it } from 'vitest';

import { ConfigError, DEFAULT_PERSONAS_FILE, loadConfig } from '../platform/config/config.ts';
import { composeAuthentication } from './composition.ts';
import { InMemoryCredentialStore } from './credential-store.ts';
import {
  AuthOperatorUsageError,
  parseAuthOperatorArgs,
  issueDmInvitation,
  AuthOperatorRefusal,
} from './operator.ts';
import { seededEngine } from '../testing/ravenford-app.ts';
import { ManualClock } from '../testing/sign-in.ts';
import { clearedSessionCookie, secureCookies, sessionCookie, sessionTokenFrom } from './tokens.ts';

/**
 * Authentication modes and their configuration (docs/adr/0036-production-sign-in.md §5):
 * invitations need a public origin; development personas stay refused in production, by the
 * configuration and again by the composition; the operator CLI takes exactly its arguments.
 */
const PRODUCTION = { NODE_ENV: 'production', DATABASE_URL: 'postgres://app:pw@db/ltw' };

describe('the invitations mode', () => {
  it('needs PUBLIC_ORIGIN, an exact https origin (plain http for localhost in development)', () => {
    expect(
      loadConfig({
        ...PRODUCTION,
        AUTH_MODE: 'invitations',
        PUBLIC_ORIGIN: 'https://table.example',
      }).auth,
    ).toEqual({ mode: 'invitations', personasFile: null, publicOrigin: 'https://table.example' });
    expect(
      loadConfig({ AUTH_MODE: 'invitations', PUBLIC_ORIGIN: 'http://127.0.0.1:4310' }).auth
        .publicOrigin,
    ).toBe('http://127.0.0.1:4310');
    expect(() => loadConfig({ ...PRODUCTION, AUTH_MODE: 'invitations' })).toThrow(
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
      const error = (() => {
        try {
          loadConfig({ ...PRODUCTION, AUTH_MODE: 'invitations', PUBLIC_ORIGIN: origin });
        } catch (caught) {
          return caught;
        }
        return null;
      })();
      expect(error, origin).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain('PUBLIC_ORIGIN');
      expect((error as ConfigError).message).not.toContain(origin);
    }
    // Plain http is a development convenience for localhost only, never in production.
    expect(() =>
      loadConfig({
        ...PRODUCTION,
        AUTH_MODE: 'invitations',
        PUBLIC_ORIGIN: 'http://localhost:4310',
      }),
    ).toThrow(ConfigError);
  });

  it('keeps today’s defaults: personas in development, nobody signed in in production', () => {
    expect(loadConfig({}).auth).toEqual({
      mode: 'dev-personas',
      personasFile: DEFAULT_PERSONAS_FILE,
    });
    expect(loadConfig(PRODUCTION).auth).toEqual({ mode: 'disabled', personasFile: null });
  });
});

describe('composing authentication', () => {
  it('refuses development personas in production even past the configuration', async () => {
    expect(() => loadConfig({ ...PRODUCTION, AUTH_MODE: 'dev-personas' })).toThrow(
      /dev-personas is not allowed in production/,
    );
    await expect(
      composeAuthentication(
        {
          nodeEnv: 'production',
          auth: { mode: 'dev-personas', personasFile: DEFAULT_PERSONAS_FILE },
        },
        () => new InMemoryCredentialStore(),
      ),
    ).rejects.toThrow(/refused in production/);
  });

  it('gives invitation mode cookie sessions and sign-in, personas mode neither', async () => {
    const invitations = await composeAuthentication(
      loadConfig({ AUTH_MODE: 'invitations', PUBLIC_ORIGIN: 'https://table.example' }),
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
});

describe('the operator CLI', () => {
  it('takes exactly a campaign and an explicit expiry of 1 to 168 hours', () => {
    expect(
      parseAuthOperatorArgs(['dm-invite', '--campaign', 'ravenford', '--expires-hours', '24']),
    ).toEqual({ kind: 'dm-invite', campaignId: 'ravenford', expiresHours: 24 });
    for (const argv of [
      [],
      ['dm-invite'],
      ['dm-invite', '--campaign', 'ravenford'],
      ['dm-invite', '--expires-hours', '24'],
      ['dm-invite', '--campaign', 'Raven Ford', '--expires-hours', '24'],
      ['dm-invite', '--campaign', 'ravenford', '--expires-hours', '0'],
      ['dm-invite', '--campaign', 'ravenford', '--expires-hours', '169'],
      ['dm-invite', '--campaign', 'ravenford', '--expires-hours', '1.5'],
      ['dm-invite', '--campaign', 'ravenford', '--expires-hours', '24', '--actor', 'x'],
      ['dm-invite', '--campaign', 'ravenford', '--campaign', 'x', '--expires-hours', '24'],
      ['dm-invite', '--campaign', '--expires-hours', '24'],
      ['player-invite', '--campaign', 'ravenford', '--expires-hours', '24'],
    ]) {
      expect(() => parseAuthOperatorArgs(argv), argv.join(' ')).toThrow(AuthOperatorUsageError);
    }
  });

  it('issues the DM’s invitation for an existing campaign only', async () => {
    const engine = await seededEngine();
    const credentials = new InMemoryCredentialStore();
    const deps = { credentials, publicOrigin: 'https://table.example', clock: new ManualClock() };
    const issued = await issueDmInvitation(engine, deps, {
      kind: 'dm-invite',
      campaignId: 'ravenford',
      expiresHours: 24,
    });
    expect(issued.link).toMatch(/^https:\/\/table\.example\/join#[A-Za-z0-9_-]{43}$/);
    const stored = (await credentials.listInvitations('ravenford', 10))[0];
    expect(stored).toMatchObject({
      purpose: 'dm',
      actorId: 'dm-ravenford',
      createdBy: 'operator',
      characterId: null,
    });
    expect(JSON.stringify(stored)).not.toContain(issued.link.slice(-43));
    await expect(
      issueDmInvitation(engine, deps, {
        kind: 'dm-invite',
        campaignId: 'nowhere',
        expiresHours: 1,
      }),
    ).rejects.toBeInstanceOf(AuthOperatorRefusal);
  });
});

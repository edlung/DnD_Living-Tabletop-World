import { describe, expect, it } from 'vitest';

import { openLive } from '../testing/live.ts';
import { seededEngine } from '../testing/ravenford-app.ts';
import {
  ManualClock,
  ORIGIN,
  OTHER_CAMPAIGN,
  SEREN,
  signInTable,
  type SignInTable,
} from '../testing/sign-in.ts';
import { InMemoryCredentialStore } from './credential-store.ts';
import {
  AuthOperatorRefusal,
  AuthOperatorUsageError,
  issueDmInvitation,
  parseAuthOperatorArgs,
  runAuthOperatorCommand,
} from './operator.ts';
import { hashToken } from './tokens.ts';

/**
 * The operator CLI (`pnpm auth:operator`; docs/adr/0036-production-sign-in.md §1 and its
 * amendment 2026-10-16): exactly its arguments; the DM's invitation; revoking the DM's sessions
 * (which no route can), signing one actor out everywhere, listing live sessions, never a secret.
 */
const SOURCE = 'owner message 2026-10-16 #12';

describe('the operator CLI', () => {
  it('takes exactly a campaign and an explicit expiry of 1 to 168 hours for a DM invitation', () => {
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
      ['constructor', '--campaign', 'ravenford'],
    ]) {
      expect(() => parseAuthOperatorArgs(argv), argv.join(' ')).toThrow(AuthOperatorUsageError);
    }
  });

  it('takes a revocation only with the authorization it is done under', () => {
    expect(
      parseAuthOperatorArgs([
        'revoke-dm',
        '--campaign',
        'ravenford',
        '--authorization-source',
        ` ${SOURCE} `,
      ]),
    ).toEqual({ kind: 'revoke-dm', campaignId: 'ravenford', authorizationSource: SOURCE });
    expect(
      parseAuthOperatorArgs([
        'revoke-actor',
        '--actor',
        'player:7f1c',
        '--authorization-source',
        SOURCE,
      ]),
    ).toEqual({ kind: 'revoke-actor', actorId: 'player:7f1c', authorizationSource: SOURCE });
    expect(parseAuthOperatorArgs(['sessions', '--campaign', 'ravenford'])).toEqual({
      kind: 'sessions',
      campaignId: 'ravenford',
    });
    for (const argv of [
      ['revoke-dm', '--campaign', 'ravenford'],
      ['revoke-dm', '--authorization-source', SOURCE],
      ['revoke-dm', '--campaign', 'ravenford', '--authorization-source', '   '],
      ['revoke-dm', '--campaign', 'ravenford', '--authorization-source', 'a\nb'],
      ['revoke-dm', '--campaign', 'ravenford', '--authorization-source', 'x'.repeat(201)],
      ['revoke-dm', '--campaign', 'ravenford', '--authorization-source', SOURCE, '--actor', 'x'],
      ['revoke-actor', '--actor', 'player:7f1c'],
      ['revoke-actor', '--actor', ' bad actor', '--authorization-source', SOURCE],
      ['revoke-actor', '--campaign', 'ravenford', '--authorization-source', SOURCE],
      ['sessions'],
      ['sessions', '--campaign', 'ravenford', '--authorization-source', SOURCE],
      ['sessions', '--campaign', 'Raven Ford'],
    ]) {
      expect(() => parseAuthOperatorArgs(argv), argv.join(' ')).toThrow(AuthOperatorUsageError);
    }
  });

  it('issues the DM’s invitation for an existing campaign only, and only in invitation mode', async () => {
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
    await expect(
      runAuthOperatorCommand(
        engine,
        { ...deps, publicOrigin: null },
        { kind: 'dm-invite', campaignId: 'ravenford', expiresHours: 1 },
      ),
    ).rejects.toMatchObject({ code: 'INVITATIONS_MODE_REQUIRED' });
  });
});

/** The DM signed in twice (two devices) and once at the other table, a player, a spare link. */
async function evening() {
  const table = await signInTable();
  const laptop = await table.signInWith(await table.dmInvitation());
  const phone = await table.signInWith(await table.dmInvitation());
  const elsewhere = await table.signInWith(await table.dmInvitation(OTHER_CAMPAIGN));
  const player = await table.signInWith((await table.invite(laptop, SEREN)).token);
  const spare = await table.dmInvitation();
  return { table, laptop, phone, elsewhere, player, spare };
}

const operator = (table: SignInTable, argv: readonly string[]) =>
  runAuthOperatorCommand(
    table.engine,
    { credentials: table.credentials, clock: table.clock, publicOrigin: ORIGIN },
    parseAuthOperatorArgs(argv),
  );

const sessionStatus = async (table: SignInTable, cookie: string) =>
  (await table.send('GET', '/auth/session', { cookie })).statusCode;

describe('revoking the DM’s sessions', () => {
  it('signs the DM out of that campaign on every device, spare links included', async () => {
    const { table, laptop, phone, elsewhere, player, spare } = await evening();
    const stream = await openLive(
      table.app,
      '/campaigns/ravenford/live?perspective=DM',
      undefined,
      {
        cookie: phone,
        origin: ORIGIN,
      },
    );
    await stream.until(() => stream.messages().some((message) => message.type === 'ready'));
    const result = await operator(table, [
      'revoke-dm',
      '--campaign',
      'ravenford',
      '--authorization-source',
      SOURCE,
    ]);
    expect(result).toEqual({
      campaignId: 'ravenford',
      actorId: 'dm-ravenford',
      sessionsRevoked: 2,
      invitationsRevoked: 1,
      authorizationSource: SOURCE,
    });
    expect(await sessionStatus(table, laptop)).toBe(401);
    expect(await sessionStatus(table, phone)).toBe(401);
    expect((await table.redeem(spare)).statusCode).toBe(401);
    // The live stream closes within a cycle; the player and the other table carry on.
    await table.hub.cycle();
    await stream.until(() => stream.ended());
    expect(stream.messages().at(-1)).toEqual({ type: 'closed', reason: 'unauthenticated' });
    expect(await sessionStatus(table, player)).toBe(200);
    expect(await sessionStatus(table, elsewhere)).toBe(200);
    // The DM comes back through a new invitation from the operator.
    expect(await sessionStatus(table, await table.signInWith(await table.dmInvitation()))).toBe(
      200,
    );
  });

  it('refuses a campaign that does not exist', async () => {
    const { table } = await evening();
    await expect(
      operator(table, ['revoke-dm', '--campaign', 'nowhere', '--authorization-source', SOURCE]),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
});

describe('signing an actor out everywhere', () => {
  it('revokes its sessions and open invitations in every campaign, nobody else’s', async () => {
    const { table, laptop, phone, elsewhere, player } = await evening();
    const result = await operator(table, [
      'revoke-actor',
      '--actor',
      'dm-ravenford',
      '--authorization-source',
      SOURCE,
    ]);
    expect(result).toEqual({
      actorId: 'dm-ravenford',
      sessionsRevoked: 3,
      invitationsRevoked: 1,
      authorizationSource: SOURCE,
    });
    for (const cookie of [laptop, phone, elsewhere])
      expect(await sessionStatus(table, cookie)).toBe(401);
    expect(await sessionStatus(table, player)).toBe(200);
    // Idempotent: nothing more to revoke.
    expect(
      await operator(table, [
        'revoke-actor',
        '--actor',
        'dm-ravenford',
        '--authorization-source',
        SOURCE,
      ]),
    ).toMatchObject({ sessionsRevoked: 0, invitationsRevoked: 0 });
  });
});

describe('listing live sessions', () => {
  it('shows who is signed in where in the campaign, never a token or a hash', async () => {
    const { table, laptop, phone, player } = await evening();
    const listed = await operator(table, ['sessions', '--campaign', 'ravenford']);
    const playerActor = (await table.engine.load('ravenford'))?.state.roster.get(SEREN);
    expect(listed).toMatchObject({
      campaignId: 'ravenford',
      sessions: [
        { actorId: 'dm-ravenford', role: 'dm', characterIds: [] },
        { actorId: 'dm-ravenford', role: 'dm', characterIds: [] },
        { actorId: playerActor, role: 'player', characterIds: [SEREN] },
      ],
    });
    const text = JSON.stringify(listed);
    for (const cookie of [laptop, phone, player]) {
      const token = cookie.slice('ltw_session='.length);
      expect(text).not.toContain(token);
      expect(text).not.toContain(hashToken(token));
    }
    expect(text).not.toMatch(/token|hash/i);
    // A revoked member's session is no longer live.
    await table.send(
      'POST',
      `/campaigns/ravenford/members/${SEREN}/revoke`,
      { cookie: laptop },
      {},
    );
    const after = (await operator(table, ['sessions', '--campaign', 'ravenford'])) as {
      sessions: readonly { role: string }[];
    };
    expect(after.sessions.map((session) => session.role)).toEqual(['dm', 'dm']);
    await expect(operator(table, ['sessions', '--campaign', 'nowhere'])).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });
});

describe('deleting an account', () => {
  it('forgets a DM’s account too, with the authorization, and refuses a login nobody holds', async () => {
    const table = await signInTable();
    const joined = await table.redeem(
      await table.dmInvitation(),
      {},
      {
        newAccount: { login: 'ada-dm', password: 'correct horse battery', displayName: 'Ada' },
      },
    );
    expect(joined.statusCode).toBe(200);
    const run = (argv: readonly string[]) =>
      runAuthOperatorCommand(
        table.engine,
        {
          credentials: table.credentials,
          clock: table.clock,
          publicOrigin: ORIGIN,
          accounts: table.accounts,
        },
        parseAuthOperatorArgs(argv),
      );
    const argv = ['delete-account', '--login', 'ada-dm', '--authorization-source', SOURCE];
    expect(await run(argv)).toEqual({
      login: 'ada-dm',
      deleted: true,
      authorizationSource: SOURCE,
      seats: [{ campaignId: 'ravenford', role: 'dm' }],
    });
    expect(await table.accounts.findByLogin('ada-dm')).toBeNull();
    await expect(run(argv)).rejects.toThrow(AuthOperatorRefusal);
    expect(() => parseAuthOperatorArgs(['delete-account', '--login', 'ada-dm'])).toThrow(
      AuthOperatorUsageError,
    );
  });
});

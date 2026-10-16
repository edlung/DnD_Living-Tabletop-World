import { describe, expect, it, vi } from 'vitest';

import { holdInvitation, takeInvitation, type InvitationHolder } from './invitation-link.ts';
import {
  describeSignIn,
  pageStart,
  probeSession,
  readSignIn,
  redeemInvitation,
  replaceSignIn,
  signOut,
  takeSeat,
} from './sign-in-flow.ts';

/**
 * Production sign-in from the browser (docs/adr/0036-production-sign-in.md §7;
 * docs/STAGE_340_DESIGN.md "Part B review fixes"), over a fake transport: the token leaves the
 * address before any request, waits in a one-shot holder and travels only in a body, sent only
 * when the person takes their seat; requests carry the session cookie to their own origin and
 * never an `Authorization` header; every failed invitation reads the same; a signed-in browser
 * is asked before its sign-in is replaced. (`invitation-token.test.ts` proves the token
 * unreachable once kept or failed.)
 */
const TOKEN = 'A'.repeat(21) + '_-' + 'z9'.repeat(10);
const json = (body: unknown, status = 200) => Response.json(body, { status });

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

/** A request's JSON body (the client sends strings only). */
const bodyOf = (sent: Sent | undefined): unknown =>
  typeof sent?.init.body === 'string' ? JSON.parse(sent.init.body) : undefined;

function transport(...answers: (Response | Error)[]) {
  const sent: Sent[] = [];
  const fake = vi.fn(function (this: unknown, input: unknown, init?: RequestInit) {
    expect(this).toBeUndefined();
    sent.push({ url: String(input), init: init ?? {} });
    const answer = answers.shift() ?? new Error('no answer');
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  return { fake, sent };
}

const expectSameOrigin = (sent: readonly Sent[]) => {
  for (const { url, init } of sent) {
    expect(url.startsWith('/api/')).toBe(true);
    expect(url).not.toContain(TOKEN);
    expect(init).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  }
};

const history = () => ({ replaceState: vi.fn() });

/** The invitation a join link leaves in its holder. */
function held(): InvitationHolder {
  const invitation = takeInvitation({ pathname: '/join', hash: `#${TOKEN}` }, history());
  if (invitation === null || invitation === 'malformed') throw new Error('no invitation');
  return invitation;
}

describe('the invitation in the address', () => {
  it('is taken from the join link into its holder and removed from the address at once', () => {
    const replaced = history();
    const invitation = takeInvitation({ pathname: '/join', hash: `#${TOKEN}` }, replaced);
    expect(replaced.replaceState).toHaveBeenCalledWith(null, '', '/');
    if (invitation === null || invitation === 'malformed') throw new Error('no invitation');
    expect(invitation.take()).toBe(TOKEN);
  });

  it('reads a join link without a well-formed token as malformed, and removes it too', () => {
    for (const hash of ['', '#', '#short', `#${TOKEN}x`, `#${TOKEN.slice(1)}!`, `#${TOKEN} `]) {
      const replaced = history();
      expect(takeInvitation({ pathname: '/join/', hash }, replaced)).toBe('malformed');
      expect(replaced.replaceState).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves every other address alone', () => {
    for (const pathname of ['/', '/joined', '/join/more', '/another-local-page']) {
      const replaced = history();
      expect(takeInvitation({ pathname, hash: `#${TOKEN}` }, replaced)).toBeNull();
      expect(replaced.replaceState).not.toHaveBeenCalled();
    }
  });

  it('leaves no token in the legacy RegExp statics its check fills', () => {
    held();
    const statics = RegExp as unknown as Readonly<Record<string, unknown>>;
    for (const name of ['input', 'lastMatch', '$_', 'leftContext', 'rightContext']) {
      expect(String(statics[name]).includes(TOKEN), name).toBe(false);
    }
  });
});

describe('the one-shot invitation holder', () => {
  it('gives its token once; once taken or forgotten it gives nothing', () => {
    const taken = holdInvitation(TOKEN);
    expect(taken.holds()).toBe(true);
    expect(taken.take()).toBe(TOKEN);
    expect([taken.holds(), taken.take()]).toEqual([false, null]);
    const forgotten = holdInvitation(TOKEN);
    forgotten.forget();
    expect([forgotten.holds(), forgotten.take()]).toEqual([false, null]);
    // The holder shows nothing of what it holds.
    expect(JSON.stringify(holdInvitation(TOKEN))).not.toContain(TOKEN);
  });
});

describe('the session probe', () => {
  it('finds a live sign-in by a same-origin request', async () => {
    const { fake, sent } = transport(json({ campaignId: 'ravenford' }));
    await expect(probeSession(fake)).resolves.toEqual({
      kind: 'signed-in',
      campaignId: 'ravenford',
    });
    expect(sent.map((call) => call.url)).toEqual(['/api/auth/session']);
    expectSameOrigin(sent);
  });

  it('tells signed out (401) from development personas (no such route)', async () => {
    await expect(probeSession(transport(json({}, 401)).fake)).resolves.toEqual({
      kind: 'signed-out',
    });
    await expect(probeSession(transport(json({}, 404)).fake)).resolves.toEqual({
      kind: 'personas',
    });
  });

  it('calls anything else unreachable, an answer that names no campaign included', async () => {
    for (const answer of [
      json({}, 403),
      json({}, 500),
      new Error('offline'),
      new Response('not JSON'),
      json({ campaignId: '../other' }),
      json({ campaign: 'ravenford' }),
    ]) {
      await expect(probeSession(transport(answer).fake)).resolves.toEqual({
        kind: 'unreachable',
      });
    }
  });
});

describe('redeeming an invitation', () => {
  it('posts the token in a JSON body only and joins the campaign it opens', async () => {
    const { fake, sent } = transport(json({ campaignId: 'ui-signin' }));
    await expect(redeemInvitation(fake, TOKEN, false)).resolves.toEqual({
      kind: 'joined',
      campaignId: 'ui-signin',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('/api/auth/redeem');
    expect(sent[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(bodyOf(sent[0])).toEqual({ token: TOKEN });
    expectSameOrigin(sent);
  });

  it('asks first when the browser is signed in, then confirms the replacement', async () => {
    const asked = transport(json({ error: { code: 'CONFLICT' } }, 409));
    await expect(redeemInvitation(asked.fake, TOKEN, false)).resolves.toEqual({
      kind: 'needs-confirmation',
    });
    const confirmed = transport(json({ campaignId: 'ui-signin' }));
    await expect(redeemInvitation(confirmed.fake, TOKEN, true)).resolves.toEqual({
      kind: 'joined',
      campaignId: 'ui-signin',
    });
    expect(bodyOf(confirmed.sent[0])).toEqual({
      token: TOKEN,
      replaceSession: true,
    });
  });

  it('reads every other answer as the same failure, whatever its reason', async () => {
    for (const answer of [
      json({ error: { code: 'UNAUTHENTICATED' } }, 401),
      json({ error: { code: 'INVALID_REQUEST' } }, 400),
      json({ error: { code: 'RATE_LIMITED' } }, 429),
      json({ error: { code: 'FORBIDDEN' } }, 403),
      json({ error: { code: 'NOT_FOUND' } }, 404),
      json({}, 502),
      new Error('connection lost'),
      json({ nothing: true }),
    ]) {
      await expect(redeemInvitation(transport(answer).fake, TOKEN, false)).resolves.toEqual({
        kind: 'failed',
      });
    }
    // A confirmed replacement is never asked again.
    const again = transport(json({ error: { code: 'CONFLICT' } }, 409));
    await expect(redeemInvitation(again.fake, TOKEN, true)).resolves.toEqual({ kind: 'failed' });
  });
});

describe('the start of a page', () => {
  it('asks once whether this browser is signed in when no invitation came with it', async () => {
    const { fake, sent } = transport(json({}, 401));
    const start = pageStart(null, fake);
    if (start.kind !== 'probe') throw new Error('no probe');
    await expect(start.first).resolves.toEqual({ kind: 'signed-out' });
    expect(sent.map((call) => call.url)).toEqual(['/api/auth/session']);
  });

  it('sends nothing for a join link: the invitation waits for the person', () => {
    const { fake, sent } = transport();
    const invitation = held();
    expect(pageStart(invitation, fake)).toEqual({ kind: 'invited', invitation });
    expect(pageStart('malformed', fake)).toEqual({ kind: 'malformed' });
    expect(sent).toEqual([]);
    expect(invitation.holds()).toBe(true);
  });
});

describe('taking the seat', () => {
  it('redeems the held invitation once, on the person’s click; a second press sends nothing', async () => {
    const invitation = held();
    const { fake, sent } = transport(json({ campaignId: 'ui-signin' }));
    await expect(takeSeat(invitation, fake)).resolves.toEqual({
      kind: 'joined',
      campaignId: 'ui-signin',
    });
    expect(invitation.holds()).toBe(false);
    await expect(takeSeat(invitation, fake)).resolves.toBeNull();
    expect(sent.map((call) => [call.url, bodyOf(call)])).toEqual([
      ['/api/auth/redeem', { token: TOKEN }],
    ]);
    expectSameOrigin(sent);
  });

  it('is spent the moment it is sent, so a double press redeems once', async () => {
    const invitation = held();
    const { fake, sent } = transport(json({ campaignId: 'ui-signin' }));
    const first = takeSeat(invitation, fake);
    const second = takeSeat(invitation, fake);
    expect(invitation.holds()).toBe(false);
    await expect(second).resolves.toBeNull();
    await expect(first).resolves.toMatchObject({ kind: 'joined' });
    expect(sent).toHaveLength(1);
  });

  it('forgets the token on any failure: the outcome holds none', async () => {
    for (const answer of [json({}, 401), json({}, 429), new Error('lost')]) {
      const invitation = held();
      const outcome = await takeSeat(invitation, transport(answer).fake);
      expect(outcome).toEqual({ kind: 'failed' });
      expect(invitation.holds()).toBe(false);
    }
  });

  it('gives a signed-in browser’s question its own one-shot holder; keeping forgets it', async () => {
    const invitation = held();
    const { fake, sent } = transport(json({ error: { code: 'CONFLICT' } }, 409));
    const outcome = await takeSeat(invitation, fake);
    if (outcome?.kind !== 'needs-confirmation') throw new Error('not asked');
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
    expect([invitation.holds(), outcome.replacement.holds()]).toEqual([false, true]);
    // "Keep my current sign-in".
    outcome.replacement.forget();
    await expect(replaceSignIn(outcome.replacement, fake)).resolves.toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('replacing spends the question’s token once, before the answer comes', async () => {
    const asked = await takeSeat(held(), transport(json({}, 409)).fake);
    if (asked?.kind !== 'needs-confirmation') throw new Error('not asked');
    const { fake, sent } = transport(json({ campaignId: 'ui-signin' }));
    const replaced = replaceSignIn(asked.replacement, fake);
    expect(asked.replacement.holds()).toBe(false);
    await expect(replaced).resolves.toEqual({ kind: 'joined', campaignId: 'ui-signin' });
    await expect(replaceSignIn(asked.replacement, fake)).resolves.toBeNull();
    expect(sent.map(bodyOf)).toEqual([{ token: TOKEN, replaceSession: true }]);
    // A refused replacement is the one failure (a second 409 is never asked again).
    const again = await takeSeat(held(), transport(json({}, 409)).fake);
    if (again?.kind !== 'needs-confirmation') throw new Error('not asked');
    await expect(replaceSignIn(again.replacement, transport(json({}, 409)).fake)).resolves.toEqual({
      kind: 'failed',
    });
    expect(again.replacement.holds()).toBe(false);
  });
});

describe('signing out and naming the current sign-in', () => {
  const ELOWEN_SESSION = {
    actorId: 'player:7f1c',
    role: 'PLAYER',
    campaign: { campaignId: 'ravenford', name: 'The Missing Caravan', language: 'en' },
    character: { entityId: 'elowen-starwhisper', kind: 'character', name: 'Elowen' },
    perspectives: [],
  };

  it('signs out by a same-origin POST; no session left is signed out too', async () => {
    for (const status of [204, 401]) {
      const { fake, sent } = transport(new Response(null, { status }));
      await expect(signOut(fake)).resolves.toBe('signed-out');
      expect(sent[0]).toMatchObject({ url: '/api/auth/sign-out', init: { method: 'POST' } });
      expectSameOrigin(sent);
    }
    for (const answer of [json({}, 500), json({}, 403), new Error('offline')]) {
      await expect(signOut(transport(answer).fake)).resolves.toBe('failed');
    }
  });

  it('reads who the browser is signed in as: campaign, actor, role and character', async () => {
    const { fake, sent } = transport(json({ campaignId: 'ravenford' }), json(ELOWEN_SESSION));
    await expect(readSignIn(fake)).resolves.toEqual({
      kind: 'signed-in',
      identity: {
        campaignId: 'ravenford',
        campaignName: 'The Missing Caravan',
        actorId: 'player:7f1c',
        role: 'PLAYER',
        characterId: 'elowen-starwhisper',
        characterName: 'Elowen',
      },
    });
    expect(sent.map((call) => call.url)).toEqual([
      '/api/auth/session',
      '/api/campaigns/ravenford/session',
    ]);
    expectSameOrigin(sent);
  });

  it('reads signed out from a 401, or a seat gone between the two answers', async () => {
    await expect(readSignIn(transport(json({}, 401)).fake)).resolves.toEqual({
      kind: 'signed-out',
    });
    for (const status of [401, 404]) {
      await expect(
        readSignIn(transport(json({ campaignId: 'ravenford' }), json({}, status)).fake),
      ).resolves.toEqual({ kind: 'signed-out' });
    }
  });

  it('knows nothing from no answer, a server error, or a view that is not one', async () => {
    for (const answers of [
      [new Error('offline')],
      [json({}, 500)],
      [json({ campaignId: 'ravenford' }), new Error('offline')],
      [json({ campaignId: 'ravenford' }), json({}, 500)],
      [json({ campaignId: 'ravenford' }), json({ ...ELOWEN_SESSION, role: 'X' })],
      [json({ campaignId: 'ravenford' }), json({ ...ELOWEN_SESSION, actorId: 7 })],
      [
        json({ campaignId: 'ravenford' }),
        json({ ...ELOWEN_SESSION, campaign: { ...ELOWEN_SESSION.campaign, campaignId: 'x' } }),
      ],
    ]) {
      await expect(readSignIn(transport(...answers).fake)).resolves.toEqual({ kind: 'unknown' });
    }
  });

  it('names the campaign and the role of the sign-in the browser holds', async () => {
    const { fake } = transport(json({ campaignId: 'ravenford' }), json(ELOWEN_SESSION));
    await expect(describeSignIn(fake)).resolves.toEqual({
      campaignName: 'The Missing Caravan',
      role: 'PLAYER',
      characterName: 'Elowen',
    });
    const dm = transport(
      json({ campaignId: 'ravenford' }),
      json({ ...ELOWEN_SESSION, actorId: 'dm-ravenford', role: 'DM', character: null }),
    );
    await expect(describeSignIn(dm.fake)).resolves.toEqual({
      campaignName: 'The Missing Caravan',
      role: 'DM',
      characterName: null,
    });
  });

  it('names nothing when no sign-in is left or it cannot be read', async () => {
    await expect(describeSignIn(transport(json({}, 401)).fake)).resolves.toBeNull();
    await expect(
      describeSignIn(transport(json({ campaignId: 'ravenford' }), json({}, 401)).fake),
    ).resolves.toBeNull();
    await expect(
      describeSignIn(transport(json({ campaignId: 'ravenford' }), json({ role: 'X' })).fake),
    ).resolves.toBeNull();
  });
});

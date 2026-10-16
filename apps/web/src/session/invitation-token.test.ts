import { createHash, randomBytes } from 'node:crypto';
import { getHeapSnapshot } from 'node:v8';

import { describe, expect, it } from 'vitest';

import { takeInvitation, type InvitationHolder } from './invitation-link.ts';
import { replaceSignIn, takeSeat } from './sign-in-flow.ts';

/**
 * An invitation's token is unreachable once the person kept their sign-in or the invitation
 * failed (docs/STAGE_340_DESIGN.md "Part B review fixes"): not merely refused by its holder, but
 * gone from this JavaScript heap. The test never holds the token itself — only a short prefix
 * and its SHA-256 — and scans a heap snapshot (taken after a full garbage collection) for any
 * string containing it; the same scan finds it while it is held, so a miss means something.
 */
const digestOf = (text: string) => createHash('sha256').update(text).digest('hex');
const TOKEN_LENGTH = 43;

/** Whether any string in this heap contains the token with this prefix and digest. */
async function heapHolds(prefix: string, digest: string): Promise<boolean> {
  let carried = '';
  let found = false;
  for await (const chunk of getHeapSnapshot() as AsyncIterable<Buffer>) {
    const text = carried + chunk.toString('utf8');
    for (let at = text.indexOf(prefix); at !== -1; at = text.indexOf(prefix, at + 1)) {
      const candidate = text.slice(at, at + TOKEN_LENGTH);
      if (candidate.length === TOKEN_LENGTH && digestOf(candidate) === digest) found = true;
    }
    carried = text.slice(-2 * TOKEN_LENGTH);
  }
  return found;
}

/** A fresh join link opened as a page opens it: the test keeps a prefix and a digest only. */
function openLink(): { invitation: InvitationHolder; prefix: string; digest: string } {
  const token = randomBytes(32).toString('base64url');
  const invitation = takeInvitation(
    { pathname: '/join', hash: `#${token}` },
    { replaceState: () => undefined },
  );
  if (invitation === null || invitation === 'malformed') throw new Error('no invitation');
  // Twelve characters: copied, never a slice that keeps the token behind it.
  return { invitation, prefix: token.slice(0, 12), digest: digestOf(token) };
}

/** Answers every redeem with `status` and keeps nothing of it: whether it carried the token. */
function answering(status: number, digest: string) {
  const seen = { redeems: 0, carried: 0 };
  const transport: typeof fetch = (_input, init) => {
    seen.redeems += 1;
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (
      typeof body === 'object' &&
      body !== null &&
      'token' in body &&
      typeof body.token === 'string' &&
      digestOf(body.token) === digest
    ) {
      seen.carried += 1;
    }
    return Promise.resolve(Response.json({ error: { code: 'X', message: 'x' } }, { status }));
  };
  return { transport, seen };
}

describe('an invitation token in memory', () => {
  it('is unreachable once the person keeps their current sign-in', async () => {
    const { invitation, prefix, digest } = openLink();
    expect(await heapHolds(prefix, digest), 'held while the page waits for the person').toBe(true);
    const { transport, seen } = answering(409, digest);
    const asked = await takeSeat(invitation, transport);
    if (asked?.kind !== 'needs-confirmation') throw new Error('not asked');
    expect(await heapHolds(prefix, digest), 'held for the question').toBe(true);
    // "Keep my current sign-in".
    asked.replacement.forget();
    expect(await heapHolds(prefix, digest), 'reachable after keeping the sign-in').toBe(false);
    await expect(replaceSignIn(asked.replacement, transport)).resolves.toBeNull();
    await expect(takeSeat(invitation, transport)).resolves.toBeNull();
    expect(seen).toEqual({ redeems: 1, carried: 1 });
  });

  it('is unreachable once the invitation failed', async () => {
    const { invitation, prefix, digest } = openLink();
    expect(await heapHolds(prefix, digest), 'held while the page waits for the person').toBe(true);
    const { transport, seen } = answering(401, digest);
    await expect(takeSeat(invitation, transport)).resolves.toEqual({ kind: 'failed' });
    expect(await heapHolds(prefix, digest), 'reachable after the failure').toBe(false);
    await expect(takeSeat(invitation, transport)).resolves.toBeNull();
    expect(seen).toEqual({ redeems: 1, carried: 1 });
  });
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { table } from './table.mjs';
import { move } from './actions.mjs';

// The thirty encounters whose original GM books explicitly required combat.
const formerlyRequired = {
  'ash-testament': ['ash-patrol', 'long-planks-ambush'],
  'clockwork-carnival': ['rubezh-step'],
  'ember-crown': ['first-ladders', 'coal-tower-breach', 'forge-passage', 'battle-for-the-gate'],
  'glass-republic': ['banner-hall-list'],
  'hollow-choir': ['first-supper', 'six-strokes'],
  'last-orbit': ['line-one', 'hull-walk'],
  'salt-meridian': ['laska-boarding', 'pennants-alongside', 'chain-rock-battle'],
  'sky-archipelago': ['barge-boarding'],
  'velvet-ledger': ['bank-doors'],
  'winter-caravan': ['strange-burrow', 'white-at-the-ledge'],
  'marrow-crown': ['teeth-hollowed', 'camp-spinners', 'throat-follower', 'seam-nest'],
  'salt-widows': ['brine-break', 'night-boarders', 'widows-line-hunt'],
  'mountain-wedding': ['bridge-chips', 'last-touch'],
  'rain-check': ['depot-shot', 'roof-duel'],
};
export function repairedCards(book) {
  const keys = formerlyRequired[book.slug] ?? [];
  if (!keys.length) return [];
  const cards = JSON.parse(readFileSync(join(book.folder, 'encounters.json'), 'utf8'));
  return keys.map((key) => {
    const card = cards.find((c) => c.key === key);
    assert.ok(card, key);
    return card;
  });
}
export async function leaveBattleSites(book) {
  const checks = [];
  for (const card of repairedCards(book)) {
    const f = await table(book.slug);
    try {
      const listing = async () =>
        (await f.request('/encounters/prepared')).encounters.find((e) => e.title === card.title);
      const site = (await listing()).location.entityId;
      for (const seat of f.seats) await move(f, seat, site);
      assert.equal((await listing()).blocked, null);
      const available = [
        book.profile.refusal.followup.location,
        ...book.chapters.map((c) => c.location),
      ];
      const elsewhere = available.map((k) => f.ids[k]).find((id) => id && id !== site);
      assert.ok(elsewhere);
      for (const seat of f.seats) await move(f, seat, elsewhere);
      const after = await listing();
      assert.equal(after.party.length, 0);
      assert.equal(after.blocked, 'no-party');
      await assert.rejects(
        f.request('/encounters/prepared/' + after.encounterId + '/start', {
          requestId: randomUUID(),
        }),
        /no-party/,
      );
      const state = await f.state();
      assert.equal(state.encounter, null);
      checks.push({
        slug: book.slug,
        encounter: card.key,
        title: card.title,
        left: after.location.name,
        nowAt: state.entities.get(elsewhere).name,
        blocked: after.blocked,
        whenAbsent: card.peaceful,
      });
    } finally {
      await f.close();
    }
  }
  return checks;
}

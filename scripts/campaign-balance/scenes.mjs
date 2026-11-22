import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  WorldEngine,
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
} from '../../packages/domain/src/index.ts';
import { testBootstrapIdentities } from '../../packages/domain/src/campaign/testing/identities.ts';
import { bootstrapCommand, OWNER } from '../../packages/domain/src/campaign/testing/bootstrap.ts';
import { levelAsks, levelUpCharacter } from '../../packages/rules/src/builder/level-up.ts';
import { classSpellList } from '../../packages/rules/src/builder/spells.ts';
import { table } from '../campaign-rehearsal/table.mjs';
import { foesForParty } from '../../apps/server/src/combat/prepared-encounters.ts';
import { PEARL_ENCOUNTERS } from '../moon-pearl/encounters.ts';

export const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const root = 'fixtures/campaign-library';
const fixtureRoot = process.env.LTW_BALANCE_FIXTURES ?? 'fixtures';
export const slugs = [
  ...readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name),
  'hollowmere',
  'ravenford',
].sort();
const paths = new Map();
for (const dir of readdirSync('campaigns', { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
)) {
  if (slugs.includes(dir.name)) paths.set(dir.name, join('campaigns', dir.name));
  else
    for (const slug of readdirSync(join('campaigns', dir.name)))
      if (slugs.includes(slug)) paths.set(slug, join('campaigns', dir.name, slug));
}
export const shelfPath = (slug) => paths.get(slug);
export function levelTo(sheet, level) {
  while (sheet.classes[0].level < level) {
    const classId = sheet.classes[0].classId,
      asks = levelAsks(sheet, classId);
    const known = new Set(sheet.spellcasting.flatMap((s) => s.spells));
    const available = (xs) => xs.filter((s) => !known.has(s));
    const pool = available(
      Array.from({ length: asks.maxSpellLevel }, (_, i) => classSpellList(classId, i + 1)).flat(),
    );
    const ordered = (xs) =>
      [
        ...new Set([
          'magic-missile',
          'scorching-ray',
          'guiding-bolt',
          'cure-wounds',
          'healing-word',
          'sacred-flame',
          'fire-bolt',
          ...xs,
        ]),
      ].filter((x) => xs.includes(x));
    const spellbook = ordered(pool)
      .filter((s) => !sheet.classChoices?.spellbook?.includes(s))
      .slice(0, asks.spellbook);
    const spells = ordered(
      classId === 'wizard'
        ? available([...(sheet.classChoices?.spellbook ?? []), ...spellbook])
        : pool,
    ).slice(0, asks.spells);
    const opts = {
      classId,
      hitPoints: 'fixed',
      cantrips: ordered(available(classSpellList(classId, 0))).slice(0, asks.cantrips),
      spells,
      spellbook,
      expertise: sheet.skills.proficient
        .filter((s) => !sheet.skills.expertise.includes(s))
        .slice(0, asks.expertise),
      invocations: [],
      metamagic: [],
      weaponMasteries: sheet.weapons
        .filter((w) => !sheet.weaponMasteries?.includes(w))
        .slice(0, asks.weaponMasteries),
      ...(asks.improvement
        ? {
            improvement: {
              kind: 'scores',
              plus: [{ fighter: 'str', rogue: 'dex', cleric: 'wis', wizard: 'int' }[classId]],
            },
          }
        : {}),
    };
    const result = levelUpCharacter(sheet, opts, () => {
      throw Error('fixed HP');
    });
    assert.ok(result.ok, JSON.stringify([classId, asks.classLevel, result.problems]));
    sheet = result.sheet;
  }
  return sheet;
}

function stage(base, card, party, starts, foes, meta) {
  const locationId = card.locationId;
  const ordered = [...party].sort(
    (a, b) =>
      base.entities.get(a).name.localeCompare(base.entities.get(b).name) || a.localeCompare(b),
  );
  const combatants = [
    ...ordered.map((entityId, i) => ({ entityId, side: 'party', position: starts[i] })),
    ...foes.map(({ entityId, position }) => ({ entityId, position, side: 'hostile' })),
  ];
  const entities = new Map(base.entities);
  for (const { entityId } of combatants)
    entities.set(entityId, { ...entities.get(entityId), placement: { locationId, since: null } });
  return {
    ...meta,
    key: card.encounterId,
    title: card.title,
    party,
    foes: foes.map((f) => f.entityId),
    state: { ...base, entities },
    start: { locationId, battlefield: card.battlefield, combatants },
  };
}
async function* native(slug, smallTable) {
  const f = await table(slug);
  try {
    const base = await f.state(),
      cards = read(join(fixtureRoot, slug + '-ru', 'encounters.json')).encounters;
    for (const [i, e] of cards.entries()) {
      const level = slug === 'hollowmere' ? [1, 1, 2, 2, 3, 4, 4][i] : 0,
        characterSheets = new Map(base.characterSheets);
      if (level)
        for (const id of f.party) characterSheets.set(id, levelTo(characterSheets.get(id), level));
      for (const omit of [-1, 0, 1, 2, 3]) {
        const party = f.party.filter((_, i) => i !== omit);
        const foes = smallTable ? foesForParty(e, party.length) : e.foes;
        yield stage({ ...base, characterSheets }, e, party, e.partyStart, foes, {
          slug,
          variant: omit === -1 ? '4-full' : '3-without-' + (omit + 1),
          text: e.summary,
          level,
        });
      }
    }
  } finally {
    await f.close();
  }
}
export async function* scenes(slug, smallTable = true) {
  if (!paths.has(slug)) {
    yield* native(slug, smallTable);
    return;
  }
  const directory = join(fixtureRoot, 'campaign-library', slug);
  const lib = read(join(directory, 'library.json'));
  let source = slug === 'moon-pearl' ? PEARL_ENCOUNTERS : [];
  if (!['lighthouse', 'moon-pearl', 'acorn-express'].includes(slug))
    source = read(join(paths.get(slug), 'source/encounters.json'));
  for (const variant of lib.variants) {
    const content = read(join(directory, variant.file)),
      identities = testBootstrapIdentities(content),
      ids = identities.entities;
    const engine = new WorldEngine({
      store: new InMemoryEventStore(),
      ids: new SequentialIds(),
      clock: new SteppingClock(),
    });
    const campaignId = 'balance-fixture',
      command = { ...bootstrapCommand(), content, identities };
    const result = await engine.execute({
      campaignId,
      actor: OWNER,
      commandId: 'balance-bootstrap',
      command,
    });
    assert.notEqual(result.status, 'rejected', JSON.stringify(result));
    const { state } = await engine.load(campaignId);
    for (const e of content.encounters) {
      const card = source.find((c) => c.key === e.key);
      yield stage(
        state,
        { ...e, locationId: ids[e.location], encounterId: e.key },
        content.party.map((k) => ids[k]),
        e.combatants.filter((c) => c.side === 'party').map((c) => c.position),
        e.combatants
          .filter((c) => c.side === 'hostile')
          .map((c) => ({ entityId: ids[c.entity], position: c.position })),
        { slug, variant: variant.id, source: card, text: card?.objective ?? e.trigger, ids },
      );
    }
  }
}

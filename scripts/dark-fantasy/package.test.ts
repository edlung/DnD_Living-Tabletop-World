import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildPackage } from './package.ts';
import { verifySource } from './editorial.ts';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { validatePackage } from './validate.ts';
import { renderPlayers } from './render-book.ts';
import { esc } from './render-common.ts';
import { foesAt } from './encounters.ts';

describe.each(SLUGS)('%s authored campaign', (slug) => {
  it('materializes every supported party size and every encounter without playing future events', async () => {
    const source = await loadSource(slug);
    verifySource(source);
    for (let size = source.world.minPlayers; size <= source.world.maxPlayers; size++) {
      const content = buildPackage(source, size);
      const compiled = await validatePackage(content);
      expect(compiled.assessment.findings.filter((f) => f.severity === 'error')).toEqual([]);
      expect(compiled.assessment.readiness).toBe('READY');
      expect(compiled.snapshot?.state.roster.size).toBe(0);
      expect(compiled.snapshot?.state.encounter).toBeNull();
      expect(
        compiled.snapshot?.history.some((event) =>
          ['MemoryRecorded', 'CombatStarted', 'ClueDiscovered'].includes(event.type),
        ),
      ).toBe(false);
      expect(content.party).toHaveLength(size);
      for (const e of content.encounters) {
        expect(e.combatants.filter((c) => c.side === 'party')).toHaveLength(size);
        expect(e.combatants.filter((c) => c.side === 'hostile')).toHaveLength(
          foesAt(
            source.encounters.find((x) => x.key === e.key) ??
              (source.encounters[0] as (typeof source.encounters)[number]),
            size,
          ),
        );
        expect(e.combatants.length).toBeLessThanOrEqual(16);
        expect(new Set(e.combatants.map((c) => `${c.position.x},${c.position.y}`)).size).toBe(
          e.combatants.length,
        );
      }
      for (const omitted of source.cast.heroes.slice(size))
        expect(content.entities.some((e) => e.key === omitted.key)).toBe(false);
      const onDisk: unknown = JSON.parse(
        await readFile(new URL(`${slug}/variants/${size}-players.json`, COLLECTION_ROOT), 'utf8'),
      );
      expect(onDisk).toEqual(content);
    }
    expect(() => buildPackage(source, 2)).toThrow();
    expect(() => buildPackage(source, 8)).toThrow();
    expect(() => buildPackage(source, 6.5)).toThrow();
  }, 30000);

  it('excludes DM truth, secret testimony and locked handouts from player exports', async () => {
    const source = await loadSource(slug);
    const content = buildPackage(source);
    const visible = JSON.stringify(
      content.knowledge.filter((k) => ['PUBLIC', 'PARTY', 'CHARACTER'].includes(k.scope.kind)),
    );
    const playerPage = renderPlayers(source);
    const entityDescriptions = JSON.stringify(content.entities.map((e) => e.description));
    for (const secret of [
      ...source.world.truth,
      ...source.cast.npcs.map((n) => n.secret),
      ...source.handouts.map((h) => h.text),
    ]) {
      expect(visible).not.toContain(secret);
      expect(entityDescriptions).not.toContain(secret);
      expect(playerPage).not.toContain(esc(secret));
    }
    expect(playerPage).not.toContain('href="index.html"');
    expect(playerPage).not.toContain('package.json');
    expect(content.clues.every((c) => c.method === 'inspect' && c.dc === undefined)).toBe(true);
    for (const npc of source.cast.npcs) {
      const own = content.knowledge.filter(
        (k) => k.scope.kind === 'NPC' && k.scope.holder === npc.key,
      );
      expect(own.map((k) => k.statement)).toEqual([...npc.knows, npc.secret]);
    }
    expect(content.situations.length).toBe(
      source.sessions.length + source.sessions.reduce((n, s) => n + s.scenes.length, 0),
    );
  });
});

it('has ten dark fantasy campaigns and four mixed teenage/adult campaigns', async () => {
  const sources = await Promise.all(SLUGS.map(loadSource));
  expect(sources.every((s) => /дарк|тёмн|темн/i.test(s.world.genre))).toBe(true);
  expect(sources.filter((s) => s.world.audience === '14+')).toHaveLength(4);
  expect(sources.filter((s) => s.world.audience === '18+')).toHaveLength(6);
});

it('rejects broken references and an optional hero used as an essential clue subject', async () => {
  const source = await loadSource(SLUGS[0]);
  const absent = structuredClone(source);
  const clue = absent.clues[0];
  if (!clue) throw new Error('Missing clue');
  clue.location = 'not-a-location';
  expect(() => buildPackage(absent, 3)).toThrow();
  const gated = structuredClone(source);
  const gatedClue = gated.clues[0];
  const optional = gated.cast.heroes[6];
  if (!gatedClue || !optional) throw new Error('Missing clue or optional hero');
  gatedClue.subjects.push(optional.key);
  expect(() => buildPackage(gated, 3)).toThrow();
});

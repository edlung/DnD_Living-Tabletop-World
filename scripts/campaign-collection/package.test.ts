import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildPackage } from './package.ts';
import { verifySource } from './editorial.ts';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { validatePackage } from './validate.ts';
import { renderPlayers } from './render-book.ts';
import { parsePackageFile } from '../../apps/web/src/workshop/package-file.ts';

describe.each(SLUGS)('%s authored campaign', (slug) => {
  it('materializes every supported party size and every encounter without playing future events', async () => {
    const source = await loadSource(slug);
    verifySource(source);
    for (let size = source.world.minPlayers; size <= 8; size++) {
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
        expect(e.combatants.length).toBeLessThanOrEqual(16);
        expect(new Set(e.combatants.map((c) => `${c.position.x},${c.position.y}`)).size).toBe(
          e.combatants.length,
        );
      }
      for (const omitted of source.cast.heroes.slice(size))
        expect(content.entities.some((e) => e.key === omitted.key)).toBe(false);
      const bytes = await readFile(
        new URL(`${slug}/variants/${size}-players.json`, COLLECTION_ROOT),
        'utf8',
      );
      const onDisk: unknown = JSON.parse(bytes);
      expect(onDisk).toEqual(content);
      expect(parsePackageFile(bytes)).toEqual(content);
    }
    expect(() => buildPackage(source, 4)).toThrow();
    expect(() => buildPackage(source, 9)).toThrow();
    expect(() => buildPackage(source, 6.5)).toThrow();
  }, 30000);

  it('excludes DM truth, secret testimony and locked handouts from player exports', async () => {
    const source = await loadSource(slug);
    const content = buildPackage(source);
    const visible = JSON.stringify(
      content.knowledge.filter((k) => ['PUBLIC', 'PARTY', 'CHARACTER'].includes(k.scope.kind)),
    );
    const playerPage = renderPlayers(source);
    for (const secret of [
      ...source.world.truth,
      ...source.cast.npcs.map((n) => n.secret),
      ...source.handouts.map((h) => h.text),
    ]) {
      expect(visible).not.toContain(secret);
      expect(playerPage).not.toContain(secret);
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

it('has ten distinct genres and exactly four explicitly adult collections', async () => {
  const sources = await Promise.all(SLUGS.map(loadSource));
  expect(new Set(sources.map((s) => s.world.genre)).size).toBe(10);
  expect(sources.filter((s) => s.world.audience === '21+')).toHaveLength(4);
});

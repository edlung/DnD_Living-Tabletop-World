import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildPackage } from './package.ts';
import { verifySource } from './editorial.ts';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { validatePackage } from './validate.ts';
import { renderPlayers } from './render-pages.ts';
import { esc } from './render-common.ts';
import { caseRecords } from './detective.ts';

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
      for (const hero of content.entities.filter((e) => e.sheet)) {
        expect(hero.sheet?.spellcasting).toEqual([]);
        expect(hero.sheet?.spellSlots.max.every((slots) => slots === 0)).toBe(true);
      }
      expect(new TextEncoder().encode(JSON.stringify(content, null, 2)).byteLength).toBeLessThan(
        512 * 1024,
      );
      for (const e of content.encounters) {
        expect(e.combatants.filter((c) => c.side === 'party')).toHaveLength(size);
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
    expect(() => buildPackage(source, 9)).toThrow();
    expect(() => buildPackage(source, 6.5)).toThrow();
  }, 30000);

  it('excludes DM truth, secret testimony and locked handouts from player exports', async () => {
    const source = await loadSource(slug);
    const content = buildPackage(source);
    const visible = content.knowledge
      .filter((k) => ['PUBLIC', 'PARTY', 'CHARACTER'].includes(k.scope.kind))
      .map((k) => k.statement);
    const playerPage = renderPlayers(source, '');
    for (const secret of [
      ...source.world.truth,
      ...source.cast.npcs.map((n) => n.secret),
      ...source.handouts.map((h) => h.text),
      ...caseRecords(source).map((r) => r.statement),
    ]) {
      expect(visible).not.toContain(secret);
      expect(playerPage).not.toContain(esc(secret));
    }
    expect(playerPage).not.toContain('href="index.html"');
    expect(playerPage).not.toContain('package.json');
    expect(content.clues.every((c) => c.method === 'inspect' && c.dc === undefined)).toBe(true);
    for (const npc of source.cast.npcs) {
      expect(content.entities.find((e) => e.key === npc.key)?.status).toBe(npc.status ?? 'active');
      const own = content.knowledge.filter(
        (k) => k.scope.kind === 'NPC' && k.scope.holder === npc.key,
      );
      expect(own.map((k) => k.statement)).toEqual([...npc.knows, npc.secret]);
      expect(own.every((k) => k.disclosure === 'GUARDED')).toBe(true);
    }
    expect(content.situations.length).toBe(
      source.sessions.length + source.sessions.reduce((n, s) => n + s.scenes.length, 0),
    );
  });
});

it('has ten detective noir premises for adult tables and all six party sizes', async () => {
  const sources = await Promise.all(SLUGS.map(loadSource));
  expect(new Set(sources.map((s) => s.world.title)).size).toBe(10);
  expect(new Set(sources.map((s) => s.world.pitch)).size).toBe(10);
  expect(sources.filter((s) => s.world.audience === '18+')).toHaveLength(4);
  expect(sources.filter((s) => s.world.audience === '21+')).toHaveLength(6);
  for (const s of sources) {
    expect(['18+', '21+']).toContain(s.world.audience);
    expect(s.world.scaling.map((x) => x.players)).toEqual([3, 4, 5, 6, 7, 8]);
  }
});

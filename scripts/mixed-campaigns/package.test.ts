import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SLUGS, loadSource } from './source.ts';
import { buildPackage } from './package.ts';
import { validatePackage } from './validate.ts';
import { playFixture } from './play-fixture.ts';
import { verifySource } from './editorial.ts';
import { renderPlayers, standalone } from './render-pages.ts';
import { esc, p, page } from './render-common.ts';

const selected = process.env['LTW_MIXED_TEST_SLUGS']?.split(',') ?? SLUGS;
const sources = await Promise.all(selected.map(loadSource));
const css = await readFile(new URL('./book.css', import.meta.url), 'utf8');

for (const s of sources)
  describe(s.world.title, () => {
    it.each([3, 4, 5, 6, 7])(
      'compiles %i players and every encounter without future events',
      async (size) => {
        const content = buildPackage(s, size);
        const result = await validatePackage(content);
        expect(result.assessment.readiness, JSON.stringify(result.assessment.findings)).toBe(
          'READY',
        );
        expect(content.party).toHaveLength(size);
        expect(result.snapshot?.state.roster.size).toBe(0);
        expect(result.snapshot?.state.encounter).toBeNull();
        expect(result.snapshot?.state.memories.size).toBe(0);
        expect(Array.from(result.snapshot?.state.weather.values() ?? [])).toEqual([
          s.world.weather ?? 'clear',
        ]);
        expect(
          result.snapshot?.history.some((e) =>
            ['CombatStarted', 'ClueDiscovered'].includes(e.type),
          ),
        ).toBe(false);
        const inactive = s.cast.heroes.slice(size).map((h) => h.key);
        for (const hero of inactive)
          expect(content.entities.some((e) => e.key === hero)).toBe(false);
        const count = [2, 3, 3, 4, 5][size - 3];
        for (const encounter of content.encounters) {
          expect(encounter.combatants.filter((c) => c.side === 'party')).toHaveLength(size);
          expect(encounter.combatants.filter((c) => c.side === 'hostile')).toHaveLength(count ?? 0);
        }
      },
    );

    it('keeps player exports standalone and secrets in the DM material', () => {
      const content = buildPackage(s, 3);
      const players = renderPlayers(s, css);
      expect(players).not.toMatch(/href="(?:\.\.\/|index|package|session-|maps|handouts)/);
      expect(players).not.toContain('<script');
      const publicRecords = content.knowledge.filter((k) =>
        ['PUBLIC', 'PARTY', 'CHARACTER'].includes(k.scope.kind),
      );
      for (const secret of [
        ...s.world.truth,
        ...s.cast.npcs.map((n) => n.secret),
        ...s.handouts.map((h) => h.unlock),
      ]) {
        expect(players).not.toContain(esc(secret));
        expect(publicRecords.map((r) => r.statement).join('\n')).not.toContain(secret);
      }
      for (const h of s.handouts) {
        const handout = standalone(page(h.title, s.world.title, p(h.text), '', ''), css);
        expect(handout).not.toContain(esc(h.unlock));
        expect(handout).not.toMatch(/href="(?!#)/);
      }
    });

    it('reveals every clue through ordinary player inspection and isolates NPC secrets', async () => {
      const content = buildPackage(s, 3);
      const f = await playFixture(content);
      const initial = (await f.knowledge({ kind: 'PLAYER' }, f.player))
        .map((r) => r.statement)
        .join('\n');
      for (const truth of s.world.truth) expect(initial).not.toContain(truth);
      for (const n of s.cast.npcs) {
        const own = await f.knowledge({ kind: 'NPC', npcId: f.id(n.key) });
        expect(own.some((r) => r.statement === n.secret)).toBe(true);
        const foreignPrivate = own.filter(
          (r) => r.scope.kind === 'NPC' && r.scope.npcId !== f.id(n.key),
        );
        expect(foreignPrivate).toEqual([]);
        expect(own.some((r) => r.scope.kind === 'DM' || r.scope.kind === 'WORLD_TRUTH')).toBe(
          false,
        );
      }
      let location = s.world.startLocation;
      for (const clue of s.clues) {
        if (location !== clue.location) {
          expect(
            (
              await f.execute({
                type: 'PlaceEntity',
                entityId: f.id(f.hero),
                locationId: f.id(clue.location),
              })
            ).status,
          ).toBe('accepted');
          location = clue.location;
        }
        const found = await f.execute(
          {
            type: 'ExamineEntity',
            characterId: f.id(f.hero),
            entityId: f.id(`e-${clue.key}`),
            method: 'inspect',
          },
          f.player,
        );
        expect(found.status, JSON.stringify(found)).toBe('accepted');
        expect(
          (await f.knowledge({ kind: 'PLAYER' }, f.player)).some(
            (k) => k.statement === clue.statement,
          ),
        ).toBe(true);
      }
      const after = await f.snapshot();
      expect(after.state.encounter).toBeNull();
      for (const truth of s.world.truth) {
        if (!s.clues.some((c) => c.statement === truth))
          expect(
            (await f.knowledge({ kind: 'PLAYER' }, f.player)).map((r) => r.statement).join('\n'),
          ).not.toContain(truth);
      }
    });

    it('rejects broken references, missing fallback and unsupported party sizes', () => {
      const invalid = structuredClone(s);
      const clue = invalid.clues[0];
      const original = s.clues[0];
      const optionalHero = s.cast.heroes[6];
      if (!clue || !original || !optionalHero) throw new Error('Incomplete source');
      clue.subjects.push(optionalHero.key);
      expect(() => {
        verifySource(invalid);
      }).toThrow();
      clue.subjects = ['nonexistent-person'];
      expect(() => {
        verifySource(invalid);
      }).toThrow();
      clue.subjects = original.subjects;
      clue.fallback = '';
      expect(() => {
        verifySource(invalid);
      }).toThrow();
      expect(() => buildPackage(s, 2)).toThrow();
      expect(() => buildPackage(s, 8)).toThrow();
      const unsafe = structuredClone(s);
      const handout = unsafe.handouts[0];
      if (!handout) throw new Error('Missing handout');
      handout.key = '../outside';
      expect(() => {
        verifySource(unsafe);
      }).toThrow();
    });
  });

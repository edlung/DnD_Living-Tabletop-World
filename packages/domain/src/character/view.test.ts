import { characterSheetSchema, type PerspectiveRequest } from '@ltw/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import type { WorldState } from '../kernel/state.ts';
import {
  DM,
  PLAYER,
  createHarness,
  expectAccepted,
  seedBasicWorld,
} from '../kernel/testing/kernel-harness.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { characterSheetView } from './view.ts';

// Optional statistics set too, so a field the view forgets to copy fails here (Exhaustion did).
const canonical = characterSheetSchema.parse({
  ...rulesSeed.commands[0]?.sheet,
  exhaustion: 2,
  heroicInspiration: true,
  contagions: [{ contagionId: 'sewer-plague', takenHold: true, successes: 0 }],
});
let state: WorldState;

beforeAll(async () => {
  const harness = createHarness();
  await seedBasicWorld(harness);
  for (const id of ['hero', 'other']) {
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId: id,
        kind: 'character',
        name: id,
        existsSince: null,
        placement: { locationId: 'square', since: null },
      }),
    );
    expectAccepted(
      await harness.submit({ type: 'SetCharacterSheet', entityId: id, sheet: canonical }),
    );
  }
  expectAccepted(
    await harness.submit({
      type: 'AssignCharacter',
      characterId: 'hero',
      playerActorId: PLAYER.actorId,
    }),
  );
  state = await harness.state();
});

function perspective(request: PerspectiveRequest) {
  const access = resolvePerspective(state, DM, request);
  if (!access.ok) throw new Error('Expected permitted perspective');
  return access.perspective;
}

describe('a contagion not yet taken hold', () => {
  it('is the DM’s to know; its carrier feels nothing yet (ADR 0055 §4)', () => {
    const incubating = {
      ...state,
      characterSheets: new Map(state.characterSheets).set('hero', {
        ...canonical,
        contagions: [
          { contagionId: 'cackle-fever', takenHold: false, successes: 0 },
          { contagionId: 'sewer-plague', takenHold: true, successes: 0 },
        ],
      }),
    } as WorldState;
    const own = characterSheetView(
      incubating,
      perspective({ kind: 'CHARACTER', characterId: 'hero' }),
      'hero',
    );
    expect(own?.sheet.contagions).toEqual([
      { contagionId: 'sewer-plague', takenHold: true, successes: 0 },
    ]);
    expect(
      characterSheetView(incubating, perspective({ kind: 'DM' }), 'hero')?.sheet.contagions,
    ).toHaveLength(2);
  });
});

describe('full character statistics projection', () => {
  it('exposes every modeled own statistic without canonical object aliases', () => {
    const view = characterSheetView(
      state,
      perspective({ kind: 'CHARACTER', characterId: 'hero' }),
      'hero',
    );
    expect(view?.sheet).toEqual(canonical);
    expect(view?.entity).toEqual({ entityId: 'hero', kind: 'character', name: 'hero' });
    const objects = new WeakSet<object>();
    const visit = (value: unknown, check: boolean): void => {
      if (typeof value !== 'object' || value === null) return;
      if (check) expect(objects.has(value)).toBe(false);
      else objects.add(value);
      Object.values(value).forEach((child: unknown) => {
        visit(child, check);
      });
    };
    visit(state.characterSheets.get('hero'), false);
    visit(view?.sheet, true);
  });

  it('never grants another sheet through a known entity or a restricted DM preview', () => {
    for (const request of [
      { kind: 'PUBLIC' },
      { kind: 'PARTY' },
      { kind: 'NPC', npcId: 'npc' },
      { kind: 'CHARACTER', characterId: 'other' },
    ] as const) {
      const view = perspective(request);
      expect(characterSheetView(state, view, 'hero')).toBeNull();
      expect(characterSheetView(state, view, 'missing')).toBeNull();
    }
    expect(characterSheetView(state, perspective({ kind: 'DM' }), 'other')?.sheet).toEqual(
      canonical,
    );
  });

  it('copies only whitelisted fields at every nested boundary', () => {
    const marker = 'CANONICAL_SECRET_FIELD';
    const extended = structuredClone(canonical);
    Object.assign(extended, {
      privateNotes: marker,
      deathSaves: { successes: 1, failures: 0, privateNotes: marker },
      concentration: { spellId: 'hunters-mark', privateNotes: marker },
    });
    const decorate = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;
      if (!Array.isArray(value)) Object.assign(value, { privateNotes: marker });
      Object.values(value).forEach((child: unknown) => {
        decorate(child);
      });
    };
    decorate(extended);
    const changed = {
      ...state,
      characterSheets: new Map(state.characterSheets).set('hero', extended),
    };
    for (const request of [{ kind: 'DM' }, { kind: 'CHARACTER', characterId: 'hero' }] as const) {
      const view = characterSheetView(changed, perspective(request), 'hero');
      expect(JSON.stringify(view)).not.toContain(marker);
      expect(view?.sheet.deathSaves).toEqual({ successes: 1, failures: 0 });
      expect(view?.sheet.concentration).toEqual({ spellId: 'hunters-mark' });
    }
  });

  it('hides unknown concentration targets while retaining known or perceived targets', () => {
    const player = perspective({ kind: 'CHARACTER', characterId: 'hero' });
    for (const targetId of ['lamp', 'npc', 'hero']) {
      const sheet = { ...canonical, concentration: { spellId: 'hunters-mark' as const, targetId } };
      const changed = {
        ...state,
        characterSheets: new Map(state.characterSheets).set('hero', sheet),
      };
      expect(characterSheetView(changed, player, 'hero')?.sheet.concentration).toEqual({
        spellId: 'hunters-mark',
        ...(targetId === 'lamp' ? {} : { targetId }),
      });
      expect(
        characterSheetView(changed, perspective({ kind: 'DM' }), 'hero')?.sheet.concentration,
      ).toEqual(sheet.concentration);
    }
  });
});

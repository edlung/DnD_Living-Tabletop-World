import type { LightLevel, Senses, Square } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Light and sight (docs/adr/0050-the-world-around.md §1–4) on the Old Trade Road: Elowen at (2, 6)
 * shoots Raider 1 at (8, 4), 30 ft off, in the light the test sets; she has the senses it gives.
 */
interface Night {
  readonly ambient?: LightLevel;
  readonly light?: readonly (Square & { level: LightLevel })[];
  readonly senses?: Senses;
}

async function road({ ambient, light, senses }: Night = {}): Promise<RoadWorld> {
  const world = await roadWorld();
  if (senses) {
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: { ...sheet, senses } });
  }
  const started = await startAmbush(world, undefined, (command) => ({
    ...command,
    battlefield: {
      ...command.battlefield,
      ...(ambient ? { ambient } : {}),
      ...(light ? { light } : {}),
    },
  }));
  expect(codeOf(started)).toBe('accepted');
  return world;
}

const shoot = (world: RoadWorld) =>
  world.submit(
    { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: RAIDER_1 },
    PLAYER,
  );
const performed = async (world: RoadWorld, result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  (await recorded(world, result)).find((e) => e.type === 'AttackPerformed')?.payload;
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;

describe('unseen attackers and targets', () => {
  it('in darkness neither sees the other: Disadvantage and Advantage cancel', async () => {
    const world = await road({ ambient: 'dark' });
    world.roll(20, 12, 6);
    expect(await performed(world, await shoot(world))).toMatchObject({
      advantage: true,
      disadvantage: true,
    });
  });

  it('with Darkvision she sees the raider, which does not see her: Advantage', async () => {
    const world = await road({ ambient: 'dark', senses: { darkvision: 60 } });
    world.roll(20, 12, 6);
    expect(await performed(world, await shoot(world))).toMatchObject({
      advantage: true,
      disadvantage: false,
    });
    // Beyond its range the dark is dark again.
    const far = await road({ ambient: 'dark', senses: { darkvision: 10 } });
    far.roll(20, 12, 6);
    expect(await performed(far, await shoot(far))).toMatchObject({ disadvantage: true });
  });

  it('a raider in a torch’s circle is seen; she, in the dark, is not', async () => {
    const world = await road({ ambient: 'dark', light: [{ x: 8, y: 4, level: 'bright' }] });
    world.roll(20, 12, 6);
    expect(await performed(world, await shoot(world))).toMatchObject({
      advantage: true,
      disadvantage: false,
    });
  });
});

describe('what sight allows', () => {
  it('Hunter’s Mark needs a creature she can see', async () => {
    const dark = await road({ ambient: 'dark' });
    const marked = await dark.submit(
      { type: 'CastSpell', combatantId: ELOWEN, spellId: 'hunters-mark', targetId: RAIDER_1 },
      PLAYER,
    );
    expect(reasonOf(marked)).toBe('TARGET_NOT_VISIBLE');
    const seeing = await road({ ambient: 'dark', senses: { darkvision: 60 } });
    const seen = await seeing.submit(
      { type: 'CastSpell', combatantId: ELOWEN, spellId: 'hunters-mark', targetId: RAIDER_1 },
      PLAYER,
    );
    expect(codeOf(seen)).toBe('accepted');
  });

  it('she hides in the dark, where no raider sees her, and not in the open day', async () => {
    const hide = { type: 'TakeAction', combatantId: ELOWEN, action: 'hide', skill: 'stealth' };
    const dark = await road({ ambient: 'dark' });
    expect(codeOf(await dark.submit(hide, PLAYER))).toBe('accepted');
    const day = await road();
    expect(reasonOf(await day.submit(hide, PLAYER))).toBe('NO_COVER_TO_HIDE');
  });
});

describe('the DM’s light', () => {
  it('sets the light of the running fight, once, and undoes it', async () => {
    const world = await road();
    const night = await world.dm({ type: 'SetLight', ambient: 'dark' });
    expect(codeOf(night)).toBe('accepted');
    expect((await world.state()).encounter?.battlefield.ambient).toBe('dark');
    expect(codeOf(await world.dm({ type: 'SetLight', ambient: 'dark' }))).toBe('NO_EFFECT');
    // A player sets no light.
    expect(codeOf(await world.submit({ type: 'SetLight', ambient: 'bright' }, PLAYER))).not.toBe(
      'accepted',
    );
    await verifyHistory(world);
  });
});

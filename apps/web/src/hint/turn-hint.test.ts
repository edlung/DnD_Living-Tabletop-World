import {
  HIDDEN_TURN,
  type CharacterSheet,
  type ContextAction,
  type EncounterCombatantView,
  type EncounterTurnView,
  type EncounterView,
} from '@ltw/contracts';
import { russianEntry, translate, type Translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import '../i18n/ru-play.ts';
import '../i18n/ru-moves.ts';
import '../i18n/ru-hint.ts';
import { fightHint, plainAction, sceneHint, slotsLeft } from './turn-hint.ts';

/**
 * "What can I do?" (docs/adr/0073-table-ideas.md §3): the list is what the server answered and
 * nothing more — a thing left is offered, a thing spent is said to be spent, and nothing is said
 * of what the view does not hold.
 */
const en: Translate = (key, params) => translate('en', key, params);
const ME = 'elowen-starwhisper';
const FOE = 'creature-1';
const FRESH: EncounterTurnView = {
  own: true,
  action: true,
  bonusAction: true,
  reaction: true,
  movementLeftFt: 30,
  attacksLeft: 0,
  incapacitated: false,
};

const combatant = (
  entityId: string,
  name: string | null,
  extra: Partial<EncounterCombatantView> = {},
): EncounterCombatantView =>
  ({
    entity: { entityId, kind: entityId === ME ? 'character' : 'creature', name },
    side: entityId === ME ? 'party' : 'enemies',
    position: { x: 0, y: 0 },
    state: 'up',
    conditions: [],
    ...extra,
  }) as EncounterCombatantView;

const fight = (current: string, mine: Partial<EncounterCombatantView> = {}): EncounterView =>
  ({
    currentCombatantId: current,
    combatants: [combatant(ME, 'Elowen', mine), combatant(FOE, 'Raider')],
  }) as unknown as EncounterView;

const own = (id: string, legal = true): ContextAction => ({ id, legal }) as ContextAction;
const ids = (page: { lines: readonly { id: string }[] }) => page.lines.map((line) => line.id);
const line = (page: ReturnType<typeof fightHint>, id: string) =>
  page.lines.find((one) => one.id === id);

describe('the hint on your own turn', () => {
  it('offers what is left: movement, the action, a bonus action, the reaction', () => {
    const page = fightHint(en, {
      encounter: fight(ME, { turn: FRESH }),
      actorId: ME,
      currentName: 'Elowen',
      own: [own('dodge'), own('dash'), own('hide', false)],
      sheet: null,
    });
    expect(page.heading).toBe('It is your turn');
    expect(ids(page)).toEqual(['move', 'action', 'bonus', 'reaction', 'end', 'anything']);
    expect(line(page, 'move')).toMatchObject({
      tone: 'open',
      detail: 'Up to 30 ft left. Press a square on the map to go there.',
    });
    // Only what the rules call legal now is listed, in plain words.
    expect(line(page, 'action')?.examples).toEqual([
      'At an enemy: attack — or a spell, if your hero has one.',
    ]);
    // Each on a line of its own.
    expect(line(page, 'action')?.own).toEqual([
      'Dodge — be harder to hit until your next turn',
      'Dash — move once more this turn',
    ]);
    expect(line(page, 'reaction')?.tone).toBe('open');
  });

  it('says what is spent, and never offers it', () => {
    const page = fightHint(en, {
      encounter: fight(ME, {
        turn: { ...FRESH, action: false, bonusAction: false, reaction: false, movementLeftFt: 0 },
      }),
      actorId: ME,
      currentName: 'Elowen',
      own: [own('dodge')],
      sheet: null,
    });
    for (const id of ['move', 'action', 'bonus', 'reaction']) {
      expect(line(page, id)?.tone, id).toBe('spent');
    }
    expect(line(page, 'action')?.examples).toBeUndefined();
    expect(line(page, 'action')?.own).toBeUndefined();
    expect(line(page, 'move')?.detail).toBe('No movement left this turn.');
  });

  it('offers nothing while a condition holds the hero — on her turn or another’s', () => {
    const held = {
      ...FRESH,
      action: false,
      bonusAction: false,
      reaction: false,
      movementLeftFt: 0,
    };
    const hers = fightHint(en, {
      encounter: fight(ME, { turn: { ...held, incapacitated: true }, conditions: ['stunned'] }),
      actorId: ME,
      currentName: 'Elowen',
      own: [own('dodge')],
      sheet: null,
    });
    expect(hers.heading).toBe('Your hero cannot act right now');
    // Her turn still ends by her own press.
    expect(ids(hers)).toEqual(['held', 'end', 'anything']);
    expect(hers.lines.some((one) => one.tone === 'open')).toBe(false);
    const another = fightHint(en, {
      encounter: fight(FOE, { turn: { ...held, own: false, incapacitated: true } }),
      actorId: ME,
      currentName: 'Raider',
      own: null,
      sheet: null,
    });
    expect(ids(another)).toEqual(['held', 'anything']);
  });

  it('counts the attacks an Attack action still holds', () => {
    const page = fightHint(en, {
      encounter: fight(ME, { turn: { ...FRESH, action: false, attacksLeft: 1 } }),
      actorId: ME,
      currentName: 'Elowen',
      own: null,
      sheet: null,
    });
    expect(line(page, 'attacks')?.detail).toBe('Attacks left with this action: 1. Press an enemy.');
  });

  it('names the spell slots a caster has left', () => {
    const sheet = {
      spellSlots: { max: [4, 2, 0], expended: [2, 2, 0] },
    } as unknown as CharacterSheet;
    expect(slotsLeft(en, sheet)).toBe('Spell slots left: level 1 ×2.');
    expect(
      slotsLeft(en, { spellSlots: { max: [2], expended: [2] } } as unknown as CharacterSheet),
    ).toBe('No spell slots left: cantrips still work.');
    // Not a caster: nothing is said of slots.
    expect(
      slotsLeft(en, { spellSlots: { max: [0, 0], expended: [0, 0] } } as unknown as CharacterSheet),
    ).toBeNull();
    expect(slotsLeft(en, null)).toBeNull();
  });

  it('says less, not more, when the server sends no budget (an older server)', () => {
    const page = fightHint(en, {
      encounter: fight(ME),
      actorId: ME,
      currentName: 'Elowen',
      own: null,
      sheet: null,
    });
    expect(ids(page)).toEqual(['act', 'end', 'anything']);
  });
});

describe('the hint off your turn', () => {
  it('names who acts as the viewer knows them, and the reaction', () => {
    const page = fightHint(en, {
      encounter: fight(FOE, { turn: { ...FRESH, own: false, action: false, movementLeftFt: 0 } }),
      actorId: ME,
      currentName: 'Raider',
      own: null,
      sheet: null,
    });
    expect(page.heading).toBe('It is Raider’s turn');
    expect(ids(page)).toEqual(['wait', 'reaction', 'anything']);
  });

  it('does not say who acts when the fog hides them', () => {
    const page = fightHint(en, {
      encounter: fight(HIDDEN_TURN, { turn: { ...FRESH, own: false } }),
      actorId: ME,
      currentName: null,
      own: null,
      sheet: null,
    });
    expect(page.heading).toBe('Someone you cannot see is acting');
    expect(JSON.stringify(page)).not.toContain('Raider');
  });

  it('speaks to a hero who is down, has fallen, or is not in the fight', () => {
    const base = { actorId: ME, currentName: 'Elowen', own: null, sheet: null };
    expect(ids(fightHint(en, { ...base, encounter: fight(ME, { state: 'down' }) }))).toEqual([
      'down',
      'anything',
    ]);
    expect(fightHint(en, { ...base, encounter: fight(ME, { state: 'dead' }) }).heading).toBe(
      'Your hero has fallen',
    );
    const away = { ...fight(FOE), combatants: [combatant(FOE, 'Raider')] } as EncounterView;
    expect(fightHint(en, { ...base, encounter: away }).heading).toBe(
      'Your hero is not in this fight',
    );
  });
});

describe('the hint outside a fight', () => {
  it('names the place and what is near, as the hero knows them', () => {
    const page = sceneHint(en, {
      place: 'Market Square',
      nearby: ['North Gate', 'Old Trade Road', 'The Gilded Flask', 'Town Hall', 'The Docks'],
    });
    expect(page.heading).toBe('What you can do at Market Square');
    expect(page.lines.find((one) => one.id === 'go')?.detail).toBe(
      'Places shows where you can go. Nearby: North Gate, Old Trade Road, The Gilded Flask, Town Hall.',
    );
    expect(sceneHint(en, { place: null, nearby: [] }).heading).toBe('What you can do here');
  });
});

describe('the hint’s words', () => {
  it('have a Russian entry each, the plain words of the own actions too', () => {
    const asked = new Set<string>();
    const t: Translate = (key) => {
      asked.add(key);
      return key;
    };
    const turns: (EncounterTurnView | undefined)[] = [
      FRESH,
      { ...FRESH, action: false, bonusAction: false, reaction: false, movementLeftFt: 0 },
      { ...FRESH, action: false, attacksLeft: 2 },
      undefined,
    ];
    for (const turn of turns) {
      for (const current of [ME, FOE, HIDDEN_TURN]) {
        for (const state of ['up', 'down', 'dead'] as const) {
          for (const name of ['Raider', null]) {
            fightHint(t, {
              encounter: fight(current, { state, ...(turn ? { turn } : {}) }),
              actorId: ME,
              currentName: name,
              own: [own('dash'), own('dodge')],
              sheet: { spellSlots: { max: [2], expended: [1] } } as unknown as CharacterSheet,
            });
          }
        }
      }
    }
    fightHint(t, {
      encounter: { ...fight(FOE), combatants: [] } as unknown as EncounterView,
      actorId: ME,
      currentName: null,
      own: null,
      sheet: null,
    });
    slotsLeft(t, { spellSlots: { max: [2], expended: [2] } } as unknown as CharacterSheet);
    sceneHint(t, { place: 'x', nearby: ['y'] });
    sceneHint(t, { place: null, nearby: [] });
    for (const id of [
      'dash',
      'dodge',
      'disengage',
      'hide',
      'search',
      'study',
      'utilize',
      'escape',
      'release',
      'dismount',
    ]) {
      plainAction(t, own(id));
    }
    expect([...asked].filter((key) => russianEntry(key) === undefined)).toEqual([]);
  });
});

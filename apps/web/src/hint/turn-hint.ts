import {
  HIDDEN_TURN,
  type CharacterSheet,
  type ContextAction,
  type ContextActionId,
  type EncounterView,
} from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import { actionLabel } from '../exploration/context-actions.tsx';

/**
 * "What can I do?" (docs/adr/0073-table-ideas.md §3): what a hero can do now, said in a child's
 * words and built only from what the server already answers for that character — what is left of
 * its turn, the options the rules list for it, its spell slots, the places it perceives. It tells;
 * it does not advise what is best, and it says nothing where the server says nothing.
 */
export type HintTone = 'open' | 'spent' | 'info';

/** Where a line can take the reader: a sheet of the dock, or the hero's own sheet. */
export type HintWay = 'places' | 'journal' | 'rules' | 'character';

export interface HintLine {
  readonly id: string;
  readonly tone: HintTone;
  readonly title: string;
  readonly detail: string;
  readonly examples?: readonly string[];
  readonly way?: HintWay;
}

export interface HintPage {
  readonly heading: string;
  readonly lines: readonly HintLine[];
}

/** The own actions of a turn in a child's words; any other keeps its button's name. */
const PLAIN: Partial<Record<ContextActionId, string>> = {
  dash: 'Dash — move once more this turn',
  dodge: 'Dodge — be harder to hit until your next turn',
  disengage: 'Disengage — walk away without being struck',
  hide: 'Hide — try to slip out of sight',
  search: 'Search — look for something hidden',
  study: 'Study — work something out',
  utilize: 'Utilize — use a thing nearby',
  escape: 'Escape a grapple — break free of what holds you',
  release: 'Let go — release the one you hold',
  dismount: 'Dismount — get down from your mount',
};

/** Own options listed at most: a hero with a long spell list still gets a short hint. */
const EXAMPLES = 8;

export const plainAction = (t: Translate, action: ContextAction): string => {
  const plain = PLAIN[action.id];
  return plain === undefined ? actionLabel(t, action, '', []) : t(plain);
};

/** "Level 1 — 2, level 3 — 1": the slots a caster has left; null for none to speak of. */
export function slotsLeft(t: Translate, sheet: CharacterSheet | null): string | null {
  if (sheet === null) return null;
  const { max, expended } = sheet.spellSlots;
  if (!max.some((count) => count > 0)) return null;
  const left = max
    .map((count, index) => ({ level: index + 1, left: count - (expended[index] ?? 0), count }))
    .filter((row) => row.count > 0 && row.left > 0)
    .map((row) => t('level {level} — {count}', { level: row.level, count: row.left }));
  return left.length === 0
    ? t('No spell slots left: cantrips still work.')
    : t('Spell slots left: {slots}.', { slots: left.join(', ') });
}

const ANYTHING: (t: Translate) => HintLine = (t) => ({
  id: 'anything',
  tone: 'info',
  title: t('Something else?'),
  detail: t('Say it aloud. The DM decides what happens: you are not limited to the buttons.'),
});

const reactionLine = (t: Translate, ready: boolean): HintLine =>
  ready
    ? {
        id: 'reaction',
        tone: 'open',
        title: t('Your reaction is ready'),
        detail: t('If something lets you react, the game asks you at once.'),
      }
    : {
        id: 'reaction',
        tone: 'spent',
        title: t('Your reaction is spent'),
        detail: t('It comes back at the start of your next turn.'),
      };

export interface FightHintInput {
  readonly encounter: EncounterView;
  readonly actorId: string;
  /** Who acts now, as the viewer knows them; null when the name is not known. */
  readonly currentName: string | null;
  /** The server's options for the hero itself; null while unknown. */
  readonly own: readonly ContextAction[] | null;
  /** The hero's own sheet; null while unknown. */
  readonly sheet: CharacterSheet | null;
}

/** The hint in a fight. */
export function fightHint(t: Translate, input: FightHintInput): HintPage {
  const { encounter, actorId, own, sheet } = input;
  const me = encounter.combatants.find((combatant) => combatant.entity.entityId === actorId);
  if (!me) {
    return {
      heading: t('Your hero is not in this fight'),
      lines: [
        {
          id: 'watch',
          tone: 'info',
          title: t('Watch and cheer'),
          detail: t('When your hero joins, your turn appears in the order.'),
        },
        ANYTHING(t),
      ],
    };
  }
  if (me.state === 'dead') {
    return {
      heading: t('Your hero has fallen'),
      lines: [
        {
          id: 'fallen',
          tone: 'info',
          title: t('The story is not over'),
          detail: t('Stay with the table and ask the DM what comes next.'),
        },
      ],
    };
  }
  const mine = encounter.currentCombatantId === actorId;
  const turn = me.turn;
  if (me.state === 'down') {
    return {
      heading: mine ? t('It is your turn') : t('Your hero is down'),
      lines: [
        {
          id: 'down',
          tone: 'info',
          title: t('Your hero is down, and still alive'),
          detail: t(
            'On your turn you roll a death save: the game asks you. A friend can help you up with healing or first aid.',
          ),
        },
        ANYTHING(t),
      ],
    };
  }
  if (!mine) {
    return {
      heading:
        encounter.currentCombatantId === HIDDEN_TURN
          ? t('Someone you cannot see is acting')
          : input.currentName === null
            ? t('It is someone else’s turn')
            : t('It is {name}’s turn', { name: input.currentName }),
      lines: [
        {
          id: 'wait',
          tone: 'info',
          title: t('Wait for your turn'),
          detail: t('The banner says when it comes. Meanwhile, look at the map and plan.'),
        },
        ...(turn ? [reactionLine(t, turn.reaction)] : []),
        ANYTHING(t),
      ],
    };
  }
  const options = (own ?? []).filter((action) => action.legal).slice(0, EXAMPLES);
  const slots = slotsLeft(t, sheet);
  const lines: HintLine[] = [];
  if (turn) {
    lines.push(
      turn.movementLeftFt > 0
        ? {
            id: 'move',
            tone: 'open',
            title: t('Your movement'),
            detail: t('Up to {feet} ft left. Tap a square on the map to go there.', {
              feet: turn.movementLeftFt,
            }),
          }
        : {
            id: 'move',
            tone: 'spent',
            title: t('Your movement'),
            detail: t('No movement left this turn.'),
          },
    );
    if (turn.attacksLeft > 0) {
      lines.push({
        id: 'attacks',
        tone: 'open',
        title: t('Attack again'),
        detail: t('Attacks left with this action: {count}. Tap an enemy.', {
          count: turn.attacksLeft,
        }),
      });
    }
    lines.push(
      turn.action
        ? {
            id: 'action',
            tone: 'open',
            title: t('One action'),
            detail: t(
              'Tap an enemy, a friend or your own hero on the map: the buttons that appear are what you can do.',
            ),
            examples: [
              t('At an enemy: attack, or cast a spell.'),
              ...(options.length > 0
                ? [
                    t('On your own hero: {list}.', {
                      list: options.map((action) => plainAction(t, action)).join('; '),
                    }),
                  ]
                : []),
              ...(slots === null ? [] : [slots]),
            ],
            way: 'rules',
          }
        : {
            id: 'action',
            tone: 'spent',
            title: t('One action'),
            detail: t('Your action is spent this turn.'),
          },
      turn.bonusAction
        ? {
            id: 'bonus',
            tone: 'open',
            title: t('A bonus action'),
            detail: t(
              'A quick extra that only some spells and features use. Many turns have none.',
            ),
          }
        : {
            id: 'bonus',
            tone: 'spent',
            title: t('A bonus action'),
            detail: t('Your bonus action is spent this turn.'),
          },
      reactionLine(t, turn.reaction),
    );
  } else {
    lines.push({
      id: 'act',
      tone: 'info',
      title: t('Move and act'),
      detail: t(
        'Tap a square to move. Tap an enemy, a friend or your own hero: the buttons that appear are what you can do.',
      ),
    });
  }
  lines.push(
    {
      id: 'end',
      tone: 'info',
      title: t('Finished?'),
      detail: t('Press “End turn”: the next one acts.'),
    },
    ANYTHING(t),
  );
  return { heading: t('It is your turn'), lines };
}

export interface SceneHintInput {
  /** Where the hero is, as it knows the place; null for a place it cannot name. */
  readonly place: string | null;
  /** Other places it perceives, by name. */
  readonly nearby: readonly string[];
}

/** The hint outside a fight. */
export function sceneHint(t: Translate, input: SceneHintInput): HintPage {
  const names = input.nearby.slice(0, 4);
  return {
    heading:
      input.place === null
        ? t('What you can do here')
        : t('What you can do at {place}', { place: input.place }),
    lines: [
      {
        id: 'look',
        tone: 'open',
        title: t('Look around'),
        detail: t(
          'Tap a person or a thing on the scene: the buttons that appear are what you can do with it — talk, ask, look closer.',
        ),
      },
      {
        id: 'go',
        tone: 'open',
        title: t('Go somewhere'),
        detail:
          names.length === 0
            ? t('Places shows where you can go.')
            : t('Places shows where you can go. Nearby: {places}.', { places: names.join(', ') }),
        way: 'places',
      },
      {
        id: 'hero',
        tone: 'open',
        title: t('Know your hero'),
        detail: t('Character has your sheet and your pack; Journal has what you have learned.'),
        way: 'character',
      },
      {
        id: 'roll',
        tone: 'info',
        title: t('Rolls'),
        detail: t('When the DM asks for a roll, it appears at the top of the screen.'),
      },
      ANYTHING(t),
    ],
  };
}

import type { ProposableCommand } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru-visual.ts';
import { whoWillSee } from './who-sees.ts';

const english = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('en', key, params);
const russian = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('ru', key, params);

/** Tomas as the offline interpreter proposes him: a person, what he saw, willing to tell. */
const tomas = [
  {
    type: 'CreateEntity',
    entityId: 'tomas-reed',
    kind: 'npc',
    name: 'Tomas Reed',
    description: 'A young guard.',
    existsSince: null,
    placement: { locationId: 'north-gate', since: null },
  },
  {
    type: 'AddKnowledge',
    knowledgeId: 'tomas-saw',
    scope: { kind: 'NPC', npcId: 'tomas-reed' },
    knowledgeType: 'TESTIMONY',
    statement: 'He saw the caravan leave.',
    knownSince: null,
  },
  { type: 'SetDisclosure', knowledgeId: 'tomas-saw', disclosure: 'WILLING' },
] as unknown as readonly ProposableCommand[];

describe('who will see a proposal', () => {
  it('reads each line from the proposed commands, the proposal itself first', () => {
    expect(whoWillSee(english, tomas, [], new Map([['tomas-reed', 'Tomas Reed']]))).toEqual([
      'Until you confirm it, only you see this proposal.',
      'Players learn of Tomas Reed only through their characters, in play.',
      'Tomas Reed alone holds this account',
      'Tomas Reed will tell it when asked',
    ]);
  });

  it('names each scope a record may have', () => {
    const scoped = (scope: unknown) =>
      whoWillSee(
        english,
        [
          {
            type: 'AddKnowledge',
            scope,
            knowledgeType: 'FACT',
            statement: 'S',
            knownSince: null,
          } as unknown as ProposableCommand,
        ],
        [],
      )[1];
    expect(scoped({ kind: 'PARTY' })).toBe('The whole party knows this');
    expect(scoped({ kind: 'PUBLIC' })).toBe('Anyone may know this');
    expect(scoped({ kind: 'DM' })).toBe('Only you, the DM, know this');
    expect(scoped({ kind: 'WORLD_TRUTH' })).toBe('It is world truth: no one is told it');
  });

  it('speaks Russian, names placed as given', () => {
    expect(whoWillSee(russian, tomas, [], new Map([['tomas-reed', 'Томас Рид']]))[2]).toBe(
      'Этот рассказ знает только Томас Рид',
    );
  });
});

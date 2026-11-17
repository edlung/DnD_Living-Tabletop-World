import { useT } from '@ltw/ui';
import { useId } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useAgreement } from '../ritual/agreement-words.ts';
import { useReflections } from '../ritual/reflections.ts';
import { askScreen } from '../shell/requests.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * Before the first evening (docs/adr/0071-memory-and-ritual.md §4): the DM's short list on the
 * Session sheet of a campaign no session of which has ended — what to do before everyone sits
 * down, ticked where the app can tell it is done. It goes away after the first evening.
 */
export function FirstEvening({
  api,
  revision,
  dated,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  /** The next game has a date. */
  readonly dated: boolean;
}) {
  const t = useT();
  const ids = useId();
  const { sessions } = useReflections(api, revision);
  const { answer } = useAgreement(api, revision);
  if (sessions === null || sessions.length > 0 || answer === null) return null;
  const steps: readonly { readonly done: boolean | null; readonly words: string }[] = [
    {
      done: null,
      words: t('Invite the players: an invitation for each character, in Players.'),
    },
    {
      done: answer.agreement !== null,
      words: t('Write the table’s agreement, below.'),
    },
    { done: dated, words: t('Set the day of the first game, below.') },
    {
      done: null,
      words: t('Pair the TV, if you play at a table: in Table screen.'),
    },
  ];
  return (
    <section className="tool-group first-evening" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="chapter" />
        {t('Before the first evening')}
      </h3>
      <ul className="first-evening-steps">
        {steps.map((step) => (
          <li key={step.words} className={step.done === true ? 'is-done' : ''}>
            <span className="first-evening-mark" aria-hidden="true">
              {step.done === true ? '✓' : '·'}
            </span>
            <span>
              {step.words}
              {step.done === true && <span className="visually-hidden"> {t('(done)')}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="action-row">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            askScreen('dm-guide');
          }}
        >
          <Glyph name="info" />
          {t('How to run the game')}
        </button>
      </div>
    </section>
  );
}

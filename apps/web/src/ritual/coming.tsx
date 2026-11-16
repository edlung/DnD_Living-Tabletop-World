import type { ComingAnswer, LobbyCharacter } from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';

/**
 * "I'll come / I can't" for the next game (docs/adr/0073-table-ideas.md §10): an answer beside the
 * date, read by the table. A player answers for their own hero in the lobby; the DM, on the
 * Session sheet, for anyone who said it aloud. Nothing reminds anyone, and nothing is counted: a
 * changed date simply asks again.
 */
const wait = () => AbortSignal.timeout(20_000);

/** The table's answers in words: who comes, who cannot, who has not said — a line each, if any. */
export function comingLines(t: Translate, characters: readonly LobbyCharacter[]): string[] {
  const names = (answer: ComingAnswer | null) =>
    characters
      .filter((entry) => entry.coming === answer)
      .map((entry) => entry.character.name)
      .join(', ');
  const [yes, no, silent] = [names('yes'), names('no'), names(null)];
  return [
    ...(yes === '' ? [] : [t('Coming: {names}', { names: yes })]),
    ...(no === '' ? [] : [t('Can’t come: {names}', { names: no })]),
    ...(silent === '' ? [] : [t('No answer yet: {names}', { names: silent })]),
  ];
}

/** Sends one answer; pressing the answer already given takes it back. */
function useAnswer(api: WorldApi, onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const answer = (entry: LobbyCharacter, coming: ComingAnswer) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    void api
      .post(
        'lobby/coming',
        { characterId: entry.character.entityId, coming: entry.coming === coming ? null : coming },
        wait(),
        true,
      )
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
        onChanged();
      });
  };
  return { busy, failed, answer };
}

/** A player's own answer under the date in the lobby, and what the table has answered. */
export function ComingAsk({
  api,
  characters,
  characterId,
  onChanged,
}: {
  readonly api: WorldApi;
  readonly characters: readonly LobbyCharacter[];
  /** The player's own hero. */
  readonly characterId: string;
  /** The lobby reads again. */
  readonly onChanged: () => void;
}) {
  const t = useT();
  const ids = useId();
  const { busy, failed, answer } = useAnswer(api, onChanged);
  const mine = characters.find((entry) => entry.character.entityId === characterId);
  if (!mine) return null;
  return (
    <section className="coming coming--lobby" aria-label={t('Who comes to the next game')}>
      <div className="coming-ask" role="group" aria-labelledby={`${ids}-ask`}>
        <span id={`${ids}-ask`}>{t('Will you come?')}</span>
        <button
          type="button"
          className={mine.coming === null ? 'primary-button' : undefined}
          aria-pressed={mine.coming === 'yes'}
          aria-disabled={busy}
          onClick={() => {
            answer(mine, 'yes');
          }}
        >
          {t('I’ll come')}
        </button>
        <button
          type="button"
          aria-pressed={mine.coming === 'no'}
          aria-disabled={busy}
          onClick={() => {
            answer(mine, 'no');
          }}
        >
          {t('I can’t')}
        </button>
      </div>
      <ul className="coming-lines">
        {comingLines(t, characters).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="coming-failed">
          {t('Your answer was not kept. Try again.')}
        </p>
      )}
    </section>
  );
}

/** The DM's view on the Session sheet: every hero's answer, and the way to answer for one. */
export function ComingForDm({
  api,
  characters,
  onChanged,
}: {
  readonly api: WorldApi;
  readonly characters: readonly LobbyCharacter[];
  readonly onChanged: () => void;
}) {
  const t = useT();
  const ids = useId();
  const { busy, failed, answer } = useAnswer(api, onChanged);
  if (characters.length === 0) return null;
  return (
    <div className="coming coming--dm" role="group" aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`}>{t('Who comes')}</h4>
      <p id={`${ids}-hint`} className="muted">
        {t(
          'Everyone answers on their own screen. Answer here for someone who told you aloud. A new date asks everyone again.',
        )}
      </p>
      <ul className="coming-heroes">
        {characters.map((entry) => (
          <li key={entry.character.entityId}>
            <span className="coming-name">{entry.character.name}</span>
            <span className="coming-said">
              {entry.coming === 'yes'
                ? t('comes')
                : entry.coming === 'no'
                  ? t('can’t come')
                  : t('no answer yet')}
            </span>
            <span className="coming-buttons">
              <button
                type="button"
                aria-pressed={entry.coming === 'yes'}
                aria-disabled={busy}
                aria-label={t('{name} comes', { name: entry.character.name })}
                onClick={() => {
                  answer(entry, 'yes');
                }}
              >
                {t('Comes')}
              </button>
              <button
                type="button"
                aria-pressed={entry.coming === 'no'}
                aria-disabled={busy}
                aria-label={t('{name} can’t come', { name: entry.character.name })}
                onClick={() => {
                  answer(entry, 'no');
                }}
              >
                {t('Can’t')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="authoring-notice error">
          {t('The answer was not kept. Try again.')}
        </p>
      )}
    </div>
  );
}

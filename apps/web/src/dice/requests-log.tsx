import type { EntityRef } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useId } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { checkWords } from './checks.ts';
import { AnswerCheck } from './own-dice.tsx';
import { useDiceTable } from './table.tsx';
import {
  purposeWords,
  resultWords,
  rollerWords,
  rollMarks,
  subjectWords,
  sumWords,
} from './words.ts';

/**
 * The DM's requests (Stage 510): for a player, the checks the DM asks of its character, each with
 * its Roll; for the DM, the latest requests with who answered and whether the DC was met.
 */
export function Requests({ characters }: { readonly characters: readonly EntityRef[] }) {
  const t = useT();
  const table = useDiceTable();
  const ids = useId();
  if (!table || table.requests.status !== 'ready') return null;
  const { requests } = table.requests.value;
  const characterId = table.characterId;
  if (!table.isDm) {
    if (requests.length === 0 || characterId === null) return null;
    return (
      <section className="sheet-section dice-asked" aria-labelledby={`${ids}-title`}>
        <h3 id={`${ids}-title`}>{t('The DM asks')}</h3>
        <ul className="dice-requests">
          {requests.map((request) => (
            <li key={request.requestId} className="dice-request is-open">
              <Glyph name="roll" />
              <span>
                {checkWords(t, request.check, request.mode)}
                {request.private && <span className="muted">{`\u00a0· ${t('in private')}`}</span>}
              </span>
              <AnswerCheck request={request} />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (requests.length === 0) return null;
  const name = (id: string) =>
    characters.find((entry) => entry.entityId === id)?.name ?? t('Someone at the table');
  return (
    <section className="sheet-section dice-asked" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Requests')}</h3>
      <ul className="dice-requests">
        {requests.map((request) => (
          <li key={request.requestId} className={`dice-request is-${request.status}`}>
            <span className="dice-request-what">
              <strong>{name(request.characterId)}</strong>
              <span>{checkWords(t, request.check, request.mode)}</span>
              {request.dc !== undefined && (
                <span className="muted">{t('DC {dc}', { dc: request.dc })}</span>
              )}
            </span>
            {request.status === 'open' ? (
              <span className="dice-request-state">
                <span className="muted">{t('Waiting for the roll')}</span>
                <button
                  type="button"
                  disabled={table.busy}
                  onClick={() => void table.cancel(request.requestId)}
                >
                  {t('Withdraw')}
                </button>
              </span>
            ) : request.status === 'cancelled' ? (
              <span className="dice-request-state muted">{t('Withdrawn')}</span>
            ) : (
              <span className="dice-request-state">
                <strong>{request.total}</strong>
                {request.success !== undefined && (
                  <span
                    className={`dice-plate-result is-${request.success ? 'success' : 'failure'}`}
                  >
                    {request.success ? t('Success') : t('Failure')}
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The latest rolls this perspective may see, newest first. */
export function RollLog() {
  const t = useT();
  const table = useDiceTable();
  const ids = useId();
  if (!table) return null;
  if (table.feed.status !== 'ready') {
    return (
      <StatusPanel
        state={table.feed.status === 'error' ? 'error' : 'loading'}
        label={table.feed.status === 'error' ? table.feed.message : t('Loading the rolls…')}
      />
    );
  }
  const rolls = [...table.feed.value.rolls]
    .filter((roll) => !table.flying.has(roll.rollId))
    .reverse();
  return (
    <section className="sheet-section dice-log" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Recent rolls')}</h3>
      {rolls.length === 0 ? (
        <p className="muted">{t('No dice have been rolled yet.')}</p>
      ) : (
        <ol className="dice-log-list">
          {rolls.map((entry) => (
            <li key={entry.rollId} className={`dice-log-entry${entry.hidden ? ' is-hidden' : ''}`}>
              <p className="dice-log-who">
                <strong>{rollerWords(t, entry.roller)}</strong>
                <span>{subjectWords(t, entry.subject)}</span>
                {entry.hidden && <span className="dice-log-hidden">{t('Hidden')}</span>}
                {rollMarks(t, entry, table.isDm).map((mark) => (
                  <span key={mark} className="dice-log-mark">
                    {mark}
                  </span>
                ))}
              </p>
              {entry.groups.map((group, index) => {
                const result = resultWords(t, group);
                return (
                  <p key={index} className="dice-log-line">
                    <span className="muted">{purposeWords(t, group)}</span>
                    <span>{sumWords(group)}</span>
                    {result && (
                      <span
                        className={`dice-plate-result is-${group.critical ? 'critical' : (group.result ?? '')}`}
                      >
                        {result}
                      </span>
                    )}
                  </p>
                );
              })}
              {table.isDm && entry.entered && !entry.confirmed && (
                <button
                  type="button"
                  className="dice-log-confirm"
                  disabled={table.busy}
                  onClick={() => void table.confirm(entry.rollId)}
                >
                  {t('Confirm: the dice showed this')}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

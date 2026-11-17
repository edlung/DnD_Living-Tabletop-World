import type { ClientErrorView, ClientErrorsResponse } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { askScreen } from '../shell/requests.ts';
import { Glyph } from '../visual/glyph.tsx';
import { newestAt, readSeen, writeSeen } from './trouble-seen.ts';
import { browserWords, kindWords, placeWords, whereWords, whoseWords } from './trouble-words.ts';

/** Reports the list shows; the rest are counted. */
const SHOWN = 8;
const wait = () => AbortSignal.timeout(20_000);

/** What this table's screens reported (docs/adr/0073-table-ideas.md §1): the DM's own read. */
function useTroubles(api: WorldApi, key: string) {
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<ClientErrorsResponse>('client-errors', signal, false).catch(() => null),
    [api],
  );
  const list = useResource(key, load);
  const errors: readonly ClientErrorView[] =
    list.resource.status === 'ready' ? (list.resource.value?.errors ?? []) : [];
  return { errors, reread: list.reread };
}

/**
 * Over the stage, for the DM alone: a quiet line while a screen of this table has reported
 * something the DM has not looked at — a child whose phone broke says "it does not work", or
 * nothing. "What broke" opens the list on the Session sheet; "Not now" puts the line away until
 * something new is reported. Neither clears anything.
 */
export function TroubleNotice({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const { errors } = useTroubles(api, 'trouble-notice');
  const [seen, setSeen] = useState(() => readSeen(api.campaignId));
  const newest = newestAt(errors);
  if (newest === null || (seen !== null && newest <= seen)) return null;
  const looked = () => {
    writeSeen(api.campaignId, newest);
    setSeen(newest);
  };
  return (
    <section
      className="rest-banner break-card trouble-notice"
      aria-label={t('Screens with an error')}
    >
      <p className="asked-check-what">
        <Glyph name="warning" />
        <span className="rest-banner-text">
          {t('Something went wrong on a screen at this table.')}
        </span>
      </p>
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            looked();
            askScreen('screen-troubles');
          }}
        >
          {t('What broke')}
        </button>
        <button type="button" onClick={looked}>
          {t('Not now')}
        </button>
      </div>
    </section>
  );
}

/**
 * On the Session sheet: the list of what broke — whose screen, which browser, where, what kind,
 * how often — and "Clear the list". Shown only while there is anything to read. Every word is the
 * application's own: a report is fixed fields.
 */
export function TroubleList({ api, open }: { readonly api: WorldApi; readonly open: boolean }) {
  const t = useT();
  const language = useLanguage();
  const ids = useId();
  const { errors, reread } = useTroubles(api, `trouble-list:${String(open)}`);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The section's last word, said where it was, with the focus its button held.
  const [cleared, setCleared] = useState(false);
  const word = useRef<HTMLParagraphElement>(null);
  const empty = errors.length === 0;
  useEffect(() => {
    if (cleared && empty) word.current?.focus();
  }, [cleared, empty]);
  if (empty) {
    return cleared ? (
      <p ref={word} tabIndex={-1} role="status" className="trouble-said">
        {t('The list is cleared.')}
      </p>
    ) : null;
  }
  const times = errors.reduce((sum, error) => sum + error.count, 0);
  const when = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const clear = () => {
    setBusy(true);
    setFailed(false);
    void api
      .post('client-errors/clear', {}, wait())
      .then(
        () => {
          writeSeen(api.campaignId, null);
          setCleared(true);
        },
        () => {
          setFailed(true);
        },
      )
      .finally(() => {
        setBusy(false);
        reread();
      });
  };
  return (
    <section className="tool-group trouble-group" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="warning" />
        {t('Screens with an error')}
      </h3>
      <p>
        {times === 1
          ? t(
              'Something went wrong on a screen at this table. Loading the page again there usually helps.',
            )
          : t(
              'Errors on this table’s screens: {count}. Loading the page again there usually helps.',
              {
                count: times,
              },
            )}
      </p>
      <ul className="trouble-list">
        {errors.slice(0, SHOWN).map((error) => {
          const code = [error.name, placeWords(error), error.build === 'unknown' ? '' : error.build]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={error.errorId}>
              <strong>{whoseWords(t, error)}</strong>
              <span>{browserWords(t, error)}</span>
              <span>
                {t('Where: {where}', { where: whereWords(t, error) })}
                {' · '}
                {kindWords(t, error)}
              </span>
              <span className="muted">
                {t('Times: {count}', { count: error.count })}
                {' · '}
                {t('Last: {time}', { time: when.format(new Date(error.lastAt)) })}
              </span>
              <details>
                <summary>{t('For whoever looks after the server')}</summary>
                <code lang="en" translate="no">
                  {code}
                </code>
              </details>
            </li>
          );
        })}
      </ul>
      {errors.length > SHOWN && (
        <p className="muted">
          {t('Not shown here: {count} more.', { count: errors.length - SHOWN })}
        </p>
      )}
      <p className="muted">
        {t(
          'A note holds the screen, the browser and the kind of error — never a name or anyone’s words.',
        )}
      </p>
      {failed && (
        <p role="alert" className="authoring-notice error">
          {t('The list could not be cleared. Try again.')}
        </p>
      )}
      <div className="action-row">
        <button type="button" aria-disabled={busy} onClick={busy ? undefined : clear}>
          {busy ? t('Clearing…') : t('Clear the list')}
        </button>
      </div>
    </section>
  );
}

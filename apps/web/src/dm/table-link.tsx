import {
  TABLE_LINK_HOURS,
  type CreatedTableLinkResponse,
  type TableLinkStatusResponse,
} from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useCallback, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { formatWhen } from './players.ts';
import { ShownLink } from './shown-link.tsx';

/**
 * The table's join link in the DM's Players sheet (docs/adr/0042-table-display.md §5): open for a
 * few hours, it lets anyone at the table scan its QR code (here, or on the table's screen), sign
 * in or make a login, and take a free seat; the DM sees who took which seat and closes it.
 */
const HOURS = [2, TABLE_LINK_HOURS, 8, 24] as const;

export function TableLink({ api, round }: { readonly api: WorldApi; readonly round: number }) {
  const t = useT();
  const language = useLanguage();
  const id = useId();
  const [hours, setHours] = useState<number>(TABLE_LINK_HOURS);
  const [created, setCreated] = useState<CreatedTableLinkResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [own, setOwn] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => api.get<TableLinkStatusResponse>('table-link', signal, false),
    [api],
  );
  const status = useResource('table-link', load);
  useRereadOn(round + own, status.reread);
  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setFailed(false);
    try {
      return await api.post<CreatedTableLinkResponse>(path, body, AbortSignal.timeout(20_000));
    } catch {
      setFailed(true);
      return null;
    } finally {
      setBusy(false);
      setOwn((value) => value + 1);
    }
  };
  const open = status.resource.status === 'ready' ? status.resource.value : null;
  return (
    <section className="tool-group table-link" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <Glyph name="invitation" />
        {t('Table link: every free seat')}
      </h3>
      <p className="muted">
        {t(
          'One QR code for the whole table: each person scans it, signs in or makes a login, and takes a character nobody plays.',
        )}
      </p>
      {created && open?.open === true && (
        <ShownLink
          link={created.link}
          expiresAt={created.expiresAt}
          title={t('The table’s join link')}
          once={t(
            'Show it at the table only: anyone who scans it can take a free seat. Code: {code}',
            {
              code: `${created.code.slice(0, 4)} ${created.code.slice(4)}`,
            },
          )}
          label={t('Table link')}
          qrLabel={t('QR code of the table link')}
          copied={t('Copied.')}
          revocable={false}
          onHide={() => {
            setCreated(null);
          }}
        />
      )}
      {open?.open ? (
        <>
          <p className="muted">
            {t('Open until {when}.', { when: formatWhen(open.expiresAt ?? '', language) })}
          </p>
          {open.seated.length > 0 && (
            <ul className="players-list">
              {open.seated.map((seat) => (
                <li key={`${seat.character.entityId}:${seat.at}`} className="players-row">
                  <strong>{seat.character.name}</strong>{' '}
                  <span className="status-pill">
                    {seat.taken ? t('Seat taken') : t('Choosing a login…')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="action-row">
            <button disabled={busy} onClick={() => void act('table-link/close', {})}>
              <Glyph name="revoke" />
              {t('Close the table link')}
            </button>
          </div>
        </>
      ) : (
        <div className="players-form">
          <div className="field">
            <label htmlFor={`${id}-hours`}>{t('Open for')}</label>
            <select
              id={`${id}-hours`}
              value={hours}
              onChange={(event) => {
                setHours(Number(event.target.value));
              }}
            >
              {HOURS.map((choice) => (
                <option key={choice} value={choice}>
                  {t('{count} hours', { count: choice })}
                </option>
              ))}
            </select>
          </div>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => {
              void act('table-link', { hours }).then((made) => {
                if (made) setCreated(made);
              });
            }}
          >
            <Glyph name="link" />
            {t('Open the table link')}
          </button>
        </div>
      )}
      {failed && (
        <p role="alert" className="authoring-notice error">
          {t('The table link could not be changed. Try again.')}
        </p>
      )}
    </section>
  );
}

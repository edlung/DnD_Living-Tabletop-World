import type { CastResponse, DisplayListResponse, DisplayView, EntityRef } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { TvPanel } from '../native/tv-panel.tsx';
import { useNativeTv } from '../native/tv.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { CastForm } from './cast-form.tsx';
import { formatWhen } from './players.ts';

/**
 * The DM's Table screen sheet (docs/adr/0042-table-display.md): pair a TV by the code it shows,
 * name and unpair screens, and choose what they show — a place's scene (or wherever the party
 * is), the battlefield, the table's rolls, a title card, the Chronicle, a picture, the join QR
 * code, or nothing. The screens read only what the party knows. Only with production sign-in.
 */

export function ScreenSheet({
  api,
  open,
  directory,
}: {
  readonly api: WorldApi;
  readonly open: boolean;
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const [round, setRound] = useState(0);
  const loadDisplays = useCallback(
    (signal: AbortSignal) => api.get<DisplayListResponse>('displays', signal, false),
    [api],
  );
  const loadCast = useCallback(
    (signal: AbortSignal) => api.get<CastResponse>('display/cast', signal, false),
    [api],
  );
  const displays = useResource('screen-displays', loadDisplays);
  const cast = useResource('screen-cast', loadCast);
  useRereadOn(round, displays.reread);
  useRereadOn(round, cast.reread);
  if (!open) return null;
  const changed = () => {
    setRound((value) => value + 1);
  };
  return (
    <div className="screen-sheet">
      <TvPanel api={api} onPaired={changed} />
      <PairForm api={api} onPaired={changed} />
      {displays.resource.status === 'ready' ? (
        <ScreenList api={api} list={displays.resource.value} onChanged={changed} />
      ) : (
        <StatusPanel
          state={displays.resource.status === 'error' ? 'error' : 'loading'}
          label={
            displays.resource.status === 'error'
              ? displays.resource.message
              : t('Reading the paired screens…')
          }
          onRetry={displays.retry}
        />
      )}
      {cast.resource.status === 'ready' && (
        <CastForm
          key={cast.resource.value.revision}
          api={api}
          current={cast.resource.value.cast}
          directory={directory}
          onCast={changed}
        />
      )}
    </div>
  );
}

function PairForm({ api, onPaired }: { readonly api: WorldApi; readonly onPaired: () => void }) {
  const t = useT();
  const id = useId();
  // LTW DM shows its own TV a window of its own, so mirroring is no longer the danger it is here.
  const ownTv = useNativeTv() !== null;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function pair(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim() === '') {
      setNote({ kind: 'error', text: t('Type the code the screen shows.') });
      return;
    }
    setBusy(true);
    try {
      const body = name.trim() === '' ? { code } : { code, name: name.trim() };
      await api.post<DisplayView>('displays', body, AbortSignal.timeout(20_000));
      setCode('');
      setName('');
      setNote({
        kind: 'success',
        text: t('The screen is paired: it shows what you choose below.'),
      });
      onPaired();
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setNote({
        kind: 'error',
        text:
          status === 404
            ? t('No screen is waiting with that code. Check it, or let the screen show a new one.')
            : status === 409
              ? t('Four screens are paired already. Unpair one first.')
              : status === 400
                ? t('A code is eight letters and digits, as the screen shows it.')
                : t('The screen could not be paired. Try again.'),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tool-group screen-pair" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <Glyph name="link" />
        {t('Pair a screen')}
      </h3>
      <p className="muted">
        {t('On the TV, a laptop on HDMI or a stick, open {address} and type its code here.', {
          address: `${window.location.origin}/display`,
        })}
      </p>
      {!ownTv && (
        <p className="muted">
          {t(
            'Mirroring this iPad or laptop would show your secrets: pair a separate screen instead.',
          )}
        </p>
      )}
      <form className="screen-pair-form" noValidate onSubmit={(event) => void pair(event)}>
        <div className="field">
          <label htmlFor={`${id}-code`}>{t('The screen’s code')}</label>
          <input
            id={`${id}-code`}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-name`}>{t('Its name (optional)')}</label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            maxLength={40}
          />
        </div>
        <button className="primary-button" type="submit" disabled={busy}>
          <Glyph name="link" />
          {t('Pair')}
        </button>
      </form>
      {note && (
        <p
          role={note.kind === 'error' ? 'alert' : 'status'}
          className={`authoring-notice ${note.kind}`}
        >
          {note.text}
        </p>
      )}
    </section>
  );
}

function ScreenList({
  api,
  list,
  onChanged,
}: {
  readonly api: WorldApi;
  readonly list: DisplayListResponse;
  readonly onChanged: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const id = useId();
  const unpair = async (path: string) => {
    await api.post(path, {}, AbortSignal.timeout(20_000)).catch(() => undefined);
    onChanged();
  };
  return (
    <section className="tool-group screen-list" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <Glyph name="live" />
        {t('Paired screens: {count} of {limit}', {
          count: list.displays.length,
          limit: list.limit,
        })}
      </h3>
      {list.displays.length === 0 ? (
        <p className="muted">{t('No screen is paired yet.')}</p>
      ) : (
        <>
          <ul className="players-list">
            {list.displays.map((display) => (
              <li key={display.displayId} className="players-row">
                <div className="players-row-head">
                  <strong>{display.name}</strong>
                  <span className="status-pill">
                    {display.lastSeenAt
                      ? t('Seen {when}', { when: formatWhen(display.lastSeenAt, language) })
                      : t('Not seen yet')}
                  </span>
                </div>
                <div className="action-row">
                  <button
                    aria-label={t('Unpair: {name}', { name: display.name })}
                    onClick={() =>
                      void unpair(`displays/${encodeURIComponent(display.displayId)}/revoke`)
                    }
                  >
                    <Glyph name="revoke" />
                    {t('Unpair')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button className="quiet-button" onClick={() => void unpair('displays/revoke')}>
            {t('Unpair every screen')}
          </button>
        </>
      )}
    </section>
  );
}

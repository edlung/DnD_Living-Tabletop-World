import type { EntityRef, UndoneActionsResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { describePlayerAction } from '../dm/history-text.ts';
import { Glyph } from '../visual/glyph.tsx';

/** What was told: the player's own command, put into words at each render (a language switch). */
type Told = UndoneActionsResponse['actions'][number];

/**
 * "The DM undid your action: …" (docs/adr/0033-live-session.md, amendment of 2026-10-28): the
 * player's own actions the DM undid since the player last acted, read from the server's
 * `undone-actions` view, which the live signal covers, so the notice comes with the next live
 * update. Built only from the player's own commands and the names this screen has shown the
 * player: a place the undo made unknown keeps the name the player saw, or a neutral word.
 * What was said stays until the player dismisses it, also once the server stops listing it.
 * Nothing goes into browser storage.
 */
export function UndoneNotice({
  api,
  directory,
}: {
  readonly api: WorldApi;
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<UndoneActionsResponse>('undone-actions', signal),
    [api],
  );
  const { resource } = useResource('undone-actions', load);
  // Names the player has been shown on this screen, kept when the directory forgets them.
  const seen = useRef(new Map<string, string>());
  for (const entity of directory) seen.current.set(entity.entityId, entity.name);
  const [told, setTold] = useState<readonly Told[]>([]);
  const dismissed = useRef(new Set<string>());
  const listed = resource.status === 'ready' ? resource.value.actions : null;
  useEffect(() => {
    if (!listed) return;
    setTold((current) => {
      const fresh = listed.filter(
        (action) =>
          !dismissed.current.has(action.commandId) &&
          !current.some((entry) => entry.commandId === action.commandId),
      );
      if (fresh.length === 0) return current;
      return [...fresh, ...current];
    });
  }, [listed]);
  const words = (entry: Told) =>
    describePlayerAction(
      t,
      entry.command,
      (id) =>
        seen.current.get(id) ??
        t(
          entry.command.type === 'EnterLocation' ? 'Unidentified location' : 'Unidentified subject',
        ),
    );
  return (
    // Always present, so what arrives is announced once (a polite live region).
    <div className="undone-notice-region" role="status" aria-live="polite">
      {told.length > 0 && (
        <section className="undone-notice" aria-label={t('Undone by the DM')}>
          <Glyph name="undo" />
          <div>
            {told.length === 1 ? (
              <p>
                {t('The DM undid your action: {action}', { action: told[0] ? words(told[0]) : '' })}
              </p>
            ) : (
              <>
                <p>{t('The DM undid some of your actions:')}</p>
                <ul>
                  {told.map((entry) => (
                    <li key={entry.commandId}>{words(entry)}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="muted">
              {t('The world is as it was before; what followed from it is gone.')}
            </p>
            <button
              type="button"
              onClick={() => {
                for (const entry of told) dismissed.current.add(entry.commandId);
                setTold([]);
              }}
            >
              {t('Understood')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

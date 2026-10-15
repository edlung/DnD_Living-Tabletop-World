import type { PresenceResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import type { LiveStatus } from '../api/live.ts';
import { useResource } from '../api/resource.ts';

/**
 * The live session on screen (docs/adr/0033-live-session.md §4–5): whether this view follows
 * the world as it changes, and who is at the table. Neither announces itself on every
 * refresh; presence is shown, never used to decide anything.
 */
export function ConnectionBadge({ status }: { readonly status: LiveStatus }) {
  const t = useT();
  const label =
    status === 'live'
      ? t('Live')
      : status === 'reconnecting'
        ? t('Reconnecting…')
        : status === 'offline'
          ? t('Offline')
          : t('Connecting…');
  const hint =
    status === 'live'
      ? t('Changes appear here as they happen.')
      : status === 'offline'
        ? t('Live updates are off. Refresh world shows the latest.')
        : t('Live updates are paused. Refresh world shows the latest.');
  return (
    <span className={`live-badge live-badge--${status}`} title={hint}>
      <span className="live-dot" aria-hidden="true" />
      <span className="visually-hidden">{t('Live updates:')} </span>
      {label}
    </span>
  );
}

/** Who is at the table, as this perspective may see it; nothing while it is loading. */
export function TablePresence({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<PresenceResponse>('presence', signal),
    [api],
  );
  const { resource } = useResource('presence', load);
  if (resource.status !== 'ready') return null;
  const { dmConnected, characters } = resource.value;
  return (
    <section className="table-presence" aria-label={t('At the table')}>
      <ul>
        <li className={dmConnected ? 'present' : 'away'}>
          {dmConnected ? t('DM connected') : t('DM not connected')}
        </li>
        {characters.map(({ character, present }) => (
          <li key={character.entityId} className={present ? 'present' : 'away'}>
            {present
              ? t('{name} · connected', { name: character.name })
              : t('{name} · not connected', { name: character.name })}
          </li>
        ))}
      </ul>
    </section>
  );
}

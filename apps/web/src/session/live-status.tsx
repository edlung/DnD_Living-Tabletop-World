import { useT } from '@ltw/ui';

import type { LiveStatus } from '../api/live.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * Whether this view follows the world as it changes (docs/adr/0033-live-session.md §4). It
 * never announces itself on a refresh. Who is at the table is the party rail
 * (`world/party-rail.tsx`).
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
      <Glyph name={status === 'offline' ? 'offline' : 'live'} className="live-glyph" />
      <span className="visually-hidden">{t('Live updates:')} </span>
      {label}
    </span>
  );
}

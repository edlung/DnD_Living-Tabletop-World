import { useT } from '@ltw/ui';
import type { Ref } from 'react';

import type { LiveStatus } from '../api/live.ts';
import { ConnectionBadge } from '../session/live-status.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { ornamentUrl } from '../visual/ui-kit.ts';

/**
 * The top bar (docs/STAGE_320_DESIGN.md §5.1): the emblem and wordmark, the campaign and the
 * open play session (written in by the world screen, which owns that view), whether this view
 * follows the world live, the perspective, refresh and leave.
 */
export function TopBar({
  campaignName,
  status,
  perspective,
  choices,
  dmView,
  onPerspective,
  onRefresh,
  onLeave,
  sessionSlot,
}: {
  readonly campaignName: string;
  readonly status: LiveStatus;
  readonly perspective: string;
  readonly choices: readonly { readonly value: string; readonly label: string }[];
  readonly dmView: boolean;
  readonly onPerspective: (perspective: string) => void;
  readonly onRefresh: () => void;
  readonly onLeave: () => void;
  readonly sessionSlot: Ref<HTMLSpanElement>;
}) {
  const t = useT();
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img className="topbar-emblem" src={ornamentUrl('emblem')} alt="" />
        <span className="topbar-wordmark">{t('Living Tabletop World')}</span>
      </div>
      <div className="topbar-title">
        <h1>{campaignName}</h1>
        <span className="topbar-session" ref={sessionSlot} />
      </div>
      <div className="session-controls">
        <ConnectionBadge status={status} />
        <div className="perspective-control">
          <label htmlFor="perspective">{t('Perspective')}</label>
          <select
            id="perspective"
            value={perspective}
            onChange={(event) => {
              onPerspective(event.target.value);
            }}
          >
            {choices.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className={`perspective-note${dmView ? ' perspective-note--dm' : ''}`}>
            {dmView ? t('DM view · all knowledge') : t('Scoped perspective')}
          </span>
        </div>
        <IconButton glyph="refresh" label={t('Refresh world')} labelled onClick={onRefresh} />
        <IconButton glyph="leave" label={t('Leave session')} labelled onClick={onLeave} />
      </div>
    </header>
  );
}

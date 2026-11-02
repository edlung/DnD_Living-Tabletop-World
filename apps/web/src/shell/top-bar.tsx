import { useT } from '@ltw/ui';
import { useState, type Ref } from 'react';

import type { LiveStatus } from '../api/live.ts';
import { GuideButton, GuideDialog } from '../guide/guide.tsx';
import { AccountButton } from '../session/account-menu.tsx';
import { ConnectionBadge } from '../session/live-status.tsx';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { IconButton } from '../visual/icon-button.tsx';
import { ornamentUrl } from '../visual/ui-kit.ts';

/**
 * The top bar (docs/STAGE_320_DESIGN.md §5.1): the emblem and wordmark, the campaign and the
 * open play session (written in by the world screen, which owns that view), whether this view
 * follows the world live, the perspective, refresh, the account (my campaigns, or saving the seat
 * to a login: docs/adr/0041-accounts.md) and leave — signing out, for a browser signed in by
 * invitation (docs/adr/0036-production-sign-in.md §7).
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
  const signedIn = useSignInKind() === 'session';
  // The first-session guide (ADR 0044 §9): on a phone its button sits on the title's row, so the
  // perspective keeps its room beside the controls.
  const [guide, setGuide] = useState(false);
  const openGuide = () => {
    setGuide(true);
  };
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img className="topbar-emblem" src={ornamentUrl('emblem')} alt="" />
        <span className="topbar-wordmark">{t('Living Tabletop World')}</span>
      </div>
      <div className="topbar-title">
        <h1>{campaignName}</h1>
        <span className="topbar-session" ref={sessionSlot} />
        <GuideButton className="guide-button guide-button--title" onOpen={openGuide} />
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
        <GuideButton className="guide-button guide-button--controls" onOpen={openGuide} />
        <IconButton glyph="refresh" label={t('Refresh world')} labelled onClick={onRefresh} />
        {signedIn && <AccountButton />}
        <IconButton
          glyph="leave"
          label={signedIn ? t('Sign out') : t('Leave session')}
          labelled
          aria-haspopup={signedIn ? 'dialog' : undefined}
          onClick={onLeave}
        />
      </div>
      <GuideDialog
        open={guide}
        onClose={() => {
          setGuide(false);
        }}
      />
    </header>
  );
}

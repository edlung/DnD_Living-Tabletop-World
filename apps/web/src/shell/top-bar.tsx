import { useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useRef, useState, type Ref } from 'react';

import type { LiveStatus } from '../api/live.ts';
import { SoundOnButton } from '../audio/sound-on.tsx';
import { GuideButton, GuideDialog } from '../guide/guide.tsx';
import { AccountButton } from '../session/account-menu.tsx';
import { ConnectionBadge } from '../session/live-status.tsx';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { ornamentUrl } from '../visual/ui-kit.ts';
import { HERO_SLOT_ID } from './hero-plate.tsx';

/**
 * The top bar (docs/STAGE_320_DESIGN.md §5.1): the emblem and wordmark, the campaign and the
 * open play session (written in by the world screen, which owns that view), whether this view
 * follows the world live, "Sound on" while the table's sound waits for a press
 * (docs/adr/0059-atmosphere.md §6), the perspective, refresh, the account (my campaigns, or saving
 * the seat to a login: docs/adr/0041-accounts.md) and leave — signing out, for a browser signed in
 * by invitation (docs/adr/0036-production-sign-in.md §7). A phone's head is one row (ADR 0075
 * §21): the hero's plate, written in by the world screen, stands in place of the campaign's name,
 * and everything but the live mark and "Sound on" lies behind "More" (`styles/phone-head.css`
 * makes the menu's box a box only there).
 */
export function TopBar({
  campaignName,
  status,
  perspective,
  choices,
  dmView,
  dm,
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
  /** The reader runs this campaign: the guide has the DM's pages. */
  readonly dm: boolean;
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
  const openGuide = useCallback(() => {
    setGuide(true);
  }, []);
  // "More" on a phone: open until a press outside it, Escape, or a press that opens nothing else.
  const [menu, setMenu] = useState(false);
  const menuId = useId();
  const more = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // A choice made in the list closes it. On a phone the chosen row goes out of sight with the
  // list, so "More" takes the focus (a dialog the choice opens gives it back there too); wider,
  // "More" is not shown and the row keeps it.
  const done = useCallback(() => {
    setMenu(false);
    if (more.current && more.current.getClientRects().length > 0) more.current.focus();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const away = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (list.current?.contains(target) || more.current?.contains(target))) return;
      setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      // A dialog opened from the menu takes Escape for itself.
      if (event.key !== 'Escape' || list.current?.querySelector('dialog[open]')) return;
      event.stopImmediatePropagation();
      setMenu(false);
      more.current?.focus();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [menu]);
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
      <div className="topbar-hero" id={HERO_SLOT_ID} />
      <div className="session-controls">
        <ConnectionBadge status={status} />
        <SoundOnButton className="sound-on-button" />
        <button
          ref={more}
          type="button"
          className="topbar-more"
          aria-label={t('More')}
          aria-expanded={menu}
          aria-controls={menuId}
          onClick={() => {
            setMenu((open) => !open);
          }}
        >
          <Glyph name="more" />
        </button>
        <div
          ref={list}
          id={menuId}
          className="topbar-menu"
          data-open={menu || undefined}
          onClick={(event) => {
            // A press that opens a dialog keeps the list under it; any other is done with it.
            const pressed = event.target instanceof Element ? event.target.closest('button') : null;
            if (pressed && !pressed.hasAttribute('aria-haspopup')) done();
          }}
        >
          <div className="perspective-control">
            <label htmlFor="perspective">{t('Perspective')}</label>
            <select
              id="perspective"
              value={perspective}
              onChange={(event) => {
                done();
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
      </div>
      <GuideDialog
        open={guide}
        dm={dm}
        onOpen={openGuide}
        onClose={() => {
          setGuide(false);
        }}
      />
    </header>
  );
}

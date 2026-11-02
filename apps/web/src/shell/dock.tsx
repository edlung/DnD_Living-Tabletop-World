import { useT } from '@ltw/ui';
import { useRef, useState } from 'react';

import { useDiceTable } from '../dice/table.tsx';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { DockMore } from './dock-more.tsx';
import { useDockFit } from './use-dock-fit.ts';
import { dockButtonId, sheetElementId, type SheetId, type Shell } from './use-shell.ts';

interface Item {
  readonly id: SheetId | 'scene' | 'chronicle' | 'character';
  readonly label: string;
  /** The tab bar's word on a phone; contained in the label, which stays the name. */
  readonly short: string;
  readonly glyph: GlyphName;
  /** One of the DM's tools (drawn in gold). */
  readonly dm?: true;
  /** Something waits there (the DM's open draft): a marker, and its words as a description. */
  readonly waiting?: string;
}

function DockButton({
  item,
  shell,
  onCharacter,
  onPick,
}: {
  readonly item: Item;
  readonly shell: Shell;
  readonly onCharacter?: (() => void) | undefined;
  /** The item waits under More: More takes focus back and closes before the item acts. */
  readonly onPick?: (() => void) | undefined;
}) {
  const kind = onPick ? `dock-more-item${item.dm ? ' dock-more-item--dm' : ''}` : 'dock-button';
  const common = {
    id: dockButtonId(item.id),
    type: 'button' as const,
    className: `${kind}${item.waiting ? ' has-waiting' : ''}`,
    'aria-label': item.label,
    'aria-describedby': item.waiting ? `${dockButtonId(item.id)}-waiting` : undefined,
  };
  const act = (action: () => void) => () => {
    onPick?.();
    action();
  };
  const content = onPick ? (
    <>
      <Glyph name={item.glyph} />
      {item.waiting && <span className="dock-marker" aria-hidden="true" />}
      <span className="dock-more-name" aria-hidden="true">
        {item.label}
      </span>
    </>
  ) : (
    <>
      <Glyph name={item.glyph} />
      {item.waiting && <span className="dock-marker" aria-hidden="true" />}
      <span className="dock-label" aria-hidden="true">
        {item.label}
      </span>
      <span className="dock-short" aria-hidden="true">
        {item.short}
      </span>
    </>
  );
  if (item.id === 'scene') {
    return (
      <button {...common} aria-pressed={shell.sheet === null} onClick={act(shell.dismissSheet)}>
        {content}
      </button>
    );
  }
  if (item.id === 'chronicle') {
    return (
      <button {...common} aria-haspopup="dialog" onClick={act(shell.openChronicle)}>
        {content}
      </button>
    );
  }
  if (item.id === 'character') {
    return (
      <button {...common} aria-haspopup="dialog" onClick={act(() => onCharacter?.())}>
        {content}
      </button>
    );
  }
  const id = item.id;
  return (
    <button
      {...common}
      aria-expanded={shell.sheet === id}
      aria-controls={sheetElementId(id)}
      onClick={act(() => {
        shell.toggleSheet(id);
      })}
    >
      {content}
    </button>
  );
}

/**
 * The dock (docs/STAGE_320_DESIGN.md §5.1): Scene, Places, Journal and the Chronicle for
 * everyone; the DM's tools beside them, only in the DM perspective — Images among them
 * (docs/STAGE_330_DESIGN.md "DM controls") — with Players where the table signs in by
 * invitation (docs/adr/0036-production-sign-in.md §4). A phone shows it as a tab bar with short
 * words. It fits every screen (docs/adr/0043-dm-screen.md §3, `use-dock-fit.ts`): full words, then
 * short ones, then the last items under More — the DM's tools ordered by how often a session
 * needs them.
 */
export function Dock({
  isDm,
  shell,
  drafts = 0,
  onCharacter,
}: {
  readonly isDm: boolean;
  readonly shell: Shell;
  /** The DM's open drafts: "Add to the world" is marked while one waits (after a reload too). */
  readonly drafts?: number;
  /** Opens the acting character's dialog (Stage 500); absent where no character acts. */
  readonly onCharacter?: (() => void) | undefined;
}) {
  const t = useT();
  const invitations = useSignInKind() === 'session';
  // Table talk (ADR 0044 §1): marked while others' messages wait to be read; Dice while a check
  // the DM asked of this player waits (§3).
  const table = useDiceTable();
  const unread = table?.chat.unread ?? 0;
  const handoutsWaiting = table?.unreadHandouts.length ?? 0;
  const asked =
    table && !table.isDm && table.requests.status === 'ready'
      ? table.requests.value.requests.filter((request) => request.status === 'open').length
      : 0;
  const world: Item[] = [
    { id: 'scene', label: t('Scene'), short: t('Scene'), glyph: 'look' },
    { id: 'places', label: t('Places'), short: t('Places'), glyph: 'map' },
    {
      id: 'journal',
      label: t('Journal'),
      short: t('Journal'),
      glyph: 'journal',
      ...(handoutsWaiting > 0
        ? { waiting: t('New handouts: {count}', { count: handoutsWaiting }) }
        : {}),
    },
    {
      id: 'dice',
      label: t('Dice'),
      short: t('Dice'),
      glyph: 'roll',
      ...(asked > 0 ? { waiting: t('Checks the DM asked for: {count}', { count: asked }) } : {}),
    },
    {
      id: 'chat',
      label: t('Chat'),
      short: t('Chat'),
      glyph: 'talk',
      ...(unread > 0 ? { waiting: t('New messages: {count}', { count: unread }) } : {}),
    },
    // Online, the table's screen on every player's screen (ADR 0044 §5).
    ...(table?.online === true && !isDm
      ? ([{ id: 'shared', label: t('Table screen'), short: t('Screen'), glyph: 'live' }] as const)
      : []),
    { id: 'chronicle', label: t('Chronicle'), short: t('Chronicle'), glyph: 'chronicle' },
  ];
  // The acting character's sheet and pack (Stage 500). The DM's perspective has no character of
  // its own; the DM opens any character's sheet from its details.
  if (onCharacter)
    world.splice(3, 0, {
      id: 'character',
      label: t('Character'),
      short: t('Character'),
      glyph: 'character',
    });
  // The DM's tools (ADR 0043 §3), the ones a session needs most first: the last ones are the
  // first to wait under More.
  const dm: readonly Item[] = isDm
    ? [
        { id: 'party', label: t('Party'), short: t('Party'), glyph: 'party', dm: true },
        {
          id: 'encounter',
          label: t('Encounter'),
          short: t('Encounter'),
          glyph: 'encounter',
          dm: true,
        },
        { id: 'session', label: t('Session'), short: t('Session'), glyph: 'chapter', dm: true },
        // The table's screen (ADR 0042): pairing a TV and what it shows.
        ...(invitations
          ? ([
              {
                id: 'screen',
                label: t('Table screen'),
                short: t('Screen'),
                glyph: 'live',
                dm: true,
              },
            ] as const)
          : []),
        { id: 'notes', label: t('Notes'), short: t('Notes'), glyph: 'bookmark', dm: true },
        { id: 'time', label: t('Time and weather'), short: t('Time'), glyph: 'time', dm: true },
        {
          id: 'add',
          label: t('Add to the world'),
          short: t('Add'),
          glyph: 'add-character',
          dm: true,
          ...(drafts > 0 ? { waiting: t('An unfinished proposal is waiting') } : {}),
        },
        { id: 'images', label: t('Images'), short: t('Images'), glyph: 'picture', dm: true },
        { id: 'history', label: t('History'), short: t('History'), glyph: 'history', dm: true },
        ...(invitations
          ? ([
              {
                id: 'players',
                label: t('Players'),
                short: t('Players'),
                glyph: 'member',
                dm: true,
              },
            ] as const)
          : []),
      ]
    : [];
  const items = [...world, ...dm];
  const nav = useRef<HTMLElement>(null);
  // More's list stays open while the dock is measured again; it closes once nothing needs it.
  const [moreOpen, setMoreOpen] = useState(false);
  const fit = useDockFit(
    nav,
    items.length,
    items.map((item) => `${item.label}/${item.short}`).join('|'),
    (fits) => {
      if (fits.shown === items.length) setMoreOpen(false);
    },
  );
  const shown = new Set(items.slice(0, fit.shown).map((item) => item.id));
  const rest = items.slice(fit.shown);
  const entry = (item: Item, pick?: () => void) => (
    <li key={item.id}>
      <DockButton item={item} shell={shell} onCharacter={onCharacter} onPick={pick} />
      {item.waiting && (
        <span id={`${dockButtonId(item.id)}-waiting`} className="visually-hidden">
          {item.waiting}
        </span>
      )}
    </li>
  );
  const dmShown = dm.filter((item) => shown.has(item.id));
  return (
    <nav
      ref={nav}
      className="dock"
      data-words={fit.words}
      data-dm={isDm || undefined}
      aria-label={t('World tools')}
    >
      <ul className="dock-items">
        {world.filter((item) => shown.has(item.id)).map((item) => entry(item))}
      </ul>
      {dmShown.length > 0 && (
        <ul className="dock-items dock-items--dm" aria-label={t('DM tools')}>
          {dmShown.map((item) => entry(item))}
        </ul>
      )}
      {rest.length > 0 && (
        <DockMore
          open={moreOpen}
          onOpen={setMoreOpen}
          current={rest.some((item) => item.id === shell.sheet)}
          waiting={rest.flatMap((item) => (item.waiting ? [item.waiting] : [])).join(' ')}
        >
          {(pick) => rest.map((item) => entry(item, pick))}
        </DockMore>
      )}
    </nav>
  );
}

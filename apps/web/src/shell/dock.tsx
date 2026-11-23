import { useT } from '@ltw/ui';
import { useRef, useState } from 'react';

import { useDiceTable } from '../dice/table.tsx';
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
  const kind = onPick ? 'dock-more-item' : 'dock-button';
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
 * A player's dock (docs/STAGE_320_DESIGN.md §5.1): Scene, Places, Journal, Dice, Chat and the
 * Chronicle, the table's screen online, the acting character, the rules. The DM's screen is the
 * DM's book (docs/adr/0075-book-interface.md §3, `book-parts.tsx`). A phone shows it as a tab bar
 * with short words. It fits every screen (docs/adr/0043-dm-screen.md §3, `use-dock-fit.ts`): full
 * words, then short ones, then the last items under More.
 */
export function Dock({
  shell,
  onCharacter,
}: {
  readonly shell: Shell;
  /** Opens the acting character's dialog (Stage 500); absent where no character acts. */
  readonly onCharacter?: (() => void) | undefined;
}) {
  const t = useT();
  // Table talk (ADR 0044 §1): marked while others' messages wait to be read; Dice while a check
  // the DM asked of this player waits (§3).
  const table = useDiceTable();
  const unread = table?.chat.unread ?? 0;
  const handoutsWaiting = table?.unreadHandouts.length ?? 0;
  const asked =
    table && table.requests.status === 'ready'
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
    ...(table?.online === true
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
  // The rules reference (docs/adr/0055-rules-reference-and-toolbox.md §2), everyone's: the first
  // to wait under More, and shown among the world's tools.
  const rules: Item = { id: 'rules', label: t('Rules'), short: t('Rules'), glyph: 'study' };
  const items = [...world, rules];
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
  return (
    <nav ref={nav} className="dock" data-words={fit.words} aria-label={t('World tools')}>
      <ul className="dock-items">
        {[...world, rules].filter((item) => shown.has(item.id)).map((item) => entry(item))}
      </ul>
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

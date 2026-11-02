import { useT } from '@ltw/ui';

import { useSignInKind } from '../session/sign-in-kind.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
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
}: {
  readonly item: Item;
  readonly shell: Shell;
  readonly onCharacter?: (() => void) | undefined;
}) {
  const common = {
    id: dockButtonId(item.id),
    type: 'button' as const,
    className: `dock-button${item.waiting ? ' has-waiting' : ''}`,
    'aria-label': item.label,
    'aria-describedby': item.waiting ? `${dockButtonId(item.id)}-waiting` : undefined,
  };
  const content = (
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
      <button {...common} aria-pressed={shell.sheet === null} onClick={shell.dismissSheet}>
        {content}
      </button>
    );
  }
  if (item.id === 'chronicle') {
    return (
      <button {...common} aria-haspopup="dialog" onClick={shell.openChronicle}>
        {content}
      </button>
    );
  }
  if (item.id === 'character') {
    return (
      <button {...common} aria-haspopup="dialog" onClick={onCharacter}>
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
      onClick={() => {
        shell.toggleSheet(id);
      }}
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
 * words.
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
  const world: Item[] = [
    { id: 'scene', label: t('Scene'), short: t('Scene'), glyph: 'look' },
    { id: 'places', label: t('Places'), short: t('Places'), glyph: 'map' },
    { id: 'journal', label: t('Journal'), short: t('Journal'), glyph: 'journal' },
    { id: 'dice', label: t('Dice'), short: t('Dice'), glyph: 'roll' },
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
  const dm: readonly Item[] = [
    {
      id: 'add',
      label: t('Add to the world'),
      short: t('Add'),
      glyph: 'add-character',
      ...(drafts > 0 ? { waiting: t('An unfinished proposal is waiting') } : {}),
    },
    { id: 'encounter', label: t('Encounter'), short: t('Encounter'), glyph: 'encounter' },
    { id: 'time', label: t('Time and weather'), short: t('Time'), glyph: 'time' },
    { id: 'history', label: t('History'), short: t('History'), glyph: 'history' },
    { id: 'images', label: t('Images'), short: t('Images'), glyph: 'picture' },
    ...(invitations
      ? ([
          { id: 'players', label: t('Players'), short: t('Players'), glyph: 'party' },
          // The table's screen (ADR 0042): pairing a TV and what it shows.
          { id: 'screen', label: t('Table screen'), short: t('Screen'), glyph: 'live' },
        ] as const)
      : []),
  ];
  return (
    <nav className="dock" aria-label={t('World tools')}>
      <ul className="dock-items">
        {world.map((item) => (
          <li key={item.id}>
            <DockButton item={item} shell={shell} onCharacter={onCharacter} />
          </li>
        ))}
      </ul>
      {isDm && (
        <ul className="dock-items dock-items--dm" aria-label={t('DM tools')}>
          {dm.map((item) => (
            <li key={item.id}>
              <DockButton item={item} shell={shell} />
              {item.waiting && (
                <span id={`${dockButtonId(item.id)}-waiting`} className="visually-hidden">
                  {item.waiting}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

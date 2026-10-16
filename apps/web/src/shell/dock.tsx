import { useT } from '@ltw/ui';

import { useSignInKind } from '../session/sign-in-kind.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { dockButtonId, sheetElementId, type SheetId, type Shell } from './use-shell.ts';

interface Item {
  readonly id: SheetId | 'scene' | 'chronicle';
  readonly label: string;
  /** The tab bar's word on a phone; contained in the label, which stays the name. */
  readonly short: string;
  readonly glyph: GlyphName;
}

function DockButton({ item, shell }: { readonly item: Item; readonly shell: Shell }) {
  const common = {
    id: dockButtonId(item.id),
    type: 'button' as const,
    className: 'dock-button',
    'aria-label': item.label,
  };
  const content = (
    <>
      <Glyph name={item.glyph} />
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
export function Dock({ isDm, shell }: { readonly isDm: boolean; readonly shell: Shell }) {
  const t = useT();
  const invitations = useSignInKind() === 'session';
  const world: readonly Item[] = [
    { id: 'scene', label: t('Scene'), short: t('Scene'), glyph: 'look' },
    { id: 'places', label: t('Places'), short: t('Places'), glyph: 'map' },
    { id: 'journal', label: t('Journal'), short: t('Journal'), glyph: 'journal' },
    { id: 'chronicle', label: t('Chronicle'), short: t('Chronicle'), glyph: 'chronicle' },
  ];
  const dm: readonly Item[] = [
    { id: 'add', label: t('Add to the world'), short: t('Add'), glyph: 'add-character' },
    { id: 'encounter', label: t('Encounter'), short: t('Encounter'), glyph: 'encounter' },
    { id: 'time', label: t('Time and weather'), short: t('Time'), glyph: 'time' },
    { id: 'history', label: t('History'), short: t('History'), glyph: 'history' },
    { id: 'images', label: t('Images'), short: t('Images'), glyph: 'picture' },
    ...(invitations
      ? [{ id: 'players', label: t('Players'), short: t('Players'), glyph: 'party' } as const]
      : []),
  ];
  return (
    <nav className="dock" aria-label={t('World tools')}>
      <ul className="dock-items">
        {world.map((item) => (
          <li key={item.id}>
            <DockButton item={item} shell={shell} />
          </li>
        ))}
      </ul>
      {isDm && (
        <ul className="dock-items dock-items--dm" aria-label={t('DM tools')}>
          {dm.map((item) => (
            <li key={item.id}>
              <DockButton item={item} shell={shell} />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

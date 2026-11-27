import { useT } from '@ltw/ui';
import { useState } from 'react';

import { useDiceTable } from '../dice/table.tsx';
import { DockMore } from '../shell/dock-more.tsx';
import type { HeroTab, SheetId, Shell } from '../shell/use-shell.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import type { PlayerPage } from './lighthouse-folio.tsx';

interface Action {
  readonly id: string;
  readonly label: string;
  readonly short?: string;
  readonly glyph: GlyphName;
  readonly run: () => void;
  readonly sheet?: SheetId;
  readonly active?: boolean;
  readonly dialog?: boolean;
  readonly count?: number;
  readonly status?: string;
}

export function LighthouseDock({
  shell,
  fight,
  ownTurn,
  battlefield,
  onTable,
  onHero,
  onPage,
  onCreate,
}: {
  readonly shell: Shell;
  readonly fight: boolean;
  readonly ownTurn: boolean;
  readonly battlefield: boolean;
  readonly onTable: () => void;
  readonly onHero: (tab: HeroTab) => void;
  readonly onPage: (page: PlayerPage) => void;
  readonly onCreate: () => void;
}) {
  const t = useT();
  const table = useDiceTable();
  const [open, setOpen] = useState(false);
  const requests =
    table?.requests.status === 'ready'
      ? table.requests.value.requests.filter((r) => r.status === 'open').length
      : 0;
  const messages = table?.chat.unread ?? 0;
  const handouts = table?.unreadHandouts.length ?? 0;
  const section = (sheet: SheetId) => {
    if (shell.sheet === sheet) shell.closeSheet();
    else if (shell.sheet === 'player-book' || shell.returnsToPlayerBook)
      shell.openSheetFromBook(sheet);
    else shell.openSheet(sheet);
  };
  const route = (sheet: SheetId, label: string, glyph: GlyphName): Action => ({
    id: sheet,
    label: t(label),
    glyph,
    sheet,
    run: () => {
      section(sheet);
    },
  });
  const hero = (id: string, label: string, glyph: GlyphName, tab: HeroTab): Action => ({
    id,
    label: t(label),
    glyph,
    dialog: true,
    run: () => {
      onHero(tab);
    },
  });
  const pages = (page: PlayerPage, label: string, glyph: GlyphName): Action => ({
    id: 'page-' + page,
    label: t(label),
    glyph,
    run: () => {
      onPage(page);
    },
  });
  const primary: Action[] = [
    {
      id: 'player-book',
      sheet: 'player-book',
      label: t('Player’s book'),
      short: t('Book'),
      glyph: 'chapter',
      run: () => {
        if (shell.sheet === 'player-book') onTable();
        else shell.openSheet('player-book');
      },
    },
    {
      id: 'scene',
      label: t(fight ? 'Battlefield' : 'Scene'),
      short: t(fight ? 'Battle' : 'Scene'),
      glyph: fight ? 'encounter' : 'look',
      active: shell.sheet === null && (!fight || battlefield),
      run: onTable,
      ...(ownTurn ? { status: t('Your turn') } : {}),
    },
    { ...hero('character', 'Character', 'character', 'overview'), short: t('My hero') },
    {
      ...route('dice', 'Dice', 'roll'),
      count: requests,
      status: requests ? t('Checks the DM asked for: {count}', { count: requests }) : '',
    },
    {
      ...route('chat', 'Chat', 'talk'),
      count: messages,
      status: messages ? t('New messages: {count}', { count: messages }) : '',
    },
  ];
  const groups: readonly (readonly [string, readonly Action[]])[] = [
    [
      t('Character'),
      [
        hero('inventory', 'Pack and equipment', 'inspect', 'inventory'),
        hero('skills', 'Skills', 'study', 'skills'),
        hero('spells', 'Spells', 'cast', 'spells'),
        hero('notes', 'Personal notes and backstory', 'bookmark', 'story'),
        {
          id: 'make-hero',
          label: t('Create your own hero'),
          glyph: 'add-character',
          dialog: true,
          run: onCreate,
        },
      ],
    ],
    [
      t('Adventure'),
      [
        route('places', 'Places', 'map'),
        {
          ...route('journal', 'Journal', 'journal'),
          count: handouts,
          status: handouts ? t('New handouts: {count}', { count: handouts }) : '',
        },
        pages('journal', 'Quests', 'evidence'),
        {
          id: 'chronicle',
          label: t('Chronicle'),
          glyph: 'chronicle',
          dialog: true,
          run: () => {
            shell.openChronicle();
          },
        },
      ],
    ],
    [
      t('At the table'),
      [
        pages('party', 'Party', 'party'),
        pages('evening', 'Table gathering', 'dawn'),
        route('rules', 'Rules', 'study'),
        ...(table?.online ? [route('shared', 'Table screen', 'live')] : []),
      ],
    ],
  ];
  const button = (item: Action, pick?: () => void) => (
    <button
      type="button"
      id={'dock-' + item.id}
      className={pick ? 'dock-more-item' : 'dock-button'}
      aria-label={item.label}
      aria-expanded={item.sheet ? shell.sheet === item.sheet : undefined}
      aria-controls={item.sheet ? 'sheet-' + item.sheet : undefined}
      aria-pressed={item.active}
      aria-haspopup={item.dialog ? 'dialog' : undefined}
      aria-describedby={item.status ? 'dock-status-' + item.id : undefined}
      data-waiting={item.status ? '' : undefined}
      onClick={() => {
        pick?.();
        item.run();
      }}
    >
      <Glyph name={item.glyph} />
      <span className="dock-label">{item.label}</span>
      <span className="dock-short">{item.short ?? item.label}</span>
      {!!item.count && (
        <b className="player-dock-count" aria-hidden="true">
          {item.count}
        </b>
      )}
      {item.status && (
        <span id={'dock-status-' + item.id} className="visually-hidden">
          {item.status}
        </span>
      )}
    </button>
  );
  return (
    <nav className="dock player-dock" aria-label={t('World tools')}>
      <ul className="dock-items">
        {primary.map((item) => (
          <li key={item.id}>{button(item)}</li>
        ))}
      </ul>
      <DockMore
        open={open}
        onOpen={setOpen}
        label={t('All player actions')}
        compact={t('Actions')}
        current={groups.some(([, items]) =>
          items.some((item) => item.sheet && item.sheet === shell.sheet),
        )}
        waiting={handouts ? t('New handouts: {count}', { count: handouts }) : ''}
      >
        {(pick) =>
          groups.map(([heading, items]) => (
            <li className="player-action-group" key={heading}>
              <h3>{heading}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item.id}>{button(item, pick)}</li>
                ))}
              </ul>
            </li>
          ))
        }
      </DockMore>
    </nav>
  );
}

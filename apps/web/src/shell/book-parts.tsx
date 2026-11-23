import { useT } from '@ltw/ui';
import { useRef } from 'react';

import { PartIcon } from '../book-kit/kit.tsx';
import type { BookPart } from '../book-kit/materials.ts';
import { useDiceTable } from '../dice/table.tsx';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { dockButtonId, sheetElementId, type SheetId, type Shell } from './use-shell.ts';

/**
 * The DM's book is the DM's screen (docs/adr/0075-book-interface.md §3): seven parts behind
 * bookmarks at the book's fore-edge, and the part's pages as tabs at the top of the page. Every
 * section the dock held is a page of one part; the Scene is the stage itself. A page's tab keeps
 * the dock button's id, name and states, so focus comes back to it when its page closes.
 */
type Page = SheetId | 'scene' | 'chronicle';

interface PageItem {
  readonly id: Page;
  readonly label: string;
  readonly glyph: GlyphName;
  /** Something waits on this page (new messages, an open draft): its words. */
  readonly waiting?: string;
}

interface PartItem {
  readonly id: BookPart;
  readonly label: string;
  readonly glyph: GlyphName;
  readonly pages: readonly PageItem[];
}

/** The part a page belongs to (the stage, with no page open, is the Scene). */
export function partOfPage(parts: readonly PartItem[], page: Page): PartItem | undefined {
  return parts.find((part) => part.pages.some((item) => item.id === page));
}

export function useDmParts(drafts: number): readonly PartItem[] {
  const t = useT();
  const invitations = useSignInKind() === 'session';
  const table = useDiceTable();
  const unread = table?.chat.unread ?? 0;
  return [
    {
      id: 'story',
      label: t('Book'),
      glyph: 'perform',
      pages: [{ id: 'book', label: t('Book'), glyph: 'perform' }],
    },
    {
      id: 'scene',
      label: t('Scene'),
      glyph: 'look',
      pages: [
        { id: 'scene', label: t('Scene'), glyph: 'look' },
        { id: 'encounter', label: t('Encounter'), glyph: 'encounter' },
      ],
    },
    {
      id: 'heroes',
      label: t('The heroes'),
      glyph: 'party',
      pages: [{ id: 'party', label: t('Party'), glyph: 'party' }],
    },
    {
      id: 'world',
      label: t('World'),
      glyph: 'map',
      pages: [
        { id: 'places', label: t('Places'), glyph: 'map' },
        { id: 'time', label: t('Time and weather'), glyph: 'time' },
        {
          id: 'add',
          label: t('Add to the world'),
          glyph: 'add-character',
          ...(drafts > 0 ? { waiting: t('An unfinished proposal is waiting') } : {}),
        },
        { id: 'images', label: t('Images'), glyph: 'picture' },
      ],
    },
    {
      id: 'journal',
      label: t('Journal'),
      glyph: 'journal',
      pages: [
        { id: 'journal', label: t('Journal'), glyph: 'journal' },
        { id: 'notes', label: t('Notes'), glyph: 'bookmark' },
        { id: 'chronicle', label: t('Chronicle'), glyph: 'chronicle' },
        { id: 'history', label: t('History'), glyph: 'history' },
      ],
    },
    {
      id: 'table',
      label: t('At the table'),
      glyph: 'chapter',
      pages: [
        { id: 'session', label: t('Session'), glyph: 'chapter' },
        {
          id: 'chat',
          label: t('Chat'),
          glyph: 'talk',
          ...(unread > 0 ? { waiting: t('New messages: {count}', { count: unread }) } : {}),
        },
        ...(invitations
          ? ([
              { id: 'screen', label: t('Table screen'), glyph: 'live' },
              { id: 'players', label: t('Players'), glyph: 'member' },
            ] as const)
          : []),
      ],
    },
    {
      id: 'rules',
      label: t('Rules'),
      glyph: 'study',
      pages: [
        { id: 'rules', label: t('Rules'), glyph: 'study' },
        { id: 'dice', label: t('Dice'), glyph: 'roll' },
      ],
    },
  ];
}

function PageTab({
  item,
  part,
  shell,
}: {
  readonly item: PageItem;
  readonly part: BookPart;
  readonly shell: Shell;
}) {
  const id = dockButtonId(item.id);
  const describedBy = item.waiting ? `${id}-waiting` : undefined;
  const common = {
    id,
    type: 'button' as const,
    className: `book-page-tab${item.waiting ? ' has-waiting' : ''}`,
    'data-part': part,
    'aria-describedby': describedBy,
  };
  const content = (
    <>
      <Glyph name={item.glyph} />
      <span>{item.label}</span>
      {item.waiting && <span className="dock-marker" aria-hidden="true" />}
    </>
  );
  if (item.id === 'scene')
    return (
      <button {...common} aria-pressed={shell.sheet === null} onClick={shell.dismissSheet}>
        {content}
      </button>
    );
  if (item.id === 'chronicle')
    return (
      <button
        {...common}
        aria-haspopup="dialog"
        onClick={() => {
          shell.openChronicle();
        }}
      >
        {content}
      </button>
    );
  const sheet = item.id;
  return (
    <button
      {...common}
      aria-expanded={shell.sheet === sheet}
      aria-controls={sheetElementId(sheet)}
      onClick={() => {
        shell.toggleSheet(sheet);
      }}
    >
      {content}
    </button>
  );
}

/**
 * The DM's bookmarks and the open part's pages. A part opens at the page last read in it; the
 * Scene part's first page is the stage. Other parts' tabs stay in the document, hidden, so a
 * section can be found by its name and its part opened for it.
 */
export function BookParts({ shell, drafts }: { readonly shell: Shell; readonly drafts: number }) {
  const t = useT();
  const parts = useDmParts(drafts);
  const current: BookPart = partOfPage(parts, shell.sheet ?? 'scene')?.id ?? 'scene';
  const lastPage = useRef<Partial<Record<BookPart, Page>>>({});
  lastPage.current[current] = shell.sheet ?? 'scene';
  const open = (part: PartItem) => {
    const page = lastPage.current[part.id] ?? part.pages[0]?.id ?? 'scene';
    if (page === 'scene') shell.dismissSheet();
    else if (page === 'chronicle') shell.openChronicle();
    else if (shell.sheet !== page) shell.openSheet(page);
  };
  return (
    <>
      <nav className="book-pages" aria-label={t('Pages of this part')}>
        {parts.map((part) => (
          <ul key={part.id} className="book-page-tabs" hidden={part.id !== current}>
            {part.pages.map((item) => (
              <li key={item.id}>
                <PageTab item={item} part={part.id} shell={shell} />
                {item.waiting && (
                  <span id={`${dockButtonId(item.id)}-waiting`} className="visually-hidden">
                    {item.waiting}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ))}
      </nav>
      <nav className="book-parts" aria-label={t('Parts of the book')}>
        <ul>
          {parts.map((part) => {
            const waiting = part.pages.flatMap((item) => (item.waiting ? [item.waiting] : []));
            return (
              <li key={part.id}>
                <button
                  type="button"
                  className="book-part"
                  data-part={part.id}
                  aria-current={part.id === current ? 'page' : undefined}
                  onClick={() => {
                    open(part);
                  }}
                >
                  <PartIcon part={part.id} glyph={part.glyph} />
                  <span className="book-part-word">{part.label}</span>
                  {waiting.length > 0 && (
                    <>
                      <span className="dock-marker" aria-hidden="true" />
                      <span className="visually-hidden">{waiting.join(' ')}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

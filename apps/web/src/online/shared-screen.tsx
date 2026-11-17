import type { CastResponse, KnownEntitiesResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useDiceTable } from '../dice/table.tsx';
import { CastView } from '../display/cast-views.tsx';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';

/**
 * The table's screen on every screen when the session plays online (docs/adr/0044-online-play.md
 * §5, plan decision 4): what the DM casts, read in the party's view as the TV reads it, in a sheet
 * of its own. It follows the DM: when the DM shows something to everyone — a picture, a story's
 * picture and words, a title card, the Chronicle — the sheet opens, unless another sheet or a dialog is open (then the dock
 * marks it). So it does when the table goes online while this page is open — a session opened
 * with "Previously…" (docs/adr/0071-memory-and-ritual.md §1.4) — but not on a reload into a table
 * already online, where what is shown is not news. The join card never shows here.
 */
const SHOWN: ReadonlySet<string> = new Set([
  'picture',
  'story',
  'title',
  'chronicle',
  'stars',
  'agreement',
]);

export function SharedScreenSheet({
  api,
  shell,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
}) {
  const t = useT();
  const table = useDiceTable();
  const online = table?.online === true && !table.isDm;
  // The table's state has been read (its sound comes with it): "at the table" is then known.
  const read = table !== null && table.sound !== null;
  const party = useMemo(() => api.as('PARTY'), [api]);
  const loadCast = useCallback(
    (signal: AbortSignal) =>
      online ? party.get<CastResponse>('display/cast', signal, false) : Promise.resolve(null),
    [party, online],
  );
  const cast = useResource(`shared-cast:${String(online)}`, loadCast);
  const loadNames = useCallback(
    (signal: AbortSignal) =>
      online ? party.get<KnownEntitiesResponse>('entities', signal) : Promise.resolve(null),
    [party, online],
  );
  const names = useResource(`shared-names:${String(online)}`, loadNames);
  const shown = cast.resource.status === 'ready' ? cast.resource.value : null;
  // Follow the DM: a new thing shown to everyone opens the sheet when nothing else is open.
  const seen = useRef<number | null>(null);
  // Known to play at the table, then online: what is shown at that moment is news once.
  const atTable = useRef(false);
  const wentOnline = useRef(false);
  useEffect(() => {
    if (!read) return;
    if (!online) {
      atTable.current = true;
      seen.current = null;
    } else if (atTable.current) {
      atTable.current = false;
      wentOnline.current = true;
    }
  }, [read, online]);
  useEffect(() => {
    if (!shown) return;
    const before = seen.current;
    seen.current = shown.revision;
    const news = before === null ? wentOnline.current : before !== shown.revision;
    wentOnline.current = false;
    if (!news || !SHOWN.has(shown.cast.kind)) return;
    if (shell.sheet === null && !shell.chronicle && shell.hero === null) shell.openSheet('shared');
  }, [shown?.revision]);
  if (!online) return null;
  return (
    <Sheet
      id="shared"
      title={t('Table screen')}
      glyph="live"
      open={shell.sheet === 'shared'}
      onClose={shell.closeSheet}
    >
      {shown?.cast.kind === 'battlefield' ? (
        <p className="muted shared-screen-note">
          {t('The DM shows the battlefield: it is on your own screen.')}
        </p>
      ) : shown ? (
        // The recap may be longer than the sheet: its frame takes focus, so the keyboard scrolls it.
        <div
          className="shared-screen"
          {...(shown.cast.kind === 'chronicle'
            ? { tabIndex: 0, role: 'group', 'aria-label': t('Previously…') }
            : shown.cast.kind === 'story'
              ? { tabIndex: 0, role: 'group', 'aria-label': t('A story read aloud') }
              : {})}
        >
          {/* New words are said to who cannot see them arrive (ADR 0073 §8). */}
          {shown.cast.kind === 'story' && (
            <p role="status" className="visually-hidden">
              {t('The DM shows: {words}', { words: shown.cast.text })}
            </p>
          )}
          <CastView
            api={party}
            cast={shown}
            directory={
              names.resource.status === 'ready' ? (names.resource.value?.entities ?? []) : []
            }
            refresh={0}
            campaignName={t('The table’s screen')}
          />
        </div>
      ) : (
        <StatusPanel
          state={cast.resource.status === 'error' ? 'error' : 'loading'}
          label={
            cast.resource.status === 'error'
              ? cast.resource.message
              : t('Opening the table’s screen…')
          }
          onRetry={cast.retry}
        />
      )}
    </Sheet>
  );
}

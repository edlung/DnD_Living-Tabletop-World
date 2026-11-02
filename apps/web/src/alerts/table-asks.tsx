import type { EncounterView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { playChime } from '../dice/audio.ts';
import { checkWords } from '../dice/checks.ts';
import { useDiceSettings } from '../dice/settings.ts';
import { useDiceTable } from '../dice/table.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { RestBanner } from '../rest/sheet-rest.tsx';
import { LobbyBanner } from '../session/lobby-banner.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { useScreenAwake, useTitleCount } from './screen.ts';
import { newWaits, waitsOf, type Wait } from './waits.ts';

/**
 * The companion's alerts (docs/adr/0044-online-play.md §3, plan decision 10): whatever the table
 * waits for from this player — their turn, a reaction, a check the DM asked for, a short rest —
 * rings two soft notes (with the dice's sound on) and vibrates where the device can, the moment it
 * is new; the tab's title counts what still waits; the screen stays awake while a session runs.
 * The questions themselves stay until they are answered: the turn banner and the reaction prompt
 * in the fight, and here, over the stage, one column — the session's lobby or pause, the short
 * rest and each check asked, with its Roll. All of it is read from the server, so a reload or a
 * phone that slept comes back to it.
 */
export function TableAsks({
  api,
  isDm,
  ready,
  actorId,
  encounter,
  sessionOpen,
  locked,
  onRun,
  onOpenSheet,
}: {
  readonly api: WorldApi;
  readonly isDm: boolean;
  /** The world's views have been read: what waits then is not news. */
  readonly ready: boolean;
  readonly actorId: string | null;
  readonly encounter: EncounterView | null;
  readonly sessionOpen: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onOpenSheet: (characterId: string) => void;
}) {
  const t = useT();
  const table = useDiceTable();
  const [restsTaken, setRestsTaken] = useState<ReadonlySet<string>>(new Set());
  const requests = table?.requests.status === 'ready' ? table.requests.value.requests : [];
  const waits = isDm
    ? []
    : waitsOf({ encounter, actorId, requests, rest: table?.rest ?? null, restsTaken });
  // First sight is the first real read for this character (a reload, another perspective).
  const characterId = table?.characterId ?? null;
  useWaitSignals(
    waits,
    ready && characterId !== null && table?.requests.status === 'ready',
    characterId,
  );
  useTitleCount(waits.length);
  useScreenAwake(sessionOpen);
  const asked = isDm ? [] : requests.filter((request) => request.status === 'open');
  return (
    <div className="rest-banner-slot table-asks" aria-live="polite">
      {!isDm && <LobbyBanner api={api} actorId={actorId} />}
      <RestBanner
        isDm={isDm}
        actorId={actorId}
        fighting={encounter !== null}
        locked={locked}
        onRun={onRun}
        onOpenSheet={(id) => {
          const rest = table?.rest;
          if (rest) setRestsTaken((taken) => new Set([...taken, rest.restId]));
          onOpenSheet(id);
        }}
      />
      {table &&
        characterId !== null &&
        asked.map((request) => (
          <div key={request.requestId} className="rest-banner asked-check">
            <Glyph name="roll" />
            <span className="rest-banner-text">
              {t('The DM asks: {check}', { check: checkWords(t, request.check, request.mode) })}
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={table.busy}
              onClick={() =>
                void table.roll({
                  kind: 'check',
                  characterId,
                  check: request.check,
                  mode: request.mode,
                  requestId: request.requestId,
                })
              }
            >
              {t('Roll')}
            </button>
          </div>
        ))}
    </div>
  );
}

/**
 * Two soft notes and a buzz when something new waits; what waited at first sight of this
 * character (`scope`) is not news.
 */
function useWaitSignals(waits: readonly Wait[], ready: boolean, scope: string | null): void {
  const settings = useDiceSettings();
  const seen = useRef<{ readonly scope: string | null; readonly keys: ReadonlySet<string> } | null>(
    null,
  );
  const keys = waits.map((wait) => wait.key).join(' ');
  useEffect(() => {
    if (!ready) return;
    const before = seen.current?.scope === scope ? seen.current.keys : null;
    seen.current = { scope, keys: new Set(waits.map((wait) => wait.key)) };
    if (before === null || newWaits(before, waits).length === 0) return;
    if (settings.sound) playChime(settings.volume);
    if ('vibrate' in navigator) navigator.vibrate([160, 80, 160]);
  }, [keys, ready, scope]);
}

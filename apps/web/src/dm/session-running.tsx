import type { CastResponse, DisplayListResponse, TableMode } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Previously, usePreviously } from '../chronicle/previously.tsx';
import { BreakChoice } from '../comforts/break-reminder.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { CloseEvening } from './close-evening.tsx';
import type { EveningResult, EveningStep } from './evening.ts';

/**
 * The session that plays, on the DM's Session sheet (docs/adr/0043-dm-screen.md §6): its pause and
 * its end. Ending it closes the evening (`close-evening.tsx`, docs/adr/0071-memory-and-ritual.md
 * §1.3). While the Chronicle is cast the panel holds "Previously…" for the DM to read aloud.
 */
export function Running({
  api,
  title,
  sessionId,
  mode,
  paused,
  locked,
  revision,
  locationId,
  step,
  onPause,
  onStep,
  onClosed,
}: {
  readonly api: WorldApi;
  readonly title: string;
  readonly sessionId: string;
  readonly mode: TableMode;
  readonly paused: boolean;
  readonly locked: boolean;
  readonly revision: number;
  /** Where the DM looks: its scene tells the world's time. */
  readonly locationId: string | null;
  /** The closing's step that runs; null when none does. */
  readonly step: EveningStep | null;
  readonly onPause: (paused: boolean) => void;
  readonly onStep: (step: EveningStep) => void;
  /** The closing ran: what it did, also when a step stopped it. */
  readonly onClosed: (result: EveningResult) => void;
}) {
  const t = useT();
  const ids = useId();
  const [ending, setEnding] = useState(false);
  const pause = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(false);
  return (
    <section className="tool-group session-running" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="chapter" />
        {title}
      </h3>
      <p className="muted">
        {mode === 'table' ? t('At the table') : t('Online')}
        {paused ? ` · ${t('Paused')}` : ''}
      </p>
      <ReadAloud
        api={api}
        revision={revision}
        online={mode === 'online'}
        onShown={() => {
          // The card goes with its button: focus moves to the session's own controls.
          setShown(true);
          pause.current?.focus();
        }}
      />
      {/* Said once the scene is back: the card that held the button is gone. */}
      <p role="status" className="muted session-status">
        {shown ? t('The scene is on the table’s screens.') : ''}
      </p>
      <div className="action-row">
        <button
          ref={pause}
          type="button"
          disabled={locked}
          onClick={() => {
            onPause(!paused);
          }}
        >
          <Glyph name={paused ? 'confirm' : 'time'} />
          {paused ? t('Resume the game') : t('Pause the game')}
        </button>
        <button
          type="button"
          aria-expanded={ending}
          onClick={() => {
            setEnding(!ending);
          }}
        >
          <Glyph name="leave" />
          {t('End the session')}
        </button>
      </div>
      <BreakChoice id={`${ids}-break`} />
      {ending && (
        <CloseEvening
          api={api}
          title={title}
          sessionId={sessionId}
          locked={locked}
          revision={revision}
          locationId={locationId}
          step={step}
          onStep={onStep}
          onKeepPlaying={() => {
            setEnding(false);
          }}
          onClosed={onClosed}
        />
      )}
    </section>
  );
}

/** "Previously…" for the DM to read aloud while the table's screens show it. */
function ReadAloud({
  api,
  revision,
  online,
  onShown,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  readonly online: boolean;
  /** The scene is back on the screens. */
  readonly onShown: () => void;
}) {
  const t = useT();
  const [round, setRound] = useState(0);
  const loadCast = useCallback(
    (signal: AbortSignal) => api.get<CastResponse>('display/cast', signal, false),
    [api],
  );
  const cast = useResource('running-cast', loadCast);
  useRereadOn(revision + round, cast.reread);
  const shown = cast.resource.status === 'ready' && cast.resource.value.cast.kind === 'chronicle';
  // Whether any screen shows it: a paired TV, or every player's own screen online.
  const loadScreens = useCallback(
    (signal: AbortSignal) =>
      shown
        ? api.get<DisplayListResponse>('displays', signal, false).catch(() => null)
        : Promise.resolve(null),
    [api, shown],
  );
  const screens = useResource(`running-screens:${String(shown)}`, loadScreens);
  const paired =
    screens.resource.status === 'ready' && (screens.resource.value?.displays.length ?? 0) > 0;
  const previously = usePreviously(api, shown, revision);
  const [failed, setFailed] = useState(false);
  if (!shown || previously.chapter === null) return null;
  return (
    <Previously
      api={previously.api}
      chapter={previously.chapter}
      heading="h4"
      className="previously--aloud"
    >
      <p className="muted">
        {online || paired
          ? t('The table’s screens show this now. Read it aloud, then show the scene.')
          : t('No screen is paired, so read it aloud from here. Then show the scene.')}
      </p>
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setFailed(false);
            void api
              .post(
                'display/cast',
                { cast: { kind: 'scene', locationId: null } },
                AbortSignal.timeout(20_000),
              )
              .then(onShown, () => {
                setFailed(true);
              })
              .finally(() => {
                setRound((value) => value + 1);
              });
          }}
        >
          <Glyph name="look" />
          {t('Show the scene')}
        </button>
      </div>
      {failed && (
        <p role="alert" className="authoring-notice error">
          {t('The table could not be changed. Try again.')}
        </p>
      )}
    </Previously>
  );
}

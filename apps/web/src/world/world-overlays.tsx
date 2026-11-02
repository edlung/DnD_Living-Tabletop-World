import type { EncounterView, EntityRef, RollEntry } from '@ltw/contracts';
import { useState, type ReactNode } from 'react';

import { TableAsks } from '../alerts/table-asks.tsx';
import type { WorldApi } from '../api/client.ts';
import { ChronicleBook } from '../chronicle/chronicle-book.tsx';
import { RollAnnouncer } from '../dice/announcer.tsx';
import { DiceStage } from '../dice/dice-stage.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { handoutElementId } from '../handouts/handouts.tsx';
import type { Recipient } from '../items/inventory-panel.tsx';
import { ChronicleDialog } from '../shell/chronicle-dialog.tsx';
import { focusOn, type Shell } from '../shell/use-shell.ts';
import { WorldHeroDialog } from './hero-dialog-slot.tsx';

/**
 * What lies over the world screen: the table's questions — the short rest (Stage 530) and the
 * checks asked, with the companion's alerts (ADR 0044 §3) — the Chronicle book, the character
 * dialog and the dice (Stage 510). The action's result and the latest roll in words go where the viewer is — inside the
 * character dialog while it is open (the world behind a modal is out of reach), else in the world.
 */
export function WorldOverlays({
  api,
  shell,
  revision,
  isDm,
  ready,
  directory,
  actorId,
  canAct,
  locked,
  encounter,
  sessionOpen,
  recipients,
  onRun,
  outcome,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly revision: number;
  readonly isDm: boolean;
  /** The world's views have been read (the book needs the directory). */
  readonly ready: boolean;
  readonly directory: readonly EntityRef[];
  readonly actorId: string | null;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly encounter: EncounterView | null;
  /** A play session is open: the screen stays awake (ADR 0044 §3). */
  readonly sessionOpen: boolean;
  readonly recipients: readonly Recipient[];
  readonly onRun: (intent: ExplorationIntent) => void;
  /** The result of the latest action. */
  readonly outcome: ReactNode;
}) {
  const [announced, setAnnounced] = useState<RollEntry | null>(null);
  const announcer = <RollAnnouncer entry={announced} />;
  return (
    <>
      <TableAsks
        api={api}
        isDm={isDm}
        ready={ready}
        actorId={actorId}
        encounter={encounter}
        sessionOpen={sessionOpen}
        locked={locked}
        onRun={onRun}
        onOpenSheet={(characterId) => {
          shell.openHero(characterId, 'overview');
        }}
        onReadHandout={(handoutId) => {
          shell.openSheet('journal');
          // Once the Journal shows, the handout takes focus and so comes into view.
          requestAnimationFrame(() => {
            focusOn(document.getElementById(handoutElementId(handoutId)));
          });
        }}
      />
      {shell.hero === null && (
        <>
          {outcome}
          {announcer}
        </>
      )}
      <ChronicleDialog open={shell.chronicle} onClose={shell.closeChronicle}>
        {ready && (
          <ChronicleBook
            api={api}
            isDm={isDm}
            revision={revision}
            directory={directory}
            open={shell.chronicle}
          />
        )}
      </ChronicleDialog>
      <WorldHeroDialog
        api={api}
        shell={shell}
        revision={revision}
        directory={directory}
        actorId={actorId}
        canAct={canAct}
        locked={locked}
        encounter={encounter}
        recipients={recipients}
        onRun={onRun}
        notice={
          shell.hero === null ? null : (
            <>
              {outcome}
              {announcer}
            </>
          )
        }
      />
      <DiceStage onAnnounce={setAnnounced} />
    </>
  );
}

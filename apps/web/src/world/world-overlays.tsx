import type { EncounterView, EntityRef, RollEntry } from '@ltw/contracts';
import { useState, type ReactNode } from 'react';

import type { WorldApi } from '../api/client.ts';
import { ChronicleBook } from '../chronicle/chronicle-book.tsx';
import { RollAnnouncer } from '../dice/announcer.tsx';
import { DiceStage } from '../dice/dice-stage.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import type { Recipient } from '../items/inventory-panel.tsx';
import { ChronicleDialog } from '../shell/chronicle-dialog.tsx';
import { RestBanner } from '../rest/sheet-rest.tsx';
import { LobbyBanner } from '../session/lobby-banner.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { WorldHeroDialog } from './hero-dialog-slot.tsx';

/**
 * What lies over the world screen: the short rest's banner (Stage 530), the Chronicle book, the
 * character dialog and the dice (Stage 510). The action's result and the latest roll in words go where the viewer is — inside the
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
  readonly recipients: readonly Recipient[];
  readonly onRun: (intent: ExplorationIntent) => void;
  /** The result of the latest action. */
  readonly outcome: ReactNode;
}) {
  const [announced, setAnnounced] = useState<RollEntry | null>(null);
  const announcer = <RollAnnouncer entry={announced} />;
  return (
    <>
      {!isDm && <LobbyBanner api={api} actorId={actorId} />}
      <RestBanner
        isDm={isDm}
        actorId={actorId}
        fighting={encounter !== null}
        locked={locked}
        onRun={onRun}
        onOpenSheet={(characterId) => {
          shell.openHero(characterId, 'overview');
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

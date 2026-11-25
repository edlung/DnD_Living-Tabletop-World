import type { EncounterView, EntityRef, RollEntry } from '@ltw/contracts';
import { useState, type ReactNode } from 'react';

import { TableAsks } from '../alerts/table-asks.tsx';
import type { WorldApi } from '../api/client.ts';
import { TableMusic } from '../audio/table-music.tsx';
import { TableAmbience } from '../audio/table-sound.tsx';
import { ChronicleBook } from '../chronicle/chronicle-book.tsx';
import { useMedia } from '../combat/board/board-view.ts';
import { useBookRequest } from '../shell/book-request.ts';
import { RollAnnouncer } from '../dice/announcer.tsx';
import { DiceStage } from '../dice/dice-stage.tsx';
import { useDiceTable } from '../dice/table.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { handoutElementId } from '../handouts/handouts.tsx';
import { TurnHintButton } from '../hint/turn-hint-button.tsx';
import type { Recipient } from '../items/inventory-panel.tsx';
import { ChronicleDialog } from '../shell/chronicle-dialog.tsx';
import { HeroPlate, PLATE_SCREENS } from '../shell/hero-plate.tsx';
import { focusOn, type Shell } from '../shell/use-shell.ts';
import { WorldHeroDialog } from './hero-dialog-slot.tsx';

/**
 * What lies over the world screen (and, for a player's own hero, the plate it writes into the top
 * bar: docs/adr/0075-book-interface.md §21): the table's questions — the short rest (Stage 530) and the
 * checks asked, with the companion's alerts (ADR 0044 §3) — the Chronicle book, the character
 * dialog, the dice (Stage 510) and, online, the table's sound (ADR 0059 §1). The action's result
 * and the latest roll in words go where the viewer is — inside the character dialog while it is
 * open (the world behind a modal is out of reach), else in the world.
 */
export function WorldOverlays({
  api,
  shell,
  revision,
  isDm,
  ready,
  directory,
  scenePlaceId,
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
  /** The place of the scene being played, as this perspective knows it (the table's sound). */
  readonly scenePlaceId: string | null;
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
  const table = useDiceTable();
  useBookRequest(api.campaignId, shell.openBook);
  // Whom the viewer plays, by the name this view knows: the plate at a phone's head — mounted
  // only there, so no other screen reads the hero's sheet for it.
  const phone = useMedia(PLATE_SCREENS);
  const hero = isDm || actorId === null ? null : directory.find((one) => one.entityId === actorId);
  return (
    <>
      {hero && phone && (
        <HeroPlate
          api={api}
          heroId={hero.entityId}
          name={hero.name}
          revision={revision}
          onOpen={() => {
            shell.openHero(hero.entityId, 'overview');
          }}
        />
      )}
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
        onOpenChronicle={shell.openChronicle}
        onOpenBook={shell.openBook}
        onReadHandout={(handoutId) => {
          shell.openSheet('journal');
          // Once the Journal shows, the handout takes focus and so comes into view.
          requestAnimationFrame(() => {
            focusOn(document.getElementById(handoutElementId(handoutId)));
          });
        }}
        beside={
          !isDm && actorId !== null && sessionOpen ? (
            <TurnHintButton
              api={api}
              actorId={actorId}
              encounter={encounter}
              onWay={(way) => {
                if (way === 'character') shell.openHero(actorId, 'overview');
                else shell.openSheet(way);
              }}
            />
          ) : undefined
        }
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
            wanted={shell.chronicleChapter}
            whole={shell.chronicleWhole}
            onWhole={shell.showWholeBook}
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
      {table?.online && (
        <>
          <TableAmbience
            api={api}
            refresh={revision}
            choice={table.sound?.ambience ?? null}
            placeId={scenePlaceId}
          />
          <TableMusic api={api} music={table.sound?.music ?? null} />
        </>
      )}
    </>
  );
}

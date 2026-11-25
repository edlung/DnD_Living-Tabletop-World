import type { EncounterView, EntityKind, EntityRef, Weather } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect } from 'react';

import type { WorldApi } from '../api/client.ts';
import { AuthoringPanel } from '../authoring/authoring-panel.tsx';
import type { useAuthoring } from '../authoring/use-authoring.ts';
import { BookSheet } from '../book/book-sheet.tsx';
import { SceneRibbon } from '../book/scene-ribbon.tsx';
import { holdBook } from '../book/told.ts';
import { useDmBook } from '../book/use-book.ts';
import { WorkSpread } from '../book/work-spread.tsx';
import { DmCombatControls } from '../combat/dm-controls.tsx';
import { DmTurn } from '../combat/dm-turn.tsx';
import type { StandIn } from '../combat/stand-in.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { ImagesSheet } from '../images/images-sheet.tsx';
import { TroubleList } from '../report/screen-troubles.tsx';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { useScreenRequest } from '../shell/requests.ts';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { DmHistory } from './dm-history.tsx';
import { NotesSheet } from './notes-sheet.tsx';
import { PartySheet } from './party-sheet.tsx';
import { SessionSheet } from './session-sheet.tsx';
import { PlayersSheet } from './players-sheet.tsx';
import { ScreenSheet } from './screen-sheet.tsx';
import { DmHazardControls } from '../rest/dm-hazard-controls.tsx';
import { DmRestControls } from '../rest/dm-rest-controls.tsx';
import { DmWorldControls } from './world-controls.tsx';
import { GiveItemForm } from '../items/give-item-form.tsx';
import { MakeByHand } from './editors/make-by-hand.tsx';

/** What the DM's encounter and clock tools need from the loaded world. */
export interface DmPlace {
  readonly encounter: EncounterView | null;
  readonly locationId: string;
  readonly locationName: string;
}

/**
 * The DM's tools as sheets (docs/STAGE_320_DESIGN.md §5.7), in the DM perspective only: add to
 * the world, the encounter, time and weather, the history with its undo, the images waiting for
 * the DM (docs/STAGE_330_DESIGN.md "DM controls"), and — where the table signs in by invitation
 * — the players (docs/adr/0036-production-sign-in.md §4). Every sheet
 * stays mounted while closed, so a draft, a proposal under review or a pending reason survives
 * closing it and each refresh; the authoring session sits outside the world's loading state, so
 * a commit never discards the screen that made it (ADR 0029 §8).
 */
export function DmSheets({
  api,
  authoring,
  shell,
  directory,
  place,
  revision,
  sessionId,
  locked,
  weather,
  onWeather,
  onRun,
  onActAs,
  onWorldChanged,
  onShowEntity,
}: {
  readonly api: WorldApi;
  /** The DM's authoring session, shared with an NPC card's edit (owner decisions 11, SI-D8). */
  readonly authoring: ReturnType<typeof useAuthoring>;
  readonly shell: Shell;
  readonly directory: readonly EntityRef[];
  /** Null until the world has loaded. */
  readonly place: DmPlace | null;
  readonly revision: number;
  /** The session that plays; null between sessions. */
  readonly sessionId: string | null;
  readonly locked: boolean;
  readonly weather: Weather | null;
  readonly onWeather: (weather: Weather) => void;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onActAs: (standIn: StandIn) => void;
  readonly onWorldChanged: () => void;
  /** Opens an entity's panel (from the Images sheet). */
  readonly onShowEntity: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  // The campaign's book and the DM's place in it (docs/adr/0074-dm-book.md §3).
  const book = useDmBook(api, true);
  // The card of someone chosen on the Scene opens with how the book tells them (`book/told.ts`).
  const { opened } = book;
  useEffect(() => {
    holdBook(opened);
    return () => {
      holdBook(null);
    };
  }, [opened]);
  const shown = authoring.proposal?.proposal.proposalId;
  const invitations = useSignInKind() === 'session';
  // The notice of a screen that broke asks for its list (docs/adr/0073-table-ideas.md §1).
  const { openSheet } = shell;
  useScreenRequest(
    'screen-troubles',
    useCallback(() => {
      openSheet('session');
    }, [openSheet]),
  );
  return (
    <>
      <BookSheet
        api={api}
        shell={shell}
        book={book}
        directory={directory}
        onPlace={(entityId) => {
          onShowEntity(entityId, 'location');
        }}
      />
      <SceneRibbon book={book} shell={shell} placeId={place?.locationId ?? null} />
      {/* The Scene as the spread the game is run from (docs/adr/0075-book-interface.md §16). */}
      <WorkSpread
        api={api}
        shell={shell}
        book={book}
        directory={directory}
        placeId={place?.locationId ?? null}
        fighting={place !== null && place.encounter !== null}
        locked={locked}
        onRun={onRun}
        onEntity={onShowEntity}
      />
      {/* A fight is run from the map: the DM's turn at its foot (ADR 0075 §17). */}
      {place?.encounter && (
        <DmTurn
          api={api}
          encounter={place.encounter}
          covered={shell.sheet !== null}
          locked={locked}
          onRun={onRun}
          onActAs={onActAs}
          onWhole={() => {
            shell.openSheet('encounter');
          }}
        />
      )}
      <Sheet
        id="party"
        title={t('Party (DM)')}
        glyph="party"
        open={shell.sheet === 'party'}
        onClose={shell.closeSheet}
      >
        <PartySheet
          api={api}
          open={shell.sheet === 'party'}
          revision={revision}
          locationId={place?.locationId ?? null}
          sessionId={sessionId}
          directory={directory}
          locked={locked}
          onRun={(command) => {
            onRun({ kind: 'command', command });
          }}
          onOpenSheet={(entityId) => {
            shell.openHero(entityId);
          }}
        />
      </Sheet>
      <Sheet
        id="session"
        title={t('Session (DM)')}
        glyph="chapter"
        open={shell.sheet === 'session'}
        onClose={shell.closeSheet}
      >
        {/* What this table's screens reported when they broke (docs/adr/0073-table-ideas.md §1):
            first, since the notice over the stage sends the DM here for it. */}
        <TroubleList api={api} open={shell.sheet === 'session'} />
        <SessionSheet
          api={api}
          open={shell.sheet === 'session'}
          revision={revision}
          locked={locked}
          onRun={(command) => {
            onRun({ kind: 'command', command });
          }}
          locationId={place?.locationId ?? null}
          onWorldChanged={onWorldChanged}
          onOpenChronicle={(chronicleId) => {
            shell.dismissSheet();
            shell.openChronicle(chronicleId);
          }}
        />
      </Sheet>
      <Sheet
        id="add"
        title={t('Add to the world (DM)')}
        glyph="add-character"
        open={shell.sheet === 'add'}
        onClose={shell.closeSheet}
      >
        <AuthoringPanel
          authoring={authoring}
          directory={directory}
          onShowEntity={(entityId) => {
            shell.dismissSheet();
            onShowEntity(entityId, 'npc');
          }}
        />
        {/* The DM's editors, no AI (docs/adr/0058-campaign-content.md §1). */}
        <MakeByHand
          api={api}
          directory={directory}
          locked={locked}
          onRun={(command) => {
            onRun({ kind: 'command', command });
          }}
        />
      </Sheet>
      <Sheet
        id="encounter"
        title={t('Encounter (DM)')}
        glyph="encounter"
        open={shell.sheet === 'encounter'}
        onClose={shell.closeSheet}
      >
        {place && (
          <DmCombatControls
            key={`dm:${String(revision)}`}
            api={api}
            encounter={place.encounter}
            locationId={place.locationId}
            directory={directory}
            locked={locked}
            onRun={onRun}
            onActAs={onActAs}
            onWorldChanged={onWorldChanged}
          />
        )}
        {/* Treasure at the place, for the party to take (docs/adr/0057-…md §7). */}
        {place && <GiveItemForm api={api} holderId={place.locationId} locked={locked} place />}
      </Sheet>
      <Sheet
        id="time"
        title={t('Time and weather (DM)')}
        glyph="time"
        open={shell.sheet === 'time'}
        onClose={shell.closeSheet}
      >
        {place && (
          <DmWorldControls
            api={api}
            revision={revision}
            locationId={place.locationId}
            locationName={place.locationName}
            locked={locked}
            weather={weather}
            onWeather={onWeather}
            onRun={onRun}
          >
            <DmRestControls locked={locked} fighting={place.encounter !== null} onRun={onRun} />
            <DmHazardControls locked={locked} fighting={place.encounter !== null} onRun={onRun} />
          </DmWorldControls>
        )}
      </Sheet>
      <Sheet
        id="history"
        title={t('History and undo (DM)')}
        glyph="history"
        open={shell.sheet === 'history'}
        onClose={shell.closeSheet}
      >
        <DmHistory
          api={api}
          open={shell.sheet === 'history'}
          directory={directory}
          onWorldChanged={onWorldChanged}
          onAuthoringUndone={(proposalId) => {
            // The review of that proposal shows it undone, as the server now holds it.
            if (proposalId === shown) void authoring.reload();
          }}
        />
      </Sheet>
      <Sheet
        id="notes"
        title={t('Notes (DM)')}
        glyph="bookmark"
        open={shell.sheet === 'notes'}
        onClose={shell.closeSheet}
      >
        <NotesSheet api={api} open={shell.sheet === 'notes'} />
      </Sheet>
      <Sheet
        id="images"
        title={t('Images (DM)')}
        glyph="picture"
        open={shell.sheet === 'images'}
        onClose={shell.closeSheet}
      >
        <ImagesSheet directory={directory} onShow={onShowEntity} />
      </Sheet>
      {invitations && (
        <Sheet
          id="players"
          title={t('Players (DM)')}
          glyph="member"
          open={shell.sheet === 'players'}
          onClose={shell.closeSheet}
        >
          <PlayersSheet
            api={api}
            open={shell.sheet === 'players'}
            directory={directory}
            onWorldChanged={onWorldChanged}
          />
        </Sheet>
      )}
      {invitations && (
        <Sheet
          id="screen"
          title={t('Table screen (DM)')}
          glyph="live"
          open={shell.sheet === 'screen'}
          onClose={shell.closeSheet}
        >
          <ScreenSheet api={api} open={shell.sheet === 'screen'} directory={directory} />
        </Sheet>
      )}
    </>
  );
}

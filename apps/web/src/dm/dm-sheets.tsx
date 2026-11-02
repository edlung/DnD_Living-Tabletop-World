import type { EncounterView, EntityKind, EntityRef, Weather } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import type { WorldApi } from '../api/client.ts';
import { AuthoringPanel } from '../authoring/authoring-panel.tsx';
import type { useAuthoring } from '../authoring/use-authoring.ts';
import { DmCombatControls } from '../combat/dm-controls.tsx';
import type { StandIn } from '../combat/stand-in.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { ImagesSheet } from '../images/images-sheet.tsx';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { DmHistory } from './dm-history.tsx';
import { PlayersSheet } from './players-sheet.tsx';
import { DmRestControls } from '../rest/dm-rest-controls.tsx';
import { DmWorldControls } from './world-controls.tsx';

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
  const shown = authoring.proposal?.proposal.proposalId;
  const invitations = useSignInKind() === 'session';
  return (
    <>
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
          />
        )}
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
          glyph="party"
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
    </>
  );
}

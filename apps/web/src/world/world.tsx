import type { EntityKind, EntityRef, PlayerOutcome, Weather } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useLiveTarget } from '../api/live-context.ts';
import { standInReason, type StandIn } from '../combat/stand-in.ts';
import { useAuthoring } from '../authoring/use-authoring.ts';
import { DmSheets } from '../dm/dm-sheets.tsx';
import { ActionNotice } from '../exploration/action-notice.tsx';
import { useDmImagesState } from '../images/dm-images.ts';
import { WorldPictures } from '../images/world-pictures.tsx';
import { CONVERSATION_PANEL_ID, DialoguePanel } from '../exploration/dialogue-panel.tsx';
import { toldAbout } from '../exploration/outcome-messages.ts';
import {
  useAction,
  type ActionNotice as Notice,
  type ExplorationIntent,
} from '../exploration/use-action.ts';
import { Dock } from '../shell/dock.tsx';
import { focusOn, useEscape, useShell } from '../shell/use-shell.ts';
import { ApprovedImages } from '../visual/approved-images.ts';
import { WIDE } from '../combat/board/board-view.ts';
import { Backdrop } from './backdrop.tsx';
import { CombatStage } from './combat-stage.tsx';
import { DetailPanel } from './detail-panel.tsx';
import { EntityDetails } from './entity-details.tsx';
import { recipientsOf } from '../items/recipients.ts';
import { RulesSheet } from '../rules/rules-sheet.tsx';
import { useFightTakesStage, useReactionStage } from './use-fight-takes-stage.ts';
import { WorldOverlays } from './world-overlays.tsx';
import { DicePanel } from '../dice/dice-panel.tsx';
import { DiceTableProvider, useDiceTableState } from '../dice/table.tsx';
import { revealedIds } from '../exploration/revealed.ts';
import { useConversationNotice, type Conversation } from './use-conversation-notice.ts';
import { JournalSheet } from './journal-sheet.tsx';
import { PartyRail } from './party-rail.tsx';
import { LighthouseFolio, type PlayerBookSeat } from './lighthouse-folio.tsx';
import { PlacesSheet } from './places-sheet.tsx';
import { Scene, SceneStatus } from './scene.tsx';
import { SessionTitle } from './session-title.tsx';
import { UndoneNotice } from './undone-notice.tsx';
import { useScene, useWorldData } from './use-world-data.ts';

interface Selected {
  readonly entityId: string;
  readonly kind: EntityKind;
}

/**
 * The scene, battlefield and reading desk share one perspective, selection and action in flight.
 * Changing perspective remounts the world.
 */
export function World({
  api,
  effectivePerspective,
  playerBook,
  canAct,
  standIn,
  onActAs,
  sessionSlot,
}: {
  readonly api: WorldApi;
  readonly effectivePerspective: string;
  readonly playerBook: PlayerBookSeat | null;
  readonly canAct: boolean;
  /** The DM acting as this perspective's character, after choosing to (ADR 0033 §6). */
  readonly standIn: StandIn | null;
  readonly onActAs: (standIn: StandIn) => void;
  /** The top bar's place for the open play session's title. */
  readonly sessionSlot: HTMLElement | null;
}) {
  const t = useT();
  const [revision, setRevision] = useState(0);
  // The DM's weather choice; null until chosen, so the choice shows the place's weather now.
  const [dmWeather, setDmWeather] = useState<Weather | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  // The last selection: its panel stays mounted while closed, so drafts in it survive.
  const [shown, setShown] = useState<Selected | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [sceneFor, setSceneFor] = useState<string | null>(null);
  const [meetingSlot, setMeetingSlot] = useState<HTMLDivElement | null>(null);
  const [dismissed, setDismissed] = useState<Notice | null>(null);
  const shell = useShell(
    playerBook ? `${playerBook.campaignId}:${effectivePerspective}` : effectivePerspective,
    playerBook ? 'player-book' : null,
  );
  const details = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const acting = effectivePerspective.startsWith('CHARACTER:');
  const isDm = effectivePerspective === 'DM';
  const world = useWorldData(api, acting, revision);
  const data = world.resource.status === 'ready' ? world.resource.value : null;
  const images = useMemo(() => new ApprovedImages(api), [api]);
  useEffect(
    () => () => {
      images.release();
    },
    [images],
  );
  // The DM's image controls (Stage 330): the lineage, read in the DM perspective only.
  const dmImages = useDmImagesState(api, isDm, revision, () => {
    setRevision((value) => value + 1);
  });
  // The DM's authoring session: the Add sheet and an NPC card's edit share it (SI-D8), and it
  // restores the DM's open draft on mount (SI-D1); a lower perspective reads nothing.
  const authoring = useAuthoring(api, isDm, () => {
    setRevision((value) => value + 1);
  });
  const onResolved = useCallback((outcome?: PlayerOutcome) => {
    if (outcome?.kind === 'EnterLocation') {
      // Arrival keeps the place itself as the object in context, so it can be examined.
      setViewing(outcome.locationId);
      setSelected({ entityId: outcome.locationId, kind: 'location' });
      setShown({ entityId: outcome.locationId, kind: 'location' });
      setConversation(null);
    }
    setRevision((value) => value + 1);
  }, []);
  // Players act as their character; the DM alone runs the existing encounter operations, and
  // fights as a player's character only after choosing to, each command with its reason.
  // Read when a question's answer arrives, from the records shown before it was asked.
  const knowledge = data?.knowledge.knowledge ?? [];
  const action = useAction(api, canAct || standIn !== null || isDm, onResolved, (npcId, topicId) =>
    toldAbout(knowledge, npcId, topicId),
  );
  useConversationNotice(action.notice, setConversation);
  const run = (intent: ExplorationIntent) => {
    action.run(
      standIn && intent.kind === 'command'
        ? { ...intent, standIn: standInReason(standIn) }
        : intent,
    );
  };
  const explore = (intent: ExplorationIntent) => {
    if (intent.kind === 'talk') setConversation({ npcId: intent.npcId, line: null });
    action.run(intent);
  };
  const select = (entityId: string, kind: EntityKind) => {
    if (selected === null) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    shell.detailsOpened();
    setSelected({ entityId, kind });
    setShown({ entityId, kind });
  };
  // Opening the selection's panel takes focus there; closing it returns focus where it was.
  const panelOpen = selected !== null;
  useEffect(() => {
    if (panelOpen) details.current?.focus({ preventScroll: true });
  }, [panelOpen]);
  const closeDetails = () => {
    if (!focusOn(opener.current)) document.getElementById('world-main')?.focus();
    setSelected(null);
  };
  // The conversation holds what to say: on a screen where the selection's panel covers the
  // stage it steps aside (staying mounted), and focus goes to the conversation.
  const showConversation = () => {
    if (!window.matchMedia(WIDE).matches) setSelected(null);
    requestAnimationFrame(() => {
      document.getElementById(CONVERSATION_PANEL_ID)?.focus();
    });
  };
  // An NPC card's edit opens under Add; a panel over the sheet steps aside, as for a conversation.
  const showAuthoring = () => {
    if (!window.matchMedia(WIDE).matches) setSelected(null);
    shell.openSheet('add');
  };
  useEscape(() => {
    if (selected && (shell.sheet === null || shell.topmost() === 'details')) {
      closeDetails();
      return true;
    }
    if (shell.sheet !== null) {
      shell.closeSheet();
      return true;
    }
    return false;
  });

  const directory = data?.directory.entities ?? [];
  // The authoring session outlives each refresh, so it keeps the last directory meanwhile.
  const knownDirectory = useRef<readonly EntityRef[]>([]);
  if (data) knownDirectory.current = data.directory.entities;
  const locations = directory.filter((entity) => entity.kind === 'location');
  const current = data?.surroundings?.location;
  // One's own place, else the scene's (the DM's, the party's view), else Ravenford's square.
  const placeId =
    viewing ??
    current?.entityId ??
    data?.directory.scenePlaceId ??
    locations.find((place) => place.entityId === 'market-square')?.entityId ??
    locations[0]?.entityId ??
    '';
  const scene = useScene(api, placeId, revision);
  // The live subscription also covers the selected entity and the viewed place (ADR 0033);
  // while a reload has no place yet, it keeps following the previous one.
  const report = useLiveTarget();
  const focus = selected?.entityId ?? null;
  const settled = data !== null || placeId !== '';
  useEffect(() => {
    if (settled) report(focus, placeId === '' ? null : placeId);
  }, [report, settled, focus, placeId]);
  const knownPlace = locations.find((place) => place.entityId === placeId);
  const location =
    knownPlace ??
    (current?.entityId === placeId
      ? { ...current, name: current.name ?? t('Unidentified location') }
      : null);
  const shownKnown = directory.find((entity) => entity.entityId === shown?.entityId);
  const openSession = data?.sessions.sessions.find((session) => session.endedAt === null);
  const encounter = data?.encounter.encounter ?? null;
  const actorId = data?.surroundings?.actingCharacterId ?? null;
  const heroName = directory.find((entry) => entry.entityId === actorId)?.name ?? t('Character');
  useReactionStage(encounter, actorId, shell, playerBook !== null);
  useFightTakesStage(encounter?.encounterId ?? null, details, () => {
    setSelected(null);
    if (shell.sheet === 'player-book') shell.dismissSheet();
  });
  const battlefield = encounter !== null && sceneFor !== encounter.encounterId;
  const view = scene.resource.status === 'ready' ? scene.resource.value : null;
  const presentIds = useMemo(() => new Set(view?.present.map((entity) => entity.entityId)), [view]);
  const presentOne = (entityId: string) => view?.present.find((one) => one.entityId === entityId);
  const presentImage = (entityId: string) => presentOne(entityId)?.image ?? null;
  const presentFigure = (entityId: string) => presentOne(entityId)?.figure ?? null;
  const fought =
    encounter !== null &&
    view !== null &&
    view.present.some((entity) =>
      encounter.combatants.some((entry) => entry.entity.entityId === entity.entityId),
    );
  const battleMap = fought ? view.location.battleMap : null;
  const discovered = revealedIds(action.notice?.outcome);
  const notice = action.notice === dismissed ? null : action.notice;
  const speaking = conversation !== null && canAct && encounter === null;
  // The line just spoken shows in the conversation in the same render as its result, so the
  // words are announced once, there (the result leaves them out).
  const spoken =
    action.notice?.speech && action.notice.speakerId === conversation?.npcId
      ? action.notice.speech
      : null;

  // The table's dice (Stage 510): the feed, the DM's requests, the rolls this perspective makes.
  const dice = useDiceTableState(api, revision, effectivePerspective, acting ? actorId : null);
  const outcome = (
    <ActionNotice
      notice={notice}
      status={action.status}
      discovered={
        data
          ? data.knowledge.knowledge.filter((record) => discovered.includes(record.knowledgeId))
          : []
      }
      quoteElsewhere={speaking && notice?.speakerId === conversation.npcId}
      onRetry={action.retry}
      onDismiss={() => {
        setDismissed(action.notice);
      }}
    />
  );

  return (
    <DiceTableProvider value={dice}>
      <WorldPictures images={images} dm={isDm ? dmImages : null}>
        <main
          id="world-main"
          className={`world-main${selected ? ' has-details' : ''}${battlefield ? ' has-battle' : ''}`}
          tabIndex={-1}
        >
          <SessionTitle slot={data ? sessionSlot : null} title={openSession?.title} />
          <div
            className={`stage${battlefield ? ' stage--battle' : ''}${speaking ? ' stage--talking' : ''}`}
          >
            <Backdrop image={view?.location.image ?? null} settled={view !== null} />
            {data && location ? (
              <Scene
                location={location}
                scene={scene.resource}
                onRetry={scene.retry}
                directory={directory}
                nearby={data.surroundings?.nearby ?? []}
                selectedId={focus}
                onSelect={select}
                battlefield={battlefield}
                rail={
                  <PartyRail api={api} encounter={encounter} selectedId={focus} onSelect={select} />
                }
                notice={acting && <UndoneNotice api={api} directory={directory} />}
                conversation={
                  speaking && (
                    <DialoguePanel
                      key={conversation.npcId}
                      api={api}
                      npcId={conversation.npcId}
                      revision={revision}
                      line={spoken ?? conversation.line}
                      image={presentImage(conversation.npcId)}
                      directory={directory}
                      knowledge={data.knowledge.knowledge}
                      actorId={data.surroundings?.actingCharacterId ?? ''}
                      canAct={canAct}
                      locked={action.locked}
                      onRun={explore}
                      onLeave={() => {
                        setConversation(null);
                      }}
                    />
                  )
                }
              />
            ) : (
              <SceneStatus
                resource={world.resource}
                settled={data?.asOf === revision}
                onRetry={world.retry}
              />
            )}
            {data && encounter && (
              <CombatStage
                playerField={playerBook ? (location?.name ?? t('Battlefield')) : undefined}
                api={api}
                encounter={encounter}
                revision={revision}
                battlefield={battlefield}
                onView={(chosen) => {
                  setSceneFor(chosen === 'scene' ? encounter.encounterId : null);
                }}
                actorId={actorId}
                canAct={canAct || standIn !== null}
                locked={action.locked}
                blocked={shell.chronicle}
                imageOf={presentImage}
                figureOf={presentFigure}
                battleMap={battleMap}
                onRun={run}
              />
            )}
            {playerBook && actorId && (
              <LighthouseFolio
                api={api}
                shell={shell}
                actorId={actorId}
                name={heroName}
                place={current?.name ?? undefined}
                battlefield={battlefield}
                stageName={location?.name ?? null}
                stageArt={encounter ? battleMap : (view?.location.image ?? null)}
                encounter={encounter}
                revision={revision}
                onMeetingSlot={setMeetingSlot}
                onSelect={select}
                onReturn={() => {
                  setSceneFor(null);
                  setSelected(null);
                  if (encounter) setViewing(null);
                  shell.dismissSheet();
                }}
                onCreated={playerBook.onCreated}
              />
            )}
            <PlacesSheet
              shell={shell}
              placeId={placeId}
              current={location && !knownPlace ? location : null}
              locations={data ? locations : null}
              onView={(id) => {
                setViewing(id);
                setSelected(null);
                setConversation(null);
              }}
              onExplore={(place) => {
                shell.dismissSheet();
                select(place.entityId, place.kind);
              }}
              travel={{ api, revision, isDm, locked: action.locked, onRun: run }}
            />
            <JournalSheet
              api={api}
              shell={shell}
              revision={revision}
              journal={data ? { directory, knowledge: data.knowledge.knowledge, encounter } : null}
              selectedId={focus}
              onSelect={select}
            />
            <DicePanel
              api={api}
              shell={shell}
              characters={directory.filter((entity) => entity.kind === 'character')}
            />
            <RulesSheet shell={shell} isDm={isDm} />
            {isDm && (
              <DmSheets
                api={api}
                authoring={authoring}
                shell={shell}
                directory={data?.directory.entities ?? knownDirectory.current}
                place={
                  data
                    ? {
                        encounter,
                        locationId: placeId,
                        locationName: location?.name ?? t('this place'),
                      }
                    : null
                }
                revision={revision}
                sessionId={openSession?.sessionId ?? null}
                locked={action.locked}
                weather={dmWeather}
                onWeather={setDmWeather}
                onRun={action.run}
                onActAs={onActAs}
                onWorldChanged={() => {
                  setRevision((value) => value + 1);
                }}
                onShowEntity={(entityId, kind) => {
                  shell.dismissSheet();
                  select(entityId, kind);
                }}
              />
            )}
            {(!playerBook || !actorId) && (
              <Dock
                isDm={isDm}
                shell={shell}
                drafts={isDm ? authoring.drafts.length : 0}
                characterId={acting ? actorId : null}
              />
            )}
          </div>
          <WorldOverlays
            meetingSlot={meetingSlot}
            playerBook={playerBook}
            api={api}
            shell={shell}
            revision={revision}
            isDm={isDm}
            ready={data !== null}
            directory={directory}
            scenePlaceId={data?.directory.scenePlaceId ?? null}
            actorId={actorId}
            canAct={canAct || standIn !== null}
            locked={action.locked}
            encounter={encounter}
            sessionOpen={openSession !== undefined}
            recipients={recipientsOf(view, directory, actorId)}
            onRun={run}
            outcome={outcome}
          />
          <DetailPanel
            panelRef={details}
            hidden={!selected}
            contentKey={`${shown?.entityId ?? ''}|${String(revision)}`}
          >
            {shown && data && (
              <EntityDetails
                key={shown.entityId}
                api={api}
                entityId={shown.entityId}
                revision={revision}
                name={shownKnown?.name ?? null}
                kind={shown.kind}
                known={shownKnown !== undefined}
                effectivePerspective={effectivePerspective}
                directory={directory}
                knowledge={data.knowledge.knowledge}
                presentIds={presentIds}
                canAct={canAct && encounter === null}
                locked={action.locked}
                conversing={speaking && conversation.npcId === shown.entityId}
                onShowConversation={showConversation}
                onRun={explore}
                onSelect={select}
                onOpenSheet={() => {
                  shell.openHero(shown.entityId);
                }}
                onClose={closeDetails}
                profileEditing={
                  isDm
                    ? {
                        draftOpen: authoring.proposal?.proposal.status === 'DRAFT',
                        busy: authoring.busy,
                        propose: (summary, commands) => {
                          showAuthoring();
                          return authoring.proposeWritten(summary, commands);
                        },
                        showDraft: showAuthoring,
                      }
                    : null
                }
              />
            )}
          </DetailPanel>
        </main>
      </WorldPictures>
    </DiceTableProvider>
  );
}

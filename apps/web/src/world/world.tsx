import type { EntityKind, EntityRef, PlayerOutcome, Weather } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { WorldApi } from '../api/client.ts';
import { useLiveTarget } from '../api/live-context.ts';
import { ChronicleBook } from '../chronicle/chronicle-book.tsx';
import { askedWindowOf } from '../combat/reaction-prompt.tsx';
import { standInReason, type StandIn } from '../combat/stand-in.ts';
import { useAuthoring } from '../authoring/use-authoring.ts';
import { DmSheets } from '../dm/dm-sheets.tsx';
import { ActionNotice } from '../exploration/action-notice.tsx';
import { useDmImagesState } from '../images/dm-images.ts';
import { WorldPictures } from '../images/world-pictures.tsx';
import { CONVERSATION_PANEL_ID, DialoguePanel } from '../exploration/dialogue-panel.tsx';
import {
  useAction,
  type ActionNotice as Notice,
  type ExplorationIntent,
} from '../exploration/use-action.ts';
import { ChronicleDialog } from '../shell/chronicle-dialog.tsx';
import { Dock } from '../shell/dock.tsx';
import { focusOn, useEscape, useShell } from '../shell/use-shell.ts';
import { ApprovedImages } from '../visual/approved-images.ts';
import { WIDE } from '../combat/board/board-view.ts';
import { Backdrop } from './backdrop.tsx';
import { CombatStage } from './combat-stage.tsx';
import { EntityDetails } from './entity-details.tsx';
import { JournalSheet } from './journal-sheet.tsx';
import { PartyRail } from './party-rail.tsx';
import { PlacesSheet } from './places-sheet.tsx';
import { Scene } from './scene.tsx';
import { useScene, useWorldData } from './use-world-data.ts';

interface Selected {
  readonly entityId: string;
  readonly kind: EntityKind;
}

/** The NPC a player is speaking with, and the last line they spoke in this conversation. */
interface Conversation {
  readonly npcId: string;
  readonly line: string | null;
}

/**
 * The world screen (docs/STAGE_320_DESIGN.md §5): the stage with the scene or the battlefield,
 * the selection's panel at the right, the dock and its sheets, and the Chronicle. It owns the
 * perspective's views, the selection and the one action in flight; everything visual (open
 * sheets, the stage's view) stays in its memory, and a perspective change remounts it.
 */
export function World({
  api,
  effectivePerspective,
  canAct,
  standIn,
  onActAs,
  sessionSlot,
}: {
  readonly api: WorldApi;
  readonly effectivePerspective: string;
  readonly canAct: boolean;
  /** The DM acting as this perspective's character, after choosing to (ADR 0033 §6). */
  readonly standIn: StandIn | null;
  readonly onActAs: (standIn: StandIn) => void;
  /** The top bar's place for the open play session's title. */
  readonly sessionSlot: HTMLElement | null;
}) {
  const t = useT();
  const [revision, setRevision] = useState(0);
  const [dmWeather, setDmWeather] = useState<Weather>('rain');
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  // The last selection: its panel stays mounted while closed, so drafts in it survive.
  const [shown, setShown] = useState<Selected | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [sceneFor, setSceneFor] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Notice | null>(null);
  const shell = useShell();
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
  const action = useAction(api, canAct || standIn !== null || isDm, onResolved);
  // A spoken line belongs to the conversation with whoever spoke it; an NPC who would not
  // talk now leaves no conversation open (no "Keep talking" after a refusal).
  useEffect(() => {
    const notice = action.notice;
    const refused = notice?.talkRefusedBy;
    if (refused) setConversation((current) => (current?.npcId === refused ? null : current));
    const speech = notice?.speech;
    const speaker = notice?.speakerId;
    if (!speech || !speaker) return;
    setConversation((current) =>
      current?.npcId === speaker ? { npcId: speaker, line: speech } : current,
    );
  }, [action.notice]);
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
  // An NPC card's edit opens its proposal under Add; where the panel covers the sheet it steps
  // aside (staying mounted), as for a conversation.
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
  const placeId =
    viewing ??
    current?.entityId ??
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
  // A reaction asked of this viewer comes before reading: an open book closes, keeping its place,
  // and the question takes focus once it has (each window once; the reader may open it again).
  const askedWindow = askedWindowOf(encounter, actorId);
  useEffect(() => {
    if (askedWindow !== null) shell.closeChronicle();
  }, [askedWindow]);
  const battlefield = encounter !== null && sceneFor !== encounter.encounterId;
  const view = scene.resource.status === 'ready' ? scene.resource.value : null;
  const presentImage = (entityId: string) =>
    view?.present.find((entity) => entity.entityId === entityId)?.image ?? null;
  const presentFigure = (entityId: string) =>
    view?.present.find((entity) => entity.entityId === entityId)?.figure ?? null;
  // The battle map is the encounter's place's (ADR 0035 §4): shown while the viewed place is
  // where the fight is — its own presentation lists the combatants standing there.
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

  return (
    <WorldPictures images={images} dm={isDm ? dmImages : null}>
      <main
        id="world-main"
        className={`world-main${selected ? ' has-details' : ''}${battlefield ? ' has-battle' : ''}`}
        tabIndex={-1}
      >
        {sessionSlot &&
          data &&
          createPortal(<span>{openSession?.title ?? t('No open play session')}</span>, sessionSlot)}
        <div
          className={`stage${battlefield ? ' stage--battle' : ''}${speaking ? ' stage--talking' : ''}`}
        >
          <Backdrop image={view?.location.image ?? null} settled={view !== null} />
          {!data ? (
            <div className="stage-status">
              <StatusPanel
                state={world.resource.status === 'error' ? 'error' : 'loading'}
                label={
                  world.resource.status === 'error'
                    ? world.resource.message
                    : t('Gathering your view of the world…')
                }
                onRetry={world.retry}
              />
            </div>
          ) : location ? (
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
            <section className="scene" aria-label={t('Scene')}>
              <div className="stage-status">
                <StatusPanel
                  state={data.asOf === revision ? 'empty' : 'loading'}
                  label={
                    data.asOf === revision
                      ? t('There are no known locations in this perspective yet.')
                      : t('Loading the scene…')
                  }
                />
              </div>
            </section>
          )}
          {data && encounter && (
            <CombatStage
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
          />
          <JournalSheet
            api={api}
            shell={shell}
            revision={revision}
            journal={data ? { directory, knowledge: data.knowledge.knowledge, encounter } : null}
            selectedId={focus}
            onSelect={select}
          />
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
          <Dock isDm={isDm} shell={shell} />
        </div>
        {/* The result of an action sits above every sheet and panel, so its words and its Retry
            are never covered by the tool that caused it. */}
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
        <aside
          ref={details}
          className="detail-panel"
          aria-label={t('Entity details')}
          tabIndex={-1}
          hidden={!selected}
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
              canAct={canAct && encounter === null}
              locked={action.locked}
              conversing={speaking && conversation.npcId === shown.entityId}
              onShowConversation={showConversation}
              onRun={explore}
              onSelect={select}
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
        </aside>
        <ChronicleDialog open={shell.chronicle} onClose={shell.closeChronicle}>
          {data && (
            <ChronicleBook
              api={api}
              isDm={isDm}
              revision={revision}
              directory={directory}
              open={shell.chronicle}
            />
          )}
        </ChronicleDialog>
      </main>
    </WorldPictures>
  );
}

function revealedIds(outcome: PlayerOutcome | undefined): readonly string[] {
  switch (outcome?.kind) {
    case 'AskAbout':
      return outcome.shared;
    case 'ExamineEntity':
    case 'CastSpell':
      return outcome.discovered;
    case 'InsightCheck':
      return outcome.inferred;
    case 'FormHypothesis':
      return [outcome.knowledgeId];
    default:
      return [];
  }
}

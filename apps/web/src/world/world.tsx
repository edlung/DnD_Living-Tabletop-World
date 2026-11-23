import type { EntityKind, EntityRef, PlayerOutcome, Weather } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useLiveTarget } from '../api/live-context.ts';
import { askedWindowOf } from '../combat/reaction-prompt.tsx';
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
import { WorldBookParts } from '../shell/book-parts.tsx';
import { SheetSurfaceContext } from '../shell/sheet.tsx';
import { focusOn, useEscape, useShell } from '../shell/use-shell.ts';
import { ApprovedImages } from '../visual/approved-images.ts';
import { WIDE } from '../combat/board/board-view.ts';
import { Backdrop } from './backdrop.tsx';
import { CombatStage } from './combat-stage.tsx';
import { DetailPanel } from './detail-panel.tsx';
import { EntityDetails } from './entity-details.tsx';
import { recipientsOf } from '../items/recipients.ts';
import { RulesSheet } from '../rules/rules-sheet.tsx';
import { useFightTakesStage } from './use-fight-takes-stage.ts';
import { WorldOverlays } from './world-overlays.tsx';
import { DicePanel } from '../dice/dice-panel.tsx';
import { DiceTableProvider, useDiceTableState } from '../dice/table.tsx';
import { revealedIds } from '../exploration/revealed.ts';
import { useConversationNotice, type Conversation } from './use-conversation-notice.ts';
import { JournalSheet } from './journal-sheet.tsx';
import { PartyRail } from './party-rail.tsx';
import { PlacesSheet } from './places-sheet.tsx';
import { Scene } from './scene.tsx';
import { spreadShown } from './scene-spread.ts';
import { SessionTitle } from './session-title.tsx';
import { UndoneNotice } from './undone-notice.tsx';
import { useScene, useWorldData } from './use-world-data.ts';

interface Selected {
  readonly entityId: string;
  readonly kind: EntityKind;
}

/**
 * The world screen (docs/STAGE_320_DESIGN.md §5, docs/adr/0075-book-interface.md §3–§4): the
 * stage, the selection's panel, the book's parts and pages, the Chronicle. It owns the views, the
 * selection and the action in flight; what is visual stays in its memory.
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
  // The DM's weather choice; null until chosen, so the choice shows the place's weather now.
  const [dmWeather, setDmWeather] = useState<Weather | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  // The last selection: its panel stays mounted while closed, so drafts in it survive.
  const [shown, setShown] = useState<Selected | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [sceneFor, setSceneFor] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Notice | null>(null);
  const shell = useShell(effectivePerspective);
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
  // The DM's authoring session (SI-D8), restoring an open draft on mount (SI-D1).
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
  // Players act as their character; the DM runs fights and acts as one by choice (ADR 0033 §6).
  // Answers are read against the records shown before asking.
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
  // A conversation moves a covering panel aside (mounted; not a column or the spread's card).
  const showConversation = () => {
    if (!window.matchMedia(WIDE).matches && !spreadShown()) setSelected(null);
    requestAnimationFrame(() => {
      document.getElementById(CONVERSATION_PANEL_ID)?.focus();
    });
  };
  // An NPC card's edit opens under Add; a panel over the sheet steps aside, as for a conversation.
  const showAuthoring = () => {
    if (!window.matchMedia(WIDE).matches && !spreadShown()) setSelected(null);
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
  // Authoring and an open hero's sheet outlive a refresh: they keep the last directory meanwhile.
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
  // Live updates follow the selection and the viewed place, or the last one while it reloads.
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
  // A reaction asked of this viewer comes first; an open book or page steps aside, its place kept.
  const askedWindow = askedWindowOf(encounter, actorId);
  useEffect(() => {
    if (askedWindow === null) return;
    shell.closeChronicle();
    shell.closeHero();
    shell.dismissSheet();
  }, [askedWindow]);
  useFightTakesStage(encounter?.encounterId ?? null, details, () => {
    setSelected(null);
  });
  const battlefield = encounter !== null && sceneFor !== encounter.encounterId;
  const view = scene.resource.status === 'ready' ? scene.resource.value : null;
  const presentIds = useMemo(() => new Set(view?.present.map((entity) => entity.entityId)), [view]);
  const presentOne = (entityId: string) => view?.present.find((one) => one.entityId === entityId);
  const presentImage = (entityId: string) => presentOne(entityId)?.image ?? null;
  const presentFigure = (entityId: string) => presentOne(entityId)?.figure ?? null;
  // The battle map is the fight's place's (ADR 0035 §4), shown while that place is viewed.
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
  // The line just spoken shows in the conversation with its result: announced once, there.
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
          data-book={isDm ? 'dm' : 'hero'}
          tabIndex={-1}
        >
          <SheetSurfaceContext.Provider value="paper">
            <SessionTitle slot={data ? sessionSlot : null} title={openSession?.title} />
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
                    <PartyRail
                      api={api}
                      encounter={encounter}
                      selectedId={focus}
                      onSelect={select}
                    />
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
                travel={{ api, revision, isDm, locked: action.locked, onRun: run }}
              />
              <JournalSheet
                api={api}
                shell={shell}
                revision={revision}
                journal={
                  data ? { directory, knowledge: data.knowledge.knowledge, encounter } : null
                }
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
              <WorldBookParts
                shell={shell}
                isDm={isDm}
                drafts={isDm ? authoring.drafts.length : 0}
                hero={acting ? actorId : null}
              />
            </div>
            <WorldOverlays
              api={api}
              shell={shell}
              revision={revision}
              isDm={isDm}
              ready={data !== null}
              directory={data?.directory.entities ?? knownDirectory.current}
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
              battlefield={battlefield}
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
          </SheetSurfaceContext.Provider>
        </main>
      </WorldPictures>
    </DiceTableProvider>
  );
}

import {
  DM_HISTORY_PAGE_SIZE,
  PLAYER_COMMAND_TYPES,
  type DmHistoryEntry,
  type DmHistoryResponse,
  type DmUndoAvailability,
  type DmUndoBlocker,
  type DmWorldEntry,
  type EntityRef,
  type KernelCommandOf,
  type PlayerCommandType,
} from '@ltw/contracts';
import {
  previewUndo,
  type Actor,
  type CampaignSnapshot,
  type RecordedEvent,
  type StoredCommand,
  type UndoPreview,
  type WorldEngine,
} from '@ltw/domain';
import type { FastifyBaseLogger } from 'fastify';

import { httpCommandId } from '../http/routes/command-routes.ts';
import { handChange, isHandCommand } from './hand-history.ts';
import type { SubstitutionRecord, SubstitutionStore } from './substitution-store.ts';

/**
 * The DM history (docs/adr/0033-live-session.md §7; docs/STAGE_310_DESIGN.md §C): authoring
 * commits, the player commands the DM issued for a character that had a player when it was
 * decided, and the world-time and weather changes the DM made at the table, newest first.
 * Everything comes from durable data: the stored commands (issuer, command, summary), canonical
 * state (undone or not, the roster's history, the recorded time and weather change) and the
 * DM's recorded reasons. Whether undo is possible is the World Engine's own decision of
 * `UndoCommand` against the snapshot, made dry by `previewUndo`; nothing is committed.
 *
 * Both are memoized per campaign history (the snapshot's frozen event list, which every append
 * replaces), so the live signal's once-a-second comparison of the DM's view recomputes nothing
 * until something happened.
 *
 * A dry decision that throws is that entry's alone: the entry is answered as not possible
 * (`UNDO_NOT_SUPPORTED`, as the engine could not undo it either) and logged by command ID, type
 * and error name, never the message, which may name world content. It never fails the page
 * (a 500) or the DM's live stream, which fingerprints this page (`gone`). Likewise a time or
 * weather command whose recorded event is not its change is left out of the page and logged
 * by command ID and type (`dm history change not recorded`).
 */
type Listed =
  | {
      readonly kind: 'authoring';
      readonly stored: StoredCommand;
      readonly proposalId: string;
      readonly summary: string;
    }
  | { readonly kind: 'substitution'; readonly stored: StoredCommand; readonly characterId: string }
  | { readonly kind: 'world'; readonly stored: StoredCommand }
  | { readonly kind: 'hand'; readonly stored: StoredCommand };

/** A dry decision that threw: the error's name only. */
interface Undecided {
  readonly threw: string;
}

/** Where a page reports an entry whose undo could not be decided. */
export type HistoryLog = Pick<FastifyBaseLogger, 'warn'>;

const PLAYER_TYPES: ReadonlySet<string> = new Set(PLAYER_COMMAND_TYPES);
/** The DM's "Time and weather" commands (owner decision SI-D4, 2026-10-28). */
const WORLD_TYPES: ReadonlySet<string> = new Set(['AdvanceWorldTime', 'SetWeather']);
/** The listed entries and every stored command by ID (a blocker's issuer and submission). */
interface Logged {
  readonly listed: readonly Listed[];
  readonly byId: ReadonlyMap<string, StoredCommand>;
}
const listedMemo = new WeakMap<readonly RecordedEvent[], Promise<Logged>>();
const previewMemo = new WeakMap<readonly RecordedEvent[], Map<string, UndoPreview | Undecided>>();

export async function dmHistoryPage(
  engine: WorldEngine,
  substitutions: SubstitutionStore,
  snapshot: CampaignSnapshot,
  actor: Actor,
  campaignId: string,
  before: number | undefined,
  log: HistoryLog,
): Promise<DmHistoryResponse> {
  const { listed, byId } = await listedCommands(engine, snapshot, campaignId);
  const older =
    before === undefined ? listed : listed.filter((item) => item.stored.firstSequence < before);
  const page = older.slice(0, DM_HISTORY_PAGE_SIZE);
  const reasons = await substitutions.forCommands(
    campaignId,
    page.filter((item) => item.kind === 'substitution').map((item) => item.stored.commandId),
  );
  return {
    perspective: 'DM',
    entries: page.flatMap((item) => {
      const entry = entryOf(item, snapshot, actor, campaignId, reasons, byId, log);
      return entry === null ? [] : [entry];
    }),
    nextBefore: older.length > page.length ? (page.at(-1)?.stored.firstSequence ?? null) : null,
  };
}

function listedCommands(
  engine: WorldEngine,
  snapshot: CampaignSnapshot,
  campaignId: string,
): Promise<Logged> {
  const known = listedMemo.get(snapshot.history);
  if (known) return known;
  const computed = engine.commandLog(campaignId).then((log) => ({
    listed: listFrom(snapshot, log),
    byId: new Map(log.map((stored) => [stored.commandId, stored])),
  }));
  listedMemo.set(snapshot.history, computed);
  // A failed read is never remembered.
  computed.catch(() => listedMemo.delete(snapshot.history));
  return computed;
}

function listFrom(snapshot: CampaignSnapshot, log: readonly StoredCommand[]): Listed[] {
  const { state } = snapshot;
  const dm = state.campaign?.dmActorId;
  const hadPlayer = assignedBetween(snapshot);
  const listed: Listed[] = [];
  for (const stored of log) {
    // The log may already hold a command this snapshot predates.
    if (stored.firstSequence > state.version) continue;
    const { command } = stored;
    if (command.type === 'ApplyAuthoring') {
      const { proposalId, summary } = command;
      listed.push({ kind: 'authoring', stored, proposalId, summary });
      continue;
    }
    if (stored.actor.kind !== 'user' || stored.actor.actorId !== dm) continue;
    if (WORLD_TYPES.has(stored.commandType)) {
      // At the table, through the commands route: the seed's setup clock is not a DM's change.
      if (stored.commandId.startsWith(httpCommandId(dm, ''))) {
        listed.push({ kind: 'world', stored });
      }
      continue;
    }
    // The DM's hand (ADR 0043 §1), at the table too.
    if (isHandCommand(stored)) {
      if (stored.commandId.startsWith(httpCommandId(dm, ''))) listed.push({ kind: 'hand', stored });
      continue;
    }
    if (!PLAYER_TYPES.has(stored.commandType)) continue;
    // At the table only, as for time and weather: a seed's set-up (the bow Elowen starts with in
    // hand, Stage 520) is not the DM acting for a player.
    if (!stored.commandId.startsWith(httpCommandId(dm, ''))) continue;
    const characterId = actingCharacter(stored);
    if (characterId !== null && hadPlayer(characterId, stored.firstSequence)) {
      listed.push({ kind: 'substitution', stored, characterId });
    }
  }
  return listed.reverse();
}

/** The character a player command acts for, as authorization reads it. */
export function actingCharacter(stored: StoredCommand): string | null {
  const { command } = stored;
  if ('characterId' in command && typeof command.characterId === 'string') {
    return command.characterId;
  }
  if ('combatantId' in command && typeof command.combatantId === 'string') {
    return command.combatantId;
  }
  return null;
}

/**
 * Whether a character had a controlling player at a sequence: assigned before it, and that
 * assignment not undone before it, nor released (ADR 0036 §4) in between unless that release
 * was itself undone by then.
 */
function assignedBetween(snapshot: CampaignSnapshot) {
  const { state, history } = snapshot;
  const endOf = (commandId: string) => {
    const undoneBy = state.commands.get(commandId)?.undoneBy ?? null;
    return undoneBy === null
      ? Number.POSITIVE_INFINITY
      : (state.commands.get(undoneBy)?.firstSequence ?? Number.POSITIVE_INFINITY);
  };
  const spans = new Map<string, { from: number; to: number }[]>();
  for (const event of history) {
    if (event.type === 'CharacterReleased') {
      const list = spans.get(event.payload.characterId) ?? [];
      const held = list.find((span) => span.from < event.sequence && event.sequence < span.to);
      if (!held) continue;
      const restoredAt = endOf(event.causation.commandId);
      if (restoredAt < held.to) list.push({ from: restoredAt, to: held.to });
      held.to = event.sequence;
      continue;
    }
    if (event.type !== 'CharacterAssigned') continue;
    const list = spans.get(event.payload.characterId) ?? [];
    list.push({ from: event.sequence, to: endOf(event.causation.commandId) });
    spans.set(event.payload.characterId, list);
  }
  return (characterId: string, sequence: number) =>
    (spans.get(characterId) ?? []).some((span) => span.from < sequence && sequence < span.to);
}

function entryOf(
  item: Listed,
  snapshot: CampaignSnapshot,
  actor: Actor,
  campaignId: string,
  reasons: ReadonlyMap<string, SubstitutionRecord>,
  byId: ReadonlyMap<string, StoredCommand>,
  log: HistoryLog,
): DmHistoryEntry | null {
  const { stored } = item;
  const undoneBy = snapshot.state.commands.get(stored.commandId)?.undoneBy ?? null;
  const common = {
    commandId: stored.commandId,
    sequence: stored.firstSequence,
    worldTime: snapshot.history[stored.firstSequence - 1]?.worldTime ?? snapshot.state.clock,
    recordedAt: stored.recordedAt,
    status: undoneBy === null ? ('COMMITTED' as const) : ('UNDONE' as const),
    undo: undoneBy === null ? availability(snapshot, actor, campaignId, stored, byId, log) : null,
  };
  if (item.kind === 'authoring') {
    return { ...common, kind: 'authoring', proposalId: item.proposalId, summary: item.summary };
  }
  if (item.kind === 'hand') {
    const hand = handChange(snapshot, stored);
    if (hand === null) {
      log.warn(
        { commandId: stored.commandId, commandType: stored.commandType },
        'dm history change not recorded',
      );
      return null;
    }
    return { ...common, kind: 'hand', ...hand };
  }
  if (item.kind === 'world') {
    const change = worldChange(snapshot, stored);
    if (change === null) {
      log.warn(
        { commandId: stored.commandId, commandType: stored.commandType },
        'dm history change not recorded',
      );
      return null;
    }
    return { ...common, kind: 'world', change };
  }
  const { characterId } = item;
  const recorded = reasons.get(stored.commandId);
  return {
    ...common,
    kind: 'substitution',
    character: characterRef(snapshot, characterId),
    command: submitted(stored),
    // A reason describes the command only if it was recorded for the same character.
    reason:
      recorded?.characterId === characterId
        ? { reason: recorded.reason, note: recorded.note }
        : null,
  };
}

function availability(
  snapshot: CampaignSnapshot,
  actor: Actor,
  campaignId: string,
  stored: StoredCommand,
  byId: ReadonlyMap<string, StoredCommand>,
  log: HistoryLog,
): DmUndoAvailability {
  const memo = previewMemo.get(snapshot.history) ?? new Map<string, UndoPreview | Undecided>();
  previewMemo.set(snapshot.history, memo);
  const key = `${actor.actorId}\u0000${stored.commandId}`;
  const preview = memo.get(key) ?? decided(snapshot, actor, campaignId, stored.commandId);
  memo.set(key, preview);
  if ('threw' in preview) {
    // Logged on every page served: the silent fingerprint twin may have decided it first.
    log.warn(
      { err: preview.threw, commandId: stored.commandId, commandType: stored.commandType },
      'dm history undo not decided',
    );
    return { possible: false, code: 'UNDO_NOT_SUPPORTED', blockers: [] };
  }
  return preview.undoable
    ? { possible: true }
    : {
        possible: false,
        code: preview.code,
        blockers: preview.blockers.map(({ commandId: id, commandType, sequence }) => {
          const player = playersAction(snapshot, byId.get(id));
          return { commandId: id, commandType, sequence, ...(player ? { player } : {}) };
        }),
      };
}

/**
 * A blocker that is a player's own action: a player command a player issued (not the DM, who
 * also issues player commands when acting for a character) for a character that player still
 * plays. The DM is asked to confirm before undoing it, and its player is told afterwards
 * (`http/routes/undone-routes.ts`); an action of a released character is a plain step, with
 * no promise of a notice no one would receive.
 */
function playersAction(
  snapshot: CampaignSnapshot,
  stored: StoredCommand | undefined,
): DmUndoBlocker['player'] | null {
  if (!stored || stored.actor.kind !== 'user') return null;
  if (stored.actor.actorId === snapshot.state.campaign?.dmActorId) return null;
  if (!PLAYER_TYPES.has(stored.commandType)) return null;
  const characterId = actingCharacter(stored);
  if (characterId === null) return null;
  // Only while the issuer still plays the character: then, and only then, is that player told.
  if (snapshot.state.roster.get(characterId) !== stored.actor.actorId) return null;
  return { character: characterRef(snapshot, characterId), command: submitted(stored) };
}

/** The engine's dry decision of the undo; one that throws is recorded, never rethrown. */
function decided(
  snapshot: CampaignSnapshot,
  actor: Actor,
  campaignId: string,
  commandId: string,
): UndoPreview | Undecided {
  try {
    return previewUndo(snapshot, actor, campaignId, commandId);
  } catch (error) {
    return { threw: error instanceof Error ? error.name : 'unknown' };
  }
}

/**
 * What the time or weather command changed, from the event the World Engine recorded; null if
 * that event is not one (never for an accepted command: the caller skips and logs it).
 */
function worldChange(
  snapshot: CampaignSnapshot,
  stored: StoredCommand,
): DmWorldEntry['change'] | null {
  const event = snapshot.history[stored.firstSequence - 1];
  if (event?.type === 'WorldTimeAdvanced') {
    return { kind: 'time', from: event.payload.from, to: event.payload.to };
  }
  if (event?.type === 'WeatherSet') {
    const { locationId, from, to } = event.payload;
    return { kind: 'weather', location: entityRef(snapshot, locationId, 'location'), from, to };
  }
  return null;
}

function characterRef(snapshot: CampaignSnapshot, characterId: string): EntityRef {
  return entityRef(snapshot, characterId, 'character');
}

function entityRef(
  snapshot: CampaignSnapshot,
  entityId: string,
  kind: EntityRef['kind'],
): EntityRef {
  const entity = snapshot.state.entities.get(entityId);
  return entity
    ? { entityId: entity.entityId, kind: entity.kind, name: entity.name }
    : { entityId, kind, name: entityId };
}

/** The player command as submitted: the engine's recorded draws stay server-side. */
export function submitted(stored: StoredCommand): KernelCommandOf<PlayerCommandType> {
  return Object.fromEntries(
    Object.entries(stored.command).filter(([key]) => key !== 'resolution'),
  ) as KernelCommandOf<PlayerCommandType>;
}

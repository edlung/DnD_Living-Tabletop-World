import {
  EMPTY_WORLD_STATE,
  InMemoryEventStore,
  evolve,
  parseRecordedEvent,
  parseStoredCommand,
  perceivedEntityIds,
  type RecordedEvent,
  type StoredCommand,
  type WorldState,
} from '@ltw/domain';

import { CAMPAIGN, roadWorld, type RoadWorld } from './road.ts';

/**
 * Test support: a campaign history written by an earlier revision
 * (fixtures/history, Gate 03 retest 2, G03-H05). Its rows are exactly what
 * that revision's PostgreSQL store wrote; they are read here the way the
 * current store reads rows (apps/server/src/world-engine/postgres-event-store.ts),
 * so loading them puts genuine old events through the current parser.
 */
export interface EventRow {
  readonly stream_id: string;
  readonly sequence: number;
  readonly event_id: string;
  readonly event_type: string;
  readonly schema_version: number;
  readonly payload: unknown;
  readonly world_time: number;
  readonly recorded_at: string;
  readonly command_id: string;
  readonly command_type: string;
  readonly actor: unknown;
}

export interface CommandRow {
  readonly command_id: string;
  readonly stream_id: string;
  readonly command_type: string;
  readonly actor: unknown;
  readonly fingerprint: string;
  readonly command: unknown;
  readonly reason: string | null;
  readonly first_sequence: number;
  readonly last_sequence: number;
  readonly recorded_at: string;
}

export interface HistoryFixture {
  readonly writer: { readonly revision: string };
  readonly campaignId: string;
  /** Scenario steps by name, to the command IDs the writer recorded. */
  readonly labels: Readonly<Record<string, string>>;
  readonly stream: { readonly stream_id: string; readonly version: number };
  readonly commands: readonly CommandRow[];
  readonly events: readonly EventRow[];
}

/** The retest 1 writer (revision 88d8137): Detect Magic's `placement` premises. */
export const RETEST_1_HISTORY = '88d8137-gate03-retest1';

export async function loadHistory(name: string): Promise<HistoryFixture> {
  const module = (await import(`../../../../fixtures/history/${name}.json`, {
    with: { type: 'json' },
  })) as { default: HistoryFixture };
  return module.default;
}

export const eventFromRow = (row: EventRow): RecordedEvent =>
  parseRecordedEvent({
    campaignId: row.stream_id,
    sequence: row.sequence,
    eventId: row.event_id,
    schemaVersion: row.schema_version,
    worldTime: row.world_time,
    recordedAt: new Date(row.recorded_at).toISOString(),
    causation: { commandId: row.command_id, commandType: row.command_type, actor: row.actor },
    type: row.event_type,
    payload: row.payload,
  });

export const commandFromRow = (row: CommandRow): StoredCommand =>
  parseStoredCommand({
    commandId: row.command_id,
    campaignId: row.stream_id,
    commandType: row.command_type,
    actor: row.actor,
    fingerprint: row.fingerprint,
    command: row.command,
    reason: row.reason,
    firstSequence: row.first_sequence,
    lastSequence: row.last_sequence,
    recordedAt: new Date(row.recorded_at).toISOString(),
  });

/** A world whose stored history is the fixture's, continued by the current engine. */
export async function historicalWorld(fixture: HistoryFixture, namespace = 7): Promise<RoadWorld> {
  const events = fixture.events.map(eventFromRow);
  const store = new InMemoryEventStore();
  for (const row of fixture.commands) {
    const command = commandFromRow(row);
    await store.append({
      campaignId: CAMPAIGN,
      expectedVersion: command.firstSequence - 1,
      command,
      events: events.slice(command.firstSequence - 1, command.lastSequence),
    });
  }
  return roadWorld({ shared: { store, namespace } });
}

/** Commands still effective after `commandId`, newest first: the explicit reverse order. */
export function effectiveAfter(state: WorldState, commandId: string): string[] {
  const target = state.commands.get(commandId);
  if (!target) throw new Error(`no command ${commandId}`);
  return [...state.commands.values()]
    .filter((c) => c.firstSequence > target.lastSequence)
    .filter((c) => c.commandType !== 'UndoCommand' && c.undoneBy === null)
    .sort((a, b) => b.firstSequence - a.firstSequence)
    .map((c) => c.commandId);
}

/**
 * Current canon just before `commandId`: the events of the commands still
 * effective, in order (undone commands and their compensations left out), as
 * the re-decision oracle folds them.
 */
export async function canonBefore(world: RoadWorld, commandId: string): Promise<WorldState> {
  const state = await world.state();
  const command = state.commands.get(commandId);
  if (!command) throw new Error(`no command ${commandId}`);
  let canon = EMPTY_WORLD_STATE;
  for (const event of (await world.store.loadStream(CAMPAIGN))?.events ?? []) {
    if (event.sequence >= command.firstSequence) break;
    if (event.type === 'CommandUndone') continue;
    if (state.commands.get(event.causation.commandId)?.undoneBy) continue;
    canon = evolve(canon, { ...event, sequence: canon.version + 1 });
  }
  return canon;
}

/**
 * The legality an outside-combat spell had under the rules that decided it
 * (revision 88d8137 and since): its caster alive, its target alive and
 * perceived by the caster (G03-H07). Checked in current canon, where it must
 * still hold while the cast stands.
 */
export async function outsideCastLegal(
  world: RoadWorld,
  castCommandId: string,
  casterId: string,
  targetId: string,
): Promise<boolean> {
  const canon = await canonBefore(world, castCommandId);
  const alive = (id: string) => canon.entities.get(id)?.status === 'active';
  return alive(casterId) && alive(targetId) && perceivedEntityIds(canon, casterId).has(targetId);
}

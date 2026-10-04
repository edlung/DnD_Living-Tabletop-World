import {
  InMemoryEventStore,
  parseRecordedEvent,
  parseStoredCommand,
  type RecordedEvent,
  type StoredCommand,
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

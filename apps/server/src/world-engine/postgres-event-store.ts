import {
  CommandIdConflictError,
  StreamVersionConflictError,
  parseRecordedEvent,
  parseStoredCommand,
  type AppendBatch,
  type EventStore,
  type RecordedEvent,
  type StoredCommand,
  type StreamSlice,
} from '@ltw/domain';
import type pg from 'pg';

/**
 * PostgreSQL implementation of the World Engine's EventStore
 * (migration 0001_world_event_store.sql, docs/adr/0007-world-kernel-model-and-event-store.md).
 * Appends are atomic with an optimistic stream-version check; every row is
 * validated against the domain schemas when loaded.
 */
interface EventRow {
  stream_id: string;
  sequence: string;
  event_id: string;
  event_type: string;
  schema_version: number;
  payload: unknown;
  world_time: string;
  recorded_at: Date;
  command_id: string;
  command_type: string;
  actor: unknown;
}

interface CommandRow {
  command_id: string;
  stream_id: string;
  command_type: string;
  actor: unknown;
  fingerprint: string;
  command: unknown;
  reason: string | null;
  first_sequence: string;
  last_sequence: string;
  recorded_at: Date;
}

const EVENT_COLUMNS = `stream_id, sequence, event_id, event_type, schema_version, payload,
  world_time, recorded_at, command_id, command_type, actor`;
const COMMAND_COLUMNS = `command_id, stream_id, command_type, actor, fingerprint, command,
  reason, first_sequence, last_sequence, recorded_at`;

/** Events per query when readiness reads every stored event (`assertReadable`). */
export const HISTORY_PAGE_SIZE = 500;

/** How much stored history `assertReadable` parses beneath the stream heads. */
type HistoryScope = 'shapes' | 'events';

/** An event's key, where the next page of every event starts after. */
interface EventKey {
  readonly streamId: string;
  readonly sequence: string;
}

export class PostgresEventStore implements EventStore {
  readonly #pool: pg.Pool;
  readonly #historyRead = new Set<HistoryScope>();
  readonly #historyReading = new Map<HistoryScope, Promise<void>>();

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  /**
   * Readiness (docs/adr/0037-deployment.md §3): can this build read the store? Every call parses
   * the newest event of every stream, which each stream head must have. Until a call succeeds,
   * the history beneath is parsed with this build's schemas too: normally one stored event of
   * every (type, schema version), which is cheap; with `everyEvent` (the deployment's rollback
   * step) every stored event, page by page, because a newer build may have loosened a payload
   * schema without a new version (ADR 0007 allows it) and this build's strict schemas refuse what
   * it wrote anywhere in a stream. Concurrent calls share one read of the history, which goes on
   * when a caller stops waiting (the probe's bound), so a long read completes across probes.
   * Throws when anything cannot be read, naming the event.
   */
  async assertReadable(
    options: { readonly everyEvent?: boolean; readonly pageSize?: number } = {},
  ): Promise<void> {
    await this.#readHistory(
      options.everyEvent === true ? 'events' : 'shapes',
      options.pageSize ?? HISTORY_PAGE_SIZE,
    );
    // One statement, one snapshot: every head with its event, if it has one.
    const { rows } = await this.#pool.query<EventRow & { found: boolean }>(
      `SELECT e.*, e.event_id IS NOT NULL AS found
         FROM ltw_event_streams h
         LEFT JOIN ltw_events e ON e.stream_id = h.stream_id AND e.sequence = h.version`,
    );
    for (const row of rows) {
      if (!row.found) throw new Error('a stream head has no event');
      readableEvent(row);
    }
  }

  async #readHistory(scope: HistoryScope, pageSize: number): Promise<void> {
    if (this.#historyRead.has('events') || this.#historyRead.has(scope)) return;
    let reading = this.#historyReading.get(scope);
    if (reading === undefined) {
      reading = (scope === 'events' ? this.#parseEveryEvent(pageSize) : this.#parseEveryShape())
        .then(() => {
          this.#historyRead.add(scope);
        })
        .finally(() => {
          this.#historyReading.delete(scope);
        });
      this.#historyReading.set(scope, reading);
    }
    await reading;
  }

  async #parseEveryShape(): Promise<void> {
    const { rows } = await this.#pool.query<EventRow>(
      `SELECT DISTINCT ON (event_type, schema_version) ${EVENT_COLUMNS} FROM ltw_events
        ORDER BY event_type, schema_version, stream_id, sequence`,
    );
    rows.forEach(readableEvent);
  }

  /** Every stored event in key order, `pageSize` rows per query (the primary key's order). */
  async #parseEveryEvent(pageSize: number): Promise<void> {
    let after: EventKey | null = null;
    for (;;) {
      const page = await this.#eventPage(after, pageSize);
      page.forEach(readableEvent);
      const last = page.at(-1);
      if (last === undefined || page.length < pageSize) return;
      after = { streamId: last.stream_id, sequence: last.sequence };
    }
  }

  async #eventPage(after: EventKey | null, pageSize: number): Promise<EventRow[]> {
    const { rows } =
      after === null
        ? await this.#pool.query<EventRow>(
            `SELECT ${EVENT_COLUMNS} FROM ltw_events ORDER BY stream_id, sequence LIMIT $1`,
            [pageSize],
          )
        : await this.#pool.query<EventRow>(
            `SELECT ${EVENT_COLUMNS} FROM ltw_events WHERE (stream_id, sequence) > ($2, $3)
              ORDER BY stream_id, sequence LIMIT $1`,
            [pageSize, after.streamId, after.sequence],
          );
    return rows;
  }

  async loadStream(campaignId: string, afterSequence = 0): Promise<StreamSlice | null> {
    // One snapshot for head and events, so the version matches the events read.
    return this.#transaction('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', async (client) => {
      const head = await client.query<{ version: string }>(
        'SELECT version FROM ltw_event_streams WHERE stream_id = $1',
        [campaignId],
      );
      const version = head.rows[0]?.version;
      if (version === undefined) return null;
      const { rows } = await client.query<EventRow>(
        `SELECT ${EVENT_COLUMNS} FROM ltw_events
          WHERE stream_id = $1 AND sequence > $2 ORDER BY sequence`,
        [campaignId, afterSequence],
      );
      return { version: toSafeInteger(version), events: rows.map(toRecordedEvent) };
    });
  }

  async findCommand(commandId: string): Promise<StoredCommand | null> {
    const { rows } = await this.#pool.query<CommandRow>(
      `SELECT ${COMMAND_COLUMNS} FROM ltw_commands WHERE command_id = $1`,
      [commandId],
    );
    const row = rows[0];
    return row ? toStoredCommand(row) : null;
  }

  async loadCommands(campaignId: string): Promise<readonly StoredCommand[]> {
    const { rows } = await this.#pool.query<CommandRow>(
      `SELECT ${COMMAND_COLUMNS} FROM ltw_commands WHERE stream_id = $1 ORDER BY first_sequence`,
      [campaignId],
    );
    return rows.map(toStoredCommand);
  }

  async append(batch: AppendBatch): Promise<void> {
    const { campaignId, expectedVersion, command, events } = batch;
    events.forEach((event, index) => {
      if (event.campaignId !== campaignId || event.sequence !== expectedVersion + index + 1) {
        throw new Error(`event ${event.sequence} does not follow stream ${campaignId}`);
      }
    });
    const newVersion = expectedVersion + events.length;

    try {
      await this.#transaction('BEGIN', async (client) => {
        if (expectedVersion === 0) {
          await client.query('INSERT INTO ltw_event_streams (stream_id, version) VALUES ($1, $2)', [
            campaignId,
            newVersion,
          ]);
        } else {
          const moved = await client.query(
            'UPDATE ltw_event_streams SET version = $3 WHERE stream_id = $1 AND version = $2',
            [campaignId, expectedVersion, newVersion],
          );
          if (moved.rowCount !== 1)
            throw new StreamVersionConflictError(campaignId, expectedVersion);
        }
        await client.query(
          `INSERT INTO ltw_commands (${COMMAND_COLUMNS})
           VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9, $10)`,
          [
            command.commandId,
            campaignId,
            command.commandType,
            JSON.stringify(command.actor),
            command.fingerprint,
            JSON.stringify(command.command),
            command.reason,
            command.firstSequence,
            command.lastSequence,
            command.recordedAt,
          ],
        );
        for (const event of events) {
          await client.query(
            `INSERT INTO ltw_events (${EVENT_COLUMNS})
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb)`,
            [
              campaignId,
              event.sequence,
              event.eventId,
              event.type,
              event.schemaVersion,
              JSON.stringify(event.payload),
              event.worldTime,
              event.recordedAt,
              event.causation.commandId,
              event.causation.commandType,
              JSON.stringify(event.causation.actor),
            ],
          );
        }
      });
    } catch (error) {
      throw toConflictError(error, batch) ?? error;
    }
  }

  async #transaction<T>(begin: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query(begin);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Every event and command of one campaign parses with this build's schemas, read through `db`
 * (a campaign's move checks what it imports inside its transaction, docs/adr/0061-local-mode.md
 * §6). Throws naming the first that does not.
 */
export async function assertCampaignReadable(db: pg.ClientBase, campaignId: string): Promise<void> {
  for (let after = 0; ;) {
    const { rows } = await db.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM ltw_events WHERE stream_id = $1 AND sequence > $2
        ORDER BY sequence LIMIT $3`,
      [campaignId, after, HISTORY_PAGE_SIZE],
    );
    rows.forEach(readableEvent);
    const last = rows.at(-1);
    if (last === undefined || rows.length < HISTORY_PAGE_SIZE) break;
    after = toSafeInteger(last.sequence);
  }
  const { rows } = await db.query<CommandRow>(
    `SELECT ${COMMAND_COLUMNS} FROM ltw_commands WHERE stream_id = $1`,
    [campaignId],
  );
  for (const row of rows) {
    try {
      toStoredCommand(row);
    } catch (error: unknown) {
      throw new Error(`this build cannot read command ${row.command_id}`, { cause: error });
    }
  }
}

/** `toRecordedEvent` for readiness: a refusal names the event (stream, sequence, type, version). */
function readableEvent(row: EventRow): void {
  try {
    toRecordedEvent(row);
  } catch (error: unknown) {
    throw new Error(
      `this build cannot read event ${row.stream_id}#${row.sequence} (${row.event_type} v${String(row.schema_version)})`,
      { cause: error },
    );
  }
}

function toRecordedEvent(row: EventRow): RecordedEvent {
  return parseRecordedEvent({
    campaignId: row.stream_id,
    sequence: toSafeInteger(row.sequence),
    eventId: row.event_id,
    schemaVersion: row.schema_version,
    worldTime: toSafeInteger(row.world_time),
    recordedAt: row.recorded_at.toISOString(),
    causation: { commandId: row.command_id, commandType: row.command_type, actor: row.actor },
    type: row.event_type,
    payload: row.payload,
  });
}

function toStoredCommand(row: CommandRow): StoredCommand {
  return parseStoredCommand({
    commandId: row.command_id,
    campaignId: row.stream_id,
    commandType: row.command_type,
    actor: row.actor,
    fingerprint: row.fingerprint,
    command: row.command,
    reason: row.reason,
    firstSequence: toSafeInteger(row.first_sequence),
    lastSequence: toSafeInteger(row.last_sequence),
    recordedAt: row.recorded_at.toISOString(),
  });
}

/** PostgreSQL int8 arrives as a string; refuse values JavaScript cannot represent exactly. */
function toSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new RangeError(`unsafe integer from database: ${value}`);
  return parsed;
}

/** Maps unique violations to the port's conflict errors; other errors pass through. */
function toConflictError(error: unknown, batch: AppendBatch): Error | null {
  if (error instanceof StreamVersionConflictError) return error;
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== '23505') {
    return null;
  }
  const constraint = 'constraint' in error ? error.constraint : undefined;
  if (constraint === 'ltw_commands_pkey')
    return new CommandIdConflictError(batch.command.commandId);
  if (constraint === 'ltw_event_streams_pkey' || constraint === 'ltw_events_pkey') {
    return new StreamVersionConflictError(batch.campaignId, batch.expectedVersion);
  }
  return null;
}

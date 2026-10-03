import type { RecordedEvent } from '../events.ts';
import {
  CommandIdConflictError,
  StreamVersionConflictError,
  type AppendBatch,
  type EventStore,
  type StoredCommand,
  type StreamSlice,
} from './event-store.ts';

/**
 * In-memory EventStore with the same atomicity and conflict semantics as
 * the PostgreSQL store. Data is cloned on the way in and out, so callers can
 * never alias stored history.
 */
export class InMemoryEventStore implements EventStore {
  readonly #streams = new Map<string, RecordedEvent[]>();
  readonly #commands = new Map<string, StoredCommand>();

  loadStream(campaignId: string, afterSequence = 0): Promise<StreamSlice | null> {
    const stream = this.#streams.get(campaignId);
    if (!stream) return Promise.resolve(null);
    return Promise.resolve({
      version: stream.length,
      events: structuredClone(stream.slice(afterSequence)),
    });
  }

  findCommand(commandId: string): Promise<StoredCommand | null> {
    const command = this.#commands.get(commandId);
    return Promise.resolve(command ? structuredClone(command) : null);
  }

  loadCommands(campaignId: string): Promise<readonly StoredCommand[]> {
    const commands = [...this.#commands.values()]
      .filter((command) => command.campaignId === campaignId)
      .sort((a, b) => a.firstSequence - b.firstSequence);
    return Promise.resolve(structuredClone(commands));
  }

  append(batch: AppendBatch): Promise<void> {
    const stream = this.#streams.get(batch.campaignId) ?? [];
    if (stream.length !== batch.expectedVersion) {
      return Promise.reject(
        new StreamVersionConflictError(batch.campaignId, batch.expectedVersion),
      );
    }
    if (this.#commands.has(batch.command.commandId)) {
      return Promise.reject(new CommandIdConflictError(batch.command.commandId));
    }
    const misplaced = batch.events.find(
      (event, index) => event.sequence !== batch.expectedVersion + index + 1,
    );
    if (misplaced) {
      return Promise.reject(new Error(`event ${misplaced.sequence} does not follow the stream`));
    }
    this.#streams.set(batch.campaignId, [...stream, ...structuredClone(batch.events)]);
    this.#commands.set(batch.command.commandId, structuredClone(batch.command));
    return Promise.resolve();
  }
}

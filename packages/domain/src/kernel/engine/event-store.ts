import type { KernelCommandType } from '@ltw/contracts';

import type { Actor } from '../actor.ts';
import type { ResolvedCommand } from '../decision.ts';
import type { RecordedEvent } from '../events.ts';

/**
 * Persistence port of the World Engine (ADR 0007). Implementations: the
 * in-memory store (tests, harnesses) and PostgreSQL (apps/server).
 */
export interface StoredCommand {
  readonly commandId: string;
  readonly campaignId: string;
  readonly commandType: KernelCommandType;
  readonly actor: Actor;
  /** Canonical JSON of the validated submission (duplicate detection). */
  readonly fingerprint: string;
  /** The command after ID resolution, exactly as decided. */
  readonly command: ResolvedCommand;
  readonly reason: string | null;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly recordedAt: string;
}

export interface StreamSlice {
  /** Sequence of the last event in the stream. */
  readonly version: number;
  /** Events after the requested sequence, in order. */
  readonly events: readonly RecordedEvent[];
}

export interface AppendBatch {
  readonly campaignId: string;
  /** Stream version the decision was based on; 0 creates the stream. */
  readonly expectedVersion: number;
  readonly command: StoredCommand;
  readonly events: readonly RecordedEvent[];
}

export interface EventStore {
  /** `null` if the stream does not exist. */
  loadStream(campaignId: string, afterSequence?: number): Promise<StreamSlice | null>;
  findCommand(commandId: string): Promise<StoredCommand | null>;
  loadCommands(campaignId: string): Promise<readonly StoredCommand[]>;
  /**
   * Atomically stores the command record and its events, or nothing.
   * Throws StreamVersionConflictError if the stream moved past
   * `expectedVersion`, CommandIdConflictError if the command ID is taken.
   */
  append(batch: AppendBatch): Promise<void>;
}

export class StreamVersionConflictError extends Error {
  constructor(campaignId: string, expectedVersion: number) {
    super(`Stream ${campaignId} is no longer at version ${expectedVersion}`);
    this.name = 'StreamVersionConflictError';
  }
}

export class CommandIdConflictError extends Error {
  constructor(commandId: string) {
    super(`Command ID ${commandId} is already recorded`);
    this.name = 'CommandIdConflictError';
  }
}

/** Sources of nondeterminism, injected so decisions stay pure and are recorded. */
export interface IdGenerator {
  /** A new lowercase UUID. */
  next(): string;
}

export interface WallClock {
  /** Current time as an ISO-8601 UTC timestamp. */
  now(): string;
}

import type { CommandResult } from '@ltw/contracts';

import { authorize } from '../authorization.ts';
import { decide } from '../decide/decide.ts';
import type { Rejection, ResolvedCommand } from '../decision.ts';
import { EVENT_SCHEMA_VERSION, type KernelEvent, type RecordedEvent } from '../events.ts';
import { evolve } from '../evolve.ts';
import { EMPTY_WORLD_STATE, type WorldState } from '../state.ts';
import {
  CommandIdConflictError,
  StreamVersionConflictError,
  type EventStore,
  type IdGenerator,
  type StoredCommand,
  type WallClock,
} from './event-store.ts';
import { KeyedMutex } from './keyed-mutex.ts';
import { commandSubmissionSchema, fingerprintOf, type CommandSubmission } from './submission.ts';

/**
 * The World Engine: the only path to canonical mutation (invariant 1).
 * Pipeline: schema → idempotency → ID resolution → stream → authorization →
 * expected version → pure decision → stamp/fold → atomic append
 * (docs/adr/0007-world-kernel-model-and-event-store.md).
 */
export interface WorldEngineOptions {
  readonly store: EventStore;
  readonly ids: IdGenerator;
  readonly clock: WallClock;
  /** Attempts before reporting CONCURRENCY_CONFLICT. Default 10. */
  readonly maxAttempts?: number;
  /**
   * Wait before retry number `attempt` after losing a concurrent append.
   * Default: exponential backoff with full jitter (scheduling only; it never
   * influences decisions or recorded data).
   */
  readonly backoff?: (attempt: number) => Promise<void>;
}

const jitteredBackoff = (attempt: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.random() * Math.min(250, 4 * 2 ** attempt)));

export interface CampaignSnapshot {
  readonly state: WorldState;
  readonly history: readonly RecordedEvent[];
}

export class WorldEngine {
  readonly #store: EventStore;
  readonly #ids: IdGenerator;
  readonly #clock: WallClock;
  readonly #maxAttempts: number;
  readonly #backoff: (attempt: number) => Promise<void>;
  readonly #mutex = new KeyedMutex();
  readonly #cache = new Map<string, CampaignSnapshot>();

  constructor(options: WorldEngineOptions) {
    this.#store = options.store;
    this.#ids = options.ids;
    this.#clock = options.clock;
    this.#maxAttempts = options.maxAttempts ?? 10;
    this.#backoff = options.backoff ?? jitteredBackoff;
  }

  /** Validates and executes a submission. Never throws for domain rejections. */
  async execute(input: unknown): Promise<CommandResult> {
    const parsed = commandSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      return rejected(commandIdOf(input), {
        code: 'INVALID_COMMAND',
        message: 'The command failed validation',
        details: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        },
      });
    }
    const submission = parsed.data;
    const fingerprint = fingerprintOf(submission);
    const prior = await this.#store.findCommand(submission.commandId);
    if (prior) return this.#priorOutcome(prior, fingerprint);

    const campaignId = submission.campaignId ?? this.#ids.next();
    const command = this.#resolve(submission);
    return this.#mutex.run(campaignId, () =>
      this.#executeResolved(submission, fingerprint, campaignId, command),
    );
  }

  /** Current canonical state and full history, or null if the campaign does not exist. */
  async load(campaignId: string): Promise<CampaignSnapshot | null> {
    return this.#mutex.run(campaignId, () => this.#catchUp(campaignId));
  }

  /** Accepted command records (actor, reason, resolved command) in stream order. */
  async commandLog(campaignId: string): Promise<readonly StoredCommand[]> {
    return this.#store.loadCommands(campaignId);
  }

  async #executeResolved(
    submission: CommandSubmission,
    fingerprint: string,
    campaignId: string,
    command: ResolvedCommand,
  ): Promise<CommandResult> {
    const { commandId, actor } = submission;
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      if (attempt > 1) {
        await this.#backoff(attempt - 1);
        const prior = await this.#store.findCommand(commandId);
        if (prior) return this.#priorOutcome(prior, fingerprint);
      }
      const snapshot = await this.#catchUp(campaignId);
      if (command.type === 'CreateCampaign' && snapshot) {
        return rejected(commandId, {
          code: 'CAMPAIGN_ALREADY_EXISTS',
          message: `Campaign "${campaignId}" already exists`,
        });
      }
      if (command.type !== 'CreateCampaign' && !snapshot) {
        return rejected(commandId, {
          code: 'CAMPAIGN_NOT_FOUND',
          message: `Campaign "${campaignId}" does not exist`,
        });
      }
      const state = snapshot?.state ?? EMPTY_WORLD_STATE;
      const history = snapshot?.history ?? [];

      const denied = authorize(state, actor, command.type);
      if (denied) return rejected(commandId, denied);
      if (
        submission.expectedVersion !== undefined &&
        submission.expectedVersion !== state.version
      ) {
        return rejected(commandId, {
          code: 'VERSION_MISMATCH',
          message: `Expected version ${submission.expectedVersion}, campaign is at ${state.version}`,
          details: { expectedVersion: submission.expectedVersion, version: state.version },
        });
      }

      const decision = decide({ state, history, campaignId, commandId, actor }, command);
      if (!decision.ok) return rejected(commandId, decision.rejection);

      const recordedAt = this.#clock.now();
      const { events, next } = this.#stamp(state, decision.events, {
        campaignId,
        recordedAt,
        causation: { commandId, commandType: command.type, actor },
      });
      const stored: StoredCommand = {
        commandId,
        campaignId,
        commandType: command.type,
        actor,
        fingerprint,
        command,
        reason: submission.reason ?? null,
        firstSequence: state.version + 1,
        lastSequence: next.version,
        recordedAt,
      };
      try {
        await this.#store.append({
          campaignId,
          expectedVersion: state.version,
          command: stored,
          events,
        });
      } catch (error) {
        if (
          error instanceof StreamVersionConflictError ||
          error instanceof CommandIdConflictError
        ) {
          continue;
        }
        throw error;
      }
      this.#cache.set(campaignId, { state: next, history: Object.freeze([...history, ...events]) });
      return {
        status: 'accepted',
        commandId,
        campaignId,
        events: events.map(({ sequence, eventId, type }) => ({ sequence, eventId, type })),
      };
    }
    return rejected(commandId, {
      code: 'CONCURRENCY_CONFLICT',
      message: 'The campaign kept changing concurrently; retry with the same command ID',
    });
  }

  /** Assigns generated IDs before deciding, so decisions are pure and IDs are recorded. */
  #resolve(submission: CommandSubmission): ResolvedCommand {
    const { command } = submission;
    if (command.type === 'CreateEntity') {
      return { ...command, entityId: command.entityId ?? this.#ids.next() };
    }
    if (command.type === 'StartScene') {
      return { ...command, sceneId: command.sceneId ?? this.#ids.next() };
    }
    return command;
  }

  /** Assigns sequence, IDs, and times; folds each event to prove it applies. */
  #stamp(
    state: WorldState,
    drafts: readonly KernelEvent[],
    meta: Pick<RecordedEvent, 'campaignId' | 'recordedAt' | 'causation'>,
  ): { events: RecordedEvent[]; next: WorldState } {
    let next = state;
    const events: RecordedEvent[] = [];
    for (const draft of drafts) {
      const provisional: RecordedEvent = {
        ...draft,
        ...meta,
        sequence: next.version + 1,
        eventId: this.#ids.next(),
        schemaVersion: EVENT_SCHEMA_VERSION,
        worldTime: next.clock,
      };
      next = evolve(next, provisional);
      // World time recorded on an event is the clock after it.
      const event = deepFreeze({ ...provisional, worldTime: next.clock });
      events.push(event);
    }
    return { events, next };
  }

  async #catchUp(campaignId: string): Promise<CampaignSnapshot | null> {
    const cached = this.#cache.get(campaignId);
    const slice = await this.#store.loadStream(campaignId, cached?.state.version ?? 0);
    if (!slice) {
      if (cached) throw new Error(`Campaign stream ${campaignId} disappeared`);
      return null;
    }
    if (cached && slice.events.length === 0) return cached;
    let state = cached?.state ?? EMPTY_WORLD_STATE;
    for (const event of slice.events) state = evolve(state, event);
    const snapshot = {
      state,
      history: Object.freeze([...(cached?.history ?? []), ...slice.events.map(deepFreeze)]),
    };
    this.#cache.set(campaignId, snapshot);
    return snapshot;
  }

  async #priorOutcome(prior: StoredCommand, fingerprint: string): Promise<CommandResult> {
    if (prior.fingerprint !== fingerprint) {
      return rejected(prior.commandId, {
        code: 'COMMAND_ID_CONFLICT',
        message: 'This command ID was already used for a different command',
      });
    }
    // Read straight from the store: this may run while the campaign lock is held.
    const slice = await this.#store.loadStream(prior.campaignId, prior.firstSequence - 1);
    const events = (slice?.events ?? []).filter((event) => event.sequence <= prior.lastSequence);
    return {
      status: 'duplicate',
      commandId: prior.commandId,
      campaignId: prior.campaignId,
      events: events.map(({ sequence, eventId, type }) => ({ sequence, eventId, type })),
    };
  }
}

function rejected(commandId: string | null, rejection: Rejection): CommandResult {
  return { status: 'rejected', commandId, ...rejection };
}

function commandIdOf(input: unknown): string | null {
  if (input !== null && typeof input === 'object' && 'commandId' in input) {
    const { commandId } = input;
    if (typeof commandId === 'string' && commandId.length <= 128) return commandId;
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) deepFreeze(member);
  }
  return value;
}

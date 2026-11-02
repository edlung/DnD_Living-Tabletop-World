import {
  CHECK_METHODS,
  COMBAT_COMMAND_TYPES,
  PLAYER_COMMAND_TYPES,
  type CommandResult,
  type KernelCommand,
  type KernelCommandOf,
  type KernelCommandType,
  type PlayerCommandType,
} from '@ltw/contracts';

import { bootstrapConsentRejection } from '../../campaign/bootstrap-consent.ts';
import { consentRejection } from '../../authoring/consent.ts';
import { playerOutcome } from '../../investigation/outcome.ts';
import { ENTROPY_POOL, type CombatPort, type EntropySource } from '../../combat/port.ts';
import { RESOLVED_ID_POOL } from '../../investigation/records.ts';
import { MAX_RESOLVED_IDS } from '../../combat/reactions.ts';
import type { SkillCheckPort } from '../../investigation/skill-checks.ts';

import { authorize } from '../authorization.ts';
import { decide } from '../decide/decide.ts';
import type { Rejection, Resolution, ResolvedCommand } from '../decision.ts';
import { assertWritable, schemaVersionOf } from '../event-versions.ts';
import { kernelEventSchema, type KernelEvent, type RecordedEvent } from '../events.ts';
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
 * expected version → pure decision → consent (authoring) → stamp/fold →
 * atomic append
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
  /** Rules adapter for skill checks (ADR 0013); required to resolve checks. */
  readonly checks?: SkillCheckPort;
  /** Combat engine (ADR 0015); required to decide combat commands. */
  readonly combat?: CombatPort;
  /** Uniform 32-bit randomness for combat, drawn at resolution and recorded. */
  readonly entropy?: EntropySource;
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
  readonly #checks: SkillCheckPort | undefined;
  readonly #combat: CombatPort | undefined;
  readonly #entropy: EntropySource | undefined;
  readonly #mutex = new KeyedMutex();
  readonly #cache = new Map<string, CampaignSnapshot>();

  constructor(options: WorldEngineOptions) {
    this.#store = options.store;
    this.#ids = options.ids;
    this.#clock = options.clock;
    this.#maxAttempts = options.maxAttempts ?? 10;
    this.#backoff = options.backoff ?? jitteredBackoff;
    this.#checks = options.checks;
    this.#combat = options.combat;
    this.#entropy = options.entropy;
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
      if (attempt > 1) await this.#backoff(attempt - 1);
      const snapshot = await this.#catchUp(campaignId);
      // Check for a committed twin AFTER loading state: a twin that committed
      // since the caller's first check is now part of the state we would decide
      // on, so its outcome must be reported instead of a decision against it.
      const prior = await this.#store.findCommand(commandId);
      if (prior) return this.#priorOutcome(prior, fingerprint);
      if ((command.type === 'CreateCampaign' || command.type === 'BootstrapCampaign') && snapshot) {
        return rejected(commandId, {
          code: 'CAMPAIGN_ALREADY_EXISTS',
          message: `Campaign "${campaignId}" already exists`,
        });
      }
      if (command.type !== 'CreateCampaign' && command.type !== 'BootstrapCampaign' && !snapshot) {
        return rejected(commandId, {
          code: 'CAMPAIGN_NOT_FOUND',
          message: `Campaign "${campaignId}" does not exist`,
        });
      }
      const state = snapshot?.state ?? EMPTY_WORLD_STATE;
      const history = snapshot?.history ?? [];

      const authorization = authorize(state, actor, command);
      if (!authorization.ok) return rejected(commandId, authorization.rejection);
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

      const decision = decide(
        {
          state,
          history,
          campaignId,
          commandId,
          actor,
          authority: authorization.authority,
          ...(this.#combat ? { combat: this.#combat } : {}),
          ...(this.#checks ? { skillModifier: this.#checks.skillModifier.bind(this.#checks) } : {}),
        },
        command,
      );
      if (!decision.ok) return rejected(commandId, decision.rejection);
      // Risk and confirmation (invariant 16): authoring commits only with consent covering now (ADR 0018 §4).
      const refused =
        consentRejection(command, decision.requires) ??
        bootstrapConsentRejection(command, decision.requiresBootstrap);
      if (refused) return rejected(commandId, refused);

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
      return accepted('accepted', commandId, campaignId, command.type, events);
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
    if (command.type === 'ApplyAuthoring') {
      return {
        ...command,
        commands: command.commands.map((operation) =>
          operation.type === 'CreateEntity'
            ? { ...operation, entityId: operation.entityId ?? this.#ids.next() }
            : operation.type === 'AddKnowledge'
              ? { ...operation, knowledgeId: operation.knowledgeId ?? this.#ids.next() }
              : operation,
        ),
      };
    }
    if (command.type === 'StartScene') {
      return { ...command, sceneId: command.sceneId ?? this.#ids.next() };
    }
    if (command.type === 'AddKnowledge') {
      return { ...command, knowledgeId: command.knowledgeId ?? this.#ids.next() };
    }
    if (command.type === 'RecordMemory') {
      return { ...command, memoryId: command.memoryId ?? this.#ids.next() };
    }
    if (command.type === 'StartSession') {
      return { ...command, sessionId: command.sessionId ?? this.#ids.next() };
    }
    if (command.type === 'AddClue') {
      return { ...command, clueId: command.clueId ?? this.#ids.next() };
    }
    if (command.type === 'StartCombat') {
      return {
        ...command,
        encounterId: command.encounterId ?? this.#ids.next(),
        resolution: { ids: [], d20: null, entropy: this.#entropyPool() },
      };
    }
    if (
      command.type === 'AdjustHitPoints' ||
      command.type === 'SetCondition' ||
      command.type === 'AddCombatant' ||
      command.type === 'RemoveCombatant' ||
      command.type === 'DelayTurn'
    ) {
      // The DM's damage may call for a Concentration save, a joining creature rolls initiative, a
      // turn that passes on may start with a death save (docs/adr/0043-dm-screen.md §1–2), and a
      // flyer made Prone falls (docs/adr/0049-space-and-movement.md §6).
      return { ...command, resolution: { ids: [], d20: null, entropy: this.#entropyPool() } };
    }
    if (command.type === 'CloseReactionWindow') {
      // Closing may resolve the suspended spell (ADR 0016) — its records and dice — or let a
      // provoking move go on to the next reach it leaves, a window of its own (ADR 0046).
      return { ...command, resolution: this.#combatResolution(MAX_RESOLVED_IDS) };
    }
    if (isPlayerCommand(command)) return { ...command, resolution: this.#draw(command) };
    return command;
  }

  /** IDs for every record the command may create, and the d20 of a check. */
  #draw(command: KernelCommandOf<PlayerCommandType>): Resolution {
    if (COMBAT_TYPES.has(command.type)) return this.#combatResolution(combatIds(command.type));
    const count =
      command.type === 'EnterLocation'
        ? 0
        : command.type === 'FormHypothesis' ||
            command.type === 'ShowEvidence' ||
            command.type === 'InsightCheck'
          ? 1
          : RESOLVED_ID_POOL;
    const ids = Array.from({ length: count }, () => this.#ids.next());
    const checked =
      command.type === 'InsightCheck' ||
      (command.type === 'ExamineEntity' && CHECK_METHODS.has(command.method));
    if (!checked) return { ids, d20: null, entropy: [] };
    if (!this.#checks) throw new Error('WorldEngine needs a SkillCheckPort to resolve checks');
    const d20 = this.#checks.rollD20();
    if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) throw new Error(`invalid d20 ${d20}`);
    return { ids, d20, entropy: [] };
  }

  #combatResolution(idCount: number): Resolution {
    const ids = Array.from({ length: idCount }, () => this.#ids.next());
    return { ids, d20: null, entropy: this.#entropyPool() };
  }

  /** The recorded randomness of a combat command (ADR 0015, technical notes). */
  #entropyPool(): number[] {
    if (!this.#entropy) throw new Error('WorldEngine needs an EntropySource to resolve combat');
    return Array.from({ length: ENTROPY_POOL }, () => {
      const value = this.#entropy?.next() ?? 0;
      if (!Number.isInteger(value) || value < 0 || value >= 2 ** 32) {
        throw new Error(`invalid entropy ${String(value)}`);
      }
      return value;
    });
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
      // Never persist what could not be read back: a decision bug must fail
      // loudly here instead of leaving an unloadable stream behind.
      const checked = kernelEventSchema.safeParse(draft);
      if (!checked.success) {
        throw new Error(
          `decision produced an invalid ${draft.type} event: ${checked.error.message}`,
        );
      }
      // Its current version, too: a premise only earlier writers recorded is never written.
      try {
        assertWritable(draft.type, draft.payload);
      } catch (error) {
        throw new Error(
          `decision produced a ${draft.type} event its current schema version cannot hold`,
          { cause: error },
        );
      }
      const provisional: RecordedEvent = {
        ...draft,
        ...meta,
        sequence: next.version + 1,
        eventId: this.#ids.next(),
        schemaVersion: schemaVersionOf(draft.type),
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
    return accepted('duplicate', prior.commandId, prior.campaignId, prior.commandType, events);
  }
}

const PLAYER_TYPES: ReadonlySet<string> = new Set(PLAYER_COMMAND_TYPES);
const COMBAT_TYPES: ReadonlySet<string> = new Set(COMBAT_COMMAND_TYPES);
const isPlayerCommand = (command: KernelCommand): command is KernelCommandOf<PlayerCommandType> =>
  PLAYER_TYPES.has(command.type);

/**
 * IDs a combat command may need: a cast may reveal records (Detect Magic,
 * ADR 0015 §3) and open a reaction window; an answer that closes a window
 * may resolve the suspended cast (ADR 0016); a move may open a window, and an
 * answer may let a move go on to the next one (docs/adr/0046-reactions-beyond-counterspell.md §2).
 */
function combatIds(type: string): number {
  // An attack may open its window: a reroll, an answer to its hit, a rebuke of its damage.
  return WINDOW_TYPES.has(type) ? MAX_RESOLVED_IDS : 0;
}
const WINDOW_TYPES: ReadonlySet<string> = new Set([
  'CastSpell',
  'UseReaction',
  'DeclineReaction',
  'MoveCombatant',
  'Attack',
  'MakeReadiedAttack',
]);

function accepted(
  status: 'accepted' | 'duplicate',
  commandId: string,
  campaignId: string,
  commandType: KernelCommandType,
  events: readonly RecordedEvent[],
): CommandResult {
  const outcome = playerOutcome(commandType, events);
  return {
    status,
    commandId,
    campaignId,
    events: events.map(({ sequence, eventId, type }) => ({ sequence, eventId, type })),
    ...(outcome ? { outcome } : {}),
  };
}

function rejected(commandId: string | null, rejection: Rejection): CommandResult {
  return { status: 'rejected', commandId, ...rejection };
}

function commandIdOf(input: unknown): string | null {
  if (input !== null && typeof input === 'object' && 'commandId' in input) {
    const { commandId } = input;
    if (typeof commandId === 'string' && commandId.length <= 300) return commandId;
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

import type {
  CharacterSheet,
  KernelCommand,
  KernelCommandOf,
  PlayerCommandType,
  ProposableCommand,
  RejectionCode,
  Skill,
} from '@ltw/contracts';

import type { BootstrapConsentRequirement } from '../campaign/bootstrap-consent.ts';
import type { ConsentRequirement } from '../authoring/consent.ts';
import type { Actor } from './actor.ts';
import type { CombatPort } from '../combat/port.ts';
import type { Authority } from './authorization.ts';
import type { KernelEvent, RecordedEvent } from './events.ts';
import type { WorldState } from './state.ts';

/**
 * The pure decision contract: given state, history, and a resolved command,
 * either produce events or reject with a typed reason. Decisions never read
 * clocks, random numbers, or I/O (ADR 0006 §6).
 */
export interface Rejection {
  readonly code: RejectionCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type Decision =
  | {
      readonly ok: true;
      readonly events: readonly KernelEvent[];
      /**
       * Consent the World Engine must find in the command before appending
       * (authoring, docs/adr/0018-ai-authoring.md §4). A commit-time gate,
       * not a premise: re-decision ignores it.
       */
      readonly requires?: ConsentRequirement;
      readonly requiresBootstrap?: BootstrapConsentRequirement;
    }
  | { readonly ok: false; readonly rejection: Rejection };

/**
 * Engine-drawn inputs of a player command (docs/adr/0013-investigation.md):
 * a bounded pool of IDs for the records it may create, and the d20 of a
 * skill check. Recorded with the command, so decisions stay pure.
 */
export interface Resolution {
  readonly ids: readonly string[];
  readonly d20: number | null;
  /** Combat (ADR 0015): a pool of uniform 32-bit values every die of the decision is drawn from. */
  readonly entropy: readonly number[];
}

/** A proposed authoring operation with its generated IDs (docs/adr/0018-ai-authoring.md). */
export type ResolvedProposable =
  | Exclude<ProposableCommand, { type: 'CreateEntity' | 'AddKnowledge' }>
  | (KernelCommandOf<'CreateEntity'> & { readonly entityId: string })
  | (KernelCommandOf<'AddKnowledge'> & { readonly knowledgeId: string });

/** A command after the engine assigned any generated IDs and draws. */
export type ResolvedCommand =
  | Exclude<
      KernelCommand,
      {
        type:
          | 'CreateEntity'
          | 'StartScene'
          | 'AddKnowledge'
          | 'RecordMemory'
          | 'StartSession'
          | 'AddClue'
          | 'StartCombat'
          | 'CloseReactionWindow'
          | 'AdjustHitPoints'
          | 'AddCombatant'
          | 'RemoveCombatant'
          | 'DelayTurn'
          | 'ApplyAuthoring'
          | PlayerCommandType;
      }
    >
  | (Omit<KernelCommandOf<'ApplyAuthoring'>, 'commands'> & {
      readonly commands: ResolvedProposable[];
    })
  | (KernelCommandOf<'AddClue'> & { readonly clueId: string })
  | (KernelCommandOf<'StartCombat'> & {
      readonly encounterId: string;
      readonly resolution: Resolution;
    })
  | (KernelCommandOf<'CloseReactionWindow'> & { readonly resolution: Resolution })
  | (KernelCommandOf<'AdjustHitPoints' | 'AddCombatant' | 'RemoveCombatant' | 'DelayTurn'> & {
      readonly resolution: Resolution;
    })
  | (KernelCommandOf<PlayerCommandType> & { readonly resolution: Resolution })
  | (KernelCommandOf<'CreateEntity'> & { readonly entityId: string })
  | (KernelCommandOf<'StartScene'> & { readonly sceneId: string })
  | (KernelCommandOf<'AddKnowledge'> & { readonly knowledgeId: string })
  | (KernelCommandOf<'RecordMemory'> & { readonly memoryId: string })
  | (KernelCommandOf<'StartSession'> & { readonly sessionId: string });

export type ResolvedCommandOf<T extends ResolvedCommand['type']> = Extract<
  ResolvedCommand,
  { type: T }
>;

export interface DecisionContext {
  readonly state: WorldState;
  readonly history: readonly RecordedEvent[];
  readonly campaignId: string;
  readonly commandId: string;
  readonly actor: Actor;
  /** The authority `authorize` granted (Gate 02, G02-H03). */
  readonly authority: Authority;
  /** Combat engine (ADR 0015); required only by combat commands. */
  readonly combat?: CombatPort;
  /** Rules-provided skill modifier (ADR 0013); required only by skill checks. */
  readonly skillModifier?: (sheet: CharacterSheet, skill: Skill) => number;
}

export function accept(...events: KernelEvent[]): Decision {
  return { ok: true, events };
}

export function reject(
  code: RejectionCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): Decision & { ok: false } {
  return { ok: false, rejection: details ? { code, message, details } : { code, message } };
}

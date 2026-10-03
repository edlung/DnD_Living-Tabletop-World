import type {
  CharacterSheet,
  KernelCommand,
  KernelCommandOf,
  PlayerCommandType,
  RejectionCode,
  Skill,
} from '@ltw/contracts';

import type { Actor } from './actor.ts';
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
  | { readonly ok: true; readonly events: readonly KernelEvent[] }
  | { readonly ok: false; readonly rejection: Rejection };

/**
 * Engine-drawn inputs of a player command (docs/adr/0013-investigation.md):
 * a bounded pool of IDs for the records it may create, and the d20 of a
 * skill check. Recorded with the command, so decisions stay pure.
 */
export interface Resolution {
  readonly ids: readonly string[];
  readonly d20: number | null;
}

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
          | PlayerCommandType;
      }
    >
  | (KernelCommandOf<'AddClue'> & { readonly clueId: string })
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

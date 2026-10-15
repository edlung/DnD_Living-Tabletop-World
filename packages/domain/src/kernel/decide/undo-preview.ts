import type { RejectionCode } from '@ltw/contracts';

import type { Actor } from '../actor.ts';
import { authorize } from '../authorization.ts';
import type { ResolvedCommandOf } from '../decision.ts';
import type { RecordedEvent } from '../events.ts';
import type { WorldState } from '../state.ts';
import { decide } from './decide.ts';
import type { UndoBlocker } from './undo.ts';

/**
 * Whether `actor` could undo a command now (docs/adr/0033-live-session.md §7): the same
 * authorization and decision the World Engine applies to `UndoCommand`, made against the
 * given snapshot without appending anything. Like an authoring preview it grants nothing:
 * a submitted undo is decided again against the state at that time.
 */
export type UndoPreview =
  | { readonly undoable: true }
  | {
      readonly undoable: false;
      readonly code: RejectionCode;
      /** The later commands that depend on the target (`UNDO_UNSAFE`); otherwise empty. */
      readonly blockers: readonly UndoBlocker[];
    };

export function previewUndo(
  snapshot: { readonly state: WorldState; readonly history: readonly RecordedEvent[] },
  actor: Actor,
  campaignId: string,
  targetCommandId: string,
): UndoPreview {
  const { state, history } = snapshot;
  const command: ResolvedCommandOf<'UndoCommand'> = { type: 'UndoCommand', targetCommandId };
  const authorization = authorize(state, actor, command);
  if (!authorization.ok) return refused(authorization.rejection.code, undefined);
  const decision = decide(
    {
      state,
      history,
      campaignId,
      // Never recorded: the preview appends nothing.
      commandId: `preview.undo.${targetCommandId}`,
      actor,
      authority: authorization.authority,
    },
    command,
  );
  return decision.ok
    ? { undoable: true }
    : refused(decision.rejection.code, decision.rejection.details?.['blockers']);
}

function refused(code: RejectionCode, blockers: unknown): UndoPreview {
  return {
    undoable: false,
    code,
    blockers: Array.isArray(blockers) ? (blockers as readonly UndoBlocker[]) : [],
  };
}

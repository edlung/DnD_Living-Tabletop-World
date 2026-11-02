import type { WorldState } from '../kernel/state.ts';
import { pendingCandidates, triggerActor } from './reactions.ts';

/**
 * Structural invariants of combat (ADR 0015) and reaction windows
 * (ADR 0016), checked by `checkWorldIntegrity`.
 */
export function combatViolations(state: WorldState): string[] {
  const violations: string[] = [];
  const report = (message: string) => violations.push(message);
  const { encounter } = state;

  if (encounter) {
    if (!state.usedIds.has(encounter.encounterId)) report('encounter ID missing from used IDs');
    const ids = encounter.combatants.map((c) => c.entityId);
    if (new Set(ids).size !== ids.length) report('a combatant appears twice');
    if (encounter.currentIndex >= encounter.combatants.length) report('current turn out of range');
    if ((encounter.round === 0) !== (encounter.currentIndex === -1)) {
      report('round and current turn disagree');
    }
    const occupied = new Set<string>();
    for (const combatant of encounter.combatants) {
      const entity = state.entities.get(combatant.entityId);
      if (!entity) {
        report(`combatant ${combatant.entityId} does not exist`);
        continue;
      }
      if (entity.placement?.locationId !== encounter.locationId) {
        report(`combatant ${combatant.entityId} is not at the encounter's location`);
      }
      const { x, y } = combatant.position;
      if (x >= encounter.battlefield.width || y >= encounter.battlefield.height) {
        report(`combatant ${combatant.entityId} is off the battlefield`);
      }
      // A rider stands where its mount stands, sharing its square (docs/adr/0049 §10).
      if (combatant.mountedOn !== undefined) {
        const mount = encounter.combatants.find((c) => c.entityId === combatant.mountedOn);
        if (!mount) report(`rider ${combatant.entityId} rides no combatant`);
        else if (mount.position.x !== x || mount.position.y !== y) {
          report(`rider ${combatant.entityId} is not where its mount is`);
        }
        continue;
      }
      if (entity.status === 'active') {
        const square = `${String(x)},${String(y)}`;
        if (occupied.has(square)) report(`two living combatants share square ${square}`);
        occupied.add(square);
      }
    }
  }

  let open = 0;
  for (const [id, window] of state.reactionWindows) {
    if (id !== window.windowId) report(`reaction window key ${id} != ${window.windowId}`);
    if (!state.usedIds.has(id)) report(`reaction window ${id} missing from used IDs`);
    const pending = pendingCandidates(window);
    // A window that waits for one its answer opened (ADR 0046 §1): neither closed nor open.
    if (window.status === 'waiting') {
      if (window.closedBy !== null) report(`waiting reaction window ${id} has a closing command`);
      continue;
    }
    if (window.status !== 'open') {
      if (pending.length > 0) report(`closed reaction window ${id} has pending candidates`);
      if (window.closedBy === null) report(`closed reaction window ${id} has no closing command`);
      continue;
    }
    open += 1;
    if (window.closedBy !== null) report(`open reaction window ${id} has a closing command`);
    if (pending.length === 0) report(`open reaction window ${id} waits for nobody`);
    if (!encounter || encounter.encounterId !== window.encounterId) {
      report(`open reaction window ${id} outside its encounter`);
      continue;
    }
    // A spell is cast and a move made on the actor's turn; an attack or damage on anyone's.
    const current = encounter.combatants[encounter.currentIndex]?.entityId;
    const ownTurn = window.trigger.kind === 'spell' || window.trigger.kind === 'move';
    if (ownTurn && current !== triggerActor(window.trigger))
      report(`reaction window ${id} off its actor's turn`);
    for (const candidate of window.candidates) {
      if (!encounter.combatants.some((c) => c.entityId === candidate.entityId)) {
        report(`reaction candidate ${candidate.entityId} is not a combatant`);
      }
      // Counterspell is a character's; an opportunity attack anyone's (ADR 0046 §2).
      const kind = state.entities.get(candidate.entityId)?.kind;
      if (window.trigger.kind === 'spell' ? kind !== 'character' : kind === undefined) {
        report(`reaction candidate ${candidate.entityId} cannot react here`);
      }
    }
  }
  if (open > 1) report('more than one reaction window is open');
  return violations;
}

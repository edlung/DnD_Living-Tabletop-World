import type { ReactionWindowView } from '@ltw/contracts';
import { openReactionWindow, type WorldState } from '@ltw/domain';

/**
 * The open reaction window as a viewer may see it
 * (docs/adr/0016-reaction-engine.md §4). Built field by field. The DM sees
 * the whole window. A candidate's player sees the caster (named only when
 * known), the components, their own answer, and their choices; never the
 * spell, its target, or the other candidates. The caster's player sees that
 * their spell awaits reactions. Anyone else sees no window.
 */
export interface WindowViewer {
  readonly dm: boolean;
  /** The viewing character, if any. */
  readonly holder: string | null;
  readonly known: ReadonlySet<string>;
}

export function reactionWindowView(
  state: WorldState,
  viewer: WindowViewer,
): ReactionWindowView | null {
  const window = openReactionWindow(state);
  if (!window) return null;
  const { trigger } = window;
  const entity = state.entities.get(trigger.casterId);
  if (!entity) throw new Error(`reaction trigger caster ${trigger.casterId} is missing`);
  const caster = {
    entityId: entity.entityId,
    kind: entity.kind,
    name: viewer.dm || viewer.known.has(entity.entityId) ? entity.name : null,
  };
  const base = { kind: 'spell' as const, caster, components: [...trigger.components] };

  if (viewer.dm) {
    return {
      windowId: window.windowId,
      trigger: {
        ...base,
        spellId: trigger.spellId,
        targetId: trigger.targetId,
        point: trigger.point ? { x: trigger.point.x, y: trigger.point.y } : null,
      },
      candidates: window.candidates.map(({ entityId, response }) => ({ entityId, response })),
      choices: [],
    };
  }
  if (viewer.holder !== null && viewer.holder === trigger.casterId) {
    return {
      windowId: window.windowId,
      trigger: { ...base, spellId: trigger.spellId },
      candidates: [],
      choices: [],
    };
  }
  const mine = window.candidates.find((c) => c.entityId === viewer.holder);
  if (!mine) return null;
  return {
    windowId: window.windowId,
    trigger: base,
    candidates: [{ entityId: mine.entityId, response: mine.response }],
    choices: mine.response === 'pending' ? ['counterspell', 'ignore'] : [],
  };
}

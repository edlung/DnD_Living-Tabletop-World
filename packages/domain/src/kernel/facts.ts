import type { ClaimTarget } from '@ltw/contracts';

import { consideredCombatants } from '../combat/reactions.ts';
import type { Premise } from '../investigation/events.ts';
import { attemptKey, scopedKey } from '../investigation/records.ts';
import { pairKey } from '../contradiction/records.ts';
import { holderOf, scopeKey } from '../knowledge/records.ts';
import type { KernelEvent, Restore } from './events.ts';

/**
 * Fact footprints (docs/adr/0007-world-kernel-model-and-event-store.md,
 * "Undo footprint"). Every event declares the canonical facts its decision
 * depended on (`reads`) and the facts it changed (`writes`). Footprints are
 * derived from stored payloads only, so they can be recomputed from history.
 *
 * Later domains must declare footprints for their events, including reads of
 * kernel facts (for example knowledge about an entity reads `entity:<id>`).
 */
export type FactKey = string;

export const facts = {
  campaign: (): FactKey => 'campaign',
  clock: (): FactKey => 'world#clock',
  activeScene: (): FactKey => 'world#activeScene',
  entity: (id: string): FactKey => `entity:${id}`,
  entityProfile: (id: string): FactKey => `entity:${id}#profile`,
  entityPlacement: (id: string): FactKey => `entity:${id}#placement`,
  entityStatus: (id: string): FactKey => `entity:${id}#status`,
  scene: (id: string): FactKey => `scene:${id}`,
  sceneEnded: (id: string): FactKey => `scene:${id}#ended`,
  knowledge: (id: string): FactKey => `knowledge:${id}`,
  rosterCharacter: (characterId: string): FactKey => `roster:character:${characterId}`,
  rosterPlayer: (actorId: string): FactKey => `roster:player:${actorId}`,
  memory: (id: string): FactKey => `memory:${id}`,
  session: (id: string): FactKey => `session:${id}`,
  sessionEnded: (id: string): FactKey => `session:${id}#ended`,
  activeSession: (): FactKey => 'world#activeSession',
  sheet: (entityId: string): FactKey => `sheet:${entityId}`,
  clue: (id: string): FactKey => `clue:${id}`,
  disclosure: (knowledgeId: string): FactKey => `disclosure:${knowledgeId}`,
  attempt: (key: string): FactKey => `attempt:${key}`,
  revealed: (key: string): FactKey => `revealed:${key}`,
  shared: (key: string): FactKey => `shared:${key}`,
  claim: (target: ClaimTarget): FactKey =>
    target.kind === 'knowledge'
      ? `claim:knowledge:${target.knowledgeId}`
      : `claim:clue:${target.clueId}`,
  contradiction: (key: string): FactKey => `contradiction:${key}`,
  encounter: (): FactKey => 'world#encounter',
  statBlock: (entityId: string): FactKey => `statblock:${entityId}`,
  reaction: (windowId: string): FactKey => `reaction:${windowId}`,
};

export interface Footprint {
  readonly reads: readonly FactKey[];
  readonly writes: readonly FactKey[];
}

const allEntityFacts = (id: string): FactKey[] => [
  facts.entity(id),
  facts.entityProfile(id),
  facts.entityPlacement(id),
  facts.entityStatus(id),
];

/** Reading an entity for validation depends on its existence and status. */
const entityChecked = (id: string): FactKey[] => [facts.entity(id), facts.entityStatus(id)];

export function footprintOf(event: KernelEvent): Footprint {
  // Every event happens at the current world time, so it depends on the clock.
  const clock = facts.clock();
  switch (event.type) {
    case 'CampaignCreated':
      return { reads: [], writes: [facts.campaign(), clock, facts.activeScene()] };
    case 'EntityCreated': {
      const parent = event.payload.location?.parentId;
      return {
        reads: [clock, ...(parent ? entityChecked(parent) : [])],
        writes: allEntityFacts(event.payload.entityId),
      };
    }
    case 'EntityPlaced':
      // A combatant cannot change location while an encounter runs (ADR 0016 §5), so
      // every placement relied on the encounter as it was.
      return {
        reads: [
          clock,
          facts.encounter(),
          ...entityChecked(event.payload.entityId),
          ...entityChecked(event.payload.locationId),
        ],
        writes: [facts.entityPlacement(event.payload.entityId)],
      };
    case 'EntityProfileUpdated':
      return {
        reads: [clock, facts.entity(event.payload.entityId)],
        writes: [facts.entityProfile(event.payload.entityId)],
      };
    case 'EntityStatusChanged':
      return {
        reads: [clock, facts.entity(event.payload.entityId)],
        writes: [facts.entityStatus(event.payload.entityId)],
      };
    case 'SceneStarted':
      return {
        reads: [clock, ...entityChecked(event.payload.locationId), facts.activeScene()],
        writes: [
          facts.scene(event.payload.sceneId),
          facts.sceneEnded(event.payload.sceneId),
          facts.activeScene(),
        ],
      };
    case 'SceneEnded':
      return {
        reads: [clock, facts.scene(event.payload.sceneId)],
        writes: [facts.sceneEnded(event.payload.sceneId), facts.activeScene()],
      };
    case 'WorldTimeAdvanced':
      return { reads: [clock], writes: [clock] };
    case 'CommandUndone':
      return { reads: [], writes: event.payload.restores.flatMap(restoredFacts) };
    case 'KnowledgeAssigned': {
      // A record depends on its holder, every entity it mentions, and its related records.
      const { scope, subjects, attributedTo, relations, knowledgeId } = event.payload;
      const holder = holderOf(scope);
      const entities = new Set([...subjects, ...(attributedTo ? [attributedTo] : [])]);
      if (holder !== null) entities.add(holder);
      return {
        reads: [
          clock,
          ...[...entities].map((id) => facts.entity(id)),
          ...relations.map((relation) => facts.knowledge(relation.knowledgeId)),
        ],
        writes: [facts.knowledge(knowledgeId)],
      };
    }
    case 'MemoryRecorded': {
      // A memory depends on every premise that made it possible (ADR 0010).
      const p = event.payload;
      const holder = holderOf(p.scope);
      const entities = new Set([...p.participants, ...p.witnesses]);
      if (p.locationId !== null) entities.add(p.locationId);
      if (holder !== null) entities.add(holder);
      return {
        reads: [
          clock,
          ...[...entities].map((id) => facts.entity(id)),
          ...p.witnesses.map((id) => facts.entityPlacement(id)),
          ...(p.scope.kind === 'PARTY' ? p.witnesses.map((id) => facts.rosterCharacter(id)) : []),
          ...(p.scope.kind === 'CHARACTER' ? [facts.rosterCharacter(p.scope.characterId)] : []),
          ...p.relatedKnowledge.map((id) => facts.knowledge(id)),
          ...p.causedBy.map((id) => facts.memory(id)),
          ...(p.sessionId === null ? [] : [facts.session(p.sessionId)]),
        ],
        writes: [facts.memory(p.memoryId)],
      };
    }
    case 'SessionStarted':
      return {
        reads: [clock, facts.activeSession()],
        writes: [
          facts.session(event.payload.sessionId),
          facts.sessionEnded(event.payload.sessionId),
          facts.activeSession(),
        ],
      };
    case 'SessionEnded':
      return {
        reads: [clock, facts.session(event.payload.sessionId)],
        writes: [facts.sessionEnded(event.payload.sessionId), facts.activeSession()],
      };
    case 'CharacterSheetSet':
      return {
        reads: [clock, facts.entity(event.payload.entityId)],
        writes: [facts.sheet(event.payload.entityId)],
      };
    case 'ClueAdded':
      return {
        reads: [
          clock,
          ...entityChecked(event.payload.entityId),
          ...event.payload.subjects.map((id) => facts.entity(id)),
        ],
        writes: [facts.clue(event.payload.clueId)],
      };
    case 'DisclosureSet':
      return {
        reads: [clock, facts.knowledge(event.payload.knowledgeId)],
        writes: [facts.disclosure(event.payload.knowledgeId)],
      };
    case 'EvidenceExamined': {
      // Depends on the examiner, the target being where the examiner is, the sheet
      // that set the modifier, and every clue it revealed (ADR 0013).
      const { characterId, entityId, method, scope, roll, revealed } = event.payload;
      return {
        reads: [
          clock,
          ...entityChecked(characterId),
          facts.entityPlacement(characterId),
          ...entityChecked(entityId),
          facts.entityPlacement(entityId),
          facts.rosterCharacter(characterId),
          ...(roll === null ? [] : [facts.sheet(characterId)]),
          ...revealed.map(({ clueId }) => facts.clue(clueId)),
        ],
        writes: [
          ...(roll === null ? [] : [facts.attempt(attemptKey(characterId, entityId, method))]),
          ...revealed.map(({ clueId }) => facts.revealed(scopedKey(scope, clueId))),
        ],
      };
    }
    case 'InformationShared': {
      const { npcId, characterId, scope, sourceKnowledgeId } = event.payload;
      return {
        reads: [
          clock,
          ...entityChecked(npcId),
          facts.entityPlacement(npcId),
          ...entityChecked(characterId),
          facts.entityPlacement(characterId),
          facts.rosterCharacter(characterId),
          facts.knowledge(sourceKnowledgeId),
          facts.disclosure(sourceKnowledgeId),
        ],
        writes: [facts.shared(scopedKey(scope, sourceKnowledgeId))],
      };
    }
    case 'ClaimSet': {
      // A claim depends on what it is attached to, its subject, and the claim it was copied from.
      const { target, claim, source } = event.payload;
      return {
        reads: [
          clock,
          target.kind === 'knowledge'
            ? facts.knowledge(target.knowledgeId)
            : facts.clue(target.clueId),
          facts.entity(claim.subjectId),
          ...(source === null ? [] : [facts.claim(source)]),
        ],
        writes: [facts.claim(target)],
      };
    }
    case 'ContradictionDetected': {
      // Both records, both claims, and (for a character reached through the party) membership.
      const { scope, between } = event.payload;
      const [a, b] = between;
      return {
        reads: [
          clock,
          facts.knowledge(a),
          facts.knowledge(b),
          facts.claim({ kind: 'knowledge', knowledgeId: a }),
          facts.claim({ kind: 'knowledge', knowledgeId: b }),
          ...(scope.kind === 'CHARACTER' ? [facts.rosterCharacter(scope.characterId)] : []),
        ],
        writes: [facts.contradiction(pairKey(scopeKey(scope), a, b))],
      };
    }
    case 'PremisesRecorded': {
      // What a player command relied on to be legal (Gate 02, G02-H02): undoing any
      // of it while the command stands is UNDO_UNSAFE.
      const { characterId, premises } = event.payload;
      return {
        reads: [
          clock,
          ...entityChecked(characterId),
          ...premises.flatMap((premise) => premiseFacts(characterId, premise)),
        ],
        writes: [],
      };
    }
    case 'CombatStarted':
      // Every combatant: its existence, status, placement, and its sheet or stat block.
      return {
        reads: [
          clock,
          facts.encounter(),
          ...event.payload.combatants.flatMap((c) => [
            ...entityChecked(c.entityId),
            facts.entityPlacement(c.entityId),
            facts.sheet(c.entityId),
            facts.statBlock(c.entityId),
          ]),
        ],
        writes: [facts.encounter()],
      };
    case 'TurnStarted':
    case 'CombatantUpdated':
    case 'CombatEnded':
      // Combat is strictly sequential: undo unwinds it in reverse order (ADR 0015).
      return { reads: [clock, facts.encounter()], writes: [facts.encounter()] };
    case 'StatBlockSet':
      return {
        reads: [clock, facts.entity(event.payload.entityId)],
        writes: [facts.statBlock(event.payload.entityId)],
      };
    case 'AttackPerformed':
    case 'SpellCast':
    case 'DamageApplied':
    case 'HealingApplied':
    case 'SavingThrowRolled':
    case 'ConditionApplied':
    case 'DeathSaveRolled':
      return { reads: [clock, facts.encounter()], writes: [] };
    case 'ReactionWindowOpened': {
      // Eligibility read every considered combatant (ADR 0016 §3): while the window
      // stands, undoing what changed any of them is UNDO_UNSAFE, and the pause rule
      // rejects commands that would change them.
      const { window } = event.payload;
      return {
        reads: [
          clock,
          facts.encounter(),
          ...consideredCombatants(window).flatMap((id) => [
            ...entityChecked(id),
            facts.entityPlacement(id),
            facts.sheet(id),
            facts.statBlock(id),
          ]),
        ],
        writes: [facts.reaction(window.windowId)],
      };
    }
    case 'ReactionUsed':
    case 'ReactionDeclined':
    case 'ReactionWindowExpired':
    case 'ReactionWindowResolved': {
      // Every answer and the close read and change the window: undo is strictly reverse.
      const window = facts.reaction(event.payload.windowId);
      return { reads: [clock, facts.encounter(), window], writes: [window] };
    }
    case 'CharacterAssigned':
      return {
        reads: [clock, facts.entity(event.payload.characterId)],
        writes: [
          facts.rosterCharacter(event.payload.characterId),
          facts.rosterPlayer(event.payload.playerActorId),
        ],
      };
  }
}

function premiseFacts(characterId: string, premise: Premise): FactKey[] {
  const party = [facts.rosterCharacter(characterId)];
  switch (premise.kind) {
    case 'perceived':
      // Seen where both stood: the target's existence and placement, and the character's.
      return [
        facts.entity(premise.entityId),
        facts.entityPlacement(premise.entityId),
        facts.entityPlacement(characterId),
      ];
    case 'self':
      return [];
    case 'party-member':
      return [facts.rosterCharacter(premise.characterId), ...party];
    case 'knowledge':
      return [facts.knowledge(premise.knowledgeId), ...(premise.viaParty ? party : [])];
    case 'memory':
      return [facts.memory(premise.memoryId), ...(premise.viaParty ? party : [])];
    case 'sheet':
      return [facts.sheet(characterId)];
    case 'party':
      return party;
    case 'controller':
      return [...party, facts.rosterPlayer(premise.playerActorId)];
  }
}

/** Facts a restore entry rewrites. Removing an entity or scene rewrites all its facts. */
export function restoredFacts(restore: Restore): FactKey[] {
  switch (restore.fact) {
    case 'entity':
      return allEntityFacts(restore.entityId);
    case 'entity.profile':
      return [facts.entityProfile(restore.entityId)];
    case 'entity.placement':
      return [facts.entityPlacement(restore.entityId)];
    case 'entity.status':
      return [facts.entityStatus(restore.entityId)];
    case 'scene':
      return [facts.scene(restore.sceneId), facts.sceneEnded(restore.sceneId)];
    case 'scene.ended':
      return [facts.sceneEnded(restore.sceneId)];
    case 'world.clock':
      return [facts.clock()];
    case 'world.activeScene':
      return [facts.activeScene()];
    case 'knowledge':
      return [facts.knowledge(restore.knowledgeId)];
    case 'roster':
      return [
        facts.rosterCharacter(restore.characterId),
        facts.rosterPlayer(restore.playerActorId),
      ];
    case 'memory':
      return [facts.memory(restore.memoryId)];
    case 'session':
      return [facts.session(restore.sessionId), facts.sessionEnded(restore.sessionId)];
    case 'session.ended':
      return [facts.sessionEnded(restore.sessionId)];
    case 'world.activeSession':
      return [facts.activeSession()];
    case 'sheet':
      return [facts.sheet(restore.entityId)];
    case 'clue':
      return [facts.clue(restore.clueId)];
    case 'disclosure':
      return [facts.disclosure(restore.knowledgeId)];
    case 'attempt':
      return [facts.attempt(restore.key)];
    case 'revealed':
      return [facts.revealed(restore.key)];
    case 'shared':
      return [facts.shared(restore.key)];
    case 'claim':
      return [facts.claim(restore.target)];
    case 'contradiction':
      return [facts.contradiction(restore.key)];
    case 'encounter':
      return [facts.encounter()];
    case 'statblock':
      return [facts.statBlock(restore.entityId)];
    case 'reactionWindow':
      return [facts.reaction(restore.windowId)];
  }
}

/** True if a fact belongs to the given entity (its existence or any facet). */
export function isFactOfEntity(fact: FactKey, entityId: string): boolean {
  const key = facts.entity(entityId);
  return fact === key || fact.startsWith(`${key}#`);
}

/** True if a fact belongs to the given scene. */
export function isFactOfScene(fact: FactKey, sceneId: string): boolean {
  const key = facts.scene(sceneId);
  return fact === key || fact.startsWith(`${key}#`);
}

import { assetFootprint, assetRestoredFacts } from '../assets/footprints.ts';
import { itemFootprint } from '../items/footprints.ts';
import { chronicleFootprint } from '../chronicle/decide.ts';
import { namedEntityIds } from '../combat/named-entities.ts';
import { consideredCombatants } from '../combat/reactions.ts';
import { attemptKey, insightKey, scopedKey, shownKey } from '../investigation/records.ts';
import { pairKey } from '../contradiction/records.ts';
import { holderOf, scopeKey } from '../knowledge/records.ts';
import type { KernelEvent, Restore } from './events.ts';
import { allEntityFacts, entityChecked, facts, type FactKey } from './fact-keys.ts';
import { premiseFacts } from './premise-facts.ts';

/**
 * Fact footprints (docs/adr/0007-world-kernel-model-and-event-store.md,
 * "Undo footprint"). Every event declares the canonical facts its decision
 * depended on (`reads`) and the facts it changed (`writes`). Footprints are
 * derived from stored payloads only, so they can be recomputed from history.
 *
 * Later domains must declare footprints for their events, including reads of
 * kernel facts (for example knowledge about an entity reads `entity:<id>`).
 * Fact names live in `fact-keys.ts`; what a recorded premise stands for, in
 * `premise-facts.ts`.
 */
export interface Footprint {
  readonly reads: readonly FactKey[];
  readonly writes: readonly FactKey[];
}

export function footprintOf(event: KernelEvent): Footprint {
  // Every event happens at the current world time, so it depends on the clock.
  const clock = facts.clock();
  switch (event.type) {
    case 'PreparedPartyEstablished':
      return {
        reads: [clock, facts.campaign(), ...event.payload.characterIds.map(facts.entity)],
        writes: [facts.preparedParty()],
      };
    case 'CampaignBootstrapped':
      return { reads: [facts.campaign(), facts.preparedParty()], writes: [facts.bootstrap()] };
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
          ...(p.scope.kind === 'PARTY'
            ? [facts.preparedParty(), ...p.witnesses.map((id) => facts.rosterCharacter(id))]
            : []),
          ...(p.scope.kind === 'CHARACTER'
            ? [facts.preparedParty(), facts.rosterCharacter(p.scope.characterId)]
            : []),
          ...p.relatedKnowledge.map((id) => facts.knowledge(id)),
          ...p.causedBy.map((id) => facts.memory(id)),
          ...(p.sessionId === null ? [] : [facts.session(p.sessionId)]),
          // A generated summary rests on the names it quotes (Stage 130).
          ...(p.named ?? []).map((id) => facts.entityProfile(id)),
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
          facts.preparedParty(),
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
    case 'EvidenceShown': {
      // The NPC saw it; the subjects it newly shows to that NPC (ADR 0020 §1).
      const { characterId, npcId, scope, knowledgeId, subjects } = event.payload;
      return {
        reads: [
          clock,
          ...entityChecked(characterId),
          facts.entityPlacement(characterId),
          ...entityChecked(npcId),
          facts.entityPlacement(npcId),
          facts.knowledge(knowledgeId),
        ],
        writes: subjects.map((subjectId) => facts.shown(shownKey(scope, npcId, subjectId))),
      };
    }
    case 'InsightChecked': {
      // The check, its sheet, and the names its inference quotes (ADR 0020 §4).
      const { characterId, npcId, topicId, inferenceId } = event.payload;
      return {
        reads: [
          clock,
          ...entityChecked(characterId),
          facts.entityPlacement(characterId),
          ...entityChecked(npcId),
          facts.entityPlacement(npcId),
          facts.sheet(characterId),
          ...(inferenceId === null
            ? []
            : [facts.entityProfile(npcId), facts.entityProfile(topicId)]),
        ],
        writes: [facts.attempt(insightKey(characterId, npcId))],
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
          facts.preparedParty(),
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
      // Both records, both claims, (for a character reached through the party) membership,
      // and the names its statement quotes (Stage 120; earlier events name only the subject).
      const { scope, between, subjectId, named } = event.payload;
      const [a, b] = between;
      return {
        reads: [
          clock,
          facts.knowledge(a),
          facts.knowledge(b),
          facts.claim({ kind: 'knowledge', knowledgeId: a }),
          facts.claim({ kind: 'knowledge', knowledgeId: b }),
          ...(scope.kind === 'CHARACTER'
            ? [facts.preparedParty(), facts.rosterCharacter(scope.characterId)]
            : []),
          ...(named ?? [subjectId]).map((id) => facts.entityProfile(id)),
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
      // Authoring is refused for a combatant, so it relied on the encounter as it was (Gate 03).
      return {
        reads: [clock, facts.encounter(), facts.entity(event.payload.entityId)],
        writes: [facts.statBlock(event.payload.entityId)],
      };
    case 'AttackPerformed':
    case 'SpellCast':
    case 'DamageApplied':
    case 'HealingApplied':
    case 'HitPointsAdjusted':
    case 'SavingThrowRolled':
    case 'ConditionApplied':
    case 'DeathSaveRolled':
      // Narrative records: their fold needs every creature they name (G03-H05).
      return {
        reads: [clock, facts.encounter(), ...namedEntityIds(event.payload).map(facts.entity)],
        writes: [],
      };
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
    case 'CharacterReleased':
      // Who controlled the character is what the release read and changed (ADR 0036 §4).
      return {
        reads: [
          clock,
          facts.entity(event.payload.characterId),
          facts.rosterCharacter(event.payload.characterId),
        ],
        writes: [
          facts.rosterCharacter(event.payload.characterId),
          facts.rosterPlayer(event.payload.playerActorId),
        ],
      };
    case 'AssetAdopted':
    case 'AssetRequested':
    case 'AssetJobStarted':
    case 'AssetGenerated':
    case 'AssetJobFailed':
    case 'AssetRequestCancelled':
    case 'AssetRetracted':
    case 'AssetApproved':
      return assetFootprint(event);
    case 'ChronicleGenerated':
      // A chapter rests on everything it tells (ADR 0024 §4).
      return chronicleFootprint(event.payload);
    case 'WeatherSet':
      // A location's own weather, from now on (ADR 0023 §1).
      return {
        reads: [clock, ...entityChecked(event.payload.locationId)],
        writes: [facts.weather(event.payload.locationId)],
      };
    case 'RelationshipChanged':
      // A living NPC's attitude (ADR 0019 §3).
      return {
        reads: [clock, ...entityChecked(event.payload.npcId)],
        writes: [facts.relationship(event.payload.npcId)],
      };
    case 'ItemGranted':
    case 'ItemEquipped':
    case 'ItemUnequipped':
    case 'ItemUsed':
    case 'ItemTransferred':
    case 'ItemSplit':
      return itemFootprint(event);
    case 'AuthoringPremisesRecorded':
      // Reads only: what an authoring commit's legality rested on (ADR 0019 §2).
      return {
        reads: [
          clock,
          ...event.payload.premises.flatMap((premise) => entityChecked(premise.entityId)),
        ],
        writes: [],
      };
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
    case 'release':
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
    case 'shown':
      return [facts.shown(restore.key)];
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
    case 'relationship':
      return [facts.relationship(restore.npcId)];
    case 'assetRequest':
    case 'asset':
    case 'assetCanonical':
      return assetRestoredFacts(restore);
    case 'weather':
      return [facts.weather(restore.locationId)];
    case 'chronicle':
      return [facts.chronicle(restore.chronicleId)];
    case 'possession':
      return [
        facts.possession(restore.itemId),
        ...(restore.holderId === null ? [] : [facts.equipment(restore.holderId)]),
      ];
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

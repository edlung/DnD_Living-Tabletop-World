import type { QuestListResponse } from '@ltw/contracts';
import type { CampaignSnapshot, StoredCommand } from '@ltw/domain';

import type { Exchange } from './session.ts';

/**
 * Ravenford's minimum commands and events (RAVENFORD_SPEC.md: "Names may
 * change; semantics require an ADR to change") against what implements them
 * and the accepted ADR that says so (docs/adr/0025-ravenford-integration.md
 * §1). Each entry has an executable check over a played session: the
 * effective history, the command log, the HTTP exchanges, and the quest log.
 * A semantic with no executable path would be listed as unavailable, never
 * skipped; none is.
 */
export interface Evidence {
  readonly events: ReadonlySet<string>;
  readonly commands: ReadonlySet<string>;
  readonly commandLog: readonly StoredCommand[];
  readonly snapshot: CampaignSnapshot;
  readonly exchanges: readonly Exchange[];
  readonly quests: QuestListResponse;
}

export interface LedgerEntry {
  readonly name: string;
  readonly kind: 'command' | 'event';
  /** What implements it, in this system's names. */
  readonly equivalent: string;
  readonly adr: string;
  readonly check: (evidence: Evidence) => boolean;
}

const has = (types: readonly string[]) => (e: Evidence) => types.every((t) => e.events.has(t));
const ran = (types: readonly string[]) => (e: Evidence) => types.every((t) => e.commands.has(t));
const routed =
  (pattern: RegExp, persona: Exchange['persona'] = 'player') =>
  (e: Evidence) =>
    e.exchanges.some((x) => x.persona === persona && pattern.test(x.url) && x.status === 200);
const recorded =
  (predicate: (event: CampaignSnapshot['history'][number]) => boolean) => (e: Evidence) =>
    e.snapshot.history.some(predicate);
const questTransition = (type: string) => (e: Evidence) =>
  e.quests.quests.some((quest) => quest.transitions.some((t) => t.type === type));

export const RAVENFORD_LEDGER: readonly LedgerEntry[] = [
  // Minimum commands.
  {
    name: 'EnterLocation',
    kind: 'command',
    equivalent: 'EnterLocation',
    adr: '0013',
    check: ran(['EnterLocation']),
  },
  {
    name: 'SelectEntity',
    kind: 'command',
    equivalent: 'GET /entities/:entityId/context (a read; nothing is recorded)',
    adr: '0012',
    check: routed(/\/entities\/[^/]+\/context\?/),
  },
  {
    name: 'InteractWithEntity',
    kind: 'command',
    equivalent: 'the chosen context action: ExamineEntity, AskAbout, ShowEvidence, InsightCheck',
    adr: '0012, 0013, 0020',
    check: ran(['ExamineEntity', 'AskAbout', 'ShowEvidence', 'InsightCheck']),
  },
  {
    name: 'StartConversation',
    kind: 'command',
    equivalent: 'POST /npcs/:npcId/dialogue with intent talk (a reply, no command)',
    adr: '0020 §3',
    check: routed(/\/npcs\/[^/]+\/dialogue$/),
  },
  {
    name: 'ChooseDialogueIntent',
    kind: 'command',
    equivalent: 'dialogue intents ask, show, insight → AskAbout, ShowEvidence, InsightCheck',
    adr: '0020 §3',
    check: (e) =>
      ['AskAbout', 'ShowEvidence', 'InsightCheck'].every((type) =>
        e.commandLog.some((c) => c.commandType === type && c.commandId.startsWith('dialogue:')),
      ),
  },
  {
    name: 'PerformSkillCheck',
    kind: 'command',
    equivalent:
      'checks resolved by Rules inside ExamineEntity (investigation, perception) and InsightCheck',
    adr: '0013, 0020 §4',
    check: (e) =>
      recorded((x) => x.type === 'EvidenceExamined' && x.payload.roll !== null)(e) &&
      has(['InsightChecked'])(e),
  },
  {
    name: 'CreateHypothesis',
    kind: 'command',
    equivalent: 'FormHypothesis',
    adr: '0013',
    check: ran(['FormHypothesis']),
  },
  {
    name: 'InspectEvidence',
    kind: 'command',
    equivalent: 'ExamineEntity with method inspect',
    adr: '0013',
    check: recorded((x) => x.type === 'EvidenceExamined' && x.payload.method === 'inspect'),
  },
  {
    name: 'MoveCharacter',
    kind: 'command',
    equivalent: 'EnterLocation between places; MoveCombatant on the battlefield',
    adr: '0013, 0015',
    check: ran(['EnterLocation', 'MoveCombatant']),
  },
  {
    name: 'StartCombat',
    kind: 'command',
    equivalent: 'StartCombat',
    adr: '0015',
    check: ran(['StartCombat']),
  },
  {
    name: 'PerformAttack',
    kind: 'command',
    equivalent: 'Attack',
    adr: '0015',
    check: ran(['Attack']),
  },
  {
    name: 'CastSpell',
    kind: 'command',
    equivalent: 'CastSpell',
    adr: '0015',
    check: ran(['CastSpell']),
  },
  {
    name: 'UseReaction',
    kind: 'command',
    equivalent: 'UseReaction (CAST); DeclineReaction (IGNORE)',
    adr: '0016',
    check: ran(['UseReaction']),
  },
  { name: 'EndTurn', kind: 'command', equivalent: 'EndTurn', adr: '0015', check: ran(['EndTurn']) },
  {
    name: 'CreateNPC',
    kind: 'command',
    equivalent: 'ApplyAuthoring with CreateEntity (kind npc), from the DM’s words',
    adr: '0007, 0017, 0018',
    check: (e) =>
      ran(['ApplyAuthoring'])(e) &&
      recorded(
        (x) =>
          x.type === 'EntityCreated' &&
          x.payload.kind === 'npc' &&
          x.causation.commandType === 'ApplyAuthoring',
      )(e),
  },
  {
    name: 'ModifyNPC',
    kind: 'command',
    equivalent:
      'UpdateEntityProfile, PlaceEntity, ChangeEntityStatus (directly or through authoring)',
    adr: '0007, 0018',
    check: ran(['UpdateEntityProfile']),
  },
  {
    name: 'AddKnowledge',
    kind: 'command',
    equivalent: 'AddKnowledge (directly or within ApplyAuthoring)',
    adr: '0008, 0018',
    check: recorded(
      (x) => x.type === 'KnowledgeAssigned' && x.causation.commandType === 'ApplyAuthoring',
    ),
  },
  {
    name: 'AdvanceWorldTime',
    kind: 'command',
    equivalent: 'AdvanceWorldTime',
    adr: '0006',
    check: ran(['AdvanceWorldTime']),
  },
  {
    name: 'GenerateChronicle',
    kind: 'command',
    equivalent: 'POST /chronicle → GenerateChronicle',
    adr: '0024',
    check: ran(['GenerateChronicle']),
  },
  // Minimum events.
  {
    name: 'LocationEntered',
    kind: 'event',
    equivalent: 'EntityPlaced, from EnterLocation',
    adr: '0013',
    check: recorded(
      (x) => x.type === 'EntityPlaced' && x.causation.commandType === 'EnterLocation',
    ),
  },
  {
    name: 'EntitySelected',
    kind: 'event',
    equivalent: 'none: selecting is a read of the context, logged per request, never recorded',
    adr: '0012, 0009',
    check: routed(/\/entities\/[^/]+\/context\?/),
  },
  {
    name: 'ConversationStarted',
    kind: 'event',
    equivalent: 'none for Talk (a traced reply); InformationShared when something is told',
    adr: '0020 §3',
    check: (e) => routed(/\/npcs\/[^/]+\/dialogue$/)(e) && has(['InformationShared'])(e),
  },
  {
    name: 'InformationShared',
    kind: 'event',
    equivalent: 'InformationShared',
    adr: '0013',
    check: has(['InformationShared']),
  },
  {
    name: 'KnowledgeDiscovered',
    kind: 'event',
    equivalent: 'KnowledgeAssigned to the party, from examination, answers, and Insight',
    adr: '0013',
    check: recorded(
      (x) => x.type === 'KnowledgeAssigned' && x.causation.commandType === 'ExamineEntity',
    ),
  },
  {
    name: 'EvidenceExamined',
    kind: 'event',
    equivalent: 'EvidenceExamined',
    adr: '0013',
    check: has(['EvidenceExamined']),
  },
  {
    name: 'HypothesisCreated',
    kind: 'event',
    equivalent: 'KnowledgeAssigned of type HYPOTHESIS, from FormHypothesis',
    adr: '0013',
    check: recorded(
      (x) =>
        x.type === 'KnowledgeAssigned' &&
        x.payload.knowledgeType === 'HYPOTHESIS' &&
        x.causation.commandType === 'FormHypothesis',
    ),
  },
  {
    name: 'ContradictionDetected',
    kind: 'event',
    equivalent: 'ContradictionDetected',
    adr: '0014',
    check: has(['ContradictionDetected']),
  },
  {
    name: 'SkillCheckPerformed',
    kind: 'event',
    equivalent: 'the roll recorded in EvidenceExamined and InsightChecked',
    adr: '0013, 0020 §4',
    check: (e) =>
      recorded((x) => x.type === 'EvidenceExamined' && x.payload.roll !== null)(e) &&
      has(['InsightChecked'])(e),
  },
  {
    name: 'NPC_CREATED',
    kind: 'event',
    equivalent: 'EntityCreated (kind npc)',
    adr: '0007',
    check: recorded(
      (x) =>
        x.type === 'EntityCreated' &&
        x.payload.kind === 'npc' &&
        x.causation.commandType === 'ApplyAuthoring',
    ),
  },
  {
    name: 'NPC_UPDATED',
    kind: 'event',
    equivalent: 'EntityProfileUpdated or EntityStatusChanged',
    adr: '0007',
    check: has(['EntityProfileUpdated']),
  },
  {
    name: 'NPC_PLACED',
    kind: 'event',
    equivalent: 'EntityPlaced',
    adr: '0007',
    check: recorded((x) => x.type === 'EntityPlaced' && x.payload.entityId === 'tomas-reed'),
  },
  {
    name: 'ASSET_GENERATION_REQUESTED',
    kind: 'event',
    equivalent: 'AssetRequested, within the authoring commit',
    adr: '0022 §2',
    check: recorded(
      (x) => x.type === 'AssetRequested' && x.causation.commandType === 'ApplyAuthoring',
    ),
  },
  ...(
    [
      'CombatStarted',
      'TurnStarted',
      'AttackPerformed',
      'SpellCast',
      'ReactionWindowOpened',
      'ReactionUsed',
      'DamageApplied',
      'ConditionApplied',
      'CombatEnded',
    ] as const
  ).map((name) => ({
    name,
    kind: 'event' as const,
    equivalent: name,
    adr: name.startsWith('Reaction') ? '0016' : '0015',
    check: has([name]),
  })),
  {
    name: 'WorldTimeAdvanced',
    kind: 'event',
    equivalent: 'WorldTimeAdvanced',
    adr: '0006',
    check: has(['WorldTimeAdvanced']),
  },
  {
    name: 'QuestActivated',
    kind: 'event',
    equivalent: 'a transition of the quest projection (never recorded: invariant 15)',
    adr: '0025 §2',
    check: questTransition('QuestActivated'),
  },
  {
    name: 'QuestUpdated',
    kind: 'event',
    equivalent: 'a transition of the quest projection (never recorded: invariant 15)',
    adr: '0025 §2',
    check: questTransition('QuestUpdated'),
  },
  {
    name: 'RelationshipChanged',
    kind: 'event',
    equivalent: 'RelationshipChanged',
    adr: '0019 §3',
    check: has(['RelationshipChanged']),
  },
  {
    name: 'ChronicleGenerated',
    kind: 'event',
    equivalent: 'ChronicleGenerated',
    adr: '0024',
    check: has(['ChronicleGenerated']),
  },
];

import { ATTITUDES } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN,
  DM,
  ELOWEN,
  PLAYER,
  type InvestigationWorld,
} from '../investigation/testing/world.ts';
import { scopeKey } from '../knowledge/records.ts';
import { npcDialogueContext, sharedSources, type NpcDialogueContext } from './dialogue-context.ts';
import { checkTalk } from './talk.ts';
import {
  BOUNDARY_NPCS,
  NPC_BOUNDARY,
  NPC_PLACE,
  boundaryWorld,
  neverSaidBy,
  type BoundaryNpc,
} from './testing/boundary.ts';

/**
 * Gate 04 isolation of the NPC context (docs/adr/0020-npc-intelligence.md §3,
 * ARCHITECTURE.md "NPC Context Isolation"). For every NPC, attitude, evidence
 * shown, and topic asked, the context it would speak from holds none of the
 * planted secrets (`fixtures/ravenford/npc-boundary.json`): no truth, DM
 * notes, descriptions, claims, clues, secrets, other holders' records or
 * memories, or unknown names; guarded content only once its disclosure rule
 * allows it. Each line comes from the NPC's own records or memories, or
 * PUBLIC ones. Sayable markers prove the check is not vacuous.
 */
const EVIDENCE = {
  'feature-19c7c7f7': 'nb-show-symbol',
  'old-trade-road': 'nb-show-road',
} as const;
const SHOWN = [null, 'feature-19c7c7f7', 'old-trade-road'] as const;
const TOPICS = [null, 'feature-19c7c7f7', 'guild-caravan', 'old-trade-road', 'captain-thorne'];

async function scene(npcId: BoundaryNpc, attitude: string, shown: (typeof SHOWN)[number]) {
  const world = await boundaryWorld();
  for (const [subject, knowledgeId] of Object.entries(EVIDENCE)) {
    await world.submit(
      {
        type: 'AddKnowledge',
        knowledgeId,
        scope: { kind: 'PARTY' },
        knowledgeType: 'EVIDENCE',
        statement: `The party found evidence about ${subject}.`,
        subjects: [subject],
        knownSince: null,
      },
      DM,
    );
  }
  await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: NPC_PLACE[npcId] });
  await world.submit({ type: 'SetRelationship', npcId, attitude }, DM);
  if (shown !== null) {
    await world.submit({
      type: 'ShowEvidence',
      characterId: ELOWEN,
      npcId,
      knowledgeId: EVIDENCE[shown],
    });
  }
  return world;
}

async function askAndBuild(world: InvestigationWorld, npcId: string, topicId: string | null) {
  let justShared: string[] = [];
  if (topicId !== null) {
    const asked = await world.submit({ type: 'AskAbout', characterId: ELOWEN, npcId, topicId });
    const snapshot = await world.engine.load(CAMPAIGN);
    justShared = sharedSources(snapshot?.history ?? [], asked.commandId ?? '');
  }
  const state = await world.state();
  const talk = checkTalk(state, PLAYER, ELOWEN, npcId);
  if (!talk.ok) throw new Error(`cannot talk: ${talk.code}`);
  const context = npcDialogueContext(state, { speaker: talk.speaker, npcId, topicId, justShared });
  if (!context) throw new Error('no context');
  return { state, context, known: talk.speaker.known };
}

/** Everything a provider could be told: names and lines, never IDs. */
function spoken(context: NpcDialogueContext): string {
  const entities = [
    context.npc,
    context.speaker,
    ...(context.place ? [context.place] : []),
    ...context.around,
    ...(context.topic ? [context.topic] : []),
    ...context.shown,
    ...context.guarded,
  ];
  const lines = [...context.justTold, ...context.mayTell, ...context.common, ...context.memories];
  return [
    context.attitude,
    ...entities.map((entity) => `${entity.kind} ${entity.name ?? ''}`),
    ...lines.map((line) => line.text),
  ].join('\n');
}

describe('the NPC context holds only what the NPC may say', () => {
  for (const npcId of BOUNDARY_NPCS) {
    it(`${npcId}: every attitude, evidence shown, and topic`, async () => {
      for (const attitude of ATTITUDES) {
        for (const shown of SHOWN) {
          const world = await scene(npcId, attitude, shown);
          for (const topicId of TOPICS) {
            const where = `${npcId} ${attitude} shown=${String(shown)} topic=${String(topicId)}`;
            const { state, context, known } = await askAndBuild(world, npcId, topicId);
            const text = spoken(context);

            for (const marker of neverSaidBy(npcId))
              expect(text, `${where}: ${marker}`).not.toContain(marker);
            for (const marker of NPC_BOUNDARY.sayableBy[npcId])
              expect(text, where).toContain(marker);
            const locked =
              attitude === 'HOSTILE' ||
              attitude === 'WARY' ||
              (attitude !== 'TRUSTED' && shown === null);
            if (locked) {
              for (const marker of NPC_BOUNDARY.guardedBy[npcId]) {
                expect(text, `${where}: ${marker}`).not.toContain(marker);
              }
            }

            const own = scopeKey({ kind: 'NPC', npcId });
            for (const line of [...context.justTold, ...context.mayTell, ...context.common]) {
              const record = state.knowledge.get(line.sourceId);
              expect([own, 'PUBLIC'], where).toContain(record && scopeKey(record.scope));
              expect(['SECRET', 'UNKNOWN', 'CONTRADICTION'], where).not.toContain(
                record?.knowledgeType,
              );
            }
            for (const line of context.memories) {
              const memory = state.memories.get(line.sourceId);
              expect([own, 'PUBLIC'], where).toContain(memory && scopeKey(memory.scope));
            }
            const named = [
              context.npc,
              context.place,
              ...context.around,
              context.topic,
              ...context.shown,
              ...context.guarded,
            ];
            for (const entity of named) {
              if (entity && entity.name !== null)
                expect(known.has(entity.entityId), `${where}: ${entity.entityId}`).toBe(true);
            }
          }
        }
      }
    }, 120_000);
  }
});

/**
 * Owner decisions 11, SI-N1: what the NPC has already told the speaker. After every topic
 * was asked of a trusting NPC that was shown evidence, each context, asked again or not,
 * knows they have met; its told-before lines are its own records that its recorded sharing
 * told this scope, never a SECRET or another holder's record, and no planted secret enters.
 */
describe('what it has already told stays inside the boundary', () => {
  for (const npcId of BOUNDARY_NPCS) {
    it(`${npcId}: trusted, shown evidence, every topic asked, then asked again`, async () => {
      const world = await scene(npcId, 'TRUSTED', 'feature-19c7c7f7');
      const topics = TOPICS.filter((topicId) => topicId !== null);
      for (const topicId of topics) await askAndBuild(world, npcId, topicId);
      for (const topicId of TOPICS) {
        const { state, context } = await askAndBuild(world, npcId, topicId);
        expect(context.metBefore).toBe(true);
        const told = context.mayTell.filter((line) => line.toldBefore);
        expect(told.length, 'not vacuous').toBeGreaterThan(0);
        const text = `${spoken(context)}\n${JSON.stringify(context)}`;
        for (const marker of neverSaidBy(npcId)) expect(text, marker).not.toContain(marker);
        const own = scopeKey({ kind: 'NPC', npcId });
        for (const line of context.mayTell) {
          const record = state.knowledge.get(line.sourceId);
          expect(record && scopeKey(record.scope)).toBe(own);
          expect(['SECRET', 'UNKNOWN', 'CONTRADICTION']).not.toContain(record?.knowledgeType);
          expect(line.toldBefore).toBe(state.investigation.shared.has(`PARTY|${line.sourceId}`));
          if (line.aboutTopic) expect(record?.subjects).toContain(topicId);
        }
      }
    }, 60_000);
  }
});

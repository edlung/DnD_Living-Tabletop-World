import type { CommandResult, NpcDialogueResponse } from '@ltw/contracts';
import { checkTalk, dialogueSourceIds, npcDialogueContext, sharedSources } from '@ltw/domain';

import { TOKENS, post } from '../ravenford-app.ts';
import {
  DIALOGUE_CASES,
  NPC_PLACES,
  PARTY_EVIDENCE,
  type DialogueIntent,
  type EvalNpc,
} from './cases.ts';
import { remoteValid, type CapabilityResult, type Row } from './eval-rows.ts';
import { observe, timed, type EvalContext, type EvalWorld } from './eval-world.ts';
import { dialogueIsolation, forbiddenFor, lexicalLeaks } from './oracles.ts';

/**
 * NPC dialogue evaluation with the Gate 04 replay (docs/STAGE_300_REMEDIATION_DESIGN.md §4;
 * ADR 0032, checkpoint C repair 1). For each NPC: three plain cases, then every attitude and
 * disclosure scenario (`cases.ts`) with every Gate 04 intent and injection line. After each
 * request the runner rebuilds the context the route gave the NPC, with the route's own domain
 * functions on the same snapshot (`checkTalk`, `npcDialogueContext`, `sharedSources`), and checks
 * the exact provider input against it (`dialogueIsolation`) apart from the reply's lexical scan.
 * NPC fidelity and voice are never judged here.
 */
const CAMPAIGN = 'ravenford';
const BASE = `/campaigns/${CAMPAIGN}`;
const ELOWEN = 'elowen-starwhisper';
type Actor = { readonly actorId: string; readonly kind: 'user' };
const DM: Actor = { actorId: 'dm-ravenford', kind: 'user' };
const PLAYER: Actor = { actorId: 'player-elowen', kind: 'user' };

/** The context the route built for this request, as text and source IDs; null when none. */
async function rebuiltContext(
  world: EvalWorld,
  npc: EvalNpc,
  intent: DialogueIntent,
  command: CommandResult | null,
): Promise<{ text: string; sourceIds: readonly string[] } | null> {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (snapshot === null) return null;
  const talk = checkTalk(snapshot.state, PLAYER, ELOWEN, npc);
  if (!talk.ok) return null;
  const accepted = command === null || command.status !== 'rejected';
  const context = npcDialogueContext(snapshot.state, {
    speaker: talk.speaker,
    npcId: npc,
    topicId: typeof intent['topicId'] === 'string' ? intent['topicId'] : null,
    justShared:
      command !== null && accepted ? sharedSources(snapshot.history, command.commandId) : [],
  });
  return context === null
    ? null
    : { text: JSON.stringify(context), sourceIds: dialogueSourceIds(context) };
}

export async function dialogue(context: EvalContext): Promise<CapabilityResult> {
  const world = await context.world();
  const rows: Row[] = [];
  let n = 0;
  const run = async (command: Readonly<Record<string, unknown>>, actor: Actor = DM) => {
    n += 1;
    return world.engine.execute({
      commandId: `ev.d.${String(n)}`,
      campaignId: CAMPAIGN,
      actor,
      command,
    });
  };
  // Set up through real commands; one that changes nothing (already so) is fine.
  const setup = async (command: Readonly<Record<string, unknown>>, actor: Actor = DM) => {
    const result = await run(command, actor);
    if (result.status === 'rejected' && result.code !== 'NO_EFFECT') {
      throw new Error(`setup ${String(command['type'])} rejected: ${result.code}`);
    }
  };
  try {
    await setup(PARTY_EVIDENCE);
    for (const [npc, place] of Object.entries(NPC_PLACES) as [EvalNpc, string][]) {
      await setup({ type: 'EnterLocation', characterId: ELOWEN, locationId: place });
      for (const testCase of DIALOGUE_CASES) {
        if (testCase.scenario !== null) {
          await setup({
            type: 'SetRelationship',
            npcId: npc,
            attitude: testCase.scenario.attitude,
          });
          // Showing again after an earlier scenario may be refused; the evidence stays shown.
          if (testCase.scenario.show) {
            await run(
              {
                type: 'ShowEvidence',
                characterId: ELOWEN,
                npcId: npc,
                knowledgeId: PARTY_EVIDENCE.knowledgeId,
              },
              PLAYER,
            );
          }
        }
        const before = world.sent.length;
        const { value: res, ms } = await timed(() =>
          post(
            world.app,
            `${BASE}/npcs/${npc}/dialogue`,
            {
              characterId: ELOWEN,
              intent: testCase.intent,
              ...(testCase.line === null ? {} : { line: testCase.line }),
            },
            TOKENS.player,
          ),
        );
        const body = res.json<NpcDialogueResponse>();
        const reply = body.reply;
        const text = reply?.text ?? '';
        const rebuilt = await rebuiltContext(world, npc, testCase.intent, body.command);
        const seen = await observe(world, reply?.traceId ?? null);
        rows.push({
          case: `${npc}: ${testCase.name}`,
          semantic: {
            pass: null,
            outcome: 'not judged (fidelity and voice need human or independent review)',
            reason: null,
          },
          technical: {
            status: reply?.status ?? `HTTP ${String(res.statusCode)}`,
            remoteValid: remoteValid(seen.attempts),
            attempts: seen.attempts,
          },
          lexicalLeaks: lexicalLeaks(text, forbiddenFor(npc, rebuilt?.text ?? null)),
          isolation: dialogueIsolation({
            npc,
            bodies: world.sent.slice(before),
            line: testCase.line,
            context: rebuilt,
            traceSourceIds: seen.trace?.sourceIds ?? null,
          }),
          endToEndMs: ms,
          traceId: reply?.traceId ?? null,
          accounting: seen.accounting,
          note: testCase.injection ? 'Gate 04 replay' : 'scenario',
          reply: text,
        });
      }
    }
  } finally {
    await world.app.close();
  }
  return { rows };
}

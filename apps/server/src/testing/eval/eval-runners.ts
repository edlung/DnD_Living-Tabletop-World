import type {
  ChronicleListResponse,
  DmIntentResponse,
  EntityContextResponse,
  GenerateChronicleResponse,
} from '@ltw/contracts';

import { TOKENS, get, post } from '../ravenford-app.ts';
import { SECRET_MARKERS } from './cases.ts';
import { dialogue } from './dialogue-runner.ts';
import { INTENT_CASES } from './intent-cases.ts';
import {
  chronicleModelVerdict,
  intentVerdict,
  isolationVerdict,
  relevanceVerdict,
} from './oracles.ts';
import { observe, timed, type EvalContext, type EvalWorld } from './eval-world.ts';
import { remoteValid, type Capability, type CapabilityResult, type Row } from './eval-rows.ts';

/**
 * The Russian evaluation cases over the composed gateway (docs/STAGE_300_REMEDIATION_DESIGN.md
 * §4; ADR 0032, checkpoint C). Every row keeps apart: the semantic verdict (null when no oracle
 * can judge it, as for NPC voice), the technical provider outcome from the trace, lexical output
 * checks and the context-isolation check of the exact provider input. Quality is never judged
 * here. End-to-end latency is measured around each HTTP request; attempt latency comes from the
 * trace.
 */
const BASE = '/campaigns/ravenford';

async function intents(context: EvalContext): Promise<CapabilityResult> {
  const world = await context.world();
  const rows: Row[] = [];
  try {
    for (const testCase of INTENT_CASES) {
      const before = world.sent.length;
      const { value: res, ms } = await timed(() =>
        post(world.app, `${BASE}/ai/intents`, { text: testCase.text }, TOKENS.dm),
      );
      const body = res.json<DmIntentResponse>();
      const verdict = intentVerdict(testCase, body);
      const seen = await observe(world, body.traceId);
      rows.push({
        case: testCase.name,
        semantic: { pass: verdict.semanticPass, outcome: verdict.outcome, reason: verdict.reason },
        technical: {
          status: body.status,
          remoteValid: remoteValid(seen.attempts),
          attempts: seen.attempts,
        },
        // Gate 04 for intents: the PUBLIC request carries no planted secret.
        isolation: isolationVerdict(world.sent.slice(before), SECRET_MARKERS),
        endToEndMs: ms,
        traceId: body.traceId,
        accounting: seen.accounting,
        note: `expected ${testCase.expect}`,
      });
    }
  } finally {
    await world.app.close();
  }
  return { rows };
}

async function enter(world: EvalWorld, place: string, n: number) {
  await world.engine.execute({
    commandId: `ev.${String(n)}`,
    campaignId: 'ravenford',
    actor: { actorId: 'dm-ravenford', kind: 'user' },
    command: { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: place },
  });
}

async function chronicle(context: EvalContext): Promise<CapabilityResult> {
  const world = await context.world();
  try {
    const { value: res, ms } = await timed(() =>
      post(
        world.app,
        `${BASE}/chronicle`,
        { title: 'Глава I — Тени на Торговой дороге', perspective: 'PARTY', from: 0 },
        TOKENS.dm,
      ),
    );
    const body = res.json<GenerateChronicleResponse>();
    const listed = await get(world.app, `${BASE}/chronicle?perspective=PARTY`, TOKENS.player);
    const chapter = listed.json<ChronicleListResponse>().chapters.at(-1);
    const seen = await observe(world, body.rendering.traceId);
    // Only the model's own prose is judged; a template or local chapter is reported apart.
    const verdict = chronicleModelVerdict({
      attempts: seen.attempts,
      proseProvider: chapter?.prose.provider ?? null,
      chapter,
      language: 'ru',
    });
    return {
      rows: [
        {
          case: 'Chapter I from the party memories',
          semantic: { pass: verdict.pass, outcome: verdict.outcome, reason: verdict.reason },
          technical: {
            status: `${body.rendering.status} via ${body.rendering.provider ?? '-'}`,
            remoteValid: remoteValid(seen.attempts),
            attempts: seen.attempts,
          },
          chronicle: { authorship: verdict.authorship, rejections: verdict.rejections },
          endToEndMs: ms,
          traceId: body.rendering.traceId,
          accounting: seen.accounting,
          note: `prose from ${chapter?.prose.provider ?? '-'}`,
          reply: (chapter?.prose.paragraphs ?? []).map((p) => p.text).join('\n\n'),
        },
      ],
    };
  } finally {
    await world.app.close();
  }
}

async function relevance(context: EvalContext): Promise<CapabilityResult> {
  const world = await context.world();
  try {
    await enter(world, 'market-square', 1);
    const path = `${BASE}/entities/mira-vale/context?perspective=PLAYER`;
    const reference = await get(world.app, path, TOKENS.player);
    const deterministic = reference.json<EntityContextResponse>().context.actions;
    const { value: res, ms } = await timed(() =>
      get(world.app, `${path}&ranking=ai`, TOKENS.player),
    );
    const body = res.json<EntityContextResponse>();
    const deadlineMs = world.ai.relevanceBudgetMs;
    const verdict = relevanceVerdict({
      deterministic,
      ranked: body,
      elapsedMs: ms,
      deadlineMs,
      toleranceMs: context.relevanceToleranceMs,
    });
    const seen = await observe(world, body.ranking.traceId);
    return {
      deadlineMs,
      rows: [
        {
          case: 'rank Mira’s actions',
          semantic: {
            pass: verdict.issues.length === 0,
            outcome: 'action-set and deadline contract',
            reason: verdict.issues.join('; ') || null,
          },
          technical: {
            status: `${body.ranking.status} from ${body.ranking.source}`,
            remoteValid: remoteValid(seen.attempts),
            attempts: seen.attempts,
          },
          endToEndMs: ms,
          traceId: body.ranking.traceId,
          accounting: seen.accounting,
          note: `deadline ${String(deadlineMs)} ms (+${String(context.relevanceToleranceMs)} ms HTTP tolerance)`,
        },
      ],
    };
  } finally {
    await world.app.close();
  }
}

export const RUNNERS: Readonly<
  Record<Capability, (context: EvalContext) => Promise<CapabilityResult>>
> = {
  reasoning: intents,
  'npc-dialogue': dialogue,
  narrative: chronicle,
  'fast-context': relevance,
};

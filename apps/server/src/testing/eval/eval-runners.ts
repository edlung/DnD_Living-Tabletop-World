import { InMemoryAiTraceStore } from '@ltw/ai';
import type {
  AiTraceView,
  DmIntentResponse,
  EntityContextResponse,
  GenerateChronicleResponse,
  NpcDialogueResponse,
} from '@ltw/contracts';
import { InMemoryEventStore } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';

import { createAiGateway } from '../../ai/gateway.ts';
import { loadConfig, type Env } from '../../platform/config/config.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../../world-engine/ravenford-seed.ts';
import {
  MIDDLE_ENTROPY,
  TOKENS,
  get,
  plantNpcBoundary,
  post,
  ravenfordApp,
  seededEngine,
  testAuthoring,
} from '../ravenford-app.ts';
import { DIALOGUE_SCENARIOS, INTENT_CASES, NEVER_SAID } from './cases.ts';

/**
 * The Russian evaluation cases over the composed gateway (docs/adr/0032-live-ai.md §5). At
 * remediation checkpoint A they run offline only: provider keys and routes are removed from the
 * environment before configuration is read, and composition builds no remote provider anyway.
 * Checks here are structural and lexical; semantic oracles are checkpoint C.
 */
const BASE = '/campaigns/ravenford';
const CYRILLIC = /[Ѐ-ӿ]/u;
export const CAPABILITIES = ['reasoning', 'npc-dialogue', 'narrative', 'fast-context'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Variables that could name or reach a remote provider; never read by an offline run. */
const REMOTE_VARIABLES = ['ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'LTW_AI_ROUTES'];

export const offlineEnv = (env: Env): Env =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !REMOTE_VARIABLES.includes(name)));

async function world(env: Env) {
  const traces = new InMemoryAiTraceStore();
  const ai = createAiGateway(loadConfig(offlineEnv(env)).ai, traces);
  const engine = await seededEngine(
    new InMemoryEventStore(),
    scriptedDice(Array(40).fill(15)),
    MIDDLE_ENTROPY,
    RAVENFORD_RU_FIXTURES_DIR,
  );
  await plantNpcBoundary(engine);
  const app = await ravenfordApp(engine, ai, testAuthoring());
  return { app, engine, ai, traces };
}

export interface Row {
  readonly case: string;
  /** A structural/lexical check only, never semantic correctness. */
  readonly structuralPass: boolean;
  readonly note: string;
  readonly reply?: string;
}
export interface Stats {
  readonly calls: number;
  readonly providers: readonly string[];
  readonly p50Ms: number;
  readonly p95Ms: number;
}
export interface CapabilityResult {
  readonly rows: Row[];
  readonly stats: Stats;
}

function stats(traces: readonly AiTraceView[]): Stats {
  const attempts = traces.flatMap((t) => ('attempts' in t ? t.attempts : []));
  const ms = attempts.map((a) => a.latencyMs).sort((a, b) => a - b);
  const at = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))] ?? 0;
  return {
    calls: attempts.length,
    providers: [...new Set(attempts.map((a) => a.provider))],
    p50Ms: at(0.5),
    p95Ms: at(0.95),
  };
}

async function intents(env: Env): Promise<CapabilityResult> {
  const { app, traces } = await world(env);
  const rows: Row[] = [];
  for (const c of INTENT_CASES) {
    const res = await post(app, `${BASE}/ai/intents`, { text: c.text }, TOKENS.dm);
    const body = res.json<DmIntentResponse>();
    const commands = (body.proposal?.commands ?? []) as unknown as Record<string, unknown>[];
    rows.push({
      case: c.name,
      structuralPass: body.status === 'PROPOSED' ? c.ok(commands) : c.expectEmpty === true,
      note:
        body.status === 'PROPOSED'
          ? `${String(commands.length)} commands`
          : `${body.status}: ${body.issues.join('; ').slice(0, 120)}`,
    });
  }
  return { rows, stats: stats(traces.all()) };
}

async function dialogue(env: Env): Promise<CapabilityResult> {
  const { app, engine, traces } = await world(env);
  const rows: Row[] = [];
  const places = {
    'mira-vale': 'market-square',
    'orin-stonebeard': 'orins-alchemy',
    'captain-thorne': 'north-gate',
  } as const;
  let n = 0;
  const dm = { actorId: 'dm-ravenford', kind: 'user' } as const;
  for (const [npc, place] of Object.entries(places)) {
    n += 1;
    await engine.execute({
      commandId: `ev.${String(n)}`,
      campaignId: 'ravenford',
      actor: dm,
      command: { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: place },
    });
    const never = [...NEVER_SAID['*'], ...NEVER_SAID[npc as keyof typeof NEVER_SAID]];
    for (const s of DIALOGUE_SCENARIOS) {
      const res = await post(
        app,
        `${BASE}/npcs/${npc}/dialogue`,
        {
          characterId: 'elowen-starwhisper',
          intent: s.intent,
          ...(s.line ? { line: s.line } : {}),
        },
        TOKENS.player,
      );
      const reply = res.json<NpcDialogueResponse>().reply;
      const text = reply?.text ?? '';
      const leaks = never.filter((m) => text.includes(m));
      rows.push({
        case: `${npc}: ${s.name}`,
        structuralPass:
          reply?.status === 'REPLIED' && CYRILLIC.test(text) && text.length <= 600 && !leaks.length,
        note: leaks.length
          ? `LEXICAL MARKER ${leaks.join(',')}`
          : (reply?.status ?? `HTTP ${String(res.statusCode)}`),
        reply: text,
      });
    }
  }
  return { rows, stats: stats(traces.all()) };
}

async function chronicle(env: Env): Promise<CapabilityResult> {
  const { app, traces } = await world(env);
  const res = await post(
    app,
    `${BASE}/chronicle`,
    { title: 'Глава I — Тени на Торговой дороге', perspective: 'PARTY', from: 0 },
    TOKENS.dm,
  );
  const body = res.json<GenerateChronicleResponse>();
  const listed = await get(app, `${BASE}/chronicle?perspective=PARTY`, TOKENS.player);
  const chapters = listed.json<{ chapters: { prose: { paragraphs: { text: string }[] } }[] }>()
    .chapters;
  const text = (chapters[0]?.prose.paragraphs ?? []).map((p) => p.text).join('\n\n');
  return {
    rows: [
      {
        case: 'Chapter I from the party memories',
        structuralPass: body.rendering.status === 'RENDERED' && CYRILLIC.test(text),
        note: `${body.rendering.status} via ${body.rendering.provider ?? '-'}`,
        reply: text,
      },
    ],
    stats: stats(traces.all()),
  };
}

async function relevance(env: Env): Promise<CapabilityResult> {
  const { app, engine, ai, traces } = await world(env);
  await engine.execute({
    commandId: 'ev.r',
    campaignId: 'ravenford',
    actor: { actorId: 'dm-ravenford', kind: 'user' },
    command: {
      type: 'EnterLocation',
      characterId: 'elowen-starwhisper',
      locationId: 'market-square',
    },
  });
  const started = performance.now();
  const res = await get(
    app,
    `${BASE}/entities/mira-vale/context?perspective=PLAYER&ranking=ai`,
    TOKENS.player,
  );
  const elapsed = Math.round(performance.now() - started);
  const ranking = res.json<EntityContextResponse>().ranking;
  return {
    rows: [
      {
        case: 'rank Mira’s actions',
        structuralPass: res.statusCode === 200 && elapsed <= ai.relevanceBudgetMs,
        note: `${ranking.status} from ${ranking.source}, ${String(elapsed)} ms (deadline ${String(ai.relevanceBudgetMs)} ms)`,
      },
    ],
    stats: stats(traces.all()),
  };
}

export const RUNNERS: Record<Capability, (env: Env) => Promise<CapabilityResult>> = {
  reasoning: intents,
  'npc-dialogue': dialogue,
  narrative: chronicle,
  'fast-context': relevance,
};

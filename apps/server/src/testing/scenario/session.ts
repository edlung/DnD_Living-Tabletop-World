import {
  CapabilityRouter,
  InMemoryAiTraceStore,
  createLocalProvider,
  createPlaceholderImageGenerator,
  type RoutedProvider,
  type RelevanceDeps,
} from '@ltw/ai';
import { createCombatEngine } from '@ltw/combat';
import type { CommandResult } from '@ltw/contracts';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  type CampaignSnapshot,
  type EntropySource,
  type EventStore,
} from '@ltw/domain';
import { scriptedDice, skillCheckPort, type Dice } from '@ltw/rules';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { InMemoryAssetContentStore, type AssetContentStore } from '../../assets/content-store.ts';
import { AssetWorker } from '../../assets/worker.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { loadRavenfordSeed } from '../../world-engine/ravenford-seed.ts';
import { EN_SCRIPT, type ScenarioScript } from './script.ts';
import {
  MIDDLE_ENTROPY,
  TOKENS,
  plantNpcBoundary,
  ravenfordApp,
  testAuthoring,
} from '../ravenford-app.ts';

/**
 * Test support (excluded from builds): one Ravenford session over the real
 * HTTP application (docs/adr/0025-ravenford-integration.md §3). The DM, the
 * player, and an outsider act only through public routes with their persona
 * tokens; every exchange is kept, so the whole session's player-facing
 * output can be checked at the end. Skill checks roll from a script (15 by
 * default) and combat dice sit at their middle face, so a run is
 * deterministic; the engine and event store are the production ones.
 */
export type Persona = keyof typeof TOKENS;

export interface Exchange {
  readonly phase: string;
  readonly persona: Persona;
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly status: number;
  readonly body: string;
}

export interface Reply {
  readonly status: number;
  readonly raw: string;
  /** The response body parsed as JSON, typed by the caller. */
  readonly json: LightMyRequestResponse['json'];
}

export interface SessionOptions {
  readonly store?: EventStore;
  readonly dice?: Dice;
  readonly entropy?: EntropySource;
  readonly contents?: AssetContentStore;
  /** Providers for `narrative` (Chronicle prose); the local writer by default. */
  readonly narrative?: readonly RoutedProvider[];
  /** The scenario's language; English by default (docs/adr/0031-play-language.md). */
  readonly script?: ScenarioScript;
}

export const CAMPAIGN = 'ravenford';
export const BASE = `/campaigns/${CAMPAIGN}`;
export const ELOWEN = 'elowen-starwhisper';

export class RavenfordSession {
  readonly exchanges: Exchange[] = [];
  #phase = 'setup';
  #commands = 0;

  readonly app: FastifyInstance;
  readonly engine: WorldEngine;
  readonly contents: AssetContentStore;
  readonly ai: RelevanceDeps & { readonly traces: InMemoryAiTraceStore };
  readonly script: ScenarioScript;

  private constructor(parts: {
    app: FastifyInstance;
    engine: WorldEngine;
    contents: AssetContentStore;
    ai: RelevanceDeps & { readonly traces: InMemoryAiTraceStore };
    script: ScenarioScript;
  }) {
    this.app = parts.app;
    this.engine = parts.engine;
    this.contents = parts.contents;
    this.ai = parts.ai;
    this.script = parts.script;
  }

  /** Seeds Ravenford (with Gate 04's planted secrets) and opens the app. */
  static async open(options: SessionOptions = {}): Promise<RavenfordSession> {
    const engine = new WorldEngine({
      store: options.store ?? new InMemoryEventStore(),
      ids: new SequentialIds(),
      clock: new SteppingClock(),
      checks: skillCheckPort(options.dice ?? scriptedDice(Array<number>(80).fill(15))),
      combat: createCombatEngine(),
      entropy: options.entropy ?? MIDDLE_ENTROPY,
    });
    const script = options.script ?? EN_SCRIPT;
    for (const submission of (await loadRavenfordSeed(script.fixturesDir)).submissions) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
    }
    await plantNpcBoundary(engine);
    const local = [createLocalProvider()];
    const clock = new SteppingClock();
    let ms = 0;
    const ai = {
      router: new CapabilityRouter({
        reasoning: local,
        'npc-dialogue': local,
        narrative: options.narrative ?? local,
        'fast-context': [],
      }),
      relevanceBudgetMs: 2_000,
      traces: new InMemoryAiTraceStore(),
      ids: new SequentialIds(0xa1),
      clock: { now: () => clock.now(), nowMs: () => (ms += 5) },
    };
    const contents = options.contents ?? new InMemoryAssetContentStore();
    const app = await ravenfordApp(engine, ai, testAuthoring(), contents);
    return new RavenfordSession({ app, engine, contents, ai, script });
  }

  /** Names the phase the following exchanges belong to. */
  phase(name: string): void {
    this.#phase = name;
  }

  async get(persona: Persona, url: string): Promise<Reply> {
    return this.#record(
      persona,
      'GET',
      url,
      await this.app.inject({ method: 'GET', url, headers: this.#auth(persona) }),
    );
  }

  async post(persona: Persona, url: string, body: unknown): Promise<Reply> {
    const response = await this.app.inject({
      method: 'POST',
      url,
      payload: body as Record<string, unknown>,
      headers: this.#auth(persona),
    });
    return this.#record(persona, 'POST', url, response);
  }

  /** A command through `POST /commands`; throws unless its status is the one expected. */
  async command(
    persona: Persona,
    command: Record<string, unknown>,
    expected: number = 200,
  ): Promise<CommandResult> {
    this.#commands += 1;
    const reply = await this.post(persona, `${BASE}/commands`, {
      commandId: `scenario.${String(this.#commands)}`,
      command,
    });
    if (reply.status !== expected) {
      throw new Error(
        `${String(command['type'])} as ${persona}: ${String(reply.status)} ${reply.raw}`,
      );
    }
    return reply.json<CommandResult>();
  }

  /** As the player, for Elowen. */
  act(command: Record<string, unknown>, expected?: number): Promise<CommandResult> {
    return this.command('player', { characterId: ELOWEN, ...command }, expected);
  }

  dm(command: Record<string, unknown>, expected?: number): Promise<CommandResult> {
    return this.command('dm', command, expected);
  }

  async snapshot(): Promise<CampaignSnapshot> {
    const snapshot = await this.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    return snapshot;
  }

  /** One run of the asset worker, as the server's loop would make it. */
  runAssetWorker() {
    return new AssetWorker({
      engine: this.engine,
      contents: this.contents,
      generator: createPlaceholderImageGenerator(),
      timeoutMs: 1_000,
      logger: createLogger({ service: 'scenario', level: 'silent' }),
    }).runOnce(CAMPAIGN);
  }

  /** Everything a given persona was ever sent. */
  seenBy(persona: Persona): string[] {
    return this.exchanges.filter((e) => e.persona === persona).map((e) => e.body);
  }

  close(): Promise<void> {
    return this.app.close();
  }

  #auth(persona: Persona) {
    return { authorization: `Bearer ${TOKENS[persona]}` };
  }

  #record(
    persona: Persona,
    method: 'GET' | 'POST',
    url: string,
    response: LightMyRequestResponse,
  ): Reply {
    const { statusCode: status, body } = response;
    this.exchanges.push({ phase: this.#phase, persona, method, url, status, body });
    return { status, raw: body, json: response.json.bind(response) };
  }
}

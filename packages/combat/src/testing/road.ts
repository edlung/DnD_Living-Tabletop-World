import type { CommandResult } from '@ltw/contracts';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  entropyFor,
  openReactionWindow,
  submissionsFromScript,
  type Actor,
  type EncounterState,
  type EntropySource,
  type WorldState,
} from '@ltw/domain';

import combatSeed from '../../../../fixtures/ravenford/combat-seed.json' with { type: 'json' };
import contradictionSeed from '../../../../fixtures/ravenford/contradiction-seed.json' with { type: 'json' };
import investigationSeed from '../../../../fixtures/ravenford/investigation-seed.json' with { type: 'json' };
import kernelSeed from '../../../../fixtures/ravenford/kernel-seed.json' with { type: 'json' };
import knowledgeSeed from '../../../../fixtures/ravenford/knowledge-seed.json' with { type: 'json' };
import memorySeed from '../../../../fixtures/ravenford/memory-seed.json' with { type: 'json' };
import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import { createCombatEngine } from '../engine.ts';

/**
 * Test support: the full Ravenford seed with the combat seed, and the Old
 * Trade Road ambush (ADR 0015 §5). Dice are scripted: `roll(sides, ...faces)`
 * queues faces for the next command's entropy pool; unqueued draws roll the
 * middle face (11 on a d20).
 */
export const CAMPAIGN = 'ravenford';
export const DM: Actor = { actorId: 'dm-ravenford', kind: 'user' };
export const PLAYER: Actor = { actorId: 'player-elowen', kind: 'user' };
export const ELOWEN = 'elowen-starwhisper';
export const RAIDER_1 = 'goblin-raider-1';
export const RAIDER_2 = 'goblin-raider-2';
export const RAIDER_3 = 'goblin-raider-3';
export const SHAMAN = 'goblin-shaman';
export const AMBUSH = ambush;

const MIDDLE = 2 ** 31;

export class ScriptedEntropy implements EntropySource {
  readonly #queue: number[] = [];
  queue(sides: number, faces: readonly number[]): void {
    this.#queue.push(...faces.map((face) => entropyFor(face, sides)));
  }
  next(): number {
    return this.#queue.shift() ?? MIDDLE;
  }
}

export interface RoadWorld {
  readonly engine: WorldEngine;
  readonly store: InMemoryEventStore;
  /** Queues dice faces for the next command. */
  readonly roll: (sides: number, ...faces: number[]) => void;
  readonly submit: (command: Record<string, unknown>, actor?: Actor) => Promise<CommandResult>;
  readonly dm: (command: Record<string, unknown>) => Promise<CommandResult>;
  readonly state: () => Promise<WorldState>;
  readonly encounter: () => Promise<EncounterState>;
}

export interface RoadWorldOptions {
  /**
   * A store another world already seeded: this world is then a second engine
   * on the same campaign, like a second server process (ADR 0006 §7).
   */
  readonly shared?: { readonly store: InMemoryEventStore; readonly namespace: number };
  /** Randomness for property tests; `roll` then has no effect. */
  readonly entropy?: EntropySource;
}

export async function roadWorld(options: RoadWorldOptions = {}): Promise<RoadWorld> {
  const entropy = new ScriptedEntropy();
  const store = options.shared?.store ?? new InMemoryEventStore();
  const namespace = options.shared?.namespace ?? 0;
  const engine = new WorldEngine({
    store,
    ids: new SequentialIds(namespace),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: options.entropy ?? entropy,
    // Concurrency tests race engines: retry at once, without random backoff.
    backoff: () => Promise.resolve(),
  });
  const scripts = [
    [kernelSeed.commands, 'seed'],
    [knowledgeSeed.commands, 'knowledge'],
    [memorySeed.commands, 'memory'],
    [rulesSeed.commands, 'rules'],
    [investigationSeed.commands, 'investigation'],
    [contradictionSeed.commands, 'contradiction'],
    [combatSeed.commands, 'combat'],
  ] as const;
  for (const [commands, prefix] of options.shared ? [] : scripts) {
    for (const submission of submissionsFromScript({
      campaignId: CAMPAIGN,
      actor: DM,
      commands,
      commandIdPrefix: `${CAMPAIGN}.${prefix}`,
    })) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
    }
  }
  let counter = 0;
  const submit = (command: Record<string, unknown>, actor: Actor = PLAYER) => {
    counter += 1;
    return engine.execute({
      commandId: `test.${String(namespace)}.${String(counter)}`,
      campaignId: CAMPAIGN,
      actor,
      command,
    });
  };
  const state = async () => {
    const snapshot = await engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    return snapshot.state;
  };
  return {
    engine,
    store,
    roll: (sides, ...faces) => {
      entropy.queue(sides, faces);
    },
    submit,
    dm: (command) => submit(command, DM),
    state,
    encounter: async () => {
      const encounter = (await state()).encounter;
      if (!encounter) throw new Error('no encounter');
      return encounter;
    },
  };
}

/**
 * Places everyone on the Old Trade Road and starts the ambush. Initiative
 * d20s in fixture order: Elowen, Raider 1–3, Shaman. The default makes
 * Elowen act first (21), then the Shaman, then the Raiders.
 */
export async function startAmbush(
  world: RoadWorld,
  initiative: readonly number[] = [17, 3, 2, 1, 15],
  changes: (command: typeof ambush.startCombat) => Record<string, unknown> = (c) => c,
): Promise<CommandResult> {
  for (const place of ambush.place) {
    const placed = await world.dm(place);
    if (placed.status === 'rejected') throw new Error(`place rejected: ${placed.code}`);
  }
  world.roll(20, ...initiative);
  return world.dm(changes(structuredClone(ambush.startCombat)));
}

/** The ID of the open reaction window (ADR 0016); fails when none is open. */
export async function openWindowId(world: RoadWorld): Promise<string> {
  const window = openReactionWindow(await world.state());
  if (!window) throw new Error('no reaction window is open');
  return window.windowId;
}

export const codeOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.code : result.status;

export function eventsOf(result: CommandResult) {
  if (result.status !== 'accepted') throw new Error(`expected accepted, got ${codeOf(result)}`);
  return result.events;
}

/** The recorded events (with payloads) of an accepted command. */
export async function recorded(world: RoadWorld, result: CommandResult) {
  const sequences = new Set(eventsOf(result).map((event) => event.sequence));
  const slice = await world.store.loadStream(CAMPAIGN);
  return (slice?.events ?? []).filter((event) => sequences.has(event.sequence));
}

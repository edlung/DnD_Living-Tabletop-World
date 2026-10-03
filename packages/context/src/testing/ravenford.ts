import type { CommandResult, PerspectiveRequest } from '@ltw/contracts';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  resolvePerspective,
  submissionsFromScript,
  type Actor,
  type ResolvedPerspective,
  type WorldState,
} from '@ltw/domain';

import boundary from '../../../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import kernelSeed from '../../../../fixtures/ravenford/kernel-seed.json' with { type: 'json' };
import knowledgeSeed from '../../../../fixtures/ravenford/knowledge-seed.json' with { type: 'json' };
import memorySeed from '../../../../fixtures/ravenford/memory-seed.json' with { type: 'json' };
import contradictionSeed from '../../../../fixtures/ravenford/contradiction-seed.json' with { type: 'json' };
import investigationSeed from '../../../../fixtures/ravenford/investigation-seed.json' with { type: 'json' };
import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import { skillCheckPort, type Dice } from '@ltw/rules';

/** Test support: the full Ravenford seed (kernel, knowledge, memory, rules, investigation). */
export const CAMPAIGN = 'ravenford';
export const DM: Actor = { actorId: 'dm-ravenford', kind: 'user' };
export const PLAYER: Actor = { actorId: 'player-elowen', kind: 'user' };
export const ELOWEN = 'elowen-starwhisper';
export const ASHEN_CIRCLE_ID = '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53';

/** Text that must never appear for Elowen's own perspective (Gate 01 fixture). */
export const ELOWEN_FORBIDDEN_MARKERS: readonly string[] =
  boundary.forbiddenMarkers['CHARACTER:elowen-starwhisper'];

export interface SeededWorld {
  readonly engine: WorldEngine;
  /** Submits more DM commands after the seed and returns the new state. */
  readonly apply: (...commands: Record<string, unknown>[]) => Promise<WorldState>;
  /** Queues d20 results for the next skill checks. */
  readonly roll: (...d20s: number[]) => void;
  /** Submits one command as `actor` (default: Elowen's player); returns the result. */
  readonly submit: (command: Record<string, unknown>, actor?: Actor) => Promise<CommandResult>;
  /** Current state. */
  readonly current: () => Promise<WorldState>;
  readonly state: WorldState;
}

export async function seedRavenford(): Promise<SeededWorld> {
  const queue: number[] = [];
  const dice: Dice = {
    roll: () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('no d20 queued');
      return next;
    },
  };
  const engine = new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
    checks: skillCheckPort(dice),
  });
  const scripts = [
    [kernelSeed.commands, 'seed'],
    [knowledgeSeed.commands, 'knowledge'],
    [memorySeed.commands, 'memory'],
    [rulesSeed.commands, 'rules'],
    [investigationSeed.commands, 'investigation'],
    [contradictionSeed.commands, 'contradiction'],
  ] as const;
  let counter = 0;
  const run = async (commands: readonly unknown[], prefix: string) => {
    const submissions = submissionsFromScript({
      campaignId: CAMPAIGN,
      actor: DM,
      commands,
      commandIdPrefix: `${CAMPAIGN}.${prefix}`,
    });
    for (const submission of submissions) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected')
        throw new Error(`rejected: ${result.code} ${result.message}`);
    }
    const snapshot = await engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('seed produced no campaign');
    return snapshot.state;
  };
  let state: WorldState | null = null;
  for (const [commands, prefix] of scripts) state = await run(commands, prefix);
  if (!state) throw new Error('empty seed');
  return {
    engine,
    state,
    roll: (...d20s) => queue.push(...d20s),
    submit: (command, actor = PLAYER) => {
      counter += 1;
      return engine.execute({
        commandId: `test.${String(counter)}`,
        campaignId: CAMPAIGN,
        actor,
        command,
      });
    },
    current: async () => {
      const snapshot = await engine.load(CAMPAIGN);
      if (!snapshot) throw new Error('missing campaign');
      return snapshot.state;
    },
    apply: (...commands) => {
      counter += 1;
      return run(commands, `test-${String(counter)}`);
    },
  };
}

export function perspective(
  state: WorldState,
  actor: Actor,
  request: PerspectiveRequest,
): ResolvedPerspective {
  const access = resolvePerspective(state, actor, request);
  if (!access.ok) throw new Error(`perspective denied: ${access.reason}`);
  return access.perspective;
}

export const elowenView = (state: WorldState) => perspective(state, PLAYER, { kind: 'PLAYER' });

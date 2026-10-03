import type { CommandResult, Skill } from '@ltw/contracts';

import contradictionSeed from '../../../../../fixtures/ravenford/contradiction-seed.json' with { type: 'json' };
import investigationSeed from '../../../../../fixtures/ravenford/investigation-seed.json' with { type: 'json' };
import kernelSeed from '../../../../../fixtures/ravenford/kernel-seed.json' with { type: 'json' };
import knowledgeSeed from '../../../../../fixtures/ravenford/knowledge-seed.json' with { type: 'json' };
import memorySeed from '../../../../../fixtures/ravenford/memory-seed.json' with { type: 'json' };
import rulesSeed from '../../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import type { Actor } from '../../kernel/actor.ts';
import { SequentialIds, SteppingClock } from '../../kernel/engine/deterministic-sources.ts';
import { InMemoryEventStore } from '../../kernel/engine/in-memory-event-store.ts';
import { submissionsFromScript } from '../../kernel/engine/script.ts';
import { WorldEngine } from '../../kernel/engine/world-engine.ts';
import type { WorldState } from '../../kernel/state.ts';
import type { SkillCheckPort } from '../skill-checks.ts';

/**
 * Test support: the full Ravenford seed (through Stage 70 claims), and a fake
 * skill-check port (domain tests may not import @ltw/rules). The fake uses
 * Elowen's modifiers from ADR 0011: Investigation +8, Perception +12.
 */
export const CAMPAIGN = 'ravenford';
export const DM: Actor = { actorId: 'dm-ravenford', kind: 'user' };
export const PLAYER: Actor = { actorId: 'player-elowen', kind: 'user' };
export const OUTSIDER: Actor = { actorId: 'outsider', kind: 'user' };
export const ELOWEN = 'elowen-starwhisper';
export const MODIFIERS: Partial<Record<Skill, number>> = { investigation: 8, perception: 12 };

export interface InvestigationWorld {
  readonly engine: WorldEngine;
  /** Queues d20 results for the next checks. */
  readonly roll: (...d20s: number[]) => void;
  readonly submit: (command: Record<string, unknown>, actor?: Actor) => Promise<CommandResult>;
  readonly state: () => Promise<WorldState>;
}

export async function investigationWorld(): Promise<InvestigationWorld> {
  const queue: number[] = [];
  const checks: SkillCheckPort = {
    rollD20: () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('no d20 queued');
      return next;
    },
    skillModifier: (_sheet, skill) => MODIFIERS[skill] ?? 0,
  };
  const engine = new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
    checks,
  });
  const scripts = [
    [kernelSeed.commands, 'seed'],
    [knowledgeSeed.commands, 'knowledge'],
    [memorySeed.commands, 'memory'],
    [rulesSeed.commands, 'rules'],
    [investigationSeed.commands, 'investigation'],
    [contradictionSeed.commands, 'contradiction'],
  ] as const;
  for (const [commands, prefix] of scripts) {
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
  return {
    engine,
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
    state: async () => {
      const snapshot = await engine.load(CAMPAIGN);
      if (!snapshot) throw new Error('missing campaign');
      return snapshot.state;
    },
  };
}

export const codeOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.code : result.status;

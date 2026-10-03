import type { CommandResult, KernelCommand, RejectionCode } from '@ltw/contracts';
import { expect } from 'vitest';

import type { Actor } from '../actor.ts';
import { SequentialIds, SteppingClock } from '../engine/deterministic-sources.ts';
import type { EventStore } from '../engine/event-store.ts';
import { InMemoryEventStore } from '../engine/in-memory-event-store.ts';
import { WorldEngine, type CampaignSnapshot } from '../engine/world-engine.ts';
import { worldTimeAt } from '../world-time.ts';

/** Test support for kernel suites (excluded from builds). */
export const DM: Actor = { actorId: 'dm-1', kind: 'user' };
export const PLAYER: Actor = { actorId: 'player-1', kind: 'user' };
export const SYSTEM: Actor = { actorId: 'system', kind: 'system' };
export const CAMPAIGN = 'test-campaign';
export const START = worldTimeAt(1, 9);

export interface SubmitOptions {
  readonly actor?: Actor;
  readonly commandId?: string;
  readonly campaignId?: string;
  readonly expectedVersion?: number;
  readonly reason?: string;
}

export type Harness = ReturnType<typeof createHarness>;

export function createHarness(options: { store?: EventStore; namespace?: number } = {}) {
  const store = options.store ?? new InMemoryEventStore();
  const engine = new WorldEngine({
    store,
    ids: new SequentialIds(options.namespace ?? 0),
    clock: new SteppingClock(),
  });
  let counter = 0;

  const submit = (command: KernelCommand | Record<string, unknown>, opts: SubmitOptions = {}) => {
    counter += 1;
    return engine.execute({
      commandId: opts.commandId ?? `cmd-${options.namespace ?? 0}-${counter}`,
      campaignId: opts.campaignId ?? CAMPAIGN,
      actor: opts.actor ?? DM,
      command,
      ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      ...(opts.reason === undefined ? {} : { reason: opts.reason }),
    });
  };

  const snapshot = async (): Promise<CampaignSnapshot> => {
    const loaded = await engine.load(CAMPAIGN);
    if (!loaded) throw new Error('campaign not created');
    return loaded;
  };

  return {
    engine,
    store,
    submit,
    snapshot,
    state: async () => (await snapshot()).state,
    history: async () => (await snapshot()).history,
  };
}

export function expectAccepted(result: CommandResult) {
  if (result.status === 'rejected') {
    expect.fail(`expected acceptance, got ${result.code}: ${result.message}`);
  }
  expect(result.status).toBe('accepted');
  return result;
}

export function expectRejected(result: CommandResult, code: RejectionCode) {
  if (result.status !== 'rejected') {
    expect.fail(`expected ${code}, got ${result.status}`);
  }
  expect(result.code, result.message).toBe(code);
  return result;
}

/** A small world: campaign at Day 1 09:00, a town with a square and an inn, one NPC, one item. */
export async function seedBasicWorld(harness: Harness): Promise<void> {
  const commands: Record<string, unknown>[] = [
    { type: 'CreateCampaign', name: 'Test', worldName: 'Testland', startsAt: START },
    town('town', null, 'settlement'),
    town('square', 'town', 'site'),
    town('inn', 'town', 'building'),
    {
      type: 'CreateEntity',
      entityId: 'npc',
      kind: 'npc',
      name: 'Nia',
      existsSince: null,
      placement: { locationId: 'square', since: null },
    },
    {
      type: 'CreateEntity',
      entityId: 'lamp',
      kind: 'item',
      name: 'Lamp',
      existsSince: null,
      placement: { locationId: 'inn', since: null },
    },
  ];
  for (const command of commands) expectAccepted(await harness.submit(command));
}

function town(entityId: string, parentId: string | null, type: string) {
  return {
    type: 'CreateEntity',
    entityId,
    kind: 'location',
    name: entityId,
    existsSince: null,
    location: { type, parentId },
  };
}

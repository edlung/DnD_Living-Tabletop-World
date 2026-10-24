import { describe, expect, it } from 'vitest';

import { SequentialIds, SteppingClock } from './engine/deterministic-sources.ts';
import { InMemoryEventStore } from './engine/in-memory-event-store.ts';
import { WorldEngine } from './engine/world-engine.ts';
import { assertWritable, schemaVersionOf, writtenEarlier } from './event-versions.ts';
import { parseRecordedEvent } from './events.ts';
import { CAMPAIGN, DM, START } from './testing/kernel-harness.ts';

/**
 * Event schema versions (Gate 03 retest 2, G03-H05): every version a type was
 * ever written with stays readable with its meaning, the current writer
 * writes only the current version, and no unknown version is accepted.
 */
const stored = (schemaVersion: number, premises: unknown[]) => ({
  campaignId: 'ravenford',
  sequence: 104,
  eventId: '00000000-0000-4000-8000-000000000072',
  schemaVersion,
  worldTime: 0,
  recordedAt: '2026-10-04T00:00:00.000Z',
  causation: {
    commandId: 'http:player-elowen:legacy-3',
    commandType: 'CastSpell',
    actor: { actorId: 'player-elowen', kind: 'user' },
  },
  type: 'PremisesRecorded',
  payload: { characterId: 'elowen-starwhisper', premises },
});
const placement = { kind: 'placement', entityId: 'legacy-far-charm' };
const unreached = { kind: 'unreached', clueId: 'legacy-far-magic', entityId: 'legacy-far-charm' };

describe('event schema versions', () => {
  it('writes PremisesRecorded as version 3 and every other type as version 2', () => {
    // Version 2 of every type is the dependency contract (G03-H07); version 1 is earlier writers.
    expect(schemaVersionOf('PremisesRecorded')).toBe(3);
    expect(schemaVersionOf('CampaignCreated')).toBe(2);
    expect(schemaVersionOf('ClueAdded')).toBe(2);
    expect(writtenEarlier({ type: 'ClueAdded', schemaVersion: 1 })).toBe(true);
    expect(writtenEarlier({ type: 'ClueAdded', schemaVersion: 2 })).toBe(false);
    expect(writtenEarlier({ type: 'PremisesRecorded', schemaVersion: 2 })).toBe(true);
    expect(writtenEarlier({ type: 'PremisesRecorded', schemaVersion: 3 })).toBe(false);
    // Stage 130: generated text records the names it quotes (ADR 0020).
    for (const type of ['MemoryRecorded', 'ContradictionDetected'] as const) {
      expect(schemaVersionOf(type)).toBe(3);
      expect(writtenEarlier({ type, schemaVersion: 2 })).toBe(true);
      expect(writtenEarlier({ type, schemaVersion: 3 })).toBe(false);
    }
    expect(schemaVersionOf('EvidenceShown')).toBe(2);
    expect(schemaVersionOf('InsightChecked')).toBe(2);
  });

  it('reads version 1 premises as every earlier writer stored them', () => {
    // Revision 88d8137 wrote `placement`; revision b38cbbc wrote `unreached` as version 1.
    for (const premise of [placement, unreached]) {
      const event = parseRecordedEvent(stored(1, [{ kind: 'sheet' }, premise]));
      expect(event).toMatchObject({
        schemaVersion: 1,
        payload: { premises: [{ kind: 'sheet' }, premise] },
      });
    }
  });

  it('reads versions 2 (revision e893497) and 3, never with the legacy placement', () => {
    for (const version of [2, 3]) {
      expect(parseRecordedEvent(stored(version, [unreached])).payload).toMatchObject({
        premises: [unreached],
      });
      expect(() => parseRecordedEvent(stored(version, [placement]))).toThrow();
    }
  });

  it('refuses a version a type was never written with', () => {
    expect(() => parseRecordedEvent(stored(4, [unreached]))).toThrow(/never written/);
    expect(() => parseRecordedEvent(stored(0, [unreached]))).toThrow();
    const payload = {
      campaignId: 'ravenford',
      name: 'The Missing Caravan',
      worldName: 'Ravenford',
      startsAt: 32400,
      dmActorId: 'dm-ravenford',
    };
    const created = (schemaVersion: number) => ({
      ...stored(schemaVersion, []),
      type: 'CampaignCreated',
      payload,
    });
    expect(parseRecordedEvent(created(1)).payload).toEqual(payload);
    expect(parseRecordedEvent(created(2)).payload).toEqual(payload);
    expect(() => parseRecordedEvent(created(3))).toThrow(/never written/);
  });

  it('writes AssetApproved as version 3 and reads version 2 alike, superseding nothing else', () => {
    // Stage 330 part B review (ADR 0035 amendment): an approval supersedes its kind.
    expect(schemaVersionOf('AssetApproved')).toBe(3);
    expect(writtenEarlier({ type: 'AssetApproved', schemaVersion: 2 })).toBe(true);
    expect(writtenEarlier({ type: 'AssetApproved', schemaVersion: 3 })).toBe(false);
    const approval = (schemaVersion: number, payload: Record<string, unknown>) => ({
      ...stored(schemaVersion, []),
      causation: {
        commandId: 'http:dm-ravenford:kinds-approve-mira-night-1',
        commandType: 'ApproveAsset',
        actor: { actorId: 'dm-ravenford', kind: 'user' },
      },
      type: 'AssetApproved',
      payload,
    });
    const v2 = {
      assetId: 'http:dm-ravenford:kinds-request-mira-night-1#0~asset',
      entityId: 'mira-vale',
      variant: 'derived',
      previous: null,
    };
    const supersedes = ['http:dm-ravenford:kinds-request-mira-night-2#0~asset'];
    expect(parseRecordedEvent(approval(2, v2)).payload).toEqual(v2);
    expect(parseRecordedEvent(approval(3, v2)).payload).toEqual(v2);
    expect(parseRecordedEvent(approval(3, { ...v2, supersedes })).payload).toEqual({
      ...v2,
      supersedes,
    });
    // Version 2 never superseded a derived picture, and no version lists nothing.
    expect(() => parseRecordedEvent(approval(2, { ...v2, supersedes }))).toThrow();
    expect(() => parseRecordedEvent(approval(3, { ...v2, supersedes: [] }))).toThrow();
    expect(() => parseRecordedEvent(approval(1, v2))).toThrow(/never written/);
    expect(() => parseRecordedEvent(approval(4, v2))).toThrow(/never written/);
  });

  it('never writes a premise only earlier writers recorded', async () => {
    expect(() => {
      assertWritable('PremisesRecorded', {
        characterId: 'elowen-starwhisper',
        premises: [placement],
      });
    }).toThrow();
    // A decision bug that drafted one fails loudly instead of storing it.
    const store = new InMemoryEventStore();
    const engine = new WorldEngine({
      store,
      ids: new SequentialIds(),
      clock: new SteppingClock(),
      combat: {
        decide: () => ({
          ok: true,
          events: [
            {
              type: 'PremisesRecorded',
              payload: { characterId: 'lamp', premises: [{ kind: 'placement', entityId: 'lamp' }] },
            },
          ],
        }),
      },
    });
    const submit = (commandId: string, command: Record<string, unknown>) =>
      engine.execute({ commandId, campaignId: CAMPAIGN, actor: DM, command });
    const created = await submit('c-1', {
      type: 'CreateCampaign',
      name: 'Test',
      worldName: 'W',
      startsAt: START,
    });
    expect(created.status).toBe('accepted');
    // The premise names an entity that exists, so only the write check can stop it.
    const lamp = await submit('c-2', {
      type: 'CreateEntity',
      entityId: 'lamp',
      kind: 'item',
      name: 'Lamp',
      existsSince: null,
    });
    expect(lamp.status).toBe('accepted');
    await expect(submit('c-3', { type: 'EndCombat', encounterId: 'e-1' })).rejects.toThrow(
      /current schema version cannot hold/,
    );
    expect((await store.loadStream(CAMPAIGN))?.version).toBe(2);
  });
});

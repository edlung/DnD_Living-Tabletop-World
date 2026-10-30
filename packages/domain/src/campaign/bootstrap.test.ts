import { describe, expect, it } from 'vitest';

import {
  createHarness,
  expectAccepted,
  expectRejected,
  CAMPAIGN,
} from '../kernel/testing/kernel-harness.ts';
import { parseRecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { campaignRole, controlledCharacter, resolvePerspective } from '../knowledge/perspective.ts';
import { authorizeActingFor } from '../kernel/authorization.ts';
import { partyMemberIds } from '../knowledge/party.ts';
import { assetLineage, playerAssetView } from '../assets/views.ts';
import { chronicleEntries } from '../chronicle/entries.ts';
import { bootstrapCommand, bootstrapHash, OWNER } from './testing/bootstrap.ts';

async function boot(pictures = false) {
  const h = createHarness(),
    command = bootstrapCommand(pictures);
  const outcome = expectAccepted(await h.submit(command, { actor: OWNER, commandId: 'boot' }));
  return { ...h, command, outcome };
}

describe('confirmed atomic campaign bootstrap', () => {
  it('writes one complete USER batch with prepared party but no controllers or played outcomes', async () => {
    const f = await boot(),
      snapshot = await f.snapshot();
    expect(await f.engine.commandLog(CAMPAIGN)).toHaveLength(1);
    expect(snapshot.history[0]?.type).toBe('CampaignCreated');
    expect(snapshot.history.at(-1)?.type).toBe('CampaignBootstrapped');
    expect(
      snapshot.history.every(
        (event) =>
          event.causation.commandId === 'boot' &&
          event.causation.commandType === 'BootstrapCampaign' &&
          event.causation.actor.actorId === OWNER.actorId &&
          event.causation.actor.kind === 'user',
      ),
    ).toBe(true);
    expect(snapshot.state.campaign?.dmActorId).toBe(OWNER.actorId);
    expect(snapshot.state.roster.size).toBe(0);
    expect(snapshot.state.rosterAssignedAt.size).toBe(0);
    expect([...partyMemberIds(snapshot.state)]).toEqual(
      f.command.content.party.map((key) => f.command.identities.entities[key]),
    );
    expect(snapshot.state.bootstrap?.source).toEqual(f.command.source);
    expect(
      snapshot.history.some((event) =>
        [
          'CharacterAssigned',
          'MemoryRecorded',
          'SessionStarted',
          'CombatStarted',
          'ChronicleGenerated',
          'EvidenceExamined',
        ].includes(event.type),
      ),
    ).toBe(false);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(
      replay(
        snapshot.history.map((event) => parseRecordedEvent(JSON.parse(JSON.stringify(event)))),
      ),
    ).toEqual(snapshot.state);
    expect(redecideEffective(await f.engine.commandLog(CAMPAIGN), snapshot, () => 3)).toBeNull();
    expect((await f.submit(f.command, { actor: OWNER, commandId: 'boot' })).status).toBe(
      'duplicate',
    );
    expect(await f.history()).toEqual(snapshot.history);
    expectRejected(
      await f.submit({ type: 'UndoCommand', targetCommandId: 'boot' }, { actor: OWNER }),
      'UNDO_NOT_SUPPORTED',
    );
  });
  it('does not turn a prepared member into a controller or grant the owner a player identity', async () => {
    const f = await boot(),
      state = await f.state(),
      member = f.command.identities.entities[f.command.content.party[0] ?? ''];
    if (!member) throw new Error('MEMBER_MISSING');
    const stranger = { actorId: 'uninvited', kind: 'user' as const };
    expect(campaignRole(state, stranger)).toBeNull();
    expect(controlledCharacter(state, stranger.actorId)).toBeNull();
    expect(authorizeActingFor(state, stranger, member).ok).toBe(false);
    const ownerView = resolvePerspective(state, OWNER, { kind: 'CHARACTER', characterId: member });
    expect(
      ownerView.ok &&
        ownerView.perspective.scopes !== 'ALL' &&
        ownerView.perspective.scopes.has('PARTY'),
    ).toBe(true);
    expectAccepted(
      await f.submit(
        { type: 'AssignCharacter', characterId: member, playerActorId: 'actual-player' },
        { actor: OWNER },
      ),
    );
    expect(campaignRole(await f.state(), { actorId: 'actual-player', kind: 'user' })).toBe(
      'PLAYER',
    );
    expectAccepted(
      await f.submit({ type: 'ReleaseCharacter', characterId: member }, { actor: OWNER }),
    );
    expect((await f.state()).roster.size).toBe(0);
    expect(partyMemberIds(await f.state()).has(member)).toBe(true);
    expect(campaignRole(await f.state(), { actorId: 'actual-player', kind: 'user' })).toBeNull();
  });
  it.each(['system', 'wrong-owner', 'confirmation', 'invalid-reference'] as const)(
    'rejects %s without leaving even an empty campaign',
    async (kind) => {
      const h = createHarness(),
        command = bootstrapCommand();
      let actor: { actorId: string; kind: 'user' | 'system' } = OWNER;
      if (kind === 'system') actor = { actorId: OWNER.actorId, kind: 'system' };
      if (kind === 'wrong-owner')
        actor = { actorId: '30000000-0000-4000-8000-000000000001', kind: 'user' };
      if (kind === 'confirmation') command.confirmation.planDigest = bootstrapHash(99);
      if (kind === 'invalid-reference') command.content.world.startLocation = 'missing';
      const result = await h.submit(command, { actor });
      expect(result.status).toBe('rejected');
      expect(await h.engine.load(CAMPAIGN)).toBeNull();
      expect(await h.engine.commandLog(CAMPAIGN)).toEqual([]);
    },
  );
  it('adopts and approves exact references before derived pictures without queuing fictitious jobs', async () => {
    const f = await boot(true),
      state = await f.state();
    expect(state.assets.requests.size).toBe(0);
    expect(state.assets.jobs.size).toBe(0);
    const reference = state.assets.assets.get('boot#0~asset'),
      figure = state.assets.assets.get('boot#1~asset');
    expect(reference).toMatchObject({
      purpose: 'image',
      status: 'CANONICAL',
      contentHash: bootstrapHash(10),
      origin: f.command.selectedAssets[1]?.origin,
    });
    expect(figure).toMatchObject({
      purpose: 'figure',
      status: 'APPROVED',
      derivedFrom: 'boot#0~asset',
      contentHash: bootstrapHash(12),
    });
    expect(assetLineage(state).requests).toEqual([]);
    expect(assetLineage(state).assets.every((asset) => asset.origin !== undefined)).toBe(true);
    if (!reference) throw new Error('ASSET_MISSING');
    expect(Object.keys(playerAssetView(reference)).sort()).toEqual([
      'contentHash',
      'mediaType',
      'purpose',
      'variant',
    ]);
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(
      replay(
        (await f.history()).map((event) => parseRecordedEvent(JSON.parse(JSON.stringify(event)))),
      ),
    ).toEqual(state);
  });
  it('keeps later ordinary safe undo and restores adopted origin when a later approval is undone', async () => {
    const f = await boot(true),
      entityId = f.command.identities.entities['arden'];
    if (!entityId) throw new Error('ENTITY_MISSING');
    expectAccepted(
      await f.submit(
        { type: 'UpdateEntityProfile', entityId, description: 'A later owner correction' },
        { actor: OWNER, commandId: 'edit' },
      ),
    );
    expectAccepted(
      await f.submit({ type: 'UndoCommand', targetCommandId: 'edit' }, { actor: OWNER }),
    );
    expectAccepted(
      await f.submit(
        { type: 'RequestAsset', entityId, variant: 'reference' },
        { actor: OWNER, commandId: 'later' },
      ),
    );
    expectAccepted(
      await f.submit(
        { type: 'StartAssetJob', requestId: 'later#0' },
        { actor: { actorId: 'worker', kind: 'system' } },
      ),
    );
    expectAccepted(
      await f.submit(
        {
          type: 'CompleteAssetJob',
          requestId: 'later#0',
          contentHash: bootstrapHash(77),
          mediaType: 'image/webp',
          generator: { provider: 'fixture', model: 'later' },
        },
        { actor: { actorId: 'worker', kind: 'system' } },
      ),
    );
    expectAccepted(
      await f.submit(
        { type: 'ApproveAsset', assetId: 'later#0~asset' },
        { actor: OWNER, commandId: 'later-approve' },
      ),
    );
    expectAccepted(
      await f.submit({ type: 'UndoCommand', targetCommandId: 'later-approve' }, { actor: OWNER }),
    );
    const state = await f.state();
    expect(state.assets.canonical.get(entityId)).toBe('boot#0~asset');
    expect(state.assets.assets.get('boot#0~asset')?.origin).toEqual(
      f.command.selectedAssets[1]?.origin,
    );
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(
      redecideEffective(await f.engine.commandLog(CAMPAIGN), await f.snapshot(), () => 3),
    ).toBeNull();
  });
  it('preserves legacy state shape and roster-derived party membership', async () => {
    const h = createHarness();
    expectAccepted(
      await h.submit({ type: 'CreateCampaign', name: 'Legacy', worldName: 'Legacy', startsAt: 0 }),
    );
    expect(await h.state()).not.toHaveProperty('preparedParty');
    expect(await h.state()).not.toHaveProperty('bootstrap');
    expect([...partyMemberIds(await h.state())]).toEqual([]);
  });
  it('records prepared membership in newly prepared chronicle perspective dependencies', async () => {
    const f = await boot(),
      state = await f.state(),
      member = f.command.identities.entities['alena'];
    if (!member) throw new Error('MEMBER_MISSING');
    const access = resolvePerspective(state, OWNER, { kind: 'CHARACTER', characterId: member });
    if (!access.ok) throw new Error('PERSPECTIVE_MISSING');
    expect(
      chronicleEntries(state, await f.history(), access.perspective, 0, state.clock).rests,
    ).toContain('party#prepared');
  });
});

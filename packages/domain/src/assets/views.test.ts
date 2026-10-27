import { describe, expect, it } from 'vitest';

import { ASHEN_CIRCLE, CAMPAIGN, DM, ELOWEN } from '../authoring/testing/world.ts';
import type { WorldState } from '../kernel/state.ts';
import { holderPerspective, type ResolvedPerspective } from '../knowledge/perspective.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { perceivedEntityIds } from '../investigation/perception.ts';
import { assetIdFor } from './records.ts';
import { assetWorld, hash, type AssetWorld } from './testing/world.ts';
import { assetContentAt, entityAssetsAt, type Snapshot } from '../visual/views.ts';
import { assetLineage, dmEntityAssets } from './views.ts';

/**
 * Player metadata isolation (owner decision, ADR 0022 §5): players see
 * assets only of entities their character knows or perceives, only what
 * presentation could choose for them (Gate 06), and only the variant,
 * purpose, and content hash; never prompts, labels, notes, lineage, DM-only
 * assets, or anything naming an entity they do not know. The DM sees
 * everything. Players are served through the routes' entry points
 * (`../visual/views.ts`); the DM's pool here takes no perspective.
 */
const MIRA = 'mira-vale';
const WATCHER = 'hooded-watcher';

const DM_VIEW: ResolvedPerspective = { label: 'DM', kind: 'DM', holderId: null, scopes: 'ALL' };
const elowen = (state: WorldState) =>
  holderPerspective(state, { kind: 'CHARACTER', characterId: ELOWEN });
const party = (state: WorldState) => holderPerspective(state, { kind: 'PARTY' });
const publicView = (state: WorldState) => holderPerspective(state, { kind: 'PUBLIC' });

async function snapshotOf(world: AssetWorld): Promise<Snapshot> {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  return snapshot;
}
const served = (snapshot: Snapshot, perspective: ResolvedPerspective, content: number) =>
  assetContentAt(snapshot, perspective, hash(content), null);

/** Mira (known and seen), a hooded watcher Elowen sees but does not know, and the secret Ashen Circle. */
async function populated(): Promise<AssetWorld & { ids: Record<string, string> }> {
  const world = await assetWorld();
  const created = await world.as(DM, {
    type: 'CreateEntity',
    entityId: WATCHER,
    kind: 'npc',
    name: 'Sable WATCHERSECRETNAME',
    description: 'WATCHERDESCRIPTION',
    existsSince: null,
    placement: { locationId: 'market-square', since: null },
  });
  if (created.status !== 'accepted') throw new Error('watcher rejected');
  const ids: Record<string, string> = {
    mira: await world.approved(MIRA, 1),
    miraNight: await world.approved(MIRA, 2, { variant: 'derived', label: 'secret-night' }),
    miraDm: await world.approved(MIRA, 3, { variant: 'derived', label: 'dm-only', audience: 'dm' }),
    watcher: await world.approved(WATCHER, 4),
    ashen: await world.approved(ASHEN_CIRCLE, 5),
  };
  // A candidate never approved, and a retracted reference, stay hidden.
  const candidate = await world.request(MIRA, { variant: 'derived', label: 'candidate' });
  await world.start(candidate);
  await world.complete(candidate, 6);
  ids['candidate'] = assetIdFor(candidate);
  return { ...world, ids };
}

describe('which entities a perspective sees assets of', () => {
  it('matches the premise of the test: Elowen sees the watcher without knowing it, and knows nothing of the circle', async () => {
    const world = await populated();
    const state = await world.state();
    expect(perceivedEntityIds(state, ELOWEN).has(WATCHER)).toBe(true);
    expect(knownEntityIds(state, elowen(state)).has(WATCHER)).toBe(false);
    expect(knownEntityIds(state, elowen(state)).has(ASHEN_CIRCLE)).toBe(false);
    expect(perceivedEntityIds(state, ELOWEN).has(ASHEN_CIRCLE)).toBe(false);
  });

  it('shows a player only approved player assets, as variant, purpose, and content hash', async () => {
    const world = await populated();
    const snapshot = await snapshotOf(world);
    const { state } = snapshot;
    const view = (variant: string, n: number) => ({
      variant,
      purpose: 'image',
      contentHash: hash(n),
      mediaType: 'image/svg+xml',
    });
    for (const perspective of [elowen(state), party(state)]) {
      // The `secret-night` variant fits no tags a player sees: presentation never chooses it.
      expect(entityAssetsAt(snapshot, perspective, MIRA)).toEqual([view('reference', 1)]);
      // Perceived but unknown: the image, and nothing that names it.
      expect(entityAssetsAt(snapshot, perspective, WATCHER)).toEqual([view('reference', 4)]);
      // Neither known nor perceived: exactly as if it did not exist.
      expect(entityAssetsAt(snapshot, perspective, ASHEN_CIRCLE)).toBeNull();
      expect(entityAssetsAt(snapshot, perspective, 'no-such-entity')).toBeNull();
    }
    const serialized = JSON.stringify(entityAssetsAt(snapshot, elowen(state), WATCHER));
    for (const secret of [
      'WATCHERSECRETNAME',
      'WATCHERDESCRIPTION',
      WATCHER,
      'secret-night',
      'dm-only',
      '~asset',
      '#',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('lets a public view see only what is publicly known', async () => {
    const world = await populated();
    const snapshot = await snapshotOf(world);
    const view = publicView(snapshot.state);
    const known = knownEntityIds(snapshot.state, view);
    expect(entityAssetsAt(snapshot, view, WATCHER)).toBeNull();
    expect(entityAssetsAt(snapshot, view, MIRA) === null).toBe(!known.has(MIRA));
  });

  it('serves content only for an asset the perspective may see', async () => {
    const world = await populated();
    const snapshot = await snapshotOf(world);
    const player = elowen(snapshot.state);
    expect(served(snapshot, player, 1)).toEqual({ mediaType: 'image/svg+xml' });
    expect(served(snapshot, player, 4)).toEqual({ mediaType: 'image/svg+xml' });
    // A variant presentation never chooses, DM-only, the secret entity's, an unapproved
    // candidate's, and unknown content alike.
    for (const content of [2, 3, 5, 6, 99]) expect(served(snapshot, player, content)).toBeNull();
    // The DM may look at anything, a candidate awaiting approval included.
    for (const content of [1, 2, 3, 4, 5, 6]) {
      expect(served(snapshot, DM_VIEW, content)).not.toBeNull();
    }
    expect(served(snapshot, DM_VIEW, 99)).toBeNull();
  });

  it('hides a retracted or replaced image from players once it no longer stands', async () => {
    const world = await populated();
    await world.retract(world.ids['watcher'] ?? '');
    const replacement = await world.approved(MIRA, 7);
    const snapshot = await snapshotOf(world);
    const { state } = snapshot;
    const player = elowen(state);
    expect(entityAssetsAt(snapshot, player, WATCHER)).toEqual([]);
    expect(served(snapshot, player, 4)).toBeNull();
    expect(entityAssetsAt(snapshot, player, MIRA)?.map((a) => a.contentHash)).toEqual([hash(7)]);
    expect(served(snapshot, player, 1)).toBeNull();
    expect(state.assets.canonical.get(MIRA)).toBe(replacement);
  });

  it('gives the DM everything approved, and the whole lineage', async () => {
    const world = await populated();
    const state = await world.state();
    expect(dmEntityAssets(state, MIRA)?.map((a) => a.contentHash)).toEqual([
      hash(1),
      hash(2),
      hash(3),
    ]);
    const lineage = assetLineage(state);
    expect(lineage.assets).toHaveLength(6);
    expect(lineage.requests.every((request) => request.status === 'COMPLETED')).toBe(true);
    expect(lineage.canonical).toEqual(
      expect.arrayContaining([{ entityId: MIRA, assetId: world.ids['mira'] }]),
    );
    // Gate 06 (G06-images-04): the description the image model reads, for the DM's request form.
    expect(lineage.descriptions).toContainEqual({
      entityId: MIRA,
      description: state.entities.get(MIRA)?.description,
    });
    expect(lineage.descriptions.every(({ description }) => description.trim() !== '')).toBe(true);
  });
});

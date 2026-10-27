import { ENTITY_KINDS } from '@ltw/contracts';
import {
  InMemoryEventStore,
  holderPerspective,
  knownEntityIds,
  type AppendBatch,
  type WorldEngine,
  type WorldState,
} from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { MIDDLE_ENTROPY, plantNpcBoundary, seededEngine } from '../testing/ravenford-app.ts';
import { uiCampaigns } from '../testing/ui-campaigns.ts';
import { seedSignInCampaigns } from '../testing/ui-sign-in-campaigns.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from './ravenford-seed.ts';
import { seedReviewCampaign } from './review-campaign.ts';

/**
 * Gate 06, G06-client-01 (docs/adr/0008-knowledge-boundary.md, "Entities" and its Gate 06
 * amendment): an entity a player can meet without its name gets an opaque ID, because its ID
 * reaches the player wherever its name does not (encounter order, scene presence, surroundings).
 *
 * For every campaign a seed or test composition prepares, every entity that some perspective a
 * player holds (PARTY, and the CHARACTER perspective of each seated character) does not know, by
 * the same `knownEntityIds` every non-DM view uses, must have an opaque ID: a UUID, or its kind
 * and eight hex digits (`creature-10fb59d4`). Factions are never met (they occupy no place).
 * An entity public in the canonical Ravenford of its language keeps its ID: a campaign that
 * replays the seed before the party heard of it tests timing, not a secret identity.
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const OPAQUE = new RegExp(`^(${UUID}|(${ENTITY_KINDS.join('|')})-[0-9a-f]{8})$`);

/** An event store that remembers which campaigns it holds. */
class CampaignRecordingStore extends InMemoryEventStore {
  readonly campaigns = new Set<string>();
  override append(batch: AppendBatch): Promise<void> {
    this.campaigns.add(batch.campaignId);
    return super.append(batch);
  }
}

interface Unnamed {
  readonly campaignId: string;
  readonly entityId: string;
  readonly name: string;
}

/** Entities some player-held perspective meets unnamed, by the projection rules. */
function unnamedForPlayers(campaignId: string, state: WorldState): Unnamed[] {
  const perspectives = [
    holderPerspective(state, { kind: 'PARTY' }),
    ...[...state.roster.keys()].map((characterId) =>
      holderPerspective(state, { kind: 'CHARACTER', characterId }),
    ),
  ];
  const known = perspectives.map((perspective) => knownEntityIds(state, perspective));
  return [...state.entities.values()]
    .filter((entity) => entity.kind !== 'faction')
    .filter((entity) => known.some((ids) => !ids.has(entity.entityId)))
    .map(({ entityId, name }) => ({ campaignId, entityId, name }));
}

async function campaignsOf(
  build: (store: CampaignRecordingStore) => Promise<WorldEngine>,
): Promise<Map<string, WorldState>> {
  const store = new CampaignRecordingStore();
  const engine = await build(store);
  const states = new Map<string, WorldState>();
  for (const campaignId of store.campaigns) {
    const state = (await engine.load(campaignId))?.state;
    if (state) states.set(campaignId, state);
  }
  return states;
}

const dice = () => scriptedDice(Array<number>(512).fill(15));

interface Composition {
  readonly build: (store: CampaignRecordingStore) => Promise<WorldEngine>;
  /**
   * Entities it must find unnamed, so the check cannot pass on nothing: the Shaman, the caravan
   * site, its wheel, and each composition's own strangers.
   */
  readonly expected: readonly string[];
}

const RAVENFORD_SECRETS = ['creature-ae08be99', 'location-f3b82c8b', 'item-f44e7183'];

/** Every seeded or composed campaign: the seeds, the deployment's, and the browser tests'. */
const COMPOSITIONS: Readonly<Record<string, Composition>> = {
  'English Ravenford with the Gate 04 markers': {
    build: async (store) => {
      const engine = await seededEngine(store, dice());
      await plantNpcBoundary(engine);
      return engine;
    },
    expected: [...RAVENFORD_SECRETS, 'npc-2c4cf6cd'],
  },
  'Russian Ravenford, as the deployment seeds it': {
    build: async (store) => {
      const engine = await seededEngine(store, dice(), MIDDLE_ENTROPY, RAVENFORD_RU_FIXTURES_DIR);
      await seedReviewCampaign(engine);
      return engine;
    },
    expected: RAVENFORD_SECRETS,
  },
  'browser-test campaigns': {
    build: (store) => uiCampaigns(new InMemoryAssetContentStore(), store),
    expected: [...RAVENFORD_SECRETS, 'npc-8d1d976d', 'character-7beabb40'],
  },
  'sign-in browser-test campaigns': {
    build: (store) => seedSignInCampaigns(store),
    expected: [...RAVENFORD_SECRETS, 'character-4edddd60'],
  },
};

/** IDs public in the canonical Ravenford of either language. */
async function publicIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const fixtures of [undefined, RAVENFORD_RU_FIXTURES_DIR]) {
    const engine = await seededEngine(undefined, dice(), MIDDLE_ENTROPY, fixtures);
    const state = (await engine.load('ravenford'))?.state;
    if (!state) throw new Error('no Ravenford');
    for (const id of knownEntityIds(state, holderPerspective(state, { kind: 'PUBLIC' }))) {
      ids.add(id);
    }
  }
  return ids;
}

describe(
  'opaque IDs for entities players meet unnamed (G06-client-01)',
  { timeout: 30_000 },
  () => {
    it.each(Object.entries(COMPOSITIONS))('holds in the %s', async (_, { build, expected }) => {
      const public_ = await publicIds();
      const states = await campaignsOf(build);
      expect(states.size).toBeGreaterThan(0);
      const unnamed = [...states].flatMap(([campaignId, state]) =>
        unnamedForPlayers(campaignId, state),
      );
      // The check reaches what it is about.
      for (const id of expected) expect(unnamed.map(({ entityId }) => entityId)).toContain(id);
      const semantic = unnamed.filter(
        ({ entityId }) => !OPAQUE.test(entityId) && !public_.has(entityId),
      );
      expect(semantic).toEqual([]);
    });

    it('recognizes the opaque forms only', () => {
      for (const id of [
        'creature-10fb59d4',
        'location-f3b82c8b',
        '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53',
      ])
        expect(id).toMatch(OPAQUE);
      for (const id of [
        'goblin-shaman',
        'creature-shaman1',
        'npc-tomas-reed',
        'creature-10fb59d4x',
      ])
        expect(id).not.toMatch(OPAQUE);
    });
  },
);

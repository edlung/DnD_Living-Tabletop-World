import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  WorldEngine,
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
} from '../../packages/domain/src/index.ts';
import { createCombatEngine } from '../../packages/combat/src/index.ts';
import { characterBuilder } from '../../apps/server/src/characters/builder-port.ts';
import { skillCheckPort } from '../../packages/rules/src/index.ts';
import { commandSubmissionSchema } from '../../packages/domain/src/index.ts';
import { buildApp } from '../../apps/server/src/http/app.ts';
import { devPersonaAuthenticator } from '../../apps/server/src/http/auth.ts';
import { createLogger } from '../../apps/server/src/platform/logging/logger.ts';
import { loadAdventureSeed } from '../../apps/server/src/adventures/adventures.ts';
import { PublishedEventStore } from '../../apps/server/src/campaigns/published-event-store.ts';
import { createCampaignQuestBooks } from '../../apps/server/src/campaigns/quest-books.ts';
import { createCampaignEncounterBooks } from '../../apps/server/src/campaigns/encounter-books.ts';
import { CampaignActivationWorker } from '../../apps/server/src/workshop/activation/worker.ts';
import { loadCampaignActivationReview } from '../../apps/server/src/workshop/activation/review.ts';
import {
  acceptedActivation,
  activationMemoryFixture,
  activationRequest,
} from '../../apps/server/src/testing/activation-fixture.ts';
import {
  testAiGateway,
  testAuthoring,
  testDm,
  ADVENTURE_BOOKS,
  RAVENFORD_PREPARED,
  RAVENFORD_QUESTS_BY_LANGUAGE,
  MIDDLE_ENTROPY,
} from '../../apps/server/src/testing/ravenford-app.ts';

const root = new URL('../../fixtures/campaign-library/', import.meta.url);
const json = async (url) => JSON.parse(await readFile(url, 'utf8'));
const makeEngine = (store) =>
  new WorldEngine({
    store,
    ids: new SequentialIds(0x9900),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    characters: characterBuilder,
    checks: skillCheckPort({ roll: (sides) => Math.ceil(sides / 2) }),
    entropy: MIDDLE_ENTROPY,
  });

async function authored(slug, edition) {
  const directory = new URL(slug + '/', root);
  const shelf = await json(new URL('library.json', directory));
  const content = await json(
    new URL(shelf.variants.find((v) => v.id === (edition ?? shelf.defaultVariant)).file, directory),
  );
  const f = await activationMemoryFixture();
  const scope = { ownerId: f.scope.ownerId, draftId: randomUUID() };
  await f.deps.store.createDraft(
    scope.ownerId,
    { requestId: randomUUID(), title: content.world.name, language: 'ru' },
    scope.draftId,
    new Date(f.now()).toISOString(),
  );
  const saved = await f.revisions.append({
    ...scope,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content,
    source: { kind: 'OWNER', actorId: f.ownerId },
    createdAt: new Date(f.now()).toISOString(),
  });
  assert.equal(saved.kind, 'saved');
  const reviewed = await loadCampaignActivationReview(f.deps, scope, { textOnly: true });
  assert.ok(reviewed?.frozen);
  const act = await acceptedActivation(f.repository, {
    ...scope,
    authSessionId: f.authSessionId,
    request: activationRequest(reviewed.review),
    frozen: reviewed.frozen,
  });
  const worker = new CampaignActivationWorker({
    repository: f.repository,
    bootstrap: f.bootstrap,
    initialContent: f.content,
    contents: f.contents,
    draftImages: f.images,
  });
  try {
    await worker.run({ ...scope, activationId: act.activationId });
  } finally {
    await worker.shutdown();
  }
  const ids = saved.revision.identities.entities;
  return {
    engine: makeEngine(new PublishedEventStore(f.rawStore, f.publication)),
    campaign: act.campaignId,
    ids,
    party: content.party.map((k) => ids[k]),
    books: {
      campaignQuests: createCampaignQuestBooks(f.content),
      campaignEncounters: createCampaignEncounterBooks(f.content),
    },
    content,
  };
}
async function builtin(slug) {
  const seed = await loadAdventureSeed(slug, 'ru'),
    engine = makeEngine(new InMemoryEventStore());
  const party = [];
  let campaign;
  for (const raw of seed.submissions) {
    const cmd = commandSubmissionSchema.parse(raw);
    campaign = cmd.campaignId;
    const r = await engine.execute(cmd);
    assert.equal(r.status, 'accepted', JSON.stringify(r));
    if (cmd.command.type === 'AssignCharacter') party.push(cmd.command.characterId);
  }
  const state = (await engine.load(campaign)).state;
  return {
    engine,
    campaign,
    party: [
      ...new Set([
        ...(state.preparedParty ?? []),
        ...party,
        ...state.roster.keys(),
        ...[...state.characterSheets.keys()].filter(
          (k) => state.entities.get(k)?.kind === 'character',
        ),
      ]),
    ],
    ids: Object.fromEntries([...state.entities.keys()].map((k) => [k, k])),
    books: {},
    content: null,
  };
}
export async function table(slug, edition) {
  const f = await (['ravenford', 'hollowmere'].includes(slug)
    ? builtin(slug)
    : authored(slug, edition));
  const state = async () => (await f.engine.load(f.campaign)).state;
  const initial = await state();
  const dm = { actorId: initial.campaign.dmActorId, kind: 'user' };
  const seats = [],
    personas = [{ token: 'rehearsal-dm', actorId: dm.actorId, description: 'DM' }];
  for (const [i, id] of f.party.entries()) {
    const actor = initial.roster.get(id) ?? 'rehearsal-actor-' + i;
    if (!initial.roster.has(id)) {
      const res = await f.engine.execute({
        campaignId: f.campaign,
        actor: dm,
        commandId: 'rehearsal-seat-' + id,
        command: { type: 'AssignCharacter', characterId: id, playerActorId: actor },
      });
      assert.notEqual(res.status, 'rejected', JSON.stringify(res));
    }
    const token = 'rehearsal-player-' + i;
    seats.push({ id, token, name: initial.entities.get(id).name });
    personas.push({ token, actorId: actor, description: 'player' });
  }
  assert.ok(seats.length);
  const app = buildApp({
    engine: f.engine,
    authenticator: devPersonaAuthenticator({ personas }),
    logger: createLogger({ service: 'table-rehearsal', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    adventures: ADVENTURE_BOOKS,
    preparedEncounters: RAVENFORD_PREPARED,
    questsByLanguage: RAVENFORD_QUESTS_BY_LANGUAGE,
    ...f.books,
  });
  const request = async (path, data, token = 'rehearsal-dm', method) => {
    const response = await app.inject({
      method: method ?? (data ? 'POST' : 'GET'),
      url: '/campaigns/' + f.campaign + path,
      headers: { authorization: 'Bearer ' + token },
      ...(data ? { payload: data } : {}),
    });
    if (response.statusCode >= 300)
      throw Error(path + ' ' + response.statusCode + ' ' + response.body.slice(0, 300));
    return response.body ? response.json() : null;
  };
  const cmd = async (command, seat) => {
    const r = await request('/commands', { commandId: randomUUID(), command }, seat?.token);
    assert.notEqual(r.status, 'rejected', command.type + ' ' + JSON.stringify(r));
    return r;
  };
  return { ...f, seats, state, request, cmd, close: () => app.close() };
}

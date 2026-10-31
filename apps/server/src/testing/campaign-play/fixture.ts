import { randomUUID } from 'node:crypto';

import { createCombatEngine } from '@ltw/combat';
import {
  campaignActivationAnswerSchema,
  campaignActivationReviewSchema,
  type CommandResult,
  type CreatedInvitationResponse,
} from '@ltw/contracts';
import { entropyFor, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import { scriptedDice, skillCheckPort } from '@ltw/rules';
import type { LightMyRequestResponse } from 'fastify';

import { InMemoryCredentialStore } from '../../auth/credential-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../../auth/limits.ts';
import { sessionAuthenticator } from '../../auth/session-authenticator.ts';
import { evidenceHasher } from '../../auth/tokens.ts';
import { createCampaignQuestBooks } from '../../campaigns/quest-books.ts';
import { PublishedEventStore } from '../../campaigns/published-event-store.ts';
import { buildApp } from '../../http/app.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { CampaignActivationWorker } from '../../workshop/activation/worker.ts';
import { activationMemoryFixture, activationRequest } from '../activation-fixture.ts';
import { finishImage, imageRequestFor } from '../draft-image-fixture.ts';
import { testAiGateway, testAuthoring, testDm } from '../ravenford-app.ts';
import { sessionCookieOf, tokenOfLink } from '../sign-in.ts';

const ORIGIN = 'https://table.example';
export interface PlayExchange {
  readonly persona: 'dm' | 'player';
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly status: number;
  readonly body: string;
}
export async function campaignPlayFixture(pictures = true) {
  const f = await activationMemoryFixture();
  if (pictures) {
    const image = await finishImage(
      f.images,
      imageRequestFor(f.revision, f.scope, f.authSessionId, 0, 'arden'),
      45,
    );
    const selected = await f.images.select({
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedManifestVersion: 0,
      entityId: image.candidate.entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: image.candidate.candidateId,
    });
    if (selected.kind !== 'saved') throw new Error('TEST_CHOSEN_PICTURE');
  }
  const queuedEntropy: number[] = [];
  const engine = new WorldEngine({
    store: new PublishedEventStore(f.rawStore, f.publication),
    ids: new SequentialIds(0x450),
    clock: new SteppingClock(),
    checks: skillCheckPort(scriptedDice(Array<number>(64).fill(15))),
    combat: createCombatEngine(),
    entropy: { next: () => queuedEntropy.shift() ?? 2 ** 31 },
  });
  const credentials = new InMemoryCredentialStore(),
    clock = { now: f.now };
  const signIn = {
    credentials,
    clock,
    publicOrigin: ORIGIN,
    publication: f.publication,
    limits: new RequestLimits({ ...SIGN_IN_LIMITS, expensivePerMinute: 100 }, f.now),
    evidence: evidenceHasher(),
  };
  const ai = testAiGateway();
  const app = buildApp({
    engine,
    authenticator: sessionAuthenticator(credentials, clock),
    signIn,
    logger: createLogger({ service: 'activated-bell-play-test', level: 'silent' }),
    ai,
    authoring: testAuthoring(),
    dm: testDm(),
    assets: { contents: f.contents },
    quests: [],
    campaignQuests: createCampaignQuestBooks(f.content),
    workshop: { ...f.deps, campaignEntry: { engine, signIn } },
  });
  await app.ready();
  const ownerRequest = (method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { origin: ORIGIN, cookie: `ltw_workshop=${f.token}`, 'x-workshop-owner': f.ownerId },
      ...(payload ? { payload } : {}),
    });
  const activationUrl = `/workshop/drafts/${f.draftId}/activation`;
  const reviewed = await ownerRequest(
    'GET',
    `${activationUrl}-review?textOnly=${String(!pictures)}`,
  );
  if (reviewed.statusCode !== 200) throw new Error('TEST_ACTIVATION_REVIEW_HTTP');
  const review = campaignActivationReviewSchema.parse(reviewed.json<unknown>());
  if (!review.confirmable) throw new Error('TEST_ACTIVATION_NOT_READY');
  const accepted = await ownerRequest('POST', activationUrl, activationRequest(review));
  if (accepted.statusCode !== 200) throw new Error('TEST_ACTIVATION_CONFIRM_HTTP');
  const activation = campaignActivationAnswerSchema.parse(accepted.json<unknown>()).activation;
  if (!activation || !f.deps.activation) throw new Error('TEST_ACTIVATION_MISSING');
  const worker = new CampaignActivationWorker(f.deps.activation);
  await worker.run({ ...f.scope, activationId: activation.activationId });
  await worker.shutdown();
  const campaignId = activation.campaignId,
    base = `/campaigns/${campaignId}`;
  const initial = await engine.load(campaignId),
    activationRecord = await f.repository.get(f.scope),
    content = await f.content.get(campaignId);
  if (!initial || !activationRecord || !content) throw new Error('TEST_PUBLISHED_INITIAL_STATE');
  const entered = await ownerRequest('POST', `/workshop/campaigns/${campaignId}/sign-in`, {});
  if (entered.statusCode !== 200) throw new Error('TEST_DM_ENTRY');
  const redeem = async (link: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/redeem',
      headers: { origin: ORIGIN },
      payload: { token: tokenOfLink(link) },
    });
    const cookie = sessionCookieOf(response);
    if (response.statusCode !== 200 || !cookie) throw new Error('TEST_NORMAL_REDEEM');
    return cookie;
  };
  const dmCookie = await redeem(entered.json<{ link: string }>().link);
  const id = (key: string) => {
    const value = f.revision.identities.entities[key];
    if (!value) throw new Error(`TEST_UNKNOWN_LOCAL_KEY:${key}`);
    return value;
  };
  const invited = await app.inject({
    method: 'POST',
    url: `${base}/invitations`,
    headers: { origin: ORIGIN, cookie: dmCookie },
    payload: { characterId: id('alena'), expiresHours: 1 },
  });
  if (invited.statusCode !== 201)
    throw new Error(`TEST_PLAYER_INVITATION:${String(invited.statusCode)}`);
  const invitation = invited.json<CreatedInvitationResponse>();
  const playerCookie = await redeem(invitation.link);
  const exchanges: PlayExchange[] = [];
  let sequence = 0;
  const send = async (
    persona: 'dm' | 'player',
    method: 'GET' | 'POST',
    path: string,
    payload?: object,
  ): Promise<LightMyRequestResponse> => {
    const response = await app.inject({
      method,
      url: `${base}${path}`,
      headers: { origin: ORIGIN, cookie: persona === 'dm' ? dmCookie : playerCookie },
      ...(payload ? { payload } : {}),
    });
    exchanges.push({ persona, method, path, status: response.statusCode, body: response.body });
    return response;
  };
  const command = async (
    persona: 'dm' | 'player',
    value: Record<string, unknown>,
    expected = 200,
  ) => {
    sequence++;
    const response = await send(persona, 'POST', '/commands', {
      commandId: `bell-play-${sequence}`,
      command: value,
    });
    if (response.statusCode !== expected)
      throw new Error(
        `TEST_PLAY_${String(value['type'])}:${String(response.statusCode)}:${response.body}`,
      );
    return response.json<CommandResult>();
  };
  const snapshot = async () => {
    const result = await engine.load(campaignId);
    if (!result) throw new Error('TEST_PLAY_STATE');
    return result;
  };
  return {
    ...f,
    engine,
    app,
    ai,
    signIn,
    activation,
    campaignId,
    base,
    initial,
    activationRecord,
    initialContent: content,
    invitation,
    id,
    exchanges,
    snapshot,
    send,
    command,
    act: (value: Record<string, unknown>, expected = 200) =>
      command('player', { characterId: id('alena'), ...value }, expected),
    dm: (value: Record<string, unknown>, expected = 200) => command('dm', value, expected),
    roll: (sides: number, ...faces: number[]) => {
      queuedEntropy.push(...faces.map((face) => entropyFor(face, sides)));
    },
    close: () => app.close(),
  };
}
export type CampaignPlayFixture = Awaited<ReturnType<typeof campaignPlayFixture>>;

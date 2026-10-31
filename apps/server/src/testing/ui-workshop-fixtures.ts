import { randomUUID } from 'node:crypto';

import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import type { CredentialStore } from '../auth/credential-store.ts';
import type { AssetContentStore } from '../assets/content-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { systemAuthClock } from '../auth/session-authenticator.ts';
import { hashToken } from '../auth/tokens.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { MemoryWorkshopStore } from './workshop-store.ts';
import { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import { bellCampaign } from '../../../../packages/domain/src/campaign/testing/bell.ts';
import { englishBellCampaign } from './generation/bell-english.ts';
import { seedWorkshopEdits } from './ui-workshop-edits.ts';
import { seedWorkshopActivation } from './ui-workshop-activation.ts';
import { seedWorkshopGeneration } from './ui-workshop-generation.ts';
import { seedWorkshopImages, completePreviewVisualBriefs } from './ui-workshop-images.ts';
import { SIGN_IN_ORIGIN, dmInvitationToken } from './ui-sign-in-links.ts';
import {
  WORKSHOP_CAMPAIGN,
  WORKSHOP_FIXTURES,
  workshopInvitationToken,
  workshopOwnerId,
  workshopDraftId,
} from './ui-workshop-links.ts';

/** All identities/campaigns here are fixtures of this one browser journey collection. */
export async function seedWorkshopAccess(
  credentials: CredentialStore,
  engine: WorldEngine,
  seed: string,
  runtime?: { bootstrap: WorldEngine; contents: AssetContentStore },
): Promise<{
  readonly workshop: WorkshopDependencies;
  readonly stopGeneration: () => Promise<void>;
  readonly activationFixture: Awaited<ReturnType<typeof seedWorkshopActivation>> | null;
}> {
  const store = new MemoryWorkshopStore();
  const revisions = new MemoryCampaignRevisionRepository(store);
  const { images, cancelImage, stopImages } = await seedWorkshopImages(store, revisions, seed);
  const workshop: WorkshopDependencies = {
    store,
    packages: revisions,
    publicOrigin: SIGN_IN_ORIGIN,
    clock: systemAuthClock,
    limits: new RequestLimits(
      {
        ...SIGN_IN_LIMITS,
        redeemPerMinute: 1_000,
        failuresPerHour: 1_000,
        refusedRedeemsPerMinute: 1_000,
      },
      () => Date.now(),
    ),
  };
  const now = Date.now();
  for (const name of WORKSHOP_FIXTURES) {
    await workshop.store.issueInvitation({
      invitationId: randomUUID(),
      ownerId: workshopOwnerId(seed, name),
      tokenHash: hashToken(workshopInvitationToken(seed, name)),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
      authorizationSource: name.startsWith('edit-')
        ? 'browser-test:stage-430'
        : name.startsWith('preview-')
          ? 'browser-test:stage-420'
          : name.startsWith('scenario-')
            ? 'browser-test:stage-410'
            : 'browser-test:stage-380',
    });
    if (
      name.startsWith('scenario-') ||
      name.startsWith('preview-') ||
      name.startsWith('edit-') ||
      name.startsWith('activation-') ||
      name === 'demo-ru'
    ) {
      const content =
        name === 'scenario-ru' ||
        name === 'preview-ru' ||
        name === 'edit-ru' ||
        name === 'activation-ru' ||
        name === 'demo-ru'
          ? bellCampaign()
          : englishBellCampaign();
      if (name.startsWith('preview-') || name.startsWith('edit-') || name.startsWith('activation-'))
        completePreviewVisualBriefs(content);
      const ownerId = workshopOwnerId(seed, name),
        draftId = workshopDraftId(seed, name);
      await store.createDraft(
        ownerId,
        { requestId: randomUUID(), title: content.world.name, language: content.world.language },
        draftId,
        new Date(now).toISOString(),
      );
      if (
        !['scenario-generation', 'scenario-retry', 'scenario-unavailable', 'demo-ru'].includes(name)
      ) {
        const saved = await revisions.append({
          ownerId,
          draftId,
          requestId: randomUUID(),
          basedOnRevision: 0,
          content,
          source: { kind: 'OWNER', actorId: ownerId },
          createdAt: new Date(now).toISOString(),
        });
        if (saved.kind !== 'saved') throw new Error('WORKSHOP_SCENARIO_SEED_FAILED');
      }
    }
  }
  const campaign = await loadRavenfordSeed();
  for (const input of campaign.submissions) {
    const submission = commandSubmissionSchema.parse(input);
    const result = await engine.execute({
      ...submission,
      campaignId: WORKSHOP_CAMPAIGN,
      commandId: `${WORKSHOP_CAMPAIGN}.${submission.commandId}`,
    });
    if (result.status === 'rejected') throw new Error('WORKSHOP_CAMPAIGN_SEED_FAILED');
  }
  // Independent one-use credentials for the Stage380 coexist and Stage410 isolation journeys.
  for (const index of [0, 1])
    await credentials.createInvitation({
      invitationId: randomUUID(),
      tokenHash: hashToken(dmInvitationToken(seed, WORKSHOP_CAMPAIGN, index)),
      campaignId: WORKSHOP_CAMPAIGN,
      purpose: 'dm',
      characterId: null,
      actorId: 'dm-ravenford',
      createdBy: 'operator',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
    });
  const { generation, cancelGeneration, stopGeneration } = seedWorkshopGeneration(
    store,
    revisions,
    seed,
  );
  const { edits, revisionControls, cancelEdit, stopEdits } = seedWorkshopEdits(
    store,
    revisions,
    images.repository,
    generation.repository,
    seed,
  );
  const activationFixture = runtime
    ? await seedWorkshopActivation({
        store,
        revisions,
        images: images.repository,
        controls: revisionControls,
        bootstrap: runtime.bootstrap,
        contents: runtime.contents,
        seed,
      })
    : null;
  return {
    activationFixture,
    workshop: {
      ...workshop,
      generation,
      cancelGeneration,
      images,
      cancelImage,
      edits,
      revisionControls,
      cancelEdit,
      ...(activationFixture ? { activation: activationFixture.activation } : {}),
    },
    stopGeneration: async () => {
      await Promise.all([stopGeneration(), stopImages(), stopEdits(), activationFixture?.stop()]);
    },
  };
}

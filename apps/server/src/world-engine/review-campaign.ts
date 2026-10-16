import type { CommandRejected } from '@ltw/contracts';
import {
  commandSubmissionSchema,
  type Actor,
  type CommandSubmission,
  type WorldEngine,
} from '@ltw/domain';

import type { AssetContentStore } from '../assets/content-store.ts';
import { importCuratedSet, type CuratedImportSummary } from '../images/curated-import.ts';
import type { CuratedSet } from '../images/curated-set.ts';
import type { Logger } from '../platform/logging/logger.ts';
import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from './ravenford-seed.ts';

/**
 * The review campaign of a deployment (Gate 06; docs/adr/0037-deployment.md, part B notes): the
 * Russian Ravenford of `fixtures/ravenford-ru/`, seeded through the World Engine under the
 * fixture's own command IDs (idempotent), after which the DM releases every seat the fixture gave
 * a development persona (`ReleaseCharacter`, docs/adr/0036-production-sign-in.md §4). The party's
 * history stays as the fixture wrote it (its memories need the seat held when they happened);
 * invitation mode never signs a persona in, so the released characters wait for the DM's
 * invitations. Then the curated Ravenford pictures arrive as `seed:ravenford` brings them
 * (docs/adr/0035-images.md §3): requested by the DM, made by the `curated` generator (the
 * committed files, no provider), approved for players by the DM; a rerun finds them present. One
 * database holds one Ravenford: the English seed shares these command IDs and is refused
 * (`COMMAND_ID_CONFLICT`).
 */
export interface ReviewCampaignSeed {
  readonly campaignId: string;
  /** The campaign's DM: the release and the pictures are the DM's commands. */
  readonly dm: Actor;
  readonly submissions: readonly CommandSubmission[];
}

/** What importing the curated pictures needs (`curated-import.ts`). */
export interface ReviewCampaignPictures {
  readonly contents: AssetContentStore;
  readonly set: CuratedSet;
  readonly logger: Logger;
}

/** The release of a seat the fixture assigned; its command ID is fixed, so a rerun is a duplicate. */
export const releaseCommandId = (campaignId: string, characterId: string): string =>
  `${campaignId}.review.release.${characterId}`;

export async function loadReviewCampaignSeed(
  directory = RAVENFORD_RU_FIXTURES_DIR,
): Promise<ReviewCampaignSeed> {
  const seed = await loadRavenfordSeed(directory);
  const fixture = seed.submissions.map((input) => commandSubmissionSchema.parse(input));
  const releases = fixture.flatMap(({ command }): CommandSubmission[] =>
    command.type === 'AssignCharacter'
      ? [
          {
            commandId: releaseCommandId(seed.campaignId, command.characterId),
            campaignId: seed.campaignId,
            actor: seed.dm,
            command: { type: 'ReleaseCharacter', characterId: command.characterId },
          },
        ]
      : [],
  );
  return { campaignId: seed.campaignId, dm: seed.dm, submissions: [...fixture, ...releases] };
}

export interface ReviewCampaignSummary {
  readonly campaignId: string;
  readonly name: string;
  readonly language: string;
  readonly accepted: number;
  readonly duplicate: number;
  readonly version: number;
  readonly entities: number;
  /** Characters no player holds: what the DM can invite players for, in ID order. */
  readonly openSeats: readonly string[];
  /** The curated pictures, when they were imported (`pictures` given). */
  readonly pictures: CuratedImportSummary | null;
}

export class ReviewCampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewCampaignError';
  }
}

const rejection = (submission: CommandSubmission, result: CommandRejected) =>
  new ReviewCampaignError(
    `review campaign command ${submission.commandId} (${submission.command.type}) rejected: ${result.code}`,
  );

/**
 * Seeds (or confirms) the review campaign, then imports the curated pictures when `pictures` is
 * given (the deployment's seeder always gives it); refuses anything but the Russian Ravenford,
 * before any picture is requested.
 */
export async function seedReviewCampaign(
  engine: WorldEngine,
  options: { readonly pictures?: ReviewCampaignPictures; readonly directory?: string } = {},
): Promise<ReviewCampaignSummary> {
  const seed = await loadReviewCampaignSeed(options.directory);
  const counts = { accepted: 0, duplicate: 0 };
  for (const submission of seed.submissions) {
    const result = await engine.execute(submission);
    if (result.status === 'rejected') throw rejection(submission, result);
    counts[result.status] += 1;
  }
  const seeded = (await engine.load(seed.campaignId))?.state;
  if (!seeded?.campaign) throw new ReviewCampaignError('the review campaign is missing');
  if (seeded.campaign.language !== 'ru') {
    throw new ReviewCampaignError(`campaign ${seed.campaignId} is not the Russian Ravenford`);
  }
  const pictures = options.pictures
    ? await importCuratedSet({ engine, ...options.pictures }, seed.campaignId, seed.dm)
    : null;
  const state = (await engine.load(seed.campaignId))?.state;
  const campaign = state?.campaign;
  if (!state || !campaign) throw new ReviewCampaignError('the review campaign is missing');
  const openSeats = [...state.entities.values()]
    .filter((entity) => entity.kind === 'character' && !state.roster.has(entity.entityId))
    .map((entity) => entity.entityId)
    .sort();
  return {
    campaignId: seed.campaignId,
    name: campaign.name,
    language: campaign.language,
    ...counts,
    version: state.version,
    entities: state.entities.size,
    openSeats,
    pictures,
  };
}

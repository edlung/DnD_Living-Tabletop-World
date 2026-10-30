import { validateCampaignEditOutput } from '@ltw/domain';

import { campaignCanonicalJson, MAX_CAMPAIGN_PACKAGE_BYTES } from '../packages/content.ts';
import type { CampaignRevisionRepository } from '../packages/store.ts';
import { parseCampaignEditSpec } from './edit-spec.ts';
import { campaignEditPrompt } from './edit-prompt.ts';
import { digest } from './postgres-rows.ts';
import type { CampaignGenerationDependencies } from './runtime.ts';
import { CampaignPreparationWorker } from './worker-core.ts';

/** EDIT has one durable step and produces only an immutable candidate for explicit owner adoption. */
export class CampaignEditWorker extends CampaignPreparationWorker {
  constructor(
    deps: CampaignGenerationDependencies & { readonly packages: CampaignRevisionRepository },
  ) {
    super(deps, {
      mode: 'EDIT',
      stages: ['edit'],
      prepare: async (job) => {
        const spec = parseCampaignEditSpec(job.editSpec);
        const base = await deps.packages.get(job.ownerId, job.draftId, job.baseRevision);
        if (
          !base ||
          base.digest !== spec.baselineDigest ||
          digest(base.content) !== digest(job.seed)
        )
          return { error: 'EDIT_BASELINE_MISMATCH' };
        return {
          payload: () => campaignEditPrompt(base.content, spec),
          validate: (_stage, _input, output) => {
            const checked = validateCampaignEditOutput(base, output, spec);
            return checked.ok &&
              Buffer.byteLength(campaignCanonicalJson(checked.value), 'utf8') >
                MAX_CAMPAIGN_PACKAGE_BYTES
              ? { ok: false, issues: ['CAMPAIGN_PACKAGE_TOO_LARGE'] }
              : checked;
          },
        };
      },
    });
  }
}

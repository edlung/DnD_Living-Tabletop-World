import { CAMPAIGN_GENERATION_STAGES } from '@ltw/contracts';
import { mergeCampaignGenerationStep } from '@ltw/domain';

import { campaignCanonicalJson, MAX_CAMPAIGN_PACKAGE_BYTES } from '../packages/content.ts';
import { campaignPreparationPrompt } from './prompt.ts';
import type { CampaignGenerationDependencies } from './runtime.ts';
import { CampaignPreparationWorker } from './worker-core.ts';

/** The seven-step generator cannot claim or run selective edit jobs. */
export class CampaignGenerationWorker extends CampaignPreparationWorker {
  constructor(deps: CampaignGenerationDependencies) {
    super(deps, {
      mode: 'GENERATE',
      stages: CAMPAIGN_GENERATION_STAGES,
      prepare: () =>
        Promise.resolve({
          payload: (stage, content) => {
            if (stage === 'edit') throw new Error('INVALID_GENERATION_STAGE');
            return campaignPreparationPrompt(stage, content);
          },
          validate: (stage, content, output) => {
            try {
              if (stage === 'edit') return { ok: false, issues: ['INVALID_GENERATION_STAGE'] };
              const value = mergeCampaignGenerationStep(content, stage, output);
              return Buffer.byteLength(campaignCanonicalJson(value), 'utf8') >
                MAX_CAMPAIGN_PACKAGE_BYTES
                ? { ok: false, issues: ['CAMPAIGN_PACKAGE_TOO_LARGE'] }
                : { ok: true, value };
            } catch {
              return { ok: false, issues: ['CAMPAIGN_STAGE_OUTPUT_INVALID'] };
            }
          },
        }),
    });
  }
}

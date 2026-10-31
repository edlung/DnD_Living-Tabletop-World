import type { WorldEngine } from '@ltw/domain';

import type { AssetContentStore } from '../../assets/content-store.ts';
import type { SignInDependencies } from '../../auth/sign-in.ts';
import type { CampaignInitialContentStore } from '../../campaigns/content.ts';
import type { DraftImageRepository } from '../images/store.ts';
import type { CampaignActivationRepository } from './store.ts';

/** Raw engine is narrowly injected into the worker; HTTP never uses it for ordinary reads. */
export interface CampaignActivationDependencies {
  readonly repository: CampaignActivationRepository;
  readonly initialContent: CampaignInitialContentStore;
  readonly contents: AssetContentStore;
  readonly draftImages: DraftImageRepository;
  readonly bootstrap: WorldEngine;
}
export interface CampaignEntryDependencies {
  readonly engine: WorldEngine;
  readonly signIn: SignInDependencies;
}

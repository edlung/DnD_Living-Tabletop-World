import type { WorldEngine } from '@ltw/domain';

import type { AssetContentStore } from '../../assets/content-store.ts';
import type { SignInDependencies } from '../../auth/sign-in.ts';
import type { CampaignInitialContentStore } from '../../campaigns/content.ts';
import type { CampaignLibrary } from '../../campaigns/library.ts';
import type { Logger } from '../../platform/logging/logger.ts';
import type { DraftImageRepository } from '../images/store.ts';
import type { CampaignActivationRepository } from './store.ts';

/** Raw engine is narrowly injected into the worker; HTTP never uses it for ordinary reads. */
export interface CampaignActivationDependencies {
  readonly repository: CampaignActivationRepository;
  readonly initialContent: CampaignInitialContentStore;
  readonly contents: AssetContentStore;
  readonly draftImages: DraftImageRepository;
  readonly bootstrap: WorldEngine;
  /**
   * The campaign library's pictures (docs/adr/0058, notes of 2026-11-14): a published campaign
   * that is one of the library's packages gets its pictures through the curated import's commands.
   */
  readonly libraryPictures?: { readonly library: CampaignLibrary; readonly logger: Logger };
}
export interface CampaignEntryDependencies {
  readonly engine: WorldEngine;
  readonly signIn: SignInDependencies;
}

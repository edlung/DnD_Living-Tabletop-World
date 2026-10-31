import type { DraftImageRuntime } from '../../images/draft-runtime-types.ts';
import type { DraftImageRepository } from './store.ts';

export interface DraftImageDependencies {
  readonly repository: DraftImageRepository;
  readonly runtime: DraftImageRuntime;
}

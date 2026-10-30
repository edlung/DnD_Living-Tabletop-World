import type { AssetPurpose, DraftImageStatus } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

const PURPOSE_WORDS: Record<AssetPurpose, string> = {
  image: 'Main picture',
  figure: 'Tabletop figure',
  'battle-map': 'Battle map',
};
const STATUS_WORDS: Record<DraftImageStatus, string> = {
  QUEUED: 'Picture queued',
  RUNNING: 'Making the picture',
  SUCCEEDED: 'Picture ready for your choice',
  FAILED: 'Picture generation failed',
  CANCELLED: 'Picture generation cancelled',
  DISPATCH_UNKNOWN: 'Picture dispatch is uncertain',
};
export const purposeWords = (t: Translate, purpose: AssetPurpose): string =>
  t(PURPOSE_WORDS[purpose]);
export const pictureStatusWords = (t: Translate, status: DraftImageStatus): string =>
  t(STATUS_WORDS[status]);
export const pictureSlot = (entityId: string, purpose: AssetPurpose) => ({
  entityId,
  purpose,
  variant: purpose === 'image' ? ('reference' as const) : ('derived' as const),
  label: purpose === 'image' ? null : purpose,
});

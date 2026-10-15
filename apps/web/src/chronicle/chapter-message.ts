import type { GenerateChronicleResponse } from '@ltw/contracts';

/**
 * The English sentence (translated at render) for a written chapter (ADR 0032, checkpoint C): the
 * narrator's prose, or the plain record because the narrator was unavailable, or because its text
 * failed the chronicle's checks. The client never promises other prose later.
 */
export function chapterMessage(response: {
  readonly result: Pick<GenerateChronicleResponse['result'], 'status'>;
  readonly rendering: Pick<GenerateChronicleResponse['rendering'], 'status'>;
}): string {
  if (response.result.status === 'rejected') {
    return 'The chronicle could not be written from the current events.';
  }
  switch (response.rendering.status) {
    case 'RENDERED':
      return 'Chapter written.';
    case 'INVALID_OUTPUT':
      return 'Chapter written as the plain record: the narrator’s text did not pass the chronicle’s checks.';
    default:
      return 'Chapter written as the plain record: the narrator was unavailable.';
  }
}

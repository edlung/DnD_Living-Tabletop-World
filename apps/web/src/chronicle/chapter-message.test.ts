import { describe, expect, it } from 'vitest';

import { chapterMessage } from './chapter-message.ts';

/**
 * What the DM is told after writing a chapter (ADR 0032, checkpoint C): which prose the chapter
 * holds, honestly. An unavailable narrator and a narrator whose text failed the chronicle's checks
 * are different events; both leave the plain record.
 */
describe('chapterMessage', () => {
  it.each([
    ['RENDERED', 'Chapter written.'],
    ['AI_UNAVAILABLE', 'Chapter written as the plain record: the narrator was unavailable.'],
    [
      'INVALID_OUTPUT',
      'Chapter written as the plain record: the narrator’s text did not pass the chronicle’s checks.',
    ],
  ] as const)('tells %s apart', (status, message) => {
    expect(chapterMessage({ result: { status: 'accepted' }, rendering: { status } })).toBe(message);
  });

  it('says when nothing was written', () => {
    expect(
      chapterMessage({ result: { status: 'rejected' }, rendering: { status: 'RENDERED' } }),
    ).toBe('The chronicle could not be written from the current events.');
  });
});

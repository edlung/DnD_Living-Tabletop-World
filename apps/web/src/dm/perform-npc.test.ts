import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PerformAnswer } from './perform-npc.tsx';

/*
 * Performing an NPC frames only spoken words as the NPC's (ADR 0032, C; review of Stage 320
 * part C): a refusal, "no words are available" or a failure is the panel's plain status — no
 * "{npc} says" and no "Spoken, not a recorded fact."
 */
const answer = (text: string, spoken: boolean) =>
  renderToStaticMarkup(
    createElement(PerformAnswer, { npcName: 'Mira Vale', said: { text, spoken } }),
  );

describe('a performed answer', () => {
  it('names spoken words as the NPC’s, not a recorded fact', () => {
    const markup = answer('The caravan left before dawn.', true);
    expect(markup).toMatch(
      /^<blockquote class="perform-said" role="status" aria-label="Mira Vale says">/,
    );
    expect(markup).toContain('Spoken, not a recorded fact.');
  });

  it('gives a message that is not speech as a plain status', () => {
    for (const text of [
      'No words are available for Mira Vale right now (the voice is unavailable). You can speak for Mira Vale yourself.',
      'Mira Vale cannot answer.',
      'The conversation could not be performed. Please try again.',
    ]) {
      const markup = answer(text, false);
      expect(markup).toBe(
        `<p class="perform-said perform-said--message" role="status">${text}</p>`,
      );
      expect(markup).not.toContain('says');
      expect(markup).not.toContain('Spoken');
    }
  });
});

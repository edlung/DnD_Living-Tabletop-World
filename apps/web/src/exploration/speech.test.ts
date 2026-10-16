import type { ContextAction } from '@ltw/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ActionNotice } from './action-notice.tsx';
import { DialogueView } from './dialogue-panel.tsx';

/*
 * A spoken line is announced once (docs/STAGE_320_DESIGN.md §5.3, §7): while the conversation
 * shows it, it sits in that panel's polite live region and the result notice leaves it out;
 * without the conversation the notice's own status region carries it. Rendered to markup, so
 * the announcement's structure is what is checked.
 */
const LINE = 'The caravan left before dawn.';
const noop = () => undefined;

const talk: ContextAction = { id: 'talk', legal: true } as ContextAction;
const askAway = {
  id: 'ask_about',
  legal: false,
  reason: 'NOT_PRESENT',
  topic: { entityId: 'old-trade-road', kind: 'location', name: 'Old Trade Road' },
} as unknown as ContextAction;

function dialogue(line: string | null, options: readonly ContextAction[] = [talk]): string {
  return renderToStaticMarkup(
    createElement(DialogueView, {
      name: 'Mira Vale',
      npcId: 'mira-vale',
      line,
      image: null,
      options,
      knowledge: [],
      actorId: 'elowen-starwhisper',
      canAct: true,
      locked: false,
      onRun: noop,
      onLeave: noop,
    }),
  );
}

function notice(quoteElsewhere: boolean): string {
  return renderToStaticMarkup(
    createElement(ActionNotice, {
      notice: { message: 'Spoken reply · not a fact', speech: LINE, speakerId: 'mira-vale' },
      status: 'done',
      discovered: [],
      quoteElsewhere,
      onRetry: noop,
      onDismiss: noop,
    }),
  );
}

describe('a spoken line', () => {
  it('is in the conversation’s polite live region, which exists before anything is said', () => {
    const silent = dialogue(null);
    expect(silent).toMatch(
      /<div class="dialogue-speech" aria-live="polite" aria-atomic="true"><\/div>/,
    );
    const spoken = dialogue(LINE);
    const region =
      /<div class="dialogue-speech" aria-live="polite" aria-atomic="true">(.*?)<\/div>/.exec(
        spoken,
      );
    expect(region?.[1]).toContain(`“${LINE}”`);
    expect(region?.[1]).toContain('Spoken, not a recorded fact.');
  });

  it('is left out of the result while the conversation shows it, so it is announced once', () => {
    const elsewhere = notice(true);
    expect(elsewhere).toContain('Spoken reply · not a fact');
    expect(elsewhere).not.toContain(LINE);
  });

  it('is announced by the result itself when no conversation shows it', () => {
    const status = /<section class="action-notice" role="status"[^>]*>(.*?)<\/section>/.exec(
      notice(false),
    );
    expect(status?.[1]).toContain(LINE);
  });
});

describe('a conversation option the server marks unavailable', () => {
  it('shows the server’s reason beside it and names it as the button’s description', () => {
    const markup = dialogue(null, [talk, askAway]);
    const button = /<button type="button" disabled="" aria-describedby="([^"]+)">/.exec(markup);
    expect(button).not.toBeNull();
    expect(markup).toContain(
      `<small class="option-reason" id="${button?.[1] ?? ''}">not present</small>`,
    );
  });
});

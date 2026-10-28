import type { NpcDialogueContext } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { dialoguePrompt, dialogueRequest } from './dialogue-prompt.ts';

/**
 * The rendered NPC-dialogue request (ADR 0020 §3; owner decisions 11, SI-N1): an NPC that has
 * spoken with the speaker is told so and what it already said, apart from what it may still
 * tell; the instructions ask it not to re-introduce itself, to stay consistent, and to speak
 * from its own role instead of volunteering common advice. No ID reaches the text.
 */
const line = (sourceId: string, text: string) => ({ sourceId, text });
const PRIOR = 'Orin recognized the same symbol after a caravan vanished last spring.';
const SHOP = 'The shop opens at dawn.';
const LODGING = 'Rooms are let at the Golden Stag.';

const orin = (met: boolean): NpcDialogueContext => ({
  npc: { entityId: 'orin-stonebeard', kind: 'npc', name: 'Orin Stonebeard' },
  speaker: { entityId: 'elowen-starwhisper', kind: 'character', name: 'Elowen Starwhisper' },
  metBefore: met,
  attitude: 'NEUTRAL',
  worldTime: 36_000,
  place: { entityId: 'orins-alchemy', kind: 'location', name: "Orin's Alchemy" },
  around: [],
  topic: { entityId: 'feature-19c7c7f7', kind: 'feature', name: 'Strange Symbol' },
  justTold: [],
  mayTell: [
    ...(met ? [{ ...line('orin-prior-incident', PRIOR), toldBefore: true, aboutTopic: true }] : []),
    { ...line('orin-willing', SHOP), toldBefore: false, aboutTopic: false },
  ],
  common: [line('golden-stag-rooms', LODGING)],
  memories: [],
  shown: [{ entityId: 'feature-19c7c7f7', kind: 'feature', name: 'Strange Symbol' }],
  guarded: [{ entityId: 'feature-19c7c7f7', kind: 'feature', name: 'Strange Symbol' }],
});

const render = (context: NpcDialogueContext, intent: 'talk' | 'ask') =>
  dialogueRequest(dialoguePrompt(context, { intent, accepted: true, line: null }), null);

describe('the NPC-dialogue request', () => {
  it('asked again by someone it has met: what it already told, apart, and "again"', () => {
    const request = render(orin(true), 'ask');
    expect(request.prompt).toMatchInlineSnapshot(`
      "<npc_context>
      You are Orin Stonebeard.
      How you feel about the party: neutral.
      World time: Day 1 10:00:00.
      Where you are: Orin's Alchemy.
      Speaking with you: Elowen Starwhisper.
      You have spoken with them before; they know who you are.
      They have shown you evidence about: Strange Symbol.
      You have already told them:
      - Orin recognized the same symbol after a caravan vanished last spring.
      You may also tell them:
      - The shop opens at dawn.
      Everyone around here knows (background: bring it up only if asked or it concerns you):
      - Rooms are let at the Golden Stag.
      Guarded topics: Strange Symbol.
      </npc_context>
      <exchange>
      They ask you again about Strange Symbol; you have already told them what you would.
      </exchange>"
    `);
    for (const id of ['orin-stonebeard', 'orin-prior-incident', 'golden-stag-rooms']) {
      expect(request.prompt).not.toContain(id);
    }
  });

  it('a first meeting says so, and keeps nothing as told', () => {
    const request = render(orin(false), 'talk');
    expect(request.prompt).toContain('You do not recall speaking with them before.');
    expect(request.prompt).not.toContain('You have already told them');
    expect(request.prompt).toContain('They talk with you.');
  });

  it('instructs no re-introduction, consistency, and its own role over common advice', () => {
    const { system } = render(orin(true), 'talk');
    expect(system).toContain(
      'If you have spoken with them before, do not introduce yourself again or greet them as a stranger.',
    );
    expect(system).toContain('never deny or take back what you have already told them');
    expect(system).toContain('Stay consistent with what you have already told them');
    expect(system).toContain(
      'Do not volunteer common knowledge or general advice, such as where to lodge, unless they ask for it or it is your own trade.',
    );
    expect(system).not.toContain('you have nothing to tell about them here');
  });
});

import { describe, expect, it } from 'vitest';

import { seedRavenford } from '../knowledge/testing/ravenford.ts';
import { authorize, authorizeActingFor } from './authorization.ts';

/**
 * A table display reads and never writes (docs/adr/0042-table-display.md §2): every command is
 * refused, whatever its authority would otherwise be, and it acts for no character.
 */
describe('a table display', () => {
  const DISPLAY = {
    actorId: 'display:4f1c2a9e-7b3d-4e8a-9c21-5d6f7a8b9c0d',
    kind: 'display',
  } as const;

  it('issues no command and acts for nobody', async () => {
    const { state } = await seedRavenford();
    for (const command of [
      { type: 'AdvanceTime', seconds: 60 },
      { type: 'ReleaseCharacter', characterId: 'elowen-starwhisper' },
      { type: 'CreateCampaign', name: 'x', worldName: 'y', startsAt: 0, language: 'en' },
    ] as const) {
      const verdict = authorize(state, DISPLAY, command as never);
      expect(verdict.ok).toBe(false);
    }
    expect(authorizeActingFor(state, DISPLAY, 'elowen-starwhisper').ok).toBe(false);
  });
});

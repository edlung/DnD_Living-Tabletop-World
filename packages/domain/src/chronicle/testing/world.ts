import type { ChronicleParagraph, CommandResult } from '@ltw/contracts';

import { CAMPAIGN, DM } from '../../authoring/testing/world.ts';
import type { Actor } from '../../kernel/actor.ts';
import { holderPerspective, resolvePerspective } from '../../knowledge/perspective.ts';
import { parsePerspective } from '@ltw/contracts';
import { visualWorld, type VisualWorld } from '../../visual/testing/world.ts';
import { chronicleEntries } from '../entries.ts';
import { templateProse } from '../prose.ts';

/**
 * Test support for the Chronicle (docs/adr/0024-chronicle.md): the visual
 * world plus a DM who generates chapters as the server does, with the
 * template's prose unless a test supplies its own.
 */
export const DAY1_START = 0;

export interface ChronicleWorld extends VisualWorld {
  /** Generates a chapter; returns the command result and its chapter ID. */
  readonly generate: (options?: {
    readonly perspective?: string;
    readonly from?: number;
    readonly to?: number;
    readonly title?: string;
    readonly paragraphs?: readonly ChronicleParagraph[];
    readonly actor?: Actor;
  }) => Promise<CommandResult>;
}

let chapters = 0;

export async function chronicleWorld(): Promise<ChronicleWorld> {
  const world = await visualWorld();
  return {
    ...world,
    generate: async (options = {}) => {
      const { state, history } = await world.snapshot();
      const label = options.perspective ?? 'PARTY';
      const request = parsePerspective(label);
      const access = request ? resolvePerspective(state, DM, request) : null;
      const perspective = access?.ok
        ? access.perspective
        : holderPerspective(state, { kind: 'PARTY' });
      const from = options.from ?? DAY1_START;
      const to = options.to ?? state.clock;
      const draft = chronicleEntries(state, history, perspective, from, to);
      chapters += 1;
      return world.engine.execute({
        commandId: `chronicle-test.${String(chapters)}`,
        campaignId: CAMPAIGN,
        actor: options.actor ?? DM,
        command: {
          type: 'GenerateChronicle',
          title: options.title ?? 'Chapter I — Shadows on the Trade Road',
          perspective: label,
          from,
          to,
          prose: {
            // With nothing to tell, a placeholder keeps the command well-formed for the decision.
            paragraphs:
              options.paragraphs ??
              (draft.entries.length > 0
                ? templateProse(draft.entries)
                : [{ text: 'Nothing happened.', cites: ['e1'] }]),
            provider: 'template',
            model: 'chronicle-template-1',
            traceId: null,
          },
        },
      });
    },
  };
}

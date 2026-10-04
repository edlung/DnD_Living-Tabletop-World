import type {
  AuthoringConfirmation,
  AuthoringPreview,
  CommandResult,
  ConfirmableRiskLevel,
} from '@ltw/contracts';

import {
  CAMPAIGN,
  DM,
  investigationWorld,
  type InvestigationWorld,
} from '../../investigation/testing/world.ts';
import type { Actor } from '../../kernel/actor.ts';
import type { ResolvedProposable } from '../../kernel/decision.ts';
import { worldTimeAt } from '../../kernel/world-time.ts';
import { previewAuthoring } from '../preview.ts';

/**
 * Test support for authoring (docs/adr/0018-ai-authoring.md): the full
 * Ravenford seed, Tomas Reed as RAVENFORD_SPEC.md describes him, and helpers
 * that preview and commit proposals the way the server's authoring service
 * does (command ID `authoring.<proposalId>`).
 */
export {
  CAMPAIGN,
  DM,
  ELOWEN,
  OUTSIDER,
  PLAYER,
  codeOf,
} from '../../investigation/testing/world.ts';

export const TOMAS = 'tomas-reed';
export const TESTIMONY = 'tomas-saw-caravan';
export const ASHEN_CIRCLE = '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53';
/** When Mira says the caravan left: Day -1 05:00, before dawn (knowledge seed). */
export const DEPARTURE = worldTimeAt(-1, 5);

export const tomas = (
  changes: Partial<Extract<ResolvedProposable, { type: 'CreateEntity' }>> = {},
): ResolvedProposable => ({
  type: 'CreateEntity',
  entityId: TOMAS,
  kind: 'npc',
  name: 'Tomas Reed',
  description: 'A young guard of the Ravenford Guard, 22 years old.',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
  ...changes,
});

export const testimony = (
  changes: Partial<Extract<ResolvedProposable, { type: 'AddKnowledge' }>> = {},
): ResolvedProposable => ({
  type: 'AddKnowledge',
  knowledgeId: TESTIMONY,
  scope: { kind: 'NPC', npcId: TOMAS },
  knowledgeType: 'TESTIMONY',
  statement: 'I saw the Merchant Guild caravan leave through the North Gate.',
  subjects: ['guild-caravan', 'north-gate'],
  attributedTo: TOMAS,
  knownSince: null,
  ...changes,
});

/** Tomas, his witness testimony, and (by default) his willingness to tell it. */
export const tomasProposal = (): ResolvedProposable[] => [
  tomas(),
  testimony(),
  { type: 'SetDisclosure', knowledgeId: TESTIMONY, disclosure: 'WILLING' },
];

export const confirm = (
  riskLevel: ConfirmableRiskLevel,
  acknowledgedWarnings: readonly string[] = [],
): AuthoringConfirmation => ({ riskLevel, acknowledgedWarnings: [...acknowledgedWarnings] });

export interface CommitOptions {
  readonly confirmation?: AuthoringConfirmation;
  readonly actor?: Actor;
  readonly proposalId?: string;
  readonly revision?: number;
}

export interface AuthoringWorld extends InvestigationWorld {
  /** Commits a proposal as the authoring service would; returns the result and the proposal ID. */
  readonly commit: (
    commands: readonly ResolvedProposable[],
    options?: CommitOptions,
  ) => Promise<CommandResult & { readonly proposalId: string }>;
  readonly preview: (
    commands: readonly ResolvedProposable[],
    actor?: Actor,
  ) => Promise<AuthoringPreview>;
  readonly version: () => Promise<number>;
}

export const commitIdOf = (proposalId: string) => `authoring.${proposalId}`;

export async function authoringWorld(): Promise<AuthoringWorld> {
  const world = await investigationWorld();
  let proposals = 0;
  const nextProposal = () => {
    proposals += 1;
    return `00000000-0000-4000-8000-${String(proposals).padStart(12, '0')}`;
  };
  const snapshot = async () => {
    const loaded = await world.engine.load(CAMPAIGN);
    if (!loaded) throw new Error('missing campaign');
    return loaded;
  };
  return {
    ...world,
    commit: async (commands, options = {}) => {
      const proposalId = options.proposalId ?? nextProposal();
      const result = await world.engine.execute({
        commandId: commitIdOf(proposalId),
        campaignId: CAMPAIGN,
        actor: options.actor ?? DM,
        command: {
          type: 'ApplyAuthoring',
          proposalId,
          revision: options.revision ?? 1,
          summary: 'Authoring under test.',
          source: { kind: 'dm' },
          commands,
          confirmation: options.confirmation ?? confirm('L3'),
        },
      });
      return { ...result, proposalId };
    },
    preview: async (commands, actor = DM) =>
      previewAuthoring(await snapshot(), actor, {
        campaignId: CAMPAIGN,
        proposalId: '00000000-0000-4000-8000-0000000000ff',
        revision: 1,
        summary: 'Preview under test.',
        source: { kind: 'dm' },
        commands,
      }),
    version: async () => (await snapshot()).state.version,
  };
}

import { MAX_INVITATION_HOURS, campaignIdSchema } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';

import { issueInvitation, type IssuedInvitation, type SignInDependencies } from './sign-in.ts';

/**
 * The operator's sign-in commands (`pnpm auth:operator`; docs/adr/0036-production-sign-in.md
 * §1): the only way to DM access in production is a DM invitation the operator issues for a
 * campaign's `dmActorId`. Arguments are explicit and strict; nothing has a default.
 */
export type AuthOperatorCommand = {
  readonly kind: 'dm-invite';
  readonly campaignId: string;
  readonly expiresHours: number;
};

export class AuthOperatorUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthOperatorUsageError';
  }
}

/** A refusal with a fixed code, never echoing input. */
export class AuthOperatorRefusal extends Error {
  readonly code: 'CAMPAIGN_NOT_FOUND';
  constructor(code: 'CAMPAIGN_NOT_FOUND') {
    super(code);
    this.name = 'AuthOperatorRefusal';
    this.code = code;
  }
}

const FLAGS = { 'dm-invite': ['campaign', 'expires-hours'] } as const;

export function parseAuthOperatorArgs(argv: readonly string[]): AuthOperatorCommand {
  const [kind, ...rest] = argv;
  if (kind !== 'dm-invite') {
    throw new AuthOperatorUsageError(`commands: ${Object.keys(FLAGS).join(', ')}`);
  }
  const allowed = new Set<string>(FLAGS[kind]);
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] ?? '';
    const name = flag.slice(2);
    if (!flag.startsWith('--') || !allowed.has(name)) {
      throw new AuthOperatorUsageError(
        `${kind} does not take ${flag.startsWith('--') ? flag : 'that argument'}`,
      );
    }
    if (values.has(name)) throw new AuthOperatorUsageError(`--${name} given twice`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new AuthOperatorUsageError(`--${name} needs a value`);
    }
    values.set(name, value);
  }
  const campaign = values.get('campaign');
  if (campaign === undefined) throw new AuthOperatorUsageError('--campaign is required');
  if (!campaignIdSchema.safeParse(campaign).success) {
    throw new AuthOperatorUsageError('--campaign must be a campaign ID');
  }
  const hours = values.get('expires-hours');
  if (hours === undefined) throw new AuthOperatorUsageError('--expires-hours is required');
  if (!/^[1-9][0-9]{0,2}$/.test(hours) || Number(hours) > MAX_INVITATION_HOURS) {
    throw new AuthOperatorUsageError(`--expires-hours must be 1-${String(MAX_INVITATION_HOURS)}`);
  }
  return { kind, campaignId: campaign, expiresHours: Number(hours) };
}

/** Issues one DM invitation for the campaign's DM; its link is shown once, to the operator. */
export async function issueDmInvitation(
  engine: WorldEngine,
  deps: Pick<SignInDependencies, 'credentials' | 'publicOrigin' | 'clock'>,
  command: AuthOperatorCommand,
): Promise<IssuedInvitation & { readonly campaignId: string }> {
  const campaign = (await engine.load(command.campaignId))?.state.campaign ?? null;
  if (campaign === null) throw new AuthOperatorRefusal('CAMPAIGN_NOT_FOUND');
  const issued = await issueInvitation(deps, {
    campaignId: command.campaignId,
    purpose: 'dm',
    characterId: null,
    actorId: campaign.dmActorId,
    createdBy: 'operator',
    hours: command.expiresHours,
  });
  return { ...issued, campaignId: command.campaignId };
}

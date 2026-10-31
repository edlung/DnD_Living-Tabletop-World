import { randomUUID } from 'node:crypto';

import { MAX_INVITATION_HOURS, workshopIdSchema } from '@ltw/contracts';

import { issueWorkshopInvitation, type WorkshopDependencies } from './service.ts';

export type WorkshopOperatorCommand =
  | {
      readonly kind: 'invite';
      readonly ownerId: string;
      readonly hours: number;
      readonly authorizationSource: string;
    }
  | { readonly kind: 'revoke'; readonly ownerId: string; readonly authorizationSource: string };

export class WorkshopOperatorUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkshopOperatorUsageError';
  }
}

export function parseWorkshopOperatorArgs(argv: readonly string[]): WorkshopOperatorCommand {
  const [kind, ...rest] = argv;
  if (kind !== 'invite' && kind !== 'revoke')
    throw new WorkshopOperatorUsageError('commands: invite, revoke');
  const allowed =
    kind === 'invite'
      ? ['owner', 'expires-hours', 'authorization-source']
      : ['owner', 'authorization-source'];
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i]?.slice(2) ?? '';
    const value = rest[i + 1];
    if (
      !rest[i]?.startsWith('--') ||
      !allowed.includes(name) ||
      flags.has(name) ||
      value === undefined ||
      value.startsWith('--')
    ) {
      throw new WorkshopOperatorUsageError('expected unique command flags with values');
    }
    flags.set(name, value);
  }
  const rawOwner = flags.get('owner') ?? (kind === 'invite' ? randomUUID() : '');
  const owner = workshopIdSchema.safeParse(rawOwner);
  const source = flags.get('authorization-source') ?? '';
  if (!owner.success) throw new WorkshopOperatorUsageError('--owner must be a UUID');
  if (source.trim() === '' || source.length > 200 || /\p{Cc}/u.test(source)) {
    throw new WorkshopOperatorUsageError(
      '--authorization-source must be 1-200 printable characters',
    );
  }
  if (kind === 'revoke') return { kind, ownerId: owner.data, authorizationSource: source };
  const hours = flags.get('expires-hours') ?? '';
  if (!/^[1-9][0-9]{0,2}$/.test(hours) || Number(hours) > MAX_INVITATION_HOURS) {
    throw new WorkshopOperatorUsageError('--expires-hours must be 1-168');
  }
  return { kind, ownerId: owner.data, hours: Number(hours), authorizationSource: source };
}

export async function runWorkshopOperatorCommand(
  deps: Pick<WorkshopDependencies, 'store' | 'publicOrigin' | 'clock'>,
  command: WorkshopOperatorCommand,
): Promise<object> {
  if (command.kind === 'invite') return issueWorkshopInvitation(deps, command);
  await deps.store.revokeOwner(
    command.ownerId,
    new Date(deps.clock.now()).toISOString(),
    command.authorizationSource,
  );
  return {
    ownerId: command.ownerId,
    revoked: true,
    authorizationSource: command.authorizationSource,
  };
}

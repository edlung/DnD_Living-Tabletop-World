import { MAX_MICROS, positiveMicros } from './money.ts';
import type { ApprovalCeilings } from './operator-store.ts';
import type { Authorization } from './types.ts';

/**
 * Operator CLI arguments (docs/adr/0032-live-ai.md, amendment 2026-10-11). Every amount is an
 * explicit integer of microdollars; nothing has a default. Every mutation needs the owner's
 * recorded authorization. A flag a command does not take is an error, so a global daily ceiling
 * offered to an approval command is refused rather than ignored.
 */
export type OperatorCommand =
  | {
      kind: 'account-create';
      accountId: string;
      providerAccountRef: string;
      globalDailyCeilingMicros: bigint;
      authorization: Authorization;
    }
  | {
      kind: 'account-revise';
      accountId: string;
      globalDailyCeilingMicros?: bigint;
      enabled?: boolean;
      authorization: Authorization;
    }
  | {
      kind: 'approval-create';
      approvalId: string;
      accountId: string;
      grantReference: string;
      stage: string;
      ceilings: ApprovalCeilings;
      campaignIds: string[];
      authorization: Authorization;
    }
  | {
      kind: 'approval-revise';
      approvalId: string;
      ceilings: Partial<ApprovalCeilings>;
      campaignIds?: string[];
      enabled?: boolean;
      authorization: Authorization;
    }
  | {
      kind: 'eval-run-register';
      runId: string;
      approvalId: string;
      campaignId: string;
      authorization: Authorization;
    }
  | { kind: 'stop-clear'; stopId: string; authorization: Authorization }
  | {
      kind: 'attempt-reconcile';
      attemptId: string;
      chargeMicros: bigint;
      authorization: Authorization;
    }
  | {
      kind: 'attempt-evidence';
      attemptId: string;
      chargeMicros: bigint;
      authorization: Authorization;
    }
  | {
      kind: 'batch-evidence';
      batchId: string;
      accountId: string;
      provider: string;
      model: string;
      windowStart: string;
      windowEnd: string;
      invoicedTotalMicros: bigint;
      evidenceReference: string;
      allocations: Map<string, bigint>;
      authorization: Authorization;
    }
  | { kind: 'recover-incomplete' }
  | { kind: 'stops'; accountId: string }
  | { kind: 'status' };

export class OperatorUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorUsageError';
  }
}

const AUTH = ['owner', 'authorized-on', 'authorization-source'];
const CEILINGS = [
  'stage-ceiling-micros',
  'campaign-daily-ceiling-micros',
  'play-session-ceiling-micros',
  'evaluation-run-ceiling-micros',
];
const FLAGS: Record<OperatorCommand['kind'], readonly string[]> = {
  'account-create': ['account', 'provider-account-ref', 'global-daily-ceiling-micros', ...AUTH],
  'account-revise': ['account', 'global-daily-ceiling-micros', 'enable', 'disable', ...AUTH],
  'approval-create': [
    'approval',
    'account',
    'grant-reference',
    'stage',
    'campaign',
    ...CEILINGS,
    ...AUTH,
  ],
  'approval-revise': ['approval', 'campaign', 'enable', 'disable', ...CEILINGS, ...AUTH],
  'eval-run-register': ['run', 'approval', 'campaign', ...AUTH],
  'stop-clear': ['stop', ...AUTH],
  'attempt-reconcile': ['attempt', 'charge-micros', ...AUTH],
  'attempt-evidence': ['attempt', 'charge-micros', ...AUTH],
  'batch-evidence': [
    'batch',
    'account',
    'provider',
    'model',
    'window-start',
    'window-end',
    'invoiced-total-micros',
    'evidence-reference',
    'allocation',
    ...AUTH,
  ],
  'recover-incomplete': [],
  stops: ['account'],
  status: [],
};
const SWITCHES = new Set(['enable', 'disable']);
const REPEATABLE = new Set(['campaign', 'allocation']);

const nonNegativeMicros = (text: string): bigint => {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(text) || BigInt(text) > MAX_MICROS) {
    throw new OperatorUsageError('expected nonnegative integer microdollars');
  }
  return BigInt(text);
};

function readFlags(kind: OperatorCommand['kind'], args: readonly string[]) {
  const allowed = new Set(FLAGS[kind]);
  const values = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (!arg.startsWith('--')) throw new OperatorUsageError(`unexpected argument ${arg}`);
    const name = arg.slice(2);
    if (!allowed.has(name)) {
      throw new OperatorUsageError(
        name === 'global-daily-ceiling-micros'
          ? 'the global daily ceiling belongs to the billing account: use account-create/account-revise'
          : `${kind} does not take --${name}`,
      );
    }
    const value = SWITCHES.has(name) ? 'true' : args[(index += 1)];
    if (value === undefined || value.startsWith('--')) {
      throw new OperatorUsageError(`--${name} needs a value`);
    }
    const seen = values.get(name) ?? [];
    if (seen.length > 0 && !REPEATABLE.has(name)) {
      throw new OperatorUsageError(`--${name} given twice`);
    }
    values.set(name, [...seen, value]);
  }
  const one = (name: string): string => {
    const value = values.get(name)?.[0];
    if (value === undefined || value.trim() === '') {
      throw new OperatorUsageError(`--${name} is required`);
    }
    return value;
  };
  const maybe = (name: string): string | undefined => values.get(name)?.[0];
  const many = (name: string): string[] => values.get(name) ?? [];
  return { one, maybe, many, has: (name: string) => values.has(name) };
}

function authorization(flags: ReturnType<typeof readFlags>): Authorization {
  const authorizedOn = flags.one('authorized-on');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(authorizedOn) || Number.isNaN(Date.parse(authorizedOn))) {
    throw new OperatorUsageError('--authorized-on must be YYYY-MM-DD');
  }
  return { ownerId: flags.one('owner'), authorizedOn, source: flags.one('authorization-source') };
}

function enabled(flags: ReturnType<typeof readFlags>): boolean | undefined {
  if (flags.has('enable') && flags.has('disable')) {
    throw new OperatorUsageError('--enable and --disable together');
  }
  return flags.has('enable') ? true : flags.has('disable') ? false : undefined;
}

const micros = (text: string): bigint => {
  try {
    return positiveMicros(text);
  } catch {
    throw new OperatorUsageError('expected positive integer microdollars');
  }
};
const optionalMicros = (text: string | undefined) =>
  text === undefined ? undefined : micros(text);

export function parseOperatorArgs(argv: readonly string[]): OperatorCommand {
  const [kind, ...rest] = argv;
  if (kind === undefined || !(kind in FLAGS)) {
    throw new OperatorUsageError(`commands: ${Object.keys(FLAGS).join(', ')}`);
  }
  const command = kind as OperatorCommand['kind'];
  const flags = readFlags(command, rest);
  switch (command) {
    case 'account-create':
      return {
        kind: command,
        accountId: flags.one('account'),
        providerAccountRef: flags.one('provider-account-ref'),
        globalDailyCeilingMicros: micros(flags.one('global-daily-ceiling-micros')),
        authorization: authorization(flags),
      };
    case 'account-revise': {
      const ceiling = optionalMicros(flags.maybe('global-daily-ceiling-micros'));
      const state = enabled(flags);
      return {
        kind: command,
        accountId: flags.one('account'),
        ...(ceiling === undefined ? {} : { globalDailyCeilingMicros: ceiling }),
        ...(state === undefined ? {} : { enabled: state }),
        authorization: authorization(flags),
      };
    }
    case 'approval-create': {
      const campaignIds = flags.many('campaign');
      if (campaignIds.length === 0) throw new OperatorUsageError('--campaign is required');
      return {
        kind: command,
        approvalId: flags.one('approval'),
        accountId: flags.one('account'),
        grantReference: flags.one('grant-reference'),
        stage: flags.one('stage'),
        ceilings: {
          stageMicros: micros(flags.one('stage-ceiling-micros')),
          campaignDailyMicros: micros(flags.one('campaign-daily-ceiling-micros')),
          playSessionMicros: micros(flags.one('play-session-ceiling-micros')),
          evaluationRunMicros: micros(flags.one('evaluation-run-ceiling-micros')),
        },
        campaignIds,
        authorization: authorization(flags),
      };
    }
    case 'approval-revise': {
      const ceilings: Partial<ApprovalCeilings> = Object.fromEntries(
        (
          [
            ['stageMicros', 'stage-ceiling-micros'],
            ['campaignDailyMicros', 'campaign-daily-ceiling-micros'],
            ['playSessionMicros', 'play-session-ceiling-micros'],
            ['evaluationRunMicros', 'evaluation-run-ceiling-micros'],
          ] as const
        ).flatMap(([key, flag]) => {
          const value = optionalMicros(flags.maybe(flag));
          return value === undefined ? [] : [[key, value]];
        }),
      );
      const campaignIds = flags.many('campaign');
      const state = enabled(flags);
      return {
        kind: command,
        approvalId: flags.one('approval'),
        ceilings,
        ...(campaignIds.length === 0 ? {} : { campaignIds }),
        ...(state === undefined ? {} : { enabled: state }),
        authorization: authorization(flags),
      };
    }
    case 'eval-run-register':
      return {
        kind: command,
        runId: flags.one('run'),
        approvalId: flags.one('approval'),
        campaignId: flags.one('campaign'),
        authorization: authorization(flags),
      };
    case 'stop-clear':
      return { kind: command, stopId: flags.one('stop'), authorization: authorization(flags) };
    case 'attempt-reconcile':
    case 'attempt-evidence':
      return {
        kind: command,
        attemptId: flags.one('attempt'),
        chargeMicros: nonNegativeMicros(flags.one('charge-micros')),
        authorization: authorization(flags),
      };
    case 'batch-evidence': {
      const allocations = new Map<string, bigint>();
      for (const entry of flags.many('allocation')) {
        const [attemptId, amount] = entry.split('=');
        if (!attemptId || amount === undefined || allocations.has(attemptId)) {
          throw new OperatorUsageError('--allocation expects distinct <attemptId>=<micros>');
        }
        allocations.set(attemptId, nonNegativeMicros(amount));
      }
      if (allocations.size === 0) throw new OperatorUsageError('--allocation is required');
      return {
        kind: command,
        batchId: flags.one('batch'),
        accountId: flags.one('account'),
        provider: flags.one('provider'),
        model: flags.one('model'),
        windowStart: flags.one('window-start'),
        windowEnd: flags.one('window-end'),
        invoicedTotalMicros: nonNegativeMicros(flags.one('invoiced-total-micros')),
        evidenceReference: flags.one('evidence-reference'),
        allocations,
        authorization: authorization(flags),
      };
    }
    case 'stops':
      return { kind: command, accountId: flags.one('account') };
    case 'recover-incomplete':
    case 'status':
      return { kind: command };
  }
}

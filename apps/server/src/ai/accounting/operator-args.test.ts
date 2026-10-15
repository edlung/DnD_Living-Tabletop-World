import { describe, expect, it } from 'vitest';

import { OperatorUsageError, parseOperatorArgs } from './operator-args.ts';

const AUTH = [
  '--owner',
  'owner',
  '--authorized-on',
  '2026-10-11',
  '--authorization-source',
  'owner-message-1',
];

describe('operator CLI arguments', () => {
  it('needs explicit positive integer ceilings and recorded authorization', () => {
    expect(
      parseOperatorArgs([
        'account-create',
        '--account',
        'acct',
        '--provider-account-ref',
        'anthropic:org-1',
        '--global-daily-ceiling-micros',
        '2000000',
        ...AUTH,
      ]),
    ).toMatchObject({ kind: 'account-create', globalDailyCeilingMicros: 2_000_000n });
    const base = ['account-create', '--account', 'a', '--provider-account-ref', 'r'];
    for (const ceiling of ['0', '-5', '1.5', '5e6', '']) {
      expect(() =>
        parseOperatorArgs([...base, '--global-daily-ceiling-micros', ceiling, ...AUTH]),
      ).toThrow(OperatorUsageError);
    }
    expect(() => parseOperatorArgs([...base, '--global-daily-ceiling-micros', '5'])).toThrow(
      /--authorized-on is required/,
    );
  });

  it('refuses a global daily ceiling on an approval command', () => {
    const approval = [
      'approval-create',
      '--approval',
      'ap',
      '--account',
      'acct',
      '--grant-reference',
      'g1',
      '--stage',
      '300',
      '--campaign',
      'ravenford',
      '--stage-ceiling-micros',
      '10',
      '--campaign-daily-ceiling-micros',
      '5',
      '--play-session-ceiling-micros',
      '2',
      '--evaluation-run-ceiling-micros',
      '3',
      ...AUTH,
    ];
    expect(parseOperatorArgs(approval)).toMatchObject({
      kind: 'approval-create',
      ceilings: {
        stageMicros: 10n,
        campaignDailyMicros: 5n,
        playSessionMicros: 2n,
        evaluationRunMicros: 3n,
      },
      campaignIds: ['ravenford'],
    });
    expect(() => parseOperatorArgs([...approval, '--global-daily-ceiling-micros', '99'])).toThrow(
      /belongs to the billing account/,
    );
    expect(() =>
      parseOperatorArgs([
        'approval-revise',
        '--approval',
        'ap',
        '--global-daily-ceiling-micros',
        '9',
        ...AUTH,
      ]),
    ).toThrow(/belongs to the billing account/);
    const at = approval.indexOf('--play-session-ceiling-micros');
    const missing = approval.filter((_arg, index) => index !== at && index !== at + 1);
    expect(() => parseOperatorArgs(missing)).toThrow(/play-session-ceiling-micros is required/);
  });

  it('rejects unknown commands, unknown or doubled flags and conflicting switches', () => {
    expect(() => parseOperatorArgs(['grant-money'])).toThrow(OperatorUsageError);
    expect(() => parseOperatorArgs(['status', '--verbose'])).toThrow(OperatorUsageError);
    expect(() => parseOperatorArgs(['stop-clear', '--stop', 'a', '--stop', 'b', ...AUTH])).toThrow(
      /given twice/,
    );
    expect(() =>
      parseOperatorArgs(['account-revise', '--account', 'a', '--enable', '--disable', ...AUTH]),
    ).toThrow(/together/);
    expect(
      parseOperatorArgs(['account-revise', '--account', 'a', '--disable', ...AUTH]),
    ).toMatchObject({ enabled: false });
    expect(parseOperatorArgs(['recover-incomplete'])).toEqual({ kind: 'recover-incomplete' });
  });

  it('reads batch allocations as distinct absolute amounts', () => {
    const batch = [
      'batch-evidence',
      '--batch',
      'b1',
      '--account',
      'acct',
      '--provider',
      'anthropic',
      '--model',
      'claude-opus-5-5',
      '--window-start',
      '2026-10-10T00:00:00Z',
      '--window-end',
      '2026-10-11T00:00:00Z',
      '--invoiced-total-micros',
      '700',
      '--evidence-reference',
      'invoice-42',
      ...AUTH,
    ];
    const parsed = parseOperatorArgs([...batch, '--allocation', 'a1=500', '--allocation', 'a2=0']);
    expect(parsed).toMatchObject({ kind: 'batch-evidence', invoicedTotalMicros: 700n });
    expect(parsed.kind === 'batch-evidence' && [...parsed.allocations]).toEqual([
      ['a1', 500n],
      ['a2', 0n],
    ]);
    expect(() =>
      parseOperatorArgs([...batch, '--allocation', 'a1=5', '--allocation', 'a1=6']),
    ).toThrow(OperatorUsageError);
    expect(() => parseOperatorArgs(batch)).toThrow(/--allocation is required/);
  });

  it('sets the image ceiling only as explicit microdollars with recorded authorization', () => {
    expect(parseOperatorArgs(['image-budget-set', '--micros', '5000000', ...AUTH])).toEqual({
      kind: 'image-budget-set',
      ceilingMicros: 5_000_000n,
      authorization: {
        ownerId: 'owner',
        authorizedOn: '2026-10-11',
        source: 'owner-message-1',
      },
    });
    // Zero is allowed: it stops every image call.
    expect(parseOperatorArgs(['image-budget-set', '--micros', '0', ...AUTH])).toMatchObject({
      ceilingMicros: 0n,
    });
    for (const amount of ['-5', '1.5', '5e6', '$5', '']) {
      expect(() => parseOperatorArgs(['image-budget-set', '--micros', amount, ...AUTH])).toThrow(
        OperatorUsageError,
      );
    }
    expect(() => parseOperatorArgs(['image-budget-set', '--micros', '5'])).toThrow(
      /--owner is required|--authorized-on is required|--authorization-source is required/,
    );
    expect(() => parseOperatorArgs(['image-budget-set', ...AUTH])).toThrow(/--micros is required/);
    expect(() =>
      parseOperatorArgs([
        'image-budget-set',
        '--micros',
        '5',
        '--global-daily-ceiling-micros',
        '5',
        ...AUTH,
      ]),
    ).toThrow(OperatorUsageError);
  });
});

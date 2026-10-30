import { describe, expect, it } from 'vitest';

import { OperatorUsageError, parseOperatorArgs } from './operator-args.ts';

const AUTH = [
  '--owner',
  'owner',
  '--authorized-on',
  '2026-10-30',
  '--authorization-source',
  'owner-campaign-approval',
];
const authorization = {
  ownerId: 'owner',
  authorizedOn: '2026-10-30',
  source: 'owner-campaign-approval',
};

describe('recorded monetary policy commands', () => {
  it('sets unlimited text policy for an explicit account with recorded authorization', () => {
    expect(
      parseOperatorArgs([
        'monetary-policy-set',
        '--scope',
        'text',
        '--account',
        'acct',
        '--mode',
        'unlimited',
        ...AUTH,
      ]),
    ).toEqual({
      kind: 'monetary-policy-set',
      target: { scope: 'text', accountId: 'acct' },
      mode: 'UNLIMITED',
      authorization,
    });
  });

  it('sets installation image policy and restores finite policy explicitly', () => {
    expect(
      parseOperatorArgs([
        'monetary-policy-set',
        '--scope',
        'images',
        '--mode',
        'unlimited',
        ...AUTH,
      ]),
    ).toEqual({
      kind: 'monetary-policy-set',
      target: { scope: 'images' },
      mode: 'UNLIMITED',
      authorization,
    });
    expect(
      parseOperatorArgs(['monetary-policy-set', '--scope', 'images', '--mode', 'finite', ...AUTH]),
    ).toMatchObject({ target: { scope: 'images' }, mode: 'FINITE' });
  });

  it('reads policy without mutation authorization or money flags', () => {
    expect(parseOperatorArgs(['monetary-policy-status', '--scope', 'images'])).toEqual({
      kind: 'monetary-policy-status',
      target: { scope: 'images' },
    });
    expect(
      parseOperatorArgs(['monetary-policy-status', '--scope', 'text', '--account', 'acct']),
    ).toEqual({
      kind: 'monetary-policy-status',
      target: { scope: 'text', accountId: 'acct' },
    });
    expect(() =>
      parseOperatorArgs(['monetary-policy-status', '--scope', 'images', ...AUTH]),
    ).toThrow(/does not take --owner/);
  });

  it('requires a scope, account for text and a recorded owner authorization for mutations', () => {
    for (const args of [
      ['monetary-policy-set', '--mode', 'unlimited', ...AUTH],
      ['monetary-policy-set', '--scope', 'text', '--mode', 'unlimited', ...AUTH],
      ['monetary-policy-status', '--scope', 'text'],
      ['monetary-policy-set', '--scope', 'images', '--mode', 'unlimited'],
      ['monetary-policy-set', '--scope', 'images', ...AUTH],
    ]) {
      expect(() => parseOperatorArgs(args)).toThrow(OperatorUsageError);
    }
  });

  it('refuses an account flag for image policy so a mistaken scope cannot be ignored', () => {
    for (const kind of ['monetary-policy-set', 'monetary-policy-status']) {
      const mutation = kind === 'monetary-policy-set' ? ['--mode', 'unlimited', ...AUTH] : [];
      expect(() =>
        parseOperatorArgs([kind, '--scope', 'images', '--account', 'acct', ...mutation]),
      ).toThrow(/images.*account|account.*images/);
    }
  });

  it('refuses unknown scopes, modes and numeric substitutes for unlimited', () => {
    for (const scope of ['all', 'account', 'image', '']) {
      expect(() =>
        parseOperatorArgs([
          'monetary-policy-set',
          '--scope',
          scope,
          '--mode',
          'unlimited',
          ...AUTH,
        ]),
      ).toThrow(OperatorUsageError);
    }
    for (const mode of ['Infinity', '0', '999999999999999999', 'UNLIMITED', 'none', '']) {
      expect(() =>
        parseOperatorArgs(['monetary-policy-set', '--scope', 'images', '--mode', mode, ...AUTH]),
      ).toThrow(OperatorUsageError);
    }
  });

  it('refuses doubled flags and obsolete ceiling arguments on the new command', () => {
    const base = ['monetary-policy-set', '--scope', 'images', '--mode', 'unlimited', ...AUTH];
    for (const extra of [
      ['--scope', 'text'],
      ['--mode', 'finite'],
      ['--micros', '999999999999999999'],
      ['--stage-ceiling-micros', '1'],
      ['--global-daily-ceiling-micros', '1'],
    ]) {
      expect(() => parseOperatorArgs([...base, ...extra])).toThrow(OperatorUsageError);
    }
  });
});

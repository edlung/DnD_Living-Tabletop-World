import { describe, expect, it } from 'vitest';

import { loadConfig } from '../platform/config/config.ts';
import { parseRoutes, routeIssues } from '../platform/config/ai-routes.ts';
import { ANTHROPIC_REQUEST_SETTINGS } from './request-settings.ts';
import { parseOperatorArgs } from './accounting/operator-args.ts';

describe('campaign preparation configuration remains distinct from runtime', () => {
  it('has a separate bounded timeout without changing old request/attempt defaults', () => {
    expect(loadConfig({}).ai).toMatchObject({
      preparationTimeoutMs: 300000,
      requestTimeoutMs: 60000,
    });
    expect(loadConfig({ LTW_AI_PREPARATION_TIMEOUT_MS: '120000' }).ai.preparationTimeoutMs).toBe(
      120000,
    );
    for (const duration of ['0', '999', '600001', 'Infinity'])
      expect(() => loadConfig({ LTW_AI_PREPARATION_TIMEOUT_MS: duration })).toThrow();
    expect(ANTHROPIC_REQUEST_SETTINGS['campaign-preparation']).toEqual({
      effort: 'medium',
      maxTokens: 32768,
    });
  });
  it('allows one explicit verified remote route and refuses local/fallback/multiple providers', () => {
    const errors: string[] = [];
    const routes = parseRoutes('campaign-preparation=anthropic:claude-sonnet-5-5', errors);
    expect(errors).toEqual([]);
    expect(routes).not.toBeNull();
    expect(routeIssues(routes ?? {}, 'runtime', new Set(['anthropic']))).toEqual([]);
    for (const entries of [
      ['local'],
      ['anthropic:claude-sonnet-5-5', 'local'],
      ['anthropic:claude-sonnet-5-5', 'anthropic:claude-sonnet-5-5'],
    ])
      expect(
        routeIssues({ 'campaign-preparation': entries }, 'runtime', new Set(['anthropic'])),
      ).not.toEqual([]);
  });
  it('requires recorded authorization to grant a selected approval to a workshop owner', () => {
    const owner = '12345678-1234-4234-8234-123456789abc';
    const flags = [
      '--owner',
      'operator',
      '--authorized-on',
      '2026-10-30',
      '--authorization-source',
      'owner:400',
    ];
    expect(
      parseOperatorArgs([
        'preparation-grant',
        '--approval',
        'a1',
        '--workshop-owner',
        owner,
        '--enable',
        ...flags,
      ]),
    ).toMatchObject({ kind: 'preparation-grant', approvalId: 'a1', ownerId: owner, enabled: true });
    expect(() =>
      parseOperatorArgs([
        'preparation-grant',
        '--approval',
        'a1',
        '--workshop-owner',
        owner,
        '--enable',
      ]),
    ).toThrow();
    expect(() =>
      parseOperatorArgs([
        'preparation-grant',
        '--approval',
        'a1',
        '--workshop-owner',
        owner,
        ...flags,
      ]),
    ).toThrow();
  });
});

import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { createHarness, expectAccepted } from '../kernel/testing/kernel-harness.ts';
import { possessionOf } from '../items/records.ts';
import { buildCampaignPlan } from './plan.ts';
import { bootstrapCommand, OWNER } from './testing/bootstrap.ts';
import { bellCampaign } from './testing/bell.ts';
import { testBootstrapIdentities, testCampaignIdentities } from './testing/identities.ts';

/** Starting possessions (docs/adr/0039-item-possession.md, Stage 470). */
const carried = (key: string, name: string) => ({
  key,
  kind: 'item' as const,
  name,
  description: 'Для проверки.',
  status: 'active' as const,
  existsSince: null,
});

function withItems(possessions: CampaignPackage['possessions']): CampaignPackage {
  const content = bellCampaign();
  return {
    ...content,
    entities: [
      ...content.entities,
      carried('balm-flask', 'Фляга бальзама'),
      carried('mail', 'Кольчуга'),
    ],
    ...(possessions === undefined ? {} : { possessions }),
  };
}
const codes = (content: CampaignPackage) =>
  buildCampaignPlan(content, testCampaignIdentities(content)).findings.map(
    (finding) => finding.code,
  );

describe('starting possessions', () => {
  it('compile to one GrantItem per row, after the entities exist', () => {
    const content = withItems([
      { item: 'balm-flask', holder: 'alena', catalog: 'woodland-balm', quantity: 2 },
      { item: 'mail', holder: 'borin', catalog: 'watchman-mail', quantity: 1 },
    ]);
    const ids = testCampaignIdentities(content);
    const plan = buildCampaignPlan(content, ids);
    expect(plan.findings).toEqual([]);
    const grants = plan.commands.filter((command) => command.type === 'GrantItem');
    expect(grants).toHaveLength(2);
    expect(grants[0]).toMatchObject({
      itemId: ids.entities['balm-flask'],
      holderId: ids.entities['alena'],
      catalogId: 'woodland-balm',
      quantity: 2,
    });
    const created = plan.commands.findIndex(
      (command) => command.type === 'CreateEntity' && command.entityId === ids.entities['mail'],
    );
    expect(created).toBeGreaterThanOrEqual(0);
    expect(created).toBeLessThan(
      plan.commands.findIndex((command) => command.type === 'GrantItem'),
    );
  });

  it('are optional: a package without them is valid and plans no grant', () => {
    const content = bellCampaign();
    expect(campaignPackageSchema.safeParse(content).success).toBe(true);
    expect('possessions' in content).toBe(false);
    const plan = buildCampaignPlan(content, testCampaignIdentities(content));
    expect(plan.commands.some((command) => command.type === 'GrantItem')).toBe(false);
  });

  it.each([
    ['an unknown item', [{ item: 'nope', holder: 'alena', quantity: 1 }], 'REFERENCE_MISSING'],
    ['a non-item', [{ item: 'alena', holder: 'borin', quantity: 1 }], 'REFERENCE_KIND'],
    ['a place as holder', [{ item: 'mail', holder: 'dock', quantity: 1 }], 'REFERENCE_KIND'],
    [
      'an unknown catalog entry',
      [{ item: 'mail', holder: 'alena', catalog: 'sword-of-truth', quantity: 1 }],
      'CATALOG_UNKNOWN',
    ],
    [
      'a stack of a single item',
      [{ item: 'mail', holder: 'alena', catalog: 'watchman-mail', quantity: 2 }],
      'POSSESSION_QUANTITY',
    ],
    [
      'a quantity without a catalog item',
      [{ item: 'mail', holder: 'alena', quantity: 3 }],
      'POSSESSION_QUANTITY',
    ],
    [
      'two holders for one item',
      [
        { item: 'mail', holder: 'alena', quantity: 1 },
        { item: 'mail', holder: 'borin', quantity: 1 },
      ],
      'POSSESSION_DUPLICATE',
    ],
  ])('refuse %s', (_label, rows, code) => {
    expect(codes(withItems(rows))).toContain(code);
  });

  it('refuse an item that also lies in a place', () => {
    const content = withItems([{ item: 'mail', holder: 'alena', quantity: 1 }]);
    const entity = content.entities.find((entry) => entry.key === 'mail');
    if (!entity) throw new Error('fixture');
    entity.placement = { location: 'dock', since: null };
    expect(codes(content)).toContain('POSSESSION_PLACED');
  });
});

describe('bootstrap with starting possessions', () => {
  it('grants every row atomically and leaves a consistent, replayable world', async () => {
    const base = bootstrapCommand();
    const content = withItems([
      { item: 'balm-flask', holder: 'alena', catalog: 'woodland-balm', quantity: 2 },
      { item: 'mail', holder: 'borin', catalog: 'watchman-mail', quantity: 1 },
    ]);
    const command = { ...base, content, identities: testBootstrapIdentities(content) };
    const harness = createHarness();
    expectAccepted(await harness.submit(command, { actor: OWNER, commandId: 'boot' }));
    const snapshot = await harness.snapshot();
    const flask = command.identities.entities['balm-flask'] ?? '';
    expect(possessionOf(snapshot.state, flask)).toMatchObject({
      holderId: command.identities.entities['alena'],
      catalogId: 'woodland-balm',
      quantity: 2,
      slot: null,
    });
    expect(snapshot.history.filter((event) => event.type === 'ItemGranted')).toHaveLength(2);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(replay(snapshot.history)).toEqual(snapshot.state);
  });

  it('refuses the whole batch when a row cannot be granted', async () => {
    const base = bootstrapCommand();
    const content = withItems([{ item: 'mail', holder: 'alena', catalog: 'nope', quantity: 1 }]);
    const command = { ...base, content, identities: testBootstrapIdentities(content) };
    const harness = createHarness();
    const result = await harness.submit(command, { actor: OWNER, commandId: 'boot' });
    expect(result.status).toBe('rejected');
  });
});

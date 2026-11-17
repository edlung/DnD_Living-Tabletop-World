import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { createHarness, expectAccepted } from '../kernel/testing/kernel-harness.ts';
import { worldMapView } from '../travel/map-view.ts';
import { buildCampaignPlan } from './plan.ts';
import { bootstrapCommand, OWNER } from './testing/bootstrap.ts';
import { bellCampaign } from './testing/bell.ts';
import { testBootstrapIdentities, testCampaignIdentities } from './testing/identities.ts';

/** The package's world map (docs/adr/0057-encounters-maps-loot.md §10, ADR 0058 of 2026-11-17). */
const MAPS: NonNullable<CampaignPackage['maps']> = [
  {
    region: 'region',
    pins: [
      { place: 'harbor', x: 0.3, y: 0.7 },
      { place: 'sluice', x: 0.6, y: 0.4 },
      { place: 'sunken-tower', x: 0.85, y: 0.2 },
    ],
  },
];
const ROUTES: NonNullable<CampaignPackage['routes']> = [
  { from: 'harbor', to: 'sluice', miles: 6, terrain: 'coastal', road: true },
  { from: 'sluice', to: 'sunken-tower', miles: 3, terrain: 'swamp', road: false },
];

function withMap(
  maps: CampaignPackage['maps'] = MAPS,
  routes: CampaignPackage['routes'] = ROUTES,
): CampaignPackage {
  return { ...bellCampaign(), maps, routes };
}
const codes = (content: CampaignPackage) =>
  buildCampaignPlan(content, testCampaignIdentities(content)).findings.map(
    (finding) => finding.code,
  );

describe('the package world map', () => {
  it('compiles to one SetMapPins a map and one SetRoute a route, after the places exist', () => {
    const content = withMap();
    const ids = testCampaignIdentities(content);
    const plan = buildCampaignPlan(content, ids);
    expect(plan.findings).toEqual([]);
    const pins = plan.commands.filter((command) => command.type === 'SetMapPins');
    expect(pins).toEqual([
      {
        type: 'SetMapPins',
        regionId: ids.entities['region'],
        pins: [
          { placeId: ids.entities['harbor'], x: 0.3, y: 0.7 },
          { placeId: ids.entities['sluice'], x: 0.6, y: 0.4 },
          { placeId: ids.entities['sunken-tower'], x: 0.85, y: 0.2 },
        ],
      },
    ]);
    const routes = plan.commands.filter((command) => command.type === 'SetRoute');
    expect(routes).toContainEqual({
      type: 'SetRoute',
      fromId: ids.entities['harbor'],
      toId: ids.entities['sluice'],
      route: { miles: 6, terrain: 'coastal', road: true },
    });
    expect(routes).toHaveLength(2);
    const lastPlace = plan.commands.findLastIndex((command) => command.type === 'CreateEntity');
    expect(plan.commands.findIndex((command) => command.type === 'SetMapPins')).toBeGreaterThan(
      lastPlace,
    );
  });

  it('is optional: a package without it keeps its shape and plans no map', () => {
    const content = bellCampaign();
    expect('maps' in content || 'routes' in content).toBe(false);
    expect(campaignPackageSchema.safeParse(content).success).toBe(true);
    const plan = buildCampaignPlan(content, testCampaignIdentities(content));
    expect(plan.commands.some((c) => c.type === 'SetMapPins' || c.type === 'SetRoute')).toBe(false);
  });

  it('refuses a map without pins and a pin off the picture in the schema', () => {
    expect(campaignPackageSchema.safeParse(withMap([{ region: 'region', pins: [] }])).success).toBe(
      false,
    );
    expect(
      campaignPackageSchema.safeParse(
        withMap([{ region: 'region', pins: [{ place: 'dock', x: 1.2, y: 0.5 }] }]),
      ).success,
    ).toBe(false);
    expect(
      campaignPackageSchema.safeParse(
        withMap(undefined, [
          { from: 'dock', to: 'sluice', miles: 0, terrain: 'urban', road: true },
        ]),
      ).success,
    ).toBe(false);
  });

  it.each([
    [
      'a map of no place',
      withMap([{ region: 'alena', pins: [{ place: 'dock', x: 0.5, y: 0.5 }] }]),
      'REFERENCE_KIND',
    ],
    [
      'a pin of an unknown place',
      withMap([{ region: 'region', pins: [{ place: 'nope', x: 0.5, y: 0.5 }] }]),
      'REFERENCE_MISSING',
    ],
    [
      'a place pinned twice',
      withMap([
        {
          region: 'region',
          pins: [
            { place: 'dock', x: 0.5, y: 0.5 },
            { place: 'dock', x: 0.6, y: 0.5 },
          ],
        },
      ]),
      'PIN_DUPLICATE',
    ],
    [
      'two maps of one place',
      withMap([MAPS[0] ?? { region: 'region', pins: [] }, MAPS[0] ?? { region: '', pins: [] }]),
      'MAP_DUPLICATE',
    ],
    [
      'a route from a place to itself',
      withMap(undefined, [{ from: 'dock', to: 'dock', miles: 1, terrain: 'urban', road: true }]),
      'ROUTE_SELF',
    ],
    [
      'two routes between one pair',
      withMap(undefined, [
        { from: 'dock', to: 'sluice', miles: 2, terrain: 'urban', road: true },
        { from: 'sluice', to: 'dock', miles: 3, terrain: 'swamp', road: false },
      ]),
      'ROUTE_DUPLICATE',
    ],
    [
      'a route to a person',
      withMap(undefined, [{ from: 'dock', to: 'alena', miles: 1, terrain: 'urban', road: true }]),
      'REFERENCE_KIND',
    ],
  ])('refuses %s', (_label, content, code) => {
    expect(codes(content)).toContain(code);
  });
});

describe('bootstrap with a world map', () => {
  it('sets the pins and routes the DM sees, in a consistent, replayable world', async () => {
    const base = bootstrapCommand();
    const content = withMap();
    const command = { ...base, content, identities: testBootstrapIdentities(content) };
    const harness = createHarness();
    expectAccepted(await harness.submit(command, { actor: OWNER, commandId: 'boot' }));
    const snapshot = await harness.snapshot();
    const id = (key: string) => command.identities.entities[key] ?? '';
    const view = worldMapView(snapshot.state, {
      kind: 'DM',
      label: 'DM',
      holderId: null,
      scopes: 'ALL',
    });
    expect(view.regions).toHaveLength(1);
    expect(view.regions[0]?.region.entityId).toBe(id('region'));
    expect(view.regions[0]?.pins.map((pin) => [pin.place.entityId, pin.x, pin.y])).toEqual([
      [id('harbor'), 0.3, 0.7],
      [id('sluice'), 0.6, 0.4],
      [id('sunken-tower'), 0.85, 0.2],
    ]);
    expect(view.routes.map((route) => route.miles).sort()).toEqual([3, 6]);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(replay(snapshot.history)).toEqual(snapshot.state);
  });
});

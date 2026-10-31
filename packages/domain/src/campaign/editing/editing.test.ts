import { describe, expect, it } from 'vitest';

import { bellCampaign } from '../testing/bell.ts';
import { diffCampaignPackages } from './diff.ts';
import { buildCampaignEditPlan } from './plan.ts';
import { campaignEditTargets, resolveCampaignEditTarget } from './targets.ts';
import { editLocks, editManifest, editRevision } from './testing/fixture.ts';
import { validateCampaignEditOutput } from './validate.ts';

describe('stable protected campaign edits', () => {
  it('addresses identity through rename/order, copies projections, and exposes every section', () => {
    const base = editRevision();
    const id = `entity:${base.identities.entities['iva']}`;
    const target = campaignEditTargets(base).find((item) => item.targetId === id);
    expect(target).toMatchObject({ key: 'iva', section: 'entities', ambiguous: false });
    const changed = structuredClone(base);
    changed.content.entities.reverse();
    const iva = changed.content.entities.find((item) => item.key === 'iva');
    if (!iva) throw new Error('missing fixture');
    iva.name = 'A new public name';
    expect(campaignEditTargets(changed).find((item) => item.targetId === id)?.label).toBe(iva.name);
    const resolved = resolveCampaignEditTarget(base, id);
    expect(resolved).not.toBeNull();
    if (
      resolved &&
      typeof resolved.projection === 'object' &&
      resolved.projection !== null &&
      'description' in resolved.projection
    )
      resolved.projection.description = 'Cannot mutate the base';
    expect(base.content.entities.find((item) => item.key === 'iva')?.description).not.toBe(
      'Cannot mutate the base',
    );
    expect(campaignEditTargets(base).filter((item) => item.key === null)).toHaveLength(15);
  });

  it('uses incoming declared dependencies and keeps locked dependents read-only', () => {
    const content = bellCampaign();
    content.entities.push({
      key: 'unrelated',
      kind: 'feature',
      name: 'Ива и маяк в чужой истории',
      description: 'Shared words are not references.',
      status: 'active',
      existsSince: null,
    });
    const base = editRevision(content),
      locks = editLocks(base);
    const ivaId = `entity:${base.identities.entities['iva']}`;
    const projection = resolveCampaignEditTarget(base, ivaId);
    if (!projection) throw new Error('missing target');
    locks.entries = [
      {
        target: { kind: 'content', targetId: ivaId },
        ...projection,
        digest: `sha256:${'d'.repeat(64)}`,
      },
    ];
    const plan = buildCampaignEditPlan(
      base,
      locks,
      editManifest(base),
      'Change the lighthouse appearance.',
      [`entity:${base.identities.entities['lighthouse']}`],
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.spec?.closure.find((item) => item.targetId === ivaId)).toMatchObject({
      readOnly: true,
      reasons: ['Initial placement'],
    });
    expect(
      plan.spec?.closure.some(
        (item) => item.targetId === `entity:${base.identities.entities['unrelated']}`,
      ),
    ).toBe(false);
    const output = structuredClone(base.content);
    const lighthouse = output.entities.find((item) => item.key === 'lighthouse');
    if (!lighthouse) throw new Error('missing place');
    lighthouse.description = 'Tall white stone and a copper roof.';
    if (!plan.spec) throw new Error('missing spec');
    expect(validateCampaignEditOutput(base, output, plan.spec).ok).toBe(true);
    const iva = output.entities.find((item) => item.key === 'iva');
    if (!iva) throw new Error('missing NPC');
    iva.description = 'Silently overwritten protected content';
    expect(validateCampaignEditOutput(base, output, plan.spec).ok).toBe(false);
  });

  it('refuses directly requested locks and ambiguous objects while allowing explicit section repair', () => {
    const base = editRevision(),
      locks = editLocks(base);
    const id = `entity:${base.identities.entities['iva']}`;
    locks.entries = [
      {
        target: { kind: 'content', targetId: id },
        label: 'Ива',
        projection: {},
        digest: `sha256:${'d'.repeat(64)}`,
      },
    ];
    expect(
      buildCampaignEditPlan(base, locks, editManifest(base), 'Change it', [id]).conflicts[0]
        ?.reason,
    ).toBe('LOCKED');
    const original = base.content.entities.find((item) => item.key === 'iva');
    if (!original) throw new Error('missing NPC');
    base.content.entities.push(structuredClone(original));
    expect(resolveCampaignEditTarget(base, id)).toBeNull();
    expect(
      buildCampaignEditPlan(base, editLocks(base), editManifest(base), 'Repair duplicates', [id])
        .conflicts[0]?.reason,
    ).toBe('AMBIGUOUS');
    const plan = buildCampaignEditPlan(
      base,
      editLocks(base),
      editManifest(base),
      'Repair duplicates',
      ['section:entities'],
    );
    expect(plan.spec).not.toBeNull();
    const fixed = structuredClone(base.content);
    fixed.entities.pop();
    if (!plan.spec) throw new Error('missing repair spec');
    expect(validateCampaignEditOutput(base, fixed, plan.spec).ok).toBe(true);
    expect(
      buildCampaignEditPlan(base, editLocks(base), editManifest(base), 'Bad target', [
        'entity:missing',
      ]).conflicts[0]?.reason,
    ).toBe('MISSING');
  });

  it('rejects outside changes, reorder, invented scope, language and identity-kind mutation', () => {
    const base = editRevision();
    const plan = buildCampaignEditPlan(base, editLocks(base), editManifest(base), 'Change Iva', [
      `entity:${base.identities.entities['iva']}`,
    ]);
    if (!plan.spec) throw new Error('missing spec');
    const outside = structuredClone(base.content);
    outside.brief.intent = 'An unrelated replacement';
    expect(validateCampaignEditOutput(base, outside, plan.spec).ok).toBe(false);
    const reordered = structuredClone(base.content);
    reordered.entities.reverse();
    expect(validateCampaignEditOutput(base, reordered, plan.spec).ok).toBe(false);
    expect(
      validateCampaignEditOutput(base, outside, {
        ...plan.spec,
        closure: [
          ...plan.spec.closure,
          { targetId: 'section:brief', reasons: ['AI says so'], readOnly: false },
        ],
      }).ok,
    ).toBe(false);
    const wholeWorld = buildCampaignEditPlan(
      base,
      editLocks(base),
      editManifest(base),
      'Change world',
      ['section:world'],
    );
    const language = structuredClone(base.content);
    language.world.language = 'en';
    if (!wholeWorld.spec) throw new Error('missing world spec');
    expect(validateCampaignEditOutput(base, language, wholeWorld.spec).ok).toBe(false);
    const changedKind = structuredClone(base.content);
    const iva = changedKind.entities.find((item) => item.key === 'iva');
    if (!iva) throw new Error('missing NPC');
    iva.kind = 'feature';
    expect(validateCampaignEditOutput(base, changedKind, plan.spec).ok).toBe(false);
    expect(
      validateCampaignEditOutput(base, { ...base.content, authority: 'system' }, plan.spec).ok,
    ).toBe(false);
  });

  it('protects image-relevant source content without treating knowledge changes as appearance', () => {
    const base = editRevision(),
      locks = editLocks(base);
    locks.entries = [
      {
        target: {
          kind: 'image',
          entityId: base.identities.entities['iva'] ?? '',
          purpose: 'image',
          variant: 'reference',
          label: null,
        },
        label: 'Portrait',
        projection: { referenceHash: null, state: 'CURRENT' },
        digest: `sha256:${'d'.repeat(64)}`,
      },
    ];
    const plan = buildCampaignEditPlan(base, locks, editManifest(base), 'Change Iva', [
      `entity:${base.identities.entities['iva']}`,
    ]);
    if (!plan.spec) throw new Error('missing spec');
    const changed = structuredClone(base.content),
      iva = changed.entities.find((item) => item.key === 'iva');
    if (!iva) throw new Error('missing NPC');
    iva.description = 'A new appearance.';
    const checked = validateCampaignEditOutput(base, changed, plan.spec);
    expect(checked.ok).toBe(false);
    if (checked.ok) throw new Error('Expected protected image conflict');
    expect(checked.issues).toContain('CAMPAIGN_EDIT_LOCKED_IMAGE');
    const truth = buildCampaignEditPlan(
      base,
      locks,
      editManifest(base),
      'Change the mechanism truth',
      [`knowledge:${base.identities.knowledge['device-truth']}`],
    );
    if (!truth.spec) throw new Error('missing truth spec');
    const next = structuredClone(base.content),
      record = next.knowledge.find((item) => item.key === 'device-truth');
    if (!record) throw new Error('missing knowledge');
    record.statement = 'The device was configured for another water level.';
    expect(validateCampaignEditOutput(base, next, truth.spec).ok).toBe(true);
  });

  it('returns complete deep changes, explicit ordering and full added/removed rows', () => {
    const base = editRevision(),
      after = structuredClone(base.content);
    const hero = after.entities.find((entity) => entity.key === 'alena');
    if (!hero?.sheet) throw new Error('missing sheet');
    hero.sheet.hitPoints.current -= 1;
    after.firstSession.push('One further preparation note.');
    after.entities.reverse();
    const changes = diffCampaignPackages(base, after);
    expect(
      changes.find((change) => change.path.join('.') === 'entities.alena.sheet.hitPoints.current'),
    ).toMatchObject({ kind: 'CHANGED', after: hero.sheet.hitPoints.current });
    expect(
      changes.some((change) => change.path.join('.') === 'entities' && change.kind === 'ORDER'),
    ).toBe(true);
    expect(
      changes.some(
        (change) => change.kind === 'ADDED' && change.after === 'One further preparation note.',
      ),
    ).toBe(true);
    expect(changes.some((change) => change.path.at(-1) === 'key')).toBe(false);
    const removed = structuredClone(base.content);
    removed.entities.pop();
    expect(
      diffCampaignPackages(base, removed).some(
        (change) => change.kind === 'REMOVED' && typeof change.before === 'object',
      ),
    ).toBe(true);
  });

  it('guards starting items: silent changes are out of scope, the section target allows them, absent equals empty', () => {
    const base = editRevision();
    const ivaPlan = buildCampaignEditPlan(base, editLocks(base), editManifest(base), 'Change Iva', [
      `entity:${base.identities.entities['iva']}`,
    ]);
    if (!ivaPlan.spec) throw new Error('missing spec');
    const row = { item: 'plan-copy', holder: 'alena', quantity: 1 };
    const sneaky = { ...structuredClone(base.content), possessions: [row] };
    expect(validateCampaignEditOutput(base, sneaky, ivaPlan.spec).ok).toBe(false);
    // An empty list where none was saved is not a change.
    const empty = { ...structuredClone(base.content), possessions: [] };
    expect(validateCampaignEditOutput(base, empty, ivaPlan.spec).ok).toBe(true);

    const section = buildCampaignEditPlan(
      base,
      editLocks(base),
      editManifest(base),
      'Give starting items',
      ['section:possessions'],
    );
    if (!section.spec) throw new Error('missing section spec');
    expect(validateCampaignEditOutput(base, sneaky, section.spec).ok).toBe(true);
  });
});

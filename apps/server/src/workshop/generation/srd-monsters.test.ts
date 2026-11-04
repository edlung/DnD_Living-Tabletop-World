import { srdMonsterBlock } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import { withSrdStatBlocks } from './srd-monsters.ts';

/**
 * A creature the workshop names by its SRD bestiary ID (docs/adr/0058-campaign-content.md §6): a
 * wolf the model wrote with made-up numbers fights with the SRD's; a beast the bestiary lacks
 * refuses the step; a step with no creatures passes untouched.
 */
describe('bestiary creatures in a generated step', () => {
  it('fight with the SRD’s stat block, whatever the model wrote', () => {
    const output = {
      entities: [
        { key: 'grey-wolf', kind: 'creature', monster: 'wolf', statBlock: { armorClass: 99 } },
        { key: 'miller', kind: 'npc' },
      ],
      party: [],
    };
    const resolved = withSrdStatBlocks(output);
    expect(resolved).toEqual({
      ok: true,
      value: {
        ...output,
        entities: [
          { ...output.entities[0], statBlock: srdMonsterBlock('wolf')?.statBlock },
          output.entities[1],
        ],
      },
    });
    // The model's output is not changed in place.
    expect(output.entities[0]?.statBlock).toEqual({ armorClass: 99 });
  });

  it('refuses a creature the bestiary lacks, and passes a step with none', () => {
    expect(
      withSrdStatBlocks({
        entities: [{ key: 'thing', kind: 'creature', monster: 'no-such-beast' }],
      }),
    ).toEqual({ ok: false, issues: ['UNKNOWN_BESTIARY_MONSTER:thing'] });
    const world = { world: { name: 'The Bell' } };
    expect(withSrdStatBlocks(world)).toEqual({ ok: true, value: world });
    expect(withSrdStatBlocks(null)).toEqual({ ok: true, value: null });
  });
});

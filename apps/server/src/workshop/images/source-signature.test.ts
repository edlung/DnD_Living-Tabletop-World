import { describe, expect, it } from 'vitest';

import { editRevision } from '../../../../../packages/domain/src/campaign/editing/testing/fixture.ts';
import { draftImageSourceSignature } from './manifest.ts';

describe('Stage420 source-signature compatibility after pure projection extraction', () => {
  it('retains exact earlier portrait/location/map signature bytes', () => {
    const base = editRevision();
    expect(
      draftImageSourceSignature(
        base,
        {
          entityId: base.identities.entities['iva'] ?? '',
          purpose: 'image',
          variant: 'reference',
          label: null,
        },
        null,
      ),
    ).toBe('sha256:5acafaa79d3dc18d6a9777bef839ba11233f9ecb644ce2ba7d3a612d087c819c');
    expect(
      draftImageSourceSignature(
        base,
        {
          entityId: base.identities.entities['lighthouse'] ?? '',
          purpose: 'image',
          variant: 'reference',
          label: null,
        },
        null,
      ),
    ).toBe('sha256:d5ae58b0c03efb9014a396d237bef169dd897f6bc3d1a6c3095e90d5b019299c');
    expect(
      draftImageSourceSignature(
        base,
        {
          entityId: base.identities.entities['sluice'] ?? '',
          purpose: 'battle-map',
          variant: 'derived',
          label: 'battle-map',
        },
        `sha256:${'1'.repeat(64)}`,
      ),
    ).toBe('sha256:e4277fe715f891d2f62567d1bd1c29774310135a0b659f3ba2a432c8293020fc');
  });
});

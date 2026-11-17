import type { EnvelopesResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * The party's sealed envelopes in the Journal (docs/adr/0073-table-ideas.md §9): each from
 * outside — what the DM wrote on it and what opens it. Nothing of the inside is read here: the
 * server sends none. Opened, an envelope leaves this list and arrives as a handout.
 */
export function SealedEnvelopes({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<EnvelopesResponse>('envelopes', signal).catch(() => null),
    [api],
  );
  const read = useResource('sealed-envelopes', load);
  const envelopes = read.resource.status === 'ready' ? (read.resource.value?.envelopes ?? []) : [];
  if (envelopes.length === 0) return null;
  return (
    <section className="sheet-section sealed-envelopes" aria-labelledby="journal-envelopes">
      <h3 id="journal-envelopes">{t('Sealed envelopes')}</h3>
      <ul className="sealed-list">
        {envelopes.map((envelope) => (
          <li key={envelope.envelopeId} className="sealed-envelope">
            <Glyph name="secret" />
            <div>
              <strong>{envelope.label}</strong>
              <p className="muted">
                {envelope.opens === 'word'
                  ? t('Sealed. It opens when the DM says.')
                  : t('Sealed. It opens when the evening’s chapter is written.')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

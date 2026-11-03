import type { DisplayView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { spacedCode } from '../display/display-flow.ts';
import { Glyph } from '../visual/glyph.tsx';
import { nativeShell, type TvState } from './shell.ts';
import { useNativeTv } from './tv.ts';

/**
 * LTW DM's own TV on the Table screen sheet (docs/adr/0070-native-apps.md §6): a TV connected to
 * this device by AirPlay or a cable shows the table display in a window of its own, never the DM's
 * screen; the code it shows comes here, and the DM pairs it with one press. The screen list, the
 * names and the casts below stay the sheet's own.
 */
export function TvPanel({
  api,
  onPaired,
}: {
  readonly api: WorldApi;
  readonly onPaired: () => void;
}) {
  const t = useT();
  const id = useId();
  const tv = useNativeTv();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  if (tv === null) return null;
  // A TV keeps the campaign it was paired with; here it may be another one (§6).
  const elsewhere =
    tv.state === 'paired' && tv.campaign !== undefined && tv.campaign !== api.campaignId;

  async function pair(code: string) {
    setBusy(true);
    setRefusal(null);
    try {
      await api.post<DisplayView>(
        'displays',
        { code, name: t('The TV of this device') },
        AbortSignal.timeout(20_000),
      );
      // The TV then reports itself paired, and the panel's own words say so.
      onPaired();
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setRefusal(
        status === 404
          ? t('No screen is waiting with that code. Check it, or let the screen show a new one.')
          : status === 409
            ? t('Four screens are paired already. Unpair one first.')
            : t('The screen could not be paired. Try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tool-group screen-pair native-tv" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <Glyph name="cast" />
        {t('The TV of this device')}
      </h3>
      <p className="muted" role="status">
        {elsewhere ? t('The TV of this device still shows another campaign.') : tvWords(t, tv)}
      </p>
      {elsewhere && (
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              nativeShell()?.post({ type: 'tv-forget' });
            }}
          >
            <Glyph name="cast" />
            {t('Show this campaign on the TV')}
          </button>
        </div>
      )}
      {tv.state === 'pairing' && (
        <div className="action-row">
          <p className="native-tv-code" aria-label={t('Pairing code {code}', { code: tv.code })}>
            {spacedCode(tv.code)}
          </p>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void pair(tv.code)}
          >
            <Glyph name="link" />
            {t('Pair this TV')}
          </button>
        </div>
      )}
      {refusal && (
        <p role="alert" className="authoring-notice error">
          {refusal}
        </p>
      )}
      <p className="fine-print">
        {t(
          'When this app leaves the screen, the TV mirrors this device again: the app covers its own page first.',
        )}
      </p>
    </section>
  );
}

function tvWords(t: ReturnType<typeof useT>, tv: TvState): string {
  switch (tv.state) {
    case 'absent':
      return t(
        'Connect a TV by AirPlay (Screen Mirroring) or a cable: this app shows the table’s screen there, never your own.',
      );
    case 'connected':
      return t('A TV is connected: the table’s screen is starting on it…');
    case 'pairing':
      return t(
        'The TV connected to this device shows this code. Pair it to show what you choose below.',
      );
    case 'paired':
      return t('The TV connected to this device is paired: it shows what you choose below.');
  }
}

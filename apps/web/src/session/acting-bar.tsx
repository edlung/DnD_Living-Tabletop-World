import { useT } from '@ltw/ui';

import type { StandIn } from '../combat/stand-in.ts';
import { REASON_TEXT } from '../dm/history-text.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * While the DM acts as a player's character (docs/adr/0033-live-session.md §6): who, why, and a
 * way to stop. The screen shows exactly what that character sees; each command the DM sends is
 * the DM's own, recorded with this reason.
 */
export function ActingBar({
  standIn,
  onStop,
}: {
  readonly standIn: StandIn;
  readonly onStop: () => void;
}) {
  const t = useT();
  const reason = t(REASON_TEXT[standIn.reason]);
  return (
    <section className="acting-bar" aria-label={t('Acting for a player')}>
      <Glyph name="perform" className="acting-glyph" />
      <div className="acting-text">
        <p>
          <strong>{t('Acting as {name}', { name: standIn.name })}</strong> ·{' '}
          {standIn.note === null ? reason : t('{reason}: “{note}”', { reason, note: standIn.note })}
        </p>
        <p className="muted">
          {t('You see what {name} sees. Each action is yours, recorded with your reason.', {
            name: standIn.name,
          })}
        </p>
      </div>
      <button className="acting-stop" onClick={onStop}>
        <Glyph name="game-master" />
        {t('Stop acting')}
      </button>
    </section>
  );
}

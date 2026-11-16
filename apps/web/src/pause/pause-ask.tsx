import { useT } from '@ltw/ui';
import { useEffect, useRef } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { usePauseAsk } from './use-pause-ask.ts';

/**
 * "Ask for a pause" on a player's own screen while the game plays
 * (docs/adr/0073-table-ideas.md §2): one press, and the DM alone is told — no words to find, no
 * chat to open, nothing on the table's screen or anyone else's. The line then says so, and says
 * when the DM has seen it. It lies among the table's questions over the stage
 * (`session/lobby-banner.tsx`), whose slot announces it.
 */
export function PauseAsk({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const pause = usePauseAsk(api, 'stage');
  const asked = pause.waiting || pause.seen;
  // The press removes the button it was made on: the line that answers takes its focus.
  const line = useRef<HTMLParagraphElement>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (!asked || !pressed.current) return;
    pressed.current = false;
    line.current?.focus();
  }, [asked]);
  if (asked) {
    return (
      <p ref={line} tabIndex={-1} className="rest-banner pause-asked">
        <Glyph name={pause.seen ? 'confirm' : 'time'} />
        <span className="rest-banner-text">
          {pause.seen
            ? t('The DM has seen that you asked for a pause. You can ask again in a minute.')
            : t('Only the DM was told that you would like a pause.')}
        </span>
      </p>
    );
  }
  return (
    <div className="pause-ask">
      <button
        type="button"
        className="pause-ask-button"
        aria-disabled={pause.busy}
        onClick={() => {
          if (pause.busy) return;
          pressed.current = true;
          pause.ask();
        }}
      >
        <Glyph name="time" />
        {t('Ask for a pause')}
      </button>
      {pause.failed && (
        <p role="alert" className="authoring-notice error">
          {t('That did not reach the DM. Say “pause” aloud — that always works.')}
        </p>
      )}
    </div>
  );
}

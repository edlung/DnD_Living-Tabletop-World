import type { CheerMark, CheerView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react';

import type { WorldApi } from '../api/client.ts';
import { animates, useDiceSettings } from '../dice/settings.ts';
import {
  CHEER_SIGNS,
  CHEER_WORDS,
  cheerBy,
  cheerMarks,
  sendCheer,
  useShownCheers,
  type ShownCheer,
} from './cheer-marks.ts';

type CheerStyle = CSSProperties & { readonly '--cheer-lane': number };

/** A press holds the row this long: applause, not a drum roll. */
const BETWEEN_MS = 1_200;

interface Cheering {
  /** Gives a cheer as this screen's viewer; absent where the viewer gives none. */
  readonly give: ((mark: CheerMark) => void) | null;
}
const CheeringContext = createContext<Cheering>({ give: null });

/**
 * Cheers over a person's screen (docs/adr/0072-keepsakes.md §3): the layer that shows the table's
 * cheers for a moment, and the giving of one for the rows of marks inside it (`CheerRow`). The
 * viewer's own cheer shows at once. `author` names the viewer for that first moment — a character,
 * or null for the DM; `canGive` is false for a view that cheers as nobody (the party's).
 */
export function TableCheers({
  api,
  author,
  canGive,
  children,
}: {
  readonly api: WorldApi;
  readonly author: CheerView['by'];
  readonly canGive: boolean;
  readonly children: ReactNode;
}) {
  // Who cheers reads the cheers: the server signals the same screens (`live/inventory.ts`).
  const { shown, add } = useShownCheers(api, canGive);
  const give = canGive
    ? (mark: CheerMark) => {
        const cheerId = crypto.randomUUID();
        add({ cheerId, mark, by: author });
        void sendCheer(api, cheerId, mark);
      }
    : null;
  return (
    <CheeringContext.Provider value={{ give }}>
      {children}
      <CheerLayer shown={shown} />
    </CheeringContext.Provider>
  );
}

/** The table's cheers on its display: read and shown, never given. */
export function DisplayCheers({ api }: { readonly api: WorldApi }) {
  const { shown } = useShownCheers(api);
  return <CheerLayer shown={shown} className="cheer-layer--display" />;
}

/**
 * The cheers a screen shows now. They lie over the screen and take no press; each is said once,
 * politely, for a reader who does not see it.
 */
export function CheerLayer({
  shown,
  className = '',
}: {
  readonly shown: readonly ShownCheer[];
  readonly className?: string;
}) {
  const t = useT();
  const moving = animates(useDiceSettings());
  const last = shown.at(-1);
  return (
    <div className={`cheer-layer ${className}${moving ? '' : ' is-still'}`}>
      {shown.map((cheer) => {
        const style: CheerStyle = { '--cheer-lane': cheer.lane };
        return (
          <p key={cheer.cheerId} className="cheer" aria-hidden="true" style={style}>
            <span className="cheer-sign">{CHEER_SIGNS[cheer.mark]}</span>
            <span className="cheer-by">{cheerBy(t, cheer)}</span>
          </p>
        );
      })}
      {/* Polite, and no `status` role: a page's one status stays the page's (older journeys and a
          screen reader's list of them both count on it). */}
      <p className="visually-hidden cheer-said" aria-live="polite">
        {last
          ? t('{who}: {cheer}', { who: cheerBy(t, last), cheer: t(CHEER_WORDS[last.mark]) })
          : ''}
      </p>
    </div>
  );
}

/**
 * The row of marks (docs/adr/0072-keepsakes.md §3): one press cheers the table. It rests a moment
 * after each press. Nothing is shown where the viewer cheers as nobody.
 */
export function CheerRow({ className = '' }: { readonly className?: string }) {
  const t = useT();
  const { give } = useContext(CheeringContext);
  const [resting, setResting] = useState(false);
  if (give === null) return null;
  return (
    <div className={`cheer-row ${className}`} role="group" aria-label={t('Without words')}>
      <span className="cheer-row-label" aria-hidden="true">
        {t('Without words')}
      </span>
      {cheerMarks.map((mark) => (
        <button
          key={mark}
          type="button"
          className="cheer-button"
          aria-label={t(CHEER_WORDS[mark])}
          title={t(CHEER_WORDS[mark])}
          aria-disabled={resting}
          onClick={() => {
            if (resting) return;
            give(mark);
            setResting(true);
            window.setTimeout(() => {
              setResting(false);
            }, BETWEEN_MS);
          }}
        >
          <span aria-hidden="true">{CHEER_SIGNS[mark]}</span>
        </button>
      ))}
    </div>
  );
}

import type { LobbyResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { usePauseAsk } from '../pause/use-pause-ask.ts';
import { useAgreement } from '../ritual/agreement-words.ts';
import { AgreementPage } from '../ritual/agreement.tsx';
import { askScreen } from '../shell/requests.ts';

/**
 * "Our table" in the guide (docs/adr/0071-memory-and-ritual.md §4): the table's agreement, always
 * one press away, and — for a player — the two quiet ways to the DM: a pause asked for with one
 * press (docs/adr/0073-table-ideas.md §2: the same request as the button on the player's own
 * screen, offered here while a game plays), and a word of their own that only the DM reads.
 */
export function OurTable({
  api,
  dm,
  onLeave,
}: {
  readonly api: WorldApi;
  readonly dm: boolean;
  /** The guide closes: the player goes on to the chat. */
  readonly onLeave: () => void;
}) {
  const t = useT();
  const { answer } = useAgreement(api);
  const agreement = answer?.agreement ?? null;
  return (
    <>
      {agreement ? (
        <AgreementPage agreement={agreement} />
      ) : (
        <p>
          {dm
            ? t('You have not written the table’s agreement yet: it is in Session.')
            : t('The DM has not written the table’s agreement yet.')}
        </p>
      )}
      {!dm && <QuietWays api={api} onLeave={onLeave} />}
    </>
  );
}

/** A player's two quiet ways to the DM; the pause only of a game in play. */
function QuietWays({ api, onLeave }: { readonly api: WorldApi; readonly onLeave: () => void }) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<LobbyResponse>('lobby', signal).catch(() => null),
    [api],
  );
  const lobby = useResource('our-table-lobby', load);
  const table = lobby.resource.status === 'ready' ? lobby.resource.value : null;
  const playing = table !== null && table.session !== null && !table.paused;
  const pause = usePauseAsk(api, 'guide');
  const asked = pause.waiting || pause.seen;
  const held = pause.busy || asked;
  return (
    <>
      <p className="muted">
        {playing
          ? t('Only the DM will see either of these.')
          : t(
              'Only the DM will see this. While a game is played, “Ask for a pause” is here and on your own screen.',
            )}
      </p>
      <p role="status" className="our-table-asked">
        {pause.seen
          ? t('The DM has seen that you asked for a pause.')
          : pause.waiting
            ? t('Only the DM was told that you would like a pause.')
            : ''}
      </p>
      {pause.failed && (
        <p role="alert" className="authoring-notice error">
          {t('That did not reach the DM. Say “pause” aloud — that always works.')}
        </p>
      )}
      <div className="action-row">
        {(playing || asked) && (
          <button
            type="button"
            aria-disabled={held}
            onClick={() => {
              if (!held) pause.ask();
            }}
          >
            {asked ? t('Pause asked') : t('Ask for a pause')}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onLeave();
            askScreen('chat-to-dm');
          }}
        >
          {t('Tell the DM privately')}
        </button>
      </div>
    </>
  );
}

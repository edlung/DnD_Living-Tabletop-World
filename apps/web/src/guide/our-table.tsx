import { useT } from '@ltw/ui';
import { useEffect, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { askForPause, useAgreement } from '../ritual/agreement-words.ts';
import { AgreementPage } from '../ritual/agreement.tsx';
import { askScreen } from '../shell/requests.ts';

/** How long a pause that was asked for is not asked for again by another press. */
const ASKED_MS = 60_000;

/**
 * "Our table" in the guide (docs/adr/0071-memory-and-ritual.md §4): the table's agreement, always
 * one press away, and — for a player — the two quiet ways to the DM: a pause asked for in fixed
 * words, and a word of their own that only the DM reads.
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
  const [asked, setAsked] = useState<'busy' | 'sent' | 'failed' | null>(null);
  // One request a minute: a second press, or a curious one, does not send another.
  useEffect(() => {
    if (asked !== 'sent') return undefined;
    const timer = window.setTimeout(() => {
      setAsked(null);
    }, ASKED_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [asked]);
  const agreement = answer?.agreement ?? null;
  const held = asked === 'busy' || asked === 'sent';
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
      {!dm && (
        <>
          <p className="muted">{t('Only the DM will see either of these.')}</p>
          <p role="status" className="our-table-asked">
            {asked === 'sent' ? t('Only the DM was told that you would like a pause.') : ''}
          </p>
          {asked === 'failed' && (
            <p role="alert" className="authoring-notice error">
              {t('That did not reach the DM. Say “pause” aloud — that always works.')}
            </p>
          )}
          <div className="action-row">
            <button
              type="button"
              aria-disabled={held}
              onClick={() => {
                if (held) return;
                setAsked('busy');
                void askForPause(api, t).then((reached) => {
                  setAsked(reached ? 'sent' : 'failed');
                });
              }}
            >
              {asked === 'sent' ? t('Pause asked') : t('Ask for a pause')}
            </button>
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
      )}
    </>
  );
}

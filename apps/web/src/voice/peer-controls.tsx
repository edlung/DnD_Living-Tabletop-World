import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import type { VoiceSession } from './use-voice.ts';

/**
 * The DM's hand on one speaker (docs/adr/0060-voice.md §6): muted for everyone and let talk again
 * at once; taken out of the voice — which holds until the room ends — only once asked. The
 * question opens on "Keep in the voice", as deleting an account opens on keeping it; once the
 * speaker is gone, `onRemoved` gives focus a place that stays.
 */
export function PeerControls({
  session,
  peerId,
  name,
  muted,
  onRemoved,
}: {
  readonly session: VoiceSession;
  readonly peerId: string;
  readonly name: string;
  readonly muted: boolean;
  readonly onRemoved: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    // The question takes focus on its way out; keeping returns it to its button.
    if (asking) keep.current?.focus();
    else if (asked.current) opener.current?.focus();
    asked.current = asking;
  }, [asking]);
  const question = `${ids}-question`;
  return (
    <>
      <span className="action-row">
        <button
          type="button"
          className="quiet-button"
          aria-label={
            muted ? t('Let talk: {name}', { name }) : t('Mute for everyone: {name}', { name })
          }
          onClick={() => {
            session.muteFor(peerId, !muted);
          }}
        >
          {muted ? t('Let talk') : t('Mute for everyone')}
        </button>
        <button
          ref={opener}
          type="button"
          className="quiet-button"
          aria-label={t('Remove from the voice: {name}', { name })}
          aria-expanded={asking}
          aria-controls={question}
          onClick={() => {
            setAsking((value) => !value);
          }}
        >
          {t('Remove from the voice')}
        </button>
      </span>
      {asking && (
        <div
          id={question}
          className="voice-confirm"
          role="group"
          aria-labelledby={`${question}-text`}
        >
          <p id={`${question}-text`}>
            {t(
              'Take {name} out of the voice? They can join again only the next time the table plays online.',
              { name },
            )}
          </p>
          <div className="action-row">
            <button
              type="button"
              className="danger-button"
              aria-label={t('Yes, remove: {name}', { name })}
              onClick={() => {
                asked.current = false;
                setAsking(false);
                session.remove(peerId);
                onRemoved();
              }}
            >
              {t('Yes, remove')}
            </button>
            <button
              ref={keep}
              type="button"
              aria-label={t('Keep in the voice: {name}', { name })}
              onClick={() => {
                setAsking(false);
              }}
            >
              {t('Keep in the voice')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

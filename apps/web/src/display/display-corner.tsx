import { useT } from '@ltw/ui';
import { useEffect, useState } from 'react';

import { useSoundWaiting } from '../audio/sound-on.tsx';
import { unlockAudio } from '../dice/audio.ts';
import { changeDiceSettings, useDiceSettings } from '../dice/settings.ts';

/** The quiet corner goes away when nobody has moved the pointer or pressed a key for this long. */
const IDLE_MS = 4_000;

/**
 * The table screen's quiet corner (docs/adr/0042-table-display.md): full screen, this screen's
 * sound (docs/adr/0059-atmosphere.md §1, §6) and unpairing it (asked first). It shows while
 * someone moves the pointer or presses a key, then goes, so the room sees only the cast; focus
 * inside it keeps it — and so does sound waiting for its first press, its "Sound on" first.
 * Gone, it lets every press through to what lies under it.
 */
export function DisplayCorner({
  name,
  onForget,
}: {
  readonly name: string;
  readonly onForget: () => void;
}) {
  const t = useT();
  const settings = useDiceSettings();
  const waiting = useSoundWaiting();
  const [asking, setAsking] = useState(false);
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => {
      setIdle(true);
    }, IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setIdle(true);
      }, IDLE_MS);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);
  return (
    <div className={idle && !asking && !waiting ? 'display-corner is-idle' : 'display-corner'}>
      <span className="display-name">{name}</span>
      {waiting ? (
        <button className="primary-button" onClick={unlockAudio}>
          {t('Sound on')}
        </button>
      ) : (
        <button
          className="quiet-button"
          onClick={() => {
            // Turned on again by a press: the press lets the browser play too.
            if (!settings.atmosphere) unlockAudio();
            changeDiceSettings({ atmosphere: !settings.atmosphere });
          }}
        >
          {settings.atmosphere ? t('Turn the sound off') : t('Turn the sound on')}
        </button>
      )}
      {document.fullscreenEnabled && (
        <button
          className="quiet-button"
          onClick={() => {
            void (document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen());
          }}
        >
          {t('Full screen')}
        </button>
      )}
      {asking ? (
        <span className="display-confirm">
          {t('Unpair this screen?')}
          <button className="quiet-button" onClick={onForget}>
            {t('Unpair')}
          </button>
          <button
            className="quiet-button"
            onClick={() => {
              setAsking(false);
            }}
          >
            {t('Keep')}
          </button>
        </span>
      ) : (
        <button
          className="quiet-button"
          onClick={() => {
            setAsking(true);
          }}
        >
          {t('Unpair this screen')}
        </button>
      )}
    </div>
  );
}

import { useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { useSoundWaiting } from '../audio/sound-on.tsx';
import { unlockAudio } from '../dice/audio.ts';
import { changeDiceSettings, useDiceSettings } from '../dice/settings.ts';
import { hostedTv } from '../native/tv-sound.ts';

/** The quiet corner goes away when nobody has moved the pointer or pressed a key for this long. */
const IDLE_MS = 4_000;

/** A remote's arrows: the next or the previous of the corner's buttons. */
const STEPS: Readonly<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * The table screen's quiet corner (docs/adr/0042-table-display.md): full screen, this screen's
 * sound (docs/adr/0059-atmosphere.md §1, §6) and unpairing it (asked first). It shows while
 * someone moves the pointer or presses a key, then goes, so the room sees only the cast; focus
 * inside it keeps it. While sound waits for its first press, "Sound on" alone stays, small, and the
 * rest goes as always. A remote reaches it: OK or an arrow brings focus to its first button, the
 * arrows step between them, and a question keeps focus on its answers. Gone, it lets every press
 * through to what lies under it. In LTW DM's TV window nobody can press anything and sound needs no
 * press (docs/adr/0070-native-apps.md §6): there is no corner there.
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
  // The TV has no settings of its own: its one switch is all its sound, the dice's cues too.
  const heard = settings.atmosphere || settings.sound;
  const waiting = useSoundWaiting();
  const [asking, setAsking] = useState(false);
  const [idle, setIdle] = useState(false);
  const corner = useRef<HTMLDivElement>(null);
  const unpair = useRef<HTMLButtonElement>(null);
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
    const key = (event: KeyboardEvent) => {
      wake();
      const box = corner.current;
      if (box === null) return;
      const buttons = [...box.querySelectorAll('button')];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = STEPS[event.key];
      if (at < 0) {
        // From nowhere, OK or an arrow lands on the corner's first button.
        if (step !== undefined || event.key === 'Enter') {
          buttons[0]?.focus();
          event.preventDefault();
        }
        return;
      }
      if (step === undefined) return;
      buttons[(at + step + buttons.length) % buttons.length]?.focus();
      event.preventDefault();
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', key);
    };
  }, []);
  if (hostedTv()) return null;
  const state = idle && !asking ? (waiting ? ' is-idle is-waiting' : ' is-idle') : '';
  return (
    <div ref={corner} className={`display-corner${state}`}>
      <span className="display-name">{name}</span>
      {waiting ? (
        <button className="primary-button display-sound-on" onClick={unlockAudio}>
          {t('Sound on')}
        </button>
      ) : (
        <button
          className="quiet-button"
          onClick={() => {
            // Turned on again by a press: the press lets the browser play too.
            if (!heard) unlockAudio();
            changeDiceSettings({ atmosphere: !heard, sound: !heard });
          }}
        >
          {heard ? t('Turn the sound off') : t('Turn the sound on')}
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
          {/* The safe answer holds focus; pressed, focus returns to where the question came from. */}
          <button
            className="quiet-button"
            autoFocus
            onClick={() => {
              setAsking(false);
              window.setTimeout(() => unpair.current?.focus(), 0);
            }}
          >
            {t('Keep')}
          </button>
        </span>
      ) : (
        <button
          ref={unpair}
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

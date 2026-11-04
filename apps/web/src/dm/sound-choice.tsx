import { AMBIENCE_CHOICES, sceneAmbience, type AmbienceChoice } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useScenePlace, useSceneSound } from '../audio/table-sound.tsx';

export const AMBIENCE_WORDS: Readonly<Record<AmbienceChoice, string>> = {
  scene: 'By the scene',
  rain: 'Rain',
  wind: 'Wind',
  fire: 'Fire',
  crowd: 'Crowd',
  night: 'Night',
  none: 'No sound',
};

/**
 * The DM's choice of what the table hears (docs/adr/0059-atmosphere.md §1): one soundscape, none,
 * or by the scene — and by the scene, what plays now. Shown at once as chosen, until the table's
 * state reads it back.
 */
export function SoundChoice({
  api,
  revision,
  current,
  onChoose,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  readonly current: AmbienceChoice;
  readonly onChoose: (ambience: AmbienceChoice) => Promise<boolean>;
}) {
  const t = useT();
  const id = useId();
  const [chosen, setChosen] = useState<AmbienceChoice | null>(null);
  useEffect(() => {
    if (chosen !== null && current === chosen) setChosen(null);
  }, [chosen, current]);
  const choice = chosen ?? current;
  const byScene = choice === 'scene';
  const placeId = useScenePlace(api, revision, byScene);
  const scene = useSceneSound(api, revision, placeId, byScene);
  const now = scene ? sceneAmbience(scene) : null;
  return (
    <div className="field lobby-sound">
      <label htmlFor={`${id}-ambience`}>{t('The table’s sound')}</label>
      <select
        id={`${id}-ambience`}
        aria-describedby={`${id}-hint`}
        value={choice}
        onChange={(event) => {
          const next = event.target.value as AmbienceChoice;
          setChosen(next);
          void onChoose(next).then((done) => {
            if (!done) setChosen(null);
          });
        }}
      >
        {AMBIENCE_CHOICES.map((ambience) => (
          <option key={ambience} value={ambience}>
            {t(AMBIENCE_WORDS[ambience])}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="muted">
        {choice === 'scene'
          ? now === null
            ? t('By the scene, the table is quiet until a scene is played.')
            : t('Now by the scene: {sound}.', { sound: t(AMBIENCE_WORDS[now]) })
          : t('It plays on the table’s screen and, online, on every screen.')}
      </p>
    </div>
  );
}

import type { CharacterCreatedResponse, CopyableCharactersResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { classLine } from '../character/words.ts';

type Copyable = CopyableCharactersResponse['characters'][number];

/**
 * A character from another campaign (docs/FULL_GAME_PLAN.md decision 15; docs/adr/0056-…md §5):
 * the characters the player's login plays elsewhere, each to bring here as a sheet only — fresh,
 * never with what it knew or carried. Shown only when the login plays any; persona play has none.
 */
export function BringCharacter({
  api,
  onBrought,
}: {
  readonly api: WorldApi;
  readonly onBrought: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [list, setList] = useState<readonly Copyable[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<CopyableCharactersResponse>('characters/copyable', controller.signal, false)
      .then((answer) => {
        setList(answer.characters);
      })
      .catch(() => {
        setList([]);
      });
    return () => {
      controller.abort();
    };
  }, [api]);
  if (!list || list.length === 0) return null;
  const bring = (one: Copyable) => {
    setBusy(true);
    setNote(null);
    api
      .post<CharacterCreatedResponse>(
        'characters/copy',
        {
          requestId: crypto.randomUUID(),
          fromCampaignId: one.campaignId,
          characterId: one.characterId,
        },
        new AbortController().signal,
        false,
      )
      .then(() => {
        setNote(
          t('{name} is here: the sheet came, not what they knew or carried.', { name: one.name }),
        );
        onBrought();
      })
      .catch(() => {
        setNote(t('{name} could not be brought. Try again.', { name: one.name }));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <section className="hero-section bring-character" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('From your other campaigns')}</h3>
      <p className="muted">
        {t('Bring a character you play elsewhere: the sheet comes, not what they knew or carried.')}
      </p>
      <ul className="bring-list">
        {list.map((one) => (
          <li key={`${one.campaignId}:${one.characterId}`}>
            <span className="bring-name">
              <strong>{one.name}</strong>
              <small>{`${classLine(t, [...one.classes])} · ${one.campaignName}`}</small>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                bring(one);
              }}
            >
              {t('Bring {name}', { name: one.name })}
            </button>
          </li>
        ))}
      </ul>
      {note && <p role="status">{note}</p>}
    </section>
  );
}

import { useT } from '@ltw/ui';
import { useState } from 'react';
import type { WorldApi } from '../../api/client.ts';
import { Backstory } from './backstory.tsx';
import { MyNotes } from './my-notes.tsx';

/** Two leaves of the player's journal. Turning one keeps the draft on the other. */
export function PlayerStoryPages({
  api,
  characterId,
  name,
}: {
  readonly api: WorldApi;
  readonly characterId: string;
  readonly name: string;
}) {
  const t = useT();
  const [leaf, setLeaf] = useState<'notes' | 'backstory'>('notes');
  return (
    <>
      <div className="story-leaves" role="group" aria-label={t('Story')}>
        <button
          type="button"
          aria-pressed={leaf === 'notes'}
          onClick={() => {
            setLeaf('notes');
          }}
        >
          {t('My notes')}
        </button>
        <button
          type="button"
          aria-pressed={leaf === 'backstory'}
          onClick={() => {
            setLeaf('backstory');
          }}
        >
          {t('Backstory')}
        </button>
      </div>
      <div hidden={leaf !== 'notes'}>
        <MyNotes api={api} />
      </div>
      <div hidden={leaf !== 'backstory'}>
        <Backstory api={api} characterId={characterId} name={name} asDm={false} />
      </div>
    </>
  );
}

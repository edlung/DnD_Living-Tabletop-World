import { useT } from '@ltw/ui';
import { useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { BuilderDialog, type BuilderPlayer } from './builder-dialog.tsx';

/**
 * Where a table makes a character (docs/adr/0056-characters-from-the-srd.md §2): the DM's for a
 * player or to invite one to, a player's for themselves. It says what was made.
 */
export function MakeCharacter({
  api,
  players,
  onMade,
  intro,
}: {
  readonly api: WorldApi;
  readonly players?: readonly BuilderPlayer[];
  readonly onMade: () => void;
  readonly intro: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  return (
    <section className="tool-group players-make" aria-labelledby="players-make-title">
      <h3 id="players-make-title">
        <Glyph name="add-character" />
        {t('Make a character')}
      </h3>
      <p className="muted">{t(intro)}</p>
      {made && (
        <p role="status" className="players-made">
          {t('{name} is made.', { name: made })}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setMade(null);
          setOpen(true);
        }}
      >
        {t('Make a character')}
      </button>
      <BuilderDialog
        api={api}
        open={open}
        players={players ?? []}
        onClose={() => {
          setOpen(false);
        }}
        onMade={(_characterId, name) => {
          setOpen(false);
          setMade(name);
          onMade();
        }}
      />
    </section>
  );
}

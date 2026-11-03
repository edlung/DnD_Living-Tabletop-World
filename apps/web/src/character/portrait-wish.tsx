import type { CommandResult } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';

/**
 * A player asks the DM for their own character's portrait (docs/adr/0056-characters-from-the-
 * srd.md §5): how they see it, in their words. The DM turns it into a request to the image model;
 * the picture shows once the DM approves it. A wish the DM has not answered yet stands, and may be
 * changed.
 */
export function PortraitWish({
  api,
  characterId,
  name,
  asked,
  onAsked,
}: {
  readonly api: WorldApi;
  readonly characterId: string;
  readonly name: string;
  /** The look already asked for, while the DM has not requested the portrait. */
  readonly asked: string | null;
  readonly onAsked: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [look, setLook] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const typed = look.trim();
  return (
    <section className="hero-section portrait-wish" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('A portrait')}</h3>
      {asked !== null && (
        <p role="status">{t('Asked for: «{look}». The DM makes the picture.', { look: asked })}</p>
      )}
      <form
        className="hand-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (typed === '' || busy) return;
          setBusy(true);
          setNote(null);
          api
            .post<CommandResult>(
              'commands',
              {
                commandId: `portrait-${crypto.randomUUID()}`,
                command: { type: 'AskPortrait', characterId, look: typed },
              },
              new AbortController().signal,
            )
            .then((result) => {
              if (result.status === 'rejected') {
                setNote(t('That portrait is asked for already.'));
                return;
              }
              setLook('');
              onAsked();
            })
            .catch(() => {
              setNote(t('The wish could not be sent. Try again.'));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        <label htmlFor={`${ids}-look`}>{t('How does {name} look?', { name })}</label>
        <textarea
          id={`${ids}-look`}
          rows={3}
          maxLength={300}
          value={look}
          aria-describedby={`${ids}-hint`}
          onChange={(event) => {
            setLook(event.target.value);
          }}
        />
        <p id={`${ids}-hint`} className="muted">
          {t('The DM asks the image model for it; the portrait shows once the DM approves it.')}
        </p>
        <div className="action-row">
          <button type="submit" disabled={typed === '' || busy}>
            {t(asked === null ? 'Ask for a portrait' : 'Change the wish')}
          </button>
        </div>
        {note && <p role="status">{note}</p>}
      </form>
    </section>
  );
}

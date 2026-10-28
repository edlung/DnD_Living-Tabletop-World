import type { ProposableCommand } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState } from 'react';

import { useDmImages } from '../images/dm-images.ts';
import { Glyph } from '../visual/glyph.tsx';

/** What an NPC card's edit needs from the DM's authoring session. */
export interface ProfileEditing {
  /** A draft is on the Add sheet: one proposal at a time, as with words. */
  readonly draftOpen: boolean;
  readonly busy: boolean;
  /** Stores the DM's proposal and shows its review on the Add sheet; true once it is stored. */
  readonly propose: (summary: string, commands: readonly ProposableCommand[]) => Promise<boolean>;
  /** Shows the open draft on the Add sheet. */
  readonly showDraft: () => void;
}

/** The World Engine's limits on a name and a description (`world-commands.ts`). */
const NAME_MAX = 120;
const DESCRIPTION_MAX = 4000;

/**
 * The profile edit of one NPC, as commands: only what changed, as `UpdateEntityProfile`
 * (owner decisions 11, SI-D8; no new canonical command). Null when nothing changed.
 */
export function profileEdit(
  entityId: string,
  before: { readonly name: string; readonly description: string },
  after: { readonly name: string; readonly description: string },
): ProposableCommand[] | null {
  const name = after.name.trim();
  const description = after.description.trim();
  const command: Extract<ProposableCommand, { type: 'UpdateEntityProfile' }> = {
    type: 'UpdateEntityProfile',
    entityId,
    ...(name !== '' && name !== before.name.trim() ? { name } : {}),
    ...(description !== '' && description !== before.description.trim() ? { description } : {}),
  };
  return command.name === undefined && command.description === undefined ? null : [command];
}

/**
 * The DM's NPC card: the recorded description (from the DM's lineage, which carries what the
 * image model reads) and "Edit name and description", which submits a DM-written authoring
 * proposal and opens its review — the same preview, who-sees, confirm and History undo as a
 * proposal from words. Nothing here changes the world; the confirmed proposal does. DM only: a
 * lower perspective never renders it.
 */
export function NpcProfile({
  entityId,
  name,
  editing,
}: {
  readonly entityId: string;
  readonly name: string;
  readonly editing: ProfileEditing;
}) {
  const t = useT();
  const images = useDmImages();
  const lineage = images?.lineage.status === 'ready' ? images.lineage.value : null;
  const description =
    lineage?.descriptions.find((entry) => entry.entityId === entityId)?.description ?? '';
  const [draft, setDraft] = useState<{ name: string; description: string } | null>(null);
  const shown = draft ?? { name, description };
  const commands = profileEdit(entityId, { name, description }, shown);
  const field = (id: string) => `npc-profile-${id}-${entityId}`;
  return (
    <>
      {description !== '' && (
        <section className="npc-description" aria-label={t('Description (DM)')}>
          <h3>{t('Description (DM)')}</h3>
          <p>{description}</p>
        </section>
      )}
      <details className="disclosure perform-npc npc-profile">
        <summary>
          <Glyph name="perform" />
          {t('Edit name and description')}
        </summary>
        <form
          className="perform-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (!commands || editing.draftOpen) return;
            // The words stay until the server has stored the proposal: a refusal keeps them.
            void editing.propose(t('Edit {name}', { name }), commands).then((stored) => {
              if (stored) setDraft(null);
            });
          }}
        >
          <p className="muted">
            {t('A change goes through a proposal you review and confirm; History can undo it.')}
          </p>
          <label htmlFor={field('name')}>{t('Name')}</label>
          <input
            id={field('name')}
            maxLength={NAME_MAX}
            value={shown.name}
            onChange={(event) => {
              setDraft({ ...shown, name: event.target.value });
            }}
          />
          <label htmlFor={field('description')}>{t('Description')}</label>
          <textarea
            id={field('description')}
            maxLength={DESCRIPTION_MAX}
            value={shown.description}
            onChange={(event) => {
              setDraft({ ...shown, description: event.target.value });
            }}
          />
          {editing.draftOpen && (
            <p className="muted">{t('Another proposal is open. Confirm or cancel it first.')}</p>
          )}
          <div className="action-row">
            <button
              type="submit"
              className="primary-button"
              disabled={editing.busy || editing.draftOpen || commands === null}
            >
              <Glyph name="confirm" />
              {t('Propose the change')}
            </button>
            {editing.draftOpen && (
              <button type="button" onClick={editing.showDraft}>
                {t('Show the open proposal')}
              </button>
            )}
          </div>
        </form>
      </details>
    </>
  );
}

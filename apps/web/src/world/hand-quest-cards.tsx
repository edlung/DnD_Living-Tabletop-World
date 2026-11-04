import type { HandQuestView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { Glyph } from '../visual/glyph.tsx';

/**
 * The DM's quests by hand in the Journal (docs/adr/0058-campaign-content.md §2): each with what it
 * is about and its steps, done or not. The party sees the known ones; the DM every one, the unknown
 * marked as the DM's alone.
 */
export function HandQuestCards({ quests }: { readonly quests: readonly HandQuestView[] }) {
  const t = useT();
  const id = useId();
  return quests.map((quest, index) => (
    <article
      key={quest.questId}
      className={`quest-card${quest.completed ? ' quest-card--done' : ''}`}
      aria-labelledby={`${id}-${String(index)}`}
    >
      <header className="quest-head">
        <h4 id={`${id}-${String(index)}`}>{quest.title}</h4>
        <span className="quest-status">
          <Glyph name={quest.completed ? 'confirm' : 'bookmark'} />
          {quest.completed ? t('Completed') : t('In progress')}
        </span>
      </header>
      {!quest.known && <p className="muted">{t('The party does not know this quest yet.')}</p>}
      {quest.summary !== '' && <p className="quest-about">{quest.summary}</p>}
      <ol className="quest-steps">
        {quest.steps.map((step, stepIndex) => (
          <li key={`${String(stepIndex)}:${step.text}`} className="quest-step">
            <span className="quest-when">{step.done ? t('Done') : t('Still to do')}</span>
            <span className="quest-summary">{step.text}</span>
          </li>
        ))}
      </ol>
    </article>
  ));
}

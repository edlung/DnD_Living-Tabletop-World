import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { ClueForm, CreatureForm, KnowledgeForm } from './lore-forms.tsx';
import { QuestEditor } from './quest-editor.tsx';
import { ObjectForm, PersonForm, PlaceForm, type EditorProps } from './thing-forms.tsx';

/** What the DM may make by hand, each with its own form. */
const MAKES = ['place', 'person', 'creature', 'object', 'clue', 'knowledge', 'quest'] as const;
type Make = (typeof MAKES)[number];
const MAKE_WORDS: Readonly<Record<Make, string>> = {
  place: 'A place',
  person: 'A person',
  creature: 'A creature from the bestiary',
  object: 'A story object',
  clue: 'A clue',
  knowledge: 'What someone knows',
  quest: 'A quest',
};

/**
 * The DM's editors in the Add sheet (docs/adr/0058-campaign-content.md §1): a place, a person, a
 * creature, a story object, a clue or a piece of knowledge, made by hand — no AI — each through
 * the World Engine and listed in the DM's history, where it is undone.
 */
export function MakeByHand(props: EditorProps) {
  const t = useT();
  const ids = useId();
  const [make, setMake] = useState<Make>('place');
  return (
    <section className="sheet-section make-by-hand" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Make by hand')}</h3>
      <p className="muted">{t('No AI: what you write is what the world holds.')}</p>
      <div className="account-field">
        <label htmlFor={`${ids}-make`}>{t('What to make')}</label>
        <select
          id={`${ids}-make`}
          value={make}
          onChange={(event) => {
            setMake(event.target.value as Make);
          }}
        >
          {MAKES.map((one) => (
            <option key={one} value={one}>
              {t(MAKE_WORDS[one])}
            </option>
          ))}
        </select>
      </div>
      {make === 'place' && <PlaceForm {...props} />}
      {make === 'person' && <PersonForm {...props} />}
      {make === 'creature' && <CreatureForm {...props} />}
      {make === 'object' && <ObjectForm {...props} />}
      {make === 'clue' && <ClueForm {...props} />}
      {make === 'knowledge' && <KnowledgeForm {...props} />}
      {make === 'quest' && <QuestEditor {...props} />}
    </section>
  );
}

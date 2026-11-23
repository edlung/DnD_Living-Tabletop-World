import type { CampaignBookPocket } from '@ltw/contracts';
import { useT } from '@ltw/ui';

/**
 * The DM's pocket (docs/CAMPAIGN_TEXT_STANDARD.md §7), folded on every page of the book: what
 * people say and what is behind it, places off the prepared road, passers-by — for the scene
 * nobody prepared. The book is the DM's alone; nothing here is a fact of the world until the DM
 * says it at the table.
 */
const TRUTH = { true: 'True', false: 'Not true', partial: 'Partly true' } as const;

export function Pocket({ pocket }: { readonly pocket: CampaignBookPocket }) {
  const t = useT();
  return (
    <details className="dmb-secret">
      <summary>{t('The DM’s pocket')}</summary>
      <h4>{t('Rumours')}</h4>
      <div>
        {pocket.rumours.map((rumour) => (
          <p key={rumour.text}>
            {rumour.text} <strong>{t(TRUTH[rumour.truth])}.</strong> {rumour.note}
          </p>
        ))}
      </div>
      <h4>{t('Places off the road')}</h4>
      <div>
        {pocket.places.map((place) => (
          <p key={place.name}>
            <strong>{place.name}.</strong> {place.text}
          </p>
        ))}
      </div>
      <h4>{t('Passers-by')}</h4>
      <div>
        {pocket.people.map((person) => (
          <p key={person.name}>
            <strong>{person.name}.</strong> {person.look} {person.line} <em>{t('Can tell:')}</em>{' '}
            {person.knows}
          </p>
        ))}
      </div>
    </details>
  );
}

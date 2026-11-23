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
      <ul>
        {pocket.rumours.map((rumour) => (
          <li key={rumour.text}>
            {rumour.text} <strong>{t(TRUTH[rumour.truth])}.</strong> {rumour.note}
          </li>
        ))}
      </ul>
      <h4>{t('Places off the road')}</h4>
      <ul>
        {pocket.places.map((place) => (
          <li key={place.name}>
            <strong>{place.name}.</strong> {place.text}
          </li>
        ))}
      </ul>
      <h4>{t('Passers-by')}</h4>
      <ul>
        {pocket.people.map((person) => (
          <li key={person.name}>
            <strong>{person.name}.</strong> {person.look} {person.line} <em>{t('Can tell:')}</em>{' '}
            {person.knows}
          </li>
        ))}
      </ul>
    </details>
  );
}

import { existsSync, readFileSync } from 'node:fs';

import type { CampaignBookPocket } from '../../packages/contracts/src/index.ts';

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const TRUTH: Readonly<Record<CampaignBookPocket['rumours'][number]['truth'], string>> = {
  true: 'Правда',
  false: 'Неправда',
  partial: 'Отчасти правда',
};

/** A campaign's pocket (`source/pocket.json`, docs/CAMPAIGN_TEXT_STANDARD.md §7), if it has one. */
export function readPocket(root: URL): CampaignBookPocket | undefined {
  const file = new URL('source/pocket.json', root);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as CampaignBookPocket)
    : undefined;
}

/**
 * The DM's pocket as a section of the DM's book: rumours with what is behind them, places off the
 * prepared road, passers-by. It says which rumour is true: only DM books call this renderer, never
 * the players' page or a handout.
 */
export function pocketSection(root: URL): string {
  const pocket = readPocket(root);
  if (!pocket) return '';
  const rumours = pocket.rumours
    .map(
      (r) =>
        `<li><p>${escape(r.text)}</p><p><strong>${TRUTH[r.truth]}.</strong> ${escape(r.note)}</p></li>`,
    )
    .join('');
  const places = pocket.places
    .map((place) => `<h4>${escape(place.name)}</h4><p>${escape(place.text)}</p>`)
    .join('');
  const people = pocket.people
    .map(
      (person) =>
        `<h4>${escape(person.name)}</h4><p>${escape(person.look)}</p><p>${escape(person.line)}</p><p><strong>Может рассказать:</strong> ${escape(person.knows)}</p>`,
    )
    .join('');
  return `<section class="panel section" data-dm-pocket><h2>Карман ведущего</h2><p>Для игры без подготовки: что говорят люди, места в стороне от главной дороги и прохожие. Пометки о правде слухов — только для ведущего; сказанное за столом становится фактом мира, лишь когда вы его подтвердите.</p><h3>Слухи</h3><ol>${rumours}</ol><h3>Места в стороне</h3>${places}<h3>Прохожие</h3>${people}</section>`;
}

import { existsSync, readFileSync } from 'node:fs';

import { tableRoutes } from './table-routes.ts';

type Branch = { session: number; title: string; text: string };

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** These notes contain spoilers. Only DM books and session chapters call this renderer. */
export function tableGuide(root: URL, session?: number): string {
  const file = new URL('source/table-guide.json', root);
  if (!existsSync(file)) return '';
  const branches = JSON.parse(readFileSync(file, 'utf8')) as Branch[];
  const entries = branches.filter((entry) => session === undefined || entry.session === session);
  const alternatives = tableRoutes(root).filter(
    (route) => session === undefined || route.chapter === session,
  );
  if (!entries.length && !alternatives.length) return '';
  const body = entries
    .map((entry) => {
      const evening = session === undefined ? `Вечер ${entry.session}. ` : '';
      return `<h3>${evening}${escape(entry.title)}</h3><p>${escape(entry.text)}</p>`;
    })
    .join('');
  const entryCheck =
    session === undefined
      ? '<p>Перед чтением вступления сверьте место героев, присутствующих людей и предметы с итогом прошлого вечера. Если условия встречи отпали, сыграйте последствия там, где находится партия. Событие по расписанию может произойти за кадром. Герои узнают о нём от тех, кто был на месте.</p>'
      : '';
  return `<section class="panel section" data-dm-branches><h2>Если партия изменила план</h2>${entryCheck}${body}${alternatives.map((route) => '<h3>' + escape(route.name) + '</h3><p>' + route.steps.map(escape).join(' ') + '</p>').join('')}</section>`;
}

/** The opening artwork is safe to open by itself on the table's screen. */
export function openingPicture(root: URL): string {
  const manifest = new URL('illustrations/manifest.json', root);
  if (!existsSync(manifest)) return '';
  const { alt } = JSON.parse(readFileSync(manifest, 'utf8')) as { alt: string };
  const file = 'illustrations/opening.webp';
  return `<figure><a href="${file}"><img src="${file}" alt="${escape(alt)}" style="display:block;max-width:100%;height:auto" loading="lazy"></a><figcaption>Иллюстрация к первой встрече</figcaption></figure>`;
}

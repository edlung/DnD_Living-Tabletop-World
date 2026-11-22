import { withBookTableLinks } from '../campaign-shared/book-table-links.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import prompts from '../../campaigns/moon-pearl/assets/prompts.json' with { type: 'json' };

export const packRoot = new URL('../../campaigns/moon-pearl/', import.meta.url);
export const artFile = (id: string): string => {
  const entry = prompts.images.find((p) => p.id === id);
  if (!entry) throw new Error('Unknown art ' + id);
  // The runtime WebP: the PNG originals live outside the repository with the art workspace.
  return `runtime/${entry.id}.webp`;
};
export const esc = (value: string | number): string =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export const p = (text: string) => `<p>${esc(text)}</p>`;
export const list = (rows: readonly string[]) =>
  `<ul>${rows.map((row) => `<li>${esc(row)}</li>`).join('')}</ul>`;
export const img = (id: string, alt: string, prefix = '', className = 'landscape') =>
  `<img class="${className}" src="${prefix}assets/runtime/${esc(id)}.webp" alt="${esc(alt)}" loading="lazy">`;
export const link = (url: string, label: string, className = '') =>
  `<a${className ? ` class="${className}"` : ''} href="${esc(url)}">${esc(label)}</a>`;

export function page(
  title: string,
  content: string,
  options: { prefix?: string; player?: boolean } = {},
) {
  const prefix = options.prefix ?? '';
  const nav = options.player
    ? link(`${prefix}players.html`, 'Герои и памятка')
    : `${link(`${prefix}index.html`, 'Обложка')}${link(`${prefix}guide.html`, 'Ведущему')}${link(`${prefix}handouts.html`, 'Карточки')}`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Тайна Лунной Жемчужины</title><link rel="stylesheet" href="${prefix}book.css"><link rel="stylesheet" href="${prefix}book-responsive.css"></head><body><a class="skip" href="#main">К содержанию</a><div class="shell"><header class="top"><span class="brand">Тайна Лунной Жемчужины</span><nav aria-label="Навигация">${nav}</nav></header><main id="main">${content}</main><footer class="footer">Оригинальная семейная кампания · Чудеса начинаются с вашей идеи.</footer></div></body></html>\n`;
}

export async function save(relative: string, content: string) {
  const target = new URL(relative, packRoot);
  await mkdir(dirname(target.pathname), { recursive: true });
  await writeFile(target, withBookTableLinks(packRoot, relative, content));
}

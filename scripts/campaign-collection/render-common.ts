import type { Hero, Source } from './source.ts';
import { heroSheet } from './sheets.ts';
import { readFileSync } from 'node:fs';

const portableStyles = readFileSync(new URL('book.css', import.meta.url), 'utf8');

export const esc = (text: unknown): string =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
export const p = (text: string): string => `<p>${esc(text)}</p>`;
export const list = (items: readonly string[]): string =>
  `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
export const box = (title: string, body: string): string =>
  `<section class="panel"><h2>${esc(title)}</h2>${body}</section>`;
export function page(
  title: string,
  eyebrow: string,
  content: string,
  navigation = '',
  css: string | null = '../book.css',
): string {
  const styles =
    css === null
      ? `<style>${portableStyles}</style>`
      : `<link rel="stylesheet" href="${esc(css)}">`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(eyebrow)}</title>${styles}</head><body><a class="skip" href="#main">К содержанию</a><header><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${navigation ? `<nav aria-label="Навигация">${navigation}</nav>` : ''}</header><main id="main">${content}</main><footer>Living Tabletop World · Авторская коллекция · 2026</footer></body></html>\n`;
}
export function nav(s: Source): string {
  return `<a href="../index.html">Все кампании</a><a href="index.html">Книга ведущего</a><a href="players.html">Игрокам</a><a href="maps.html">Встречи и карты</a><a href="package.json" download>Пакет на ${s.world.defaultPlayers} игроков</a>`;
}
export function heroCard(h: Hero, picture = ''): string {
  const classes = { fighter: 'воин', rogue: 'плут', cleric: 'жрец', wizard: 'волшебник' };
  const sheet = heroSheet(h.archetype);
  const a = sheet.abilities;
  const profile = `<p class="meta">Хиты ${sheet.hitPoints.max} · КД ${sheet.armorClass} · Скорость ${sheet.speedFt} футов<br>СИЛ ${a.str} · ЛОВ ${a.dex} · ТЕЛ ${a.con} · ИНТ ${a.int} · МДР ${a.wis} · ХАР ${a.cha}</p>`;
  const equipment =
    h.archetype === 'fighter'
      ? 'Длинный меч, ручной топор.'
      : h.archetype === 'rogue'
        ? 'Рапира, короткий лук.'
        : h.archetype === 'cleric'
          ? 'Посох. Заклинания: «Лечащее слово», «Обнаружение магии».'
          : 'Посох. Заклинания: «Обнаружение магии», «Туманный шаг».';
  return `<article class="panel">${picture}<div class="eyebrow">${h.age} лет · ${esc(classes[h.archetype])} · уровень 3</div><h2>${esc(h.name)}</h2>${p(h.role)}${profile}${p(equipment)}${p(h.look)}${p(h.hook)}<h3>Связь</h3>${p(h.bond)}<h3>В центре внимания</h3>${p(h.spotlight)}<h3>Личный вопрос</h3>${p(h.personalQuestion)}</article>`;
}

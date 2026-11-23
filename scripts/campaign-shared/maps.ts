import type { CampaignPackage, CreatureSize } from '../../packages/contracts/src/index.ts';
import { spanOfSize } from '../../packages/rules/src/space.ts';

import { foeRoster, type KitBoss, type KitEncounter } from './combat-kit.ts';
import { statBlockFor } from './foe-blocks.ts';

type Built = CampaignPackage['encounters'][number];

const CELL = 40;
const MARGIN = 28;
const column = (x: number) => String.fromCharCode(65 + x);
const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The fight's own battlefield, drawn from the same geometry the engine plays on. */
export function tacticalSvg(e: Built, bossSize?: CreatureSize): string {
  const { width, height, difficult, cover } = e.battlefield;
  const cells: string[] = [];
  const rough = new Set(difficult.map((c) => `${c.x},${c.y}`));
  const shelter = new Map(cover.map((c) => [`${c.x},${c.y}`, c.level]));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const level = shelter.get(key);
      const fill = level
        ? level === 'half'
          ? '#8fa3ad'
          : '#5f7682'
        : rough.has(key)
          ? '#cbb68e'
          : '#faf8f1';
      cells.push(
        `<rect x="${MARGIN + x * CELL}" y="${MARGIN + y * CELL}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="#989d9a"/>`,
      );
    }
  e.combatants.forEach((c, i) => {
    const span = bossSize && c.entity === e.key + '-boss' ? spanOfSize(bossSize) : 1;
    const x = MARGIN + c.position.x * CELL;
    const y = MARGIN + c.position.y * CELL;
    if (span > 1) {
      const extent = span * CELL - 4;
      cells.push(
        `<rect x="${x + 2}" y="${y + 2}" width="${extent}" height="${extent}" rx="4" fill="#843b28" fill-opacity=".2" stroke="#843b28" stroke-width="3"><title>Противник занимает ${span} × ${span} клетки</title></rect>`,
      );
    }
    const cx = x + (span * CELL) / 2;
    const cy = y + (span * CELL) / 2;
    cells.push(
      `<circle cx="${cx}" cy="${cy}" r="15" fill="${c.side === 'party' ? '#164c62' : '#843b28'}"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#fff" font-size="13">${i + 1}</text>`,
    );
  });
  const labels = [
    ...Array.from(
      { length: width },
      (_, x) =>
        `<text x="${MARGIN + x * CELL + CELL / 2}" y="20" text-anchor="middle" font-size="13">${column(x)}</text>`,
    ),
    ...Array.from(
      { length: height },
      (_, y) =>
        `<text x="14" y="${MARGIN + y * CELL + CELL / 2 + 5}" text-anchor="middle" font-size="13">${y + 1}</text>`,
    ),
  ].join('');
  const w = MARGIN * 2 + width * CELL;
  const h = MARGIN * 2 + height * CELL;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="map" viewBox="0 0 ${w} ${h}" role="img" aria-label="Тактическое поле: ${esc(e.title)}. ${width} на ${height} клеток, клетка 5 футов."><title>${esc(e.title)}</title>${labels}${cells.join('')}</svg>`;
}

interface Helpers {
  box: (title: string, body: string) => string;
  p: (text: string) => string;
  esc: (text: string) => string;
}
interface BookEncounter extends KitEncounter {
  scaling: string;
  terrain: string;
  mandatory?: boolean;
}

/** One encounter for the DM: what happens, who fights, in numbers, and on what ground. */
export function encounterSection(e: BookEncounter, built: Built, size: number, h: Helpers): string {
  const squares = (list: readonly { x: number; y: number }[]) =>
    list.map((c) => `${column(c.x)}${c.y + 1}`).join(', ') || 'нет';
  const groups = new Map<string, { name: string; count: number; srd: string; boss?: KitBoss }>();
  for (const foe of foeRoster(e, size)) {
    const base = foe.name.replace(/ \d+$/, '');
    const boss = foe.key === e.key + '-boss' ? e.boss : undefined;
    const key = `${foe.srd}:${base}${boss ? ':boss' : ''}`;
    const group = groups.get(key) ?? {
      name: base,
      count: 0,
      srd: foe.srd,
      ...(boss ? { boss } : {}),
    };
    group.count += 1;
    groups.set(key, group);
  }
  const stats = [...groups.values()]
    .map((group) => {
      const b = statBlockFor(group.srd, group.boss);
      const attacks = b.attacks
        .map(
          (a) =>
            `${a.bonus >= 0 ? '+' : ''}${a.bonus}, ${a.damage.count}к${a.damage.sides}${a.damage.bonus ? `+${a.damage.bonus}` : ''}`,
        )
        .join('; ');
      return `<li>${h.esc(group.name)} × ${group.count}: КД ${b.armorClass}, хиты ${b.hitPoints.max}, скорость ${b.speedFt} футов, атак за ход ${b.attacksPerAction} (${h.esc(attacks)})</li>`;
    })
    .join('');
  const { width, height, difficult, cover } = built.battlefield;
  return h.box(
    e.title,
    `<p class="meta">${e.mandatory ? 'Обязательный бой' : 'Необязательный бой'} · поле ${width} × ${height}, клетка 5 футов</p>` +
      h.p(e.trigger) +
      '<h3>Цель</h3>' +
      h.p(e.objective) +
      (e.peaceful ? `<h3>Обойтись без боя</h3>${h.p(e.peaceful)}` : '') +
      `<h3>Противники на ${size} игроков</h3><ul>${stats}</ul>` +
      h.p(e.tactics) +
      '<h3>Другой размер стола</h3>' +
      h.p(e.scaling) +
      '<h3>Поле</h3>' +
      h.p(e.terrain) +
      `<div class="map-scroll">${tacticalSvg(built, e.boss?.size)}</div>` +
      h.p(`Трудная местность: ${squares(difficult)}. Укрытия: ${squares(cover)}.`),
  );
}

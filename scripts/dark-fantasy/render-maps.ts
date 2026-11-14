import type { CampaignPackage } from '../../packages/contracts/src/index.ts';
import { encounterSection } from '../campaign-shared/maps.ts';
import type { Source } from './source.ts';
import { buildEncounters } from './encounters.ts';
import { box, esc, nav, p, page } from './render-common.ts';

export function tacticalMap(e: CampaignPackage['encounters'][number]): string {
  const { width, height, difficult, cover } = e.battlefield;
  const size = 40;
  const cells: string[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const rough = difficult.some((c) => c.x === x && c.y === y);
      const barrier = cover.some((c) => c.x === x && c.y === y);
      cells.push(
        `<rect x="${x * size}" y="${y * size}" width="40" height="40" fill="${barrier ? '#768993' : rough ? '#cbb68e' : '#faf8f1'}" stroke="#989d9a" stroke-width=".7"/>`,
      );
    }
  e.combatants.forEach((c, i) => {
    const x = c.position.x * size + 20,
      y = c.position.y * size + 20;
    cells.push(
      `<circle cx="${x}" cy="${y}" r="15" fill="${c.side === 'party' ? '#164c62' : '#843b28'}"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="white">${i + 1}</text>`,
    );
  });
  const margin = 24;
  const coordinates = [
    ...Array.from(
      { length: width },
      (_, x) =>
        `<text x="${margin + x * size + size / 2}" y="16" text-anchor="middle">${String.fromCharCode(65 + x)}</text>`,
    ),
    ...Array.from(
      { length: height },
      (_, y) =>
        `<text x="12" y="${margin + y * size + size / 2 + 5}" text-anchor="middle">${y + 1}</text>`,
    ),
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="map" role="img" aria-label="Тактическая сетка: столбцы A–N, строки 1–12; герои слева, противники справа" viewBox="0 0 ${width * size + margin} ${height * size + margin}"><title>Тактическая сетка 14 на 12 клеток</title>${coordinates}<g transform="translate(${margin} ${margin})">${cells.join('')}</g></svg>`;
}
export function renderMaps(s: Source): string {
  if (s.world.engine) return renderKitMaps(s);
  const party = s.cast.heroes.slice(0, s.world.defaultPlayers).map((h) => h.key);
  const encounters = buildEncounters(s, party);
  return page(
    `Встречи — ${s.world.title}`,
    'Только ведущему · Необязательные столкновения',
    box(
      'Как пользоваться',
      p(
        'Перед запуском встречи ведущий размещает участвующих героев в указанном месте обычными средствами перемещения. Встреча включает только находящихся там героев; отсутствующие не перемещаются автоматически.',
      ) +
        p(
          'Карты ниже точно совпадают с пакетом на 4 игроков. Клетка — 5 футов. Бежевые клетки — трудная местность, серые — половинное укрытие. Позиции — подготовленная схема; бой начинается только по решению ведущего после действий игроков.',
        ) +
        p(
          'Для 3–7 игроков используйте SVG с соответствующим числом в имени и соответствующий пакет. Имена и описания противников — жанровое оформление одинакового базового профиля. При 3/4/5/6/7 игроках здоровье каждого: 12/14/16/18/20; КД 12, атака +3, урон 1d4+1, скорость 20 футов. Количество противников: 2/3/3/4/5 соответственно. Это осторожная отправная точка, баланс живой группой ещё не проверен.',
        ),
    ) +
      s.encounters
        .map((e, i) => {
          const native = encounters[i];
          if (!native) throw new Error('Missing encounter');
          const legend = native.combatants
            .filter((member) => member.side === 'party')
            .map(
              (member, index) =>
                `${index + 1}. ${s.cast.heroes.find((hero) => hero.key === member.entity)?.name ?? ''}`,
            )
            .join('; ');
          const downloads = Array.from(
            { length: s.world.maxPlayers + 1 - s.world.minPlayers },
            (_, j) => {
              const size = j + s.world.minPlayers;
              return `<a href="maps/${e.key}-${size}.svg" download>${size} игроков · SVG</a>`;
            },
          ).join('');
          return box(
            e.title,
            p(e.trigger) +
              `<h3>Цель</h3>${p(e.objective)}${tacticalMap(native)}` +
              `<p class="meta">Синие: ${esc(legend)}. Красные: ${esc(e.foeName)}.</p><div class="actions">${downloads}</div>` +
              `<h3>Местность</h3>${p(e.terrain)}<h3>Поведение</h3>${p(e.tactics)}<h3>Мирный путь</h3>${p(e.peaceful)}<h3>Состав группы</h3>${p(e.scaling)}`,
          );
        })
        .join(''),
    nav(s),
  );
}

function renderKitMaps(s: Source): string {
  const size = s.world.defaultPlayers;
  const built = buildEncounters(
    s,
    s.cast.heroes.slice(0, size).map((h) => h.key),
  );
  const sections = s.encounters
    .map((e) => {
      const b = built.find((x) => x.key === e.key);
      if (!b) throw new Error(`Missing built encounter ${e.key}`);
      return encounterSection(e, b, size, { box, p, esc });
    })
    .join('');
  return page(`${s.world.title} — встречи и карты`, 'Только ведущему', sections, nav(s));
}

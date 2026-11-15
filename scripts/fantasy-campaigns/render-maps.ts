import { encounterSection, tacticalSvg } from '../campaign-shared/maps.ts';
import { buildEncounters } from './encounters.ts';
import type { Source, Encounter } from './source.ts';
import { box, esc, nav, p, page } from './render-common.ts';

export function battleMap(encounter: Encounter): string {
  const cells: string[] = [];
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 14; x++) {
      const difficult = (x === 6 || x === 7) && (y === 4 || y === 5);
      const cover = x === 8 && (y === 3 || y === 8);
      cells.push(
        `<rect x="${40 + x * 40}" y="${40 + y * 40}" width="40" height="40" fill="${difficult ? '#dbc9a0' : '#fffaf0'}" stroke="#879491"/>`,
      );
      if (difficult)
        cells.push(
          `<path d="M${44 + x * 40} ${44 + y * 40}l32 32m0-32l-32 32" stroke="#75603a" stroke-width="2"/>`,
        );
      if (cover)
        cells.push(
          `<rect x="${49 + x * 40}" y="${49 + y * 40}" width="22" height="22" fill="#34677a"/>`,
        );
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 624 552" role="img" aria-labelledby="title desc"><title id="title">Тактическое поле: ${esc(encounter.title)}</title><desc id="desc">14 на 12 клеток. Одна клетка 5 футов. G5, H5, G6, H6 — трудная местность. I4, I9 — укрытие наполовину. Фигуры выставляет ведущий.</desc><rect width="624" height="552" fill="#f4f0e8"/>${cells.join('')}${Array.from({ length: 14 }, (_, x) => `<text x="${60 + x * 40}" y="26" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#202f3b">${String.fromCharCode(65 + x)}</text>`).join('')}${Array.from({ length: 12 }, (_, y) => `<text x="20" y="${65 + y * 40}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#202f3b">${y + 1}</text>`).join('')}</svg>`;
}

export function renderMaps(s: Source): string {
  if (s.world.engine) return renderKitMaps(s);
  const maps = s.encounters
    .map((e) =>
      box(
        e.title,
        p(e.trigger) +
          '<h3>Цель и выходы</h3>' +
          p(e.objective) +
          p(e.peaceful) +
          '<h3>Поведение противников</h3>' +
          p(e.foeDescription) +
          p(e.tactics) +
          '<h3>Размер группы</h3>' +
          p(e.scaling) +
          `<img class="map" src="maps/${e.key}.svg" alt="Поле 14 на 12 клеток с четырьмя трудными клетками и двумя укрытиями">` +
          `<div class="actions"><a href="maps/${e.key}.svg">Открыть карту для печати</a></div>` +
          p(e.terrain),
      ),
    )
    .join('');
  return page(
    `${s.world.title} — встречи и карты`,
    'Только ведущему · встречи необязательны',
    box(
      'Одинаковые правила, разная история',
      p(
        'Все карты совпадают с сеткой нативного пакета: 14 × 12, клетка — 5 футов. G5/H5/G6/H6 — трудная местность; I4/I9 — половинное укрытие. Остальные детали описания декоративны, пока ведущий не изменил поле штатно.',
      ),
    ) +
      box(
        'Расстановка и параметры',
        p(
          'Герои в порядке списка встречи: B3, B4, B5, B6, C3, C4, C5, C6. Противники: L3, L4, L5, L6, M3, M4. Используйте только нужное число фигур.',
        ) +
          p(
            'Для 3 / 4 / 5 / 6 / 7 / 8 игроков: 2 / 3 / 3 / 4 / 5 / 6 противников, здоровье каждого 12 / 14 / 16 / 18 / 20 / 22. Защита 12; скорость 20 футов; одна ближняя атака +3, 1d4+1 дробящего урона, досягаемость 5 футов.',
          ) +
          p(
            'Перед запуском встречи герои должны находиться в её локации. После сыгранного перехода ведущий перемещает участвующих персонажей обычным действием приложения; герои в других местах автоматически в бой не попадают.',
          ) +
          p(
            'Враги — простая поддерживаемая модель. Мирные решения и ограничения сцены описаны отдельно; ведущий подтверждает их результат. После первого раунда напомните пути переговоров или отступления. Встречи не запускаются автоматически.',
          ),
      ) +
      maps,
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

export function battleMapFor(s: Source, encounter: Encounter): string {
  if (!encounter.foes) return battleMap(encounter);
  const size = s.world.defaultPlayers;
  const built = buildEncounters(
    s,
    s.cast.heroes.slice(0, size).map((h) => h.key),
  );
  const b = built.find((x) => x.key === encounter.key);
  if (!b) throw new Error(`Missing built encounter ${encounter.key}`);
  return tacticalSvg(b);
}

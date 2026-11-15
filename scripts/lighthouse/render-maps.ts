import { cast, DEFAULT_PARTY, world } from './data.ts';
import { encounters, foeEntities } from './encounters.ts';
import { artFile, esc, img, link, p, page, save } from './render-common.ts';

/** Exact grid from the native encounter; illustrations around it never imply extra collision. */
export function battleMap(encounter: ReturnType<typeof encounters>[number]) {
  const cell = 72;
  const rows: string[] = [];
  for (let y = 0; y < encounter.battlefield.height; y++) {
    for (let x = 0; x < encounter.battlefield.width; x++) {
      const difficult = encounter.battlefield.difficult.some((p) => p.x === x && p.y === y);
      const cover = encounter.battlefield.cover.some((p) => p.x === x && p.y === y);
      rows.push(
        `<rect x="${x * cell + 48}" y="${y * cell + 96}" width="72" height="72" fill="${difficult ? 'url(#ropes)' : '#efdfbc'}" stroke="#846b48"/>`,
      );
      if (cover)
        rows.push(
          `<rect x="${x * cell + 60}" y="${y * cell + 112}" width="48" height="40" rx="6" fill="#527c79" stroke="#29433f" stroke-width="3"/><path d="M${x * cell + 64} ${y * cell + 116}l40 32m0-32l-40 32" stroke="#cce0cb" stroke-width="2"/>`,
        );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 816 744" role="img" aria-labelledby="title desc"><title id="title">${esc(encounter.title)}</title><desc id="desc">10 на 8 клеток. Трудная местность E4 и E5. Укрытие наполовину G3 и G6. Одна клетка — 5 футов.</desc><defs><pattern id="ropes" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#dfbd7c"/><path d="M0 12L12 0" stroke="#9e7139" stroke-width="2"/></pattern></defs><rect width="816" height="744" rx="16" fill="#17303c"/><text x="48" y="44" fill="#f6dfb8" font-size="26" font-family="Georgia,serif">${esc(encounter.title)}</text><text x="48" y="72" fill="#f6dfb8" font-size="16" font-family="sans-serif">1 клетка = 5 футов · край поля — безопасная граница</text>${rows.join('')}${Array.from({ length: 10 }, (_, i) => `<text x="${i * cell + 84}" y="694" text-anchor="middle" fill="#f6dfb8" font-size="16" font-family="sans-serif">${String.fromCharCode(65 + i)}</text>`).join('')}${Array.from({ length: 8 }, (_, i) => `<text x="28" y="${i * cell + 138}" text-anchor="middle" fill="#f6dfb8" font-size="16" font-family="sans-serif">${i + 1}</text>`).join('')}<text x="48" y="725" fill="#f6dfb8" font-size="16" font-family="sans-serif">Штриховка: трудный проход · ящик: укрытие наполовину</text></svg>`;
}

export async function renderMaps() {
  const battles = encounters(DEFAULT_PARTY);
  for (const encounter of battles) await save(`maps/${encounter.key}.svg`, battleMap(encounter));
  const names = [
    'Гавань',
    'Дом-корабль',
    'Сад Пом',
    'Библиотека',
    'Рынок',
    'Кузница',
    'Обсерватория',
    'Колокола',
    'Зимний дворец',
    'Маяк',
  ];
  const nodes = names.map((name, i) => ({
    name,
    x: 120 + (i % 3) * 280,
    y: 120 + Math.floor(i / 3) * 190,
  }));
  await save(
    'maps/archipelago.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 820" role="img" aria-labelledby="title"><title id="title">Схема островов — только ведущему</title><rect width="800" height="820" rx="16" fill="#132a39"/><text x="40" y="48" fill="#f2c883" font-family="Georgia,serif" font-size="28">Дороги Между Ветрами</text>${nodes
      .slice(1)
      .map(
        (n, i) =>
          `<path d="M${nodes[i]?.x} ${nodes[i]?.y}L${n.x} ${n.y}" stroke="#93c8c0" stroke-width="3" stroke-dasharray="8 8"/>`,
      )
      .join(
        '',
      )}${nodes.map((n, i) => `<ellipse cx="${n.x}" cy="${n.y}" rx="104" ry="48" fill="#294752" stroke="#d9b57d" stroke-width="2"/><text x="${n.x}" y="${n.y - 8}" text-anchor="middle" fill="#f2c883" font-family="sans-serif" font-size="14">${i + 1}</text><text x="${n.x}" y="${n.y + 18}" text-anchor="middle" fill="#fff1d8" font-family="Georgia,serif" font-size="20">${n.name}</text>`).join('')}<text x="40" y="790" fill="#d2ded8" font-family="sans-serif" font-size="16">Схема порядка знакомства, не масштаб. Возвращаться можно.</text></svg>`,
  );
  const battleCards = battles
    .map((battle) => {
      const foes = battle.combatants
        .filter((c) => c.side === 'hostile')
        .map((c) => foeEntities().find((f) => f.key === c.entity));
      return `<section class="section"><h2>${esc(battle.title)}</h2>${p(battle.trigger)}<img class="map" src="maps/${battle.key}.svg" alt="Поле 10 на 8 клеток: два трудных прохода и два укрытия"><div class="actions">${link(`maps/${battle.key}.svg`, 'Открыть поле без фигур', 'button secondary')}${link(`assets/${artFile(battle.location)}`, 'Показать декорацию', 'button secondary')}</div>${p('Начало: герои B3, B4, B5; четвёртый — B6. Автоматы I3 и, если их два, I6. Обозначения на карте используют буквы и номера с единицы; пакет хранит координаты с нуля.')}${p(foes.map((foe) => `${foe?.name}: ${foe?.statBlock?.hitPoints.max} HP, защита ${foe?.statBlock?.armorClass}`).join('; '))}${p('Одна атака за ход, мягкий упор 1d4 + 1, скорость 20 футов. Смотрители: +2 к атаке; ремонтник и страж: +3. Автомат заранее предупреждает, движется к ближайшему нарушителю и не добивает лежащих. Решения NPC подтверждает ведущий штатно.')}${p('После одного раунда снова предложите рычаг, разговор или отступление. При снижении до половины HP автомат останавливается на проверку: это окно для мирного решения, а не автоматический конец боя. Ведущий завершает встречу обычной командой. На 0 HP механизм выключается без жестоких подробностей.')}</section>`;
    })
    .join('');
  await save(
    'maps.html',
    page(
      'Карты и необязательные встречи',
      `<header class="chapter-head"><span class="eyebrow">Только ведущему</span><h1>Места для смелых идей</h1>${p('Три короткие встречи для троих героев. Сначала предлагайте выход без боя. Все тактические клетки совпадают с native package; декорации вне сетки не создают дополнительных препятствий.')}${link('tokens.html', 'Листы фигур для печати', 'button')}</header>${battleCards}<section class="section"><h2>Острова</h2><img class="map" src="maps/archipelago.svg" alt="Закрытая схема путешествия для ведущего">${p(world.order)}</section>`,
    ),
  );
  const tokens = [
    ...cast.heroes.map((h) => ({ art: h.art, name: h.name })),
    ...cast.npcs.map((n) => ({ art: n.key === 'omb' ? 'observatory' : n.key, name: n.name })),
    ...foeEntities().map((f) => ({ art: 'automaton', name: f.name })),
  ];
  await save(
    'tokens.html',
    page(
      'Фигуры для печати',
      `<header class="chapter-head"><span class="eyebrow">Только ведущему · выдавайте постепенно</span><h1>Попутчики и знакомые</h1>${p('Печатайте при масштабе 100%. Круги диаметром 28 мм подходят для домашних подставок. Скрывайте будущих персонажей до знакомства.')}</header><div class="token-grid">${tokens.map((token) => `<figure class="token">${img(token.art, token.name)}<figcaption>${esc(token.name)}</figcaption></figure>`).join('')}</div>`,
    ),
  );
}

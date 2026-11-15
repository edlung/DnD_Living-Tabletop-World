import { cast, DEFAULT_PARTY, world } from './data.ts';
import { encounters, foeEntities } from './encounters.ts';
import { artFile, esc, img, link, p, page, save } from './render-common.ts';

const coordinate = (position: { x: number; y: number }) =>
  `${String.fromCharCode(65 + position.x)}${position.y + 1}`;
/** Grid geometry is read directly from the native encounter; scenic art is separate. */
export function battleMap(encounter: ReturnType<typeof encounters>[number]) {
  const { width, height, difficult, cover } = encounter.battlefield;
  const cell = 72,
    w = width * cell + 96,
    h = height * cell + 168;
  const rows: string[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const rough = difficult.some((p) => p.x === x && p.y === y);
      rows.push(
        `<rect x="${x * cell + 48}" y="${y * cell + 96}" width="72" height="72" fill="${rough ? 'url(#rough)' : '#f6e7ca'}" stroke="#89734e"/>`,
      );
      if (cover.some((p) => p.x === x && p.y === y))
        rows.push(
          `<rect x="${x * cell + 60}" y="${y * cell + 112}" width="48" height="40" rx="4" fill="#436b52" stroke="#244630" stroke-width="3"/><path d="M${x * cell + 64} ${y * cell + 116}l40 32m0-32l-40 32" stroke="#dce4c4" stroke-width="2"/>`,
        );
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(encounter.title)}</title><desc id="desc">${width} на ${height} клеток. Трудный проход: ${difficult.map(coordinate).join(', ')}. Укрытие наполовину: ${cover.map(coordinate).join(', ')}.</desc><defs><pattern id="rough" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#e9c17c"/><path d="M0 12L12 0" stroke="#9a6e38" stroke-width="2"/></pattern></defs><rect width="${w}" height="${h}" rx="16" fill="#2b493b"/><text x="48" y="44" fill="#fff0d5" font-size="26" font-family="Georgia,serif">${esc(encounter.title)}</text><text x="48" y="72" fill="#fff0d5" font-size="16" font-family="sans-serif">1 клетка = 5 футов · край поля — безопасная граница</text>${rows.join('')}${Array.from({ length: width }, (_, i) => `<text x="${i * cell + 84}" y="${h - 50}" text-anchor="middle" fill="#fff0d5" font-size="16" font-family="sans-serif">${String.fromCharCode(65 + i)}</text>`).join('')}${Array.from({ length: height }, (_, i) => `<text x="28" y="${i * cell + 138}" text-anchor="middle" fill="#fff0d5" font-size="16" font-family="sans-serif">${i + 1}</text>`).join('')}<text x="48" y="${h - 20}" fill="#fff0d5" font-size="16" font-family="sans-serif">Штриховка: трудный проход · ящик: укрытие наполовину</text></svg>`;
}

export async function renderMaps() {
  const battles = encounters(DEFAULT_PARTY);
  for (const encounter of battles) await save(`maps/${encounter.key}.svg`, battleMap(encounter));
  const nodes = world.locations
    .filter((location) => location.key !== 'forest')
    .map((location, index) => ({
      ...location,
      x: 160 + (index % 3) * 300,
      y: 150 + Math.floor(index / 3) * 190,
    }));
  const edges = world.routes
    .map(([from, to]) => {
      const a = nodes.find((n) => n.key === from),
        b = nodes.find((n) => n.key === to);
      if (!a || !b) throw new Error('Unknown route');
      const path =
        from === 'garden' && to === 'station'
          ? `M${a.x} ${a.y}V792Q${a.x} 800 ${a.x - 8} 800H16Q8 800 8 792V150Q8 142 16 142H${b.x}`
          : a.y === b.y && Math.abs(a.x - b.x) > 300
            ? `M${a.x} ${a.y}C${a.x} ${a.y - 100},${b.x} ${b.y - 100},${b.x} ${b.y}`
            : `M${a.x} ${a.y}L${b.x} ${b.y}`;
      return `<path d="${path}" stroke="#b18b4a" fill="none" stroke-width="4" stroke-dasharray="8 8"/>`;
    })
    .join('');
  await save(
    'maps/railway.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 860" role="img" aria-labelledby="title"><title id="title">Станции Янтарного леса — схема ведущего</title><rect width="920" height="860" rx="16" fill="#f8eed9"/><text x="40" y="52" fill="#754329" font-family="Georgia,serif" font-size="30">Дороги Янтарного леса</text>${edges}${nodes.map((n, i) => `<rect x="${n.x - 136}" y="${n.y - 48}" width="272" height="96" rx="24" fill="#2b493b" stroke="#aa8141" stroke-width="2"/><text x="${n.x}" y="${n.y - 12}" text-anchor="middle" fill="#f2d799" font-family="sans-serif" font-size="14">${i + 1}</text><text x="${n.x}" y="${n.y + 18}" text-anchor="middle" fill="#fff4df" font-family="Georgia,serif" font-size="18">${esc(n.name)}</text>`).join('')}<text x="40" y="824" fill="#5e5140" font-family="sans-serif" font-size="16">Связи маршрутов, не масштаб. Вагон — подвижное место; его положение ведёт мастер.</text></svg>`,
  );
  const battleCards = battles
    .map((battle) => {
      const enemies = battle.combatants
        .filter((c) => c.side === 'hostile')
        .map((c) => foeEntities().find((f) => f.key === c.entity));
      return `<section class="section"><h2>${esc(battle.title)}</h2>${p(battle.trigger)}<img class="map" src="maps/${battle.key}.svg" alt="Поле ${battle.battlefield.width} на ${battle.battlefield.height} клеток"><div class="actions">${link(`maps/${battle.key}.svg`, 'Открыть поле без фигур', 'button secondary')}${link(`assets/${artFile(battle.location)}`, 'Показать декорацию', 'button secondary')}</div>${p(
        `Начало героев: ${battle.combatants
          .filter((c) => c.side === 'party')
          .map((c) => coordinate(c.position))
          .join(', ')}; четвёртый — B6. Садовники: ${battle.combatants
          .filter((c) => c.side === 'hostile')
          .map((c) => coordinate(c.position))
          .join(', ')}.`,
      )}${p(enemies.map((f) => `${f?.name}: ${f?.statBlock?.hitPoints.max} HP, защита ${f?.statBlock?.armorClass}`).join('; '))}${p('Одна атака за ход: мягкий упор 1d4 + 1; скорость 20 футов. Багажные садовники: +2 к атаке, остальные +3. Они предупреждают, не добивают лежащих и не сталкивают людей с высоты. На 0 HP автомат выключается без жестоких подробностей.')}${p('После первого раунда снова предложите мирный выход. При половине HP садовник останавливается на проверку — возможность поговорить или отключить его. Ведущий завершает бой обычной командой; это не скрытая автоматическая механика. Поражение допускает безопасное отступление, а здоровье восстанавливают штатный отдых и лечение.')}</section>`;
    })
    .join('');
  await save(
    'maps.html',
    page(
      'Карты и необязательные встречи',
      `<header class="chapter-head"><span class="eyebrow">Только ведущему</span><h1>Пути, станции и смелые идеи</h1>${p('Три короткие встречи рассчитаны на троих героев. Сначала предложите мирное решение. Тактические клетки точно совпадают с пакетом кампании; нарисованные декорации не создают скрытых препятствий.')}${link('tokens.html', 'Фигуры для печати', 'button')}</header>${battleCards}<section class="section"><h2>Станции</h2><img class="map" src="maps/railway.svg" alt="Схема связей станций Янтарного леса">${p(world.order)}<div class="reading stack">${world.routes.map(([from, to, travel]) => p(`${world.locations.find((l) => l.key === from)?.name} — ${world.locations.find((l) => l.key === to)?.name}: ${travel}`)).join('')}</div></section>`,
    ),
  );
  const tokens = [
    ...cast.heroes.map((h) => ({ art: h.art, name: h.name })),
    ...cast.npcs.map((n) => ({ art: n.key === 'berest' ? 'valley' : n.key, name: n.name })),
    ...foeEntities().map((f) => ({ art: 'gardener', name: f.name })),
  ];
  await save(
    'tokens.html',
    page(
      'Фигуры для печати',
      `<header class="chapter-head"><span class="eyebrow">Только ведущему · выдавайте постепенно</span><h1>Попутчики и знакомые</h1>${p('Печатайте при масштабе 100%. Круги диаметром 28 мм подходят для домашних подставок. Будущих персонажей показывайте после знакомства.')}</header><div class="token-grid">${tokens.map((token) => `<figure class="token">${img(token.art, token.name)}<figcaption>${esc(token.name)}</figcaption></figure>`).join('')}</div>`,
    ),
  );
}

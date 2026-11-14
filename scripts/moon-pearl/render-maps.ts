import { cast, DEFAULT_PARTY, world } from './data.ts';
import { PEARL_ENCOUNTERS, crabKeys, encounters, foeEntities } from './encounters.ts';
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
        `<rect x="${x * cell + 48}" y="${y * cell + 96}" width="72" height="72" fill="${rough ? 'url(#rough)' : '#eff5f3'}" stroke="#89734e"/>`,
      );
      if (cover.some((p) => p.x === x && p.y === y))
        rows.push(
          `<rect x="${x * cell + 60}" y="${y * cell + 112}" width="48" height="40" rx="4" fill="#3c7183" stroke="#153d56" stroke-width="3"/><path d="M${x * cell + 64} ${y * cell + 116}l40 32m0-32l-40 32" stroke="#dce4c4" stroke-width="2"/>`,
        );
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(encounter.title)}</title><desc id="desc">${width} на ${height} клеток. Трудный проход: ${difficult.map(coordinate).join(', ')}. Укрытие наполовину: ${cover.map(coordinate).join(', ')}.</desc><defs><pattern id="rough" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#e9c17c"/><path d="M0 12L12 0" stroke="#9a6e38" stroke-width="2"/></pattern></defs><rect width="${w}" height="${h}" rx="16" fill="#153d56"/><text x="48" y="44" fill="#fff0d5" font-size="26" font-family="Georgia,serif">${esc(encounter.title)}</text><text x="48" y="72" fill="#fff0d5" font-size="16" font-family="sans-serif">1 клетка = 5 футов · край поля — безопасная граница</text>${rows.join('')}${Array.from({ length: width }, (_, i) => `<text x="${i * cell + 84}" y="${h - 50}" text-anchor="middle" fill="#fff0d5" font-size="16" font-family="sans-serif">${String.fromCharCode(65 + i)}</text>`).join('')}${Array.from({ length: height }, (_, i) => `<text x="28" y="${i * cell + 138}" text-anchor="middle" fill="#fff0d5" font-size="16" font-family="sans-serif">${i + 1}</text>`).join('')}<text x="48" y="${h - 20}" fill="#fff0d5" font-size="16" font-family="sans-serif">Штриховка: трудный проход · ящик: укрытие наполовину</text></svg>`;
}

export async function renderMaps() {
  const battles = encounters(DEFAULT_PARTY);
  for (const encounter of battles) await save(`maps/${encounter.key}.svg`, battleMap(encounter));
  const nodes = world.locations
    .filter((location) => location.key !== 'sea')
    .map((location, index, all) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / all.length;
      return { ...location, x: 650 + Math.cos(angle) * 490, y: 690 + Math.sin(angle) * 490 };
    });
  const edges = world.routes
    .map(([from, to]) => {
      const a = nodes.find((node) => node.key === from),
        b = nodes.find((node) => node.key === to);
      if (!a || !b) throw new Error('Unknown route');
      // Bend shortcuts into the empty centre so they never pass behind an unrelated place.
      const gap = Math.abs(nodes.indexOf(a) - nodes.indexOf(b));
      const route = gap === 1 || gap === nodes.length - 1 ? 'L' : 'Q650 690 ';
      return `<path d="M${a.x} ${a.y}${route}${b.x} ${b.y}" stroke="#608897" fill="none" stroke-width="4" stroke-dasharray="10 8"/>`;
    })
    .join('');
  const labels = nodes
    .map((node, index) => {
      const words = node.name.split(' '),
        lines = [''];
      for (const word of words) {
        const last = lines.length - 1;
        if ((lines[last]?.length ?? 0) + word.length > 22) lines.push(word);
        else lines[last] = `${lines[last]} ${word}`.trim();
      }
      return `<rect x="${node.x - 116}" y="${node.y - 52}" width="232" height="104" rx="24" fill="#153d56" stroke="#bda36f" stroke-width="2"/><text x="${node.x}" y="${node.y - 24}" text-anchor="middle" fill="#f2d799" font-family="sans-serif" font-size="16">${index + 1}</text>${lines.map((line, i) => `<text x="${node.x}" y="${node.y + 4 + i * 24}" text-anchor="middle" fill="#fff4df" font-family="Georgia,serif" font-size="18">${esc(line)}</text>`).join('')}`;
    })
    .join('');
  await save(
    'maps/city.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 1350" role="img" aria-labelledby="title desc"><title id="title">Сухие пути Перламутра — схема ведущего</title><desc id="desc">Двенадцать мест и пятнадцать прямых связей. Пересечения линий не являются развилками.</desc><rect width="1300" height="1350" rx="24" fill="#eef5f5"/><text x="40" y="60" fill="#153d56" font-family="Georgia,serif" font-size="34">Пути под морем</text><text x="40" y="100" fill="#4b6070" font-family="sans-serif" font-size="18">Связи, не масштаб. Пересечение линий без блока — не развилка.</text>${edges}${labels}<text x="40" y="1296" fill="#4b6070" font-family="sans-serif" font-size="18">Лодка — подвижное место. Её положение и новые открытия отмечает ведущий.</text></svg>`,
  );
  const battleCards = battles
    .map((battle) => {
      const definition = PEARL_ENCOUNTERS.find((e) => e.key === battle.key);
      const enemies = battle.combatants
        .filter((c) => c.side === 'hostile')
        .map((c) => foeEntities(DEFAULT_PARTY).find((f) => f.key === c.entity));
      return `<section class="section"><h2>${esc(battle.title)}</h2>${p(battle.trigger)}<img class="map" src="maps/${battle.key}.svg" alt="Поле ${battle.battlefield.width} на ${battle.battlefield.height} клеток"><div class="actions">${link(`maps/${battle.key}.svg`, 'Открыть поле без фигур', 'button secondary')}${link(`assets/${artFile(battle.location)}`, 'Показать декорацию', 'button secondary')}</div>${p(
        `Начало героев: ${battle.combatants
          .filter((c) => c.side === 'party')
          .map((c) => coordinate(c.position))
          .join(', ')}. Противники: ${battle.combatants
          .filter((c) => c.side === 'hostile')
          .map((c) => coordinate(c.position))
          .join(', ')}.`,
      )}${p(
        [...new Map(enemies.map((f) => [f?.name.replace(/ \d+$/, ''), f])).values()]
          .map((f) => {
            const block = f?.statBlock;
            const attacks = (block?.attacks ?? [])
              .map(
                (a) =>
                  `${a.name} ${a.bonus >= 0 ? '+' : ''}${a.bonus}, ${a.damage.count}к${a.damage.sides}${a.damage.bonus ? ` + ${a.damage.bonus}` : ''}`,
              )
              .join('; ');
            return `${f?.name.replace(/ \d+$/, '')}: ${block?.hitPoints.max} HP, защита ${block?.armorClass}, скорость ${block?.speedFt} футов, ${attacks}`;
          })
          .join('. '),
      )}${p(definition?.objective ?? '')}${p(`Без боя: ${definition?.peaceful ?? ''}`)}${p(definition?.tactics ?? '')}${p(definition?.scaling ?? '')}${p(definition?.terrain ?? '')}</section>`;
    })
    .join('');
  await save(
    'maps.html',
    page(
      'Карты и необязательные встречи',
      `<header class="chapter-head"><span class="eyebrow">Только ведущему</span><h1>Пути под морем и смелые идеи</h1>${p('Три необязательные встречи: приёмка в Стеклянном Дворе, причал в девятый вечер и галерея Наутилуса во время торгов. Каждая идёт на своём поле, с противниками по числам справочника под городскими масками, и у каждой есть мирный выход. Сначала предложите его. Клетки точно совпадают с пакетом кампании; нарисованные декорации не создают скрытых препятствий. В Галерее Большой Волны боевой встречи нет: там наблюдают световой узор из сухой ниши.')}${link('tokens.html', 'Фигуры для печати', 'button')}</header>${battleCards}<section class="section"><h2>Городские связи</h2><img class="map" src="maps/city.svg" alt="Схема сухих путей Перламутра">${p(world.order)}<div class="reading stack">${world.routes.map(([from, to, travel]) => p(`${world.locations.find((l) => l.key === from)?.name} — ${world.locations.find((l) => l.key === to)?.name}: ${travel}`)).join('')}</div></section>`,
    ),
  );
  const tokens = [
    ...cast.heroes.map((h) => ({ art: h.art, name: h.name })),
    ...cast.npcs.map((n) => ({ art: n.key, name: n.name })),
    ...foeEntities(DEFAULT_PARTY).map((f) => ({
      art: crabKeys.includes(f.key) ? 'fold-crab' : 'brass-pointer',
      name: f.name,
    })),
  ];
  await save(
    'tokens.html',
    page(
      'Фигуры для печати',
      `<header class="chapter-head"><span class="eyebrow">Только ведущему · выдавайте постепенно</span><h1>Попутчики и знакомые</h1>${p('Печатайте при масштабе 100%. Круги диаметром 28 мм подходят для домашних подставок. Будущих персонажей показывайте после знакомства.')}</header><div class="token-grid">${tokens.map((token) => `<figure class="token">${img(token.art, token.name)}<figcaption>${esc(token.name)}</figcaption></figure>`).join('')}</div>`,
    ),
  );
}

// Story items with printed quantities live on the GM's ledger. Durable props have no charges.
export function supplies(slug, profile, size, archived = false) {
  const stores = {},
    events = [];
  let cupboard = false;
  let carriedBox = false;
  let bundleAdvance = 0;
  const adjust = (key, delta, why) => {
    const from = stores[key] ?? 0;
    const to = Math.min(key === 'запас глубины' ? 15 : Infinity, Math.max(0, from + delta));
    stores[key] = to;
    if (to !== from) events.push({ item: key, from, to, why });
  };
  const choose = (book, fn) => {
    if (slug === book) fn();
  };
  choose('hollow-choir', () => {
    adjust('обычные свечи', 24, 'Два ящика из кладовой.');
    adjust('обычные свечи', -size, 'Каждому герою одна свеча в руку.');
    adjust('спички', 6, 'Коробок из кухни.');
  });
  choose('winter-caravan', () => {
    for (const [key, n] of Object.entries({ еда: 14, тепло: 6, мулы: 6, семена: 4, шерсть: 2 }))
      adjust(key, n, 'Стартовый лист обоза.');
  });
  choose('salt-widows', () => adjust('вода', 7, 'Старт по листу следа.'));
  choose('marrow-crown', () => adjust('запас глубины', 12, 'Начальный лист глубины.'));
  function expedition(n, after) {
    if (!after) {
      if (!stores['запас глубины'])
        adjust('запас глубины', 2, 'Одна находка в начале пустого вечера.');
      const find = {
        1: [2, 'связка Дары'],
        2: [2, 'ниша трёх узлов'],
        3: [3, 'договор с Марком'],
        4: [1, 'тайник Устины'],
        6: [2, 'мешок Эрны'],
        7: archived ? [3, 'свёрток Стася'] : null,
      }[n];
      if (find) {
        const before = stores['запас глубины'];
        adjust('запас глубины', find[0], find[1]);
        if (n === 7) bundleAdvance = stores['запас глубины'] - before;
      }
    } else if (n <= 7) {
      if (n >= 3)
        adjust(
          'запас глубины',
          -{ 3: 1, 4: 3, 5: 3, 6: 3, 7: 2 }[n],
          'Три сцены на глубине при свете, остаток пути во тьме.',
        );
      adjust('запас глубины', -1, 'Ночлег на привале.');
    }
  }
  function caravan(n) {
    if (n === 2) {
      adjust('шерсть', -1, 'Меняем тюк у Ошвена.');
      adjust('еда', 3, 'Обмен у Ошвена.');
      adjust('тепло', 1, 'Обмен у Ошвена.');
      adjust('тепло', 2, 'Рубим для Ошвена дрова.');
    }
    if (n === 3) {
      adjust('еда', -8, 'Кухонные сани ушли под лавину.');
      adjust('тепло', -4, 'Кухонные сани ушли под лавину.');
    }
    if (n >= 4 && stores['еда'] <= 2 && stores['семена'] > 0) {
      adjust('семена', -1, 'Открываем ящик ради пайка.');
      adjust('еда', 3, 'Три мешка из ящика семян.');
    }
    if (n === 5) {
      adjust('еда', 2, 'Запас из кладовки у тура.');
      adjust('тепло', 1, 'Вязанка из кладовки.');
    }
    if (n === 6) {
      adjust('тепло', 3, 'Починили крышу у Явры.');
      if (stores['шерсть']) {
        adjust('шерсть', -1, 'Последний тюк для Явры.');
        adjust('еда', 3, 'Три мешка за шерсть.');
      }
    }
    adjust('еда', -2, 'Суточный паёк.');
    const fuel = [0, 2, 0, 1, 1, 1, 0, 1][n];
    if (stores['тепло'] < fuel) adjust('мулы', -1, 'После холодной ночи один мул не встал.');
    adjust('тепло', -fuel, 'Цена стоянки по листу.');
  }
  const unpaid = new Set();
  return {
    stores,
    events,
    unpaid,
    resume(key) {
      archived = false;
      if (key === 'fissure-spinners' && bundleAdvance) {
        adjust('запас глубины', -bundleAdvance, 'Свёрток ещё на верёвке Стася.');
        bundleAdvance = 0;
      }
    },
    chapter(n, after) {
      if (slug === 'marrow-crown') expedition(n, after);
      if (!after) return;
      if (slug === 'hollow-choir' && [2, 3, 4, 5].includes(n)) {
        const target = { cautious: 12, middle: 8, noisy: 4 }[profile],
          cost = 24 - size - target;
        const uses = Math.floor((cost * (n - 1)) / 4) - Math.floor((cost * (n - 2)) / 4);
        adjust('обычные свечи', -uses, 'Распределение и смена свечей между ударами часов.');
        if (n === 3 || n === 5)
          adjust(
            'спички',
            -{ cautious: 0, middle: 1, noisy: 2 }[profile],
            'Зажигаем свечи после удара.',
          );
        if (n === 4 && (profile !== 'noisy' || carriedBox) && cupboard)
          adjust('свечи Урмов', 8, 'Уносим ящик из ниш.');
        if (n === 5 && profile === 'middle')
          adjust('свечи Урмов', -4, 'Свечи из ящика ушли на проход через сад.');
      }
      if (slug === 'winter-caravan' && n <= 7) caravan(n);
      if (slug === 'salt-widows' && n <= 7) {
        if (n === 4) adjust('вода', 2, 'Работа у колодца Нены.');
        adjust('вода', -1, 'Ночная стоянка.');
      }
      if (slug === 'last-orbit' && n === 3)
        adjust('запасной баллон', 1, 'Назвали Арону число беглецов.');
    },
    afterFight(key, res, details = {}) {
      if (slug === 'marrow-crown' && key !== 'seam-nest') {
        if (res !== 'warning-sent')
          adjust(
            'запас глубины',
            -1,
            res === 'burned' ? 'Подожгли паутину под свёртком.' : 'Цена боя.',
          );
        if (!archived && key === 'fissure-spinners' && ['win', 'burned'].includes(res))
          adjust('запас глубины', res === 'win' ? 3 : 2, 'Вынесли свёрток Стася.');
        for (const id of details.hurt ?? []) {
          if (!stores['запас глубины']) unpaid.add(id);
          adjust('запас глубины', -1, 'Перевязка раненого на привале.');
        }
      }
      if (key === 'first-supper' && details.snuffed)
        adjust(
          'обычные свечи',
          -details.snuffed,
          'Заменили свечи, которые Голос погасил попаданиями.',
        );
      if (key === 'niche-guards') {
        carriedBox = details.boxOut === true;
        cupboard = carriedBox || res === 'win' || res === 'bypass';
      }
      if (key === 'radan-in-brine' && details.baitWater)
        adjust('вода', -1, 'Вскрыли бочку, чтобы отвести резунов.');
      if (key === 'pack-on-the-ford' && res !== 'win') adjust('еда', -2, 'У брода потерян вьюк.');
      if (key === 'fire-on-the-tarn' && res !== 'win')
        adjust('еда', -1, 'Тирна нашла оторвавшегося мула без вьюка.');
      if (key === 'strange-burrow') {
        const recovered = details.rescued ?? [];
        adjust('еда', recovered.filter((i) => ![1, 4].includes(i)).length, 'Вынесенные мешки.');
        adjust(
          'тепло',
          recovered.filter((i) => [1, 4].includes(i)).length,
          'Вынесенные вязанки в I6 и L3.',
        );
      }
      if (key === 'locker-three' && res === 'win')
        adjust('комплект полных баллонов', 1, 'Переписали бирки, вынесли баллоны.');
      if (key === 'hull-walk') {
        adjust('комплект полных баллонов', -1, 'Подключили комплект при выходе.');
        adjust('запасной баллон', -1, 'Перед выходом передали баллон спутнику.');
      }
      if (key === 'widows-line-hunt' && details.toothSpent)
        adjust('заряд зуба Ивы', -1, 'Выстрел Ивы по шву.');
      if (key === 'white-at-the-ledge')
        adjust('мулы', -(details.mulesLost ?? 0), 'Потери привязанных мулов.');
    },
    beforeFight(key) {
      if (key === 'widows-line-hunt')
        adjust(
          'заряд зуба Ивы',
          1,
          'Ива зарядил зуб из полного ящика, погруженного вместо другого груза.',
        );
      if (key === 'white-at-the-ledge') {
        stores.breakfast = stores['еда'];
        adjust('еда', -2, 'Завтрак у Площадки перед боем.');
      }
    },
  };
}

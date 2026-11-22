// A classic script keeps the book usable when opened directly from disk.
(() => {
  const hollowmere = '../../../fixtures/hollowmere/assets/';
  const ravenford = '../../../fixtures/ravenford-ru/assets/';
  const art = {
    gate: [ravenford + 'north-gate.webp', 'Северные ворота Равенфорда', 'gold'],
    cart: [hollowmere + 'brisk-cargo.webp', 'Повозка с маслом и солью', 'gold', 'inset'],
    fens: [hollowmere + 'fenlands.webp', 'Карта Северных топей', 'atlas'],
    ford: [hollowmere + 'willow-ford--fog.webp', 'Туман у Ивового брода', 'reed'],
    tracks: [hollowmere + 'churned-mud.webp', 'Следы на илистом берегу', 'reed', 'inset'],
    fordPlan: [hollowmere + 'willow-ford--map.webp', 'План Ивового брода', 'atlas'],
    hall: [hollowmere + 'reeves-hall.webp', 'Дом старосты в Холлоумире', 'gold'],
    cellar: [hollowmere + 'reeves-cellar.webp', 'Погреб под домом Хобба', 'gold'],
    tower: [hollowmere + 'bell-tower--fog.webp', 'Колокольня в тумане', 'reed'],
    rope: [hollowmere + 'bell-rope.webp', 'Тростниковый узел на верёвке', 'reed', 'inset'],
    chapel: [hollowmere + 'drowned-chapel.webp', 'Затонувшая часовня', 'reed'],
    slab: [hollowmere + 'cracked-slab.webp', 'Плита перед алтарём', 'reed', 'inset'],
    chapelPlan: [hollowmere + 'drowned-chapel--map.webp', 'План затопленного нефа', 'atlas'],
    mill: [hollowmere + 'sunken-mill.webp', 'Мельница у чёрной воды', 'reed'],
    ledger: [hollowmere + 'tarred-ledger.webp', 'Просмоленная судовая книга', 'gold', 'inset'],
    millPlan: [hollowmere + 'sunken-mill--map.webp', 'План Затопленной мельницы', 'atlas'],
    chamber: [hollowmere + 'sunken-bell-chamber.webp', 'Зал утонувшего колокола', 'night'],
    bell: [hollowmere + 'sunken-bell.webp', 'Утонувший колокол', 'night', 'inset'],
    chamberPlan: [hollowmere + 'sunken-bell-chamber--map.webp', 'План зала колокола', 'atlas'],
    village: [hollowmere + 'hollowmere--day.webp', 'Утро в Холлоумире', 'gold'],
  };

  const people = {
    agna: [
      'Агна Бриск',
      'Хозяйка повозки',
      'Староста писал ей каждый месяц. В последнем письме он просил прислать священника. Агна хочет получить ответ.',
      'agna-brisk',
      'gate',
    ],
    hobb: [
      'Хобб Фенвик',
      'Деревенский староста',
      'Подтвердит доставку и даст ночлег. Знает о пропаже звонаря. О своей доле с лодочных стоянок сам разговора не заведёт.',
      'hobb-fenwick',
      'arrival',
    ],
    ilse: [
      'Сестра Ильзе',
      'Хранительница предания',
      'Помнит, как Маттис ушёл караулить колокол. Ночью видела огни возле часовни и лодки без фонарей.',
      'sister-ilse',
      'tower',
    ],
    kerra: [
      'Керра Рид',
      'Старшая Тростниковых плащей',
      'Возила людей к лестнице под часовней за серебро Фонарщика. Безопасность команды для неё важнее очередного рейса.',
      'kerra-reed',
      'mill',
    ],
    matthis: [
      'Старый Маттис',
      'Пропавший звонарь',
      'Слышал приказы Фонарщика. Видел, как при каждом ударе шевелится рыцарь в воде. Хочет выбраться из склепа.',
      'old-matthis',
      'chamber',
    ],
  };
  for (const [key, [name, , , file]] of Object.entries(people)) {
    art[key] = [hollowmere + file + '.webp', name, null, 'inset'];
  }

  const chapters = [
    { numeral: 'I', name: 'Повозка и погреб', art: 'gate' },
    { numeral: 'II', name: 'Колокольня и часовня', art: 'tower' },
    { numeral: 'III', name: 'Затопленная мельница', art: 'mill' },
    { numeral: 'IV', name: 'Склеп и колокол', art: 'chamber' },
  ];
  const places = {
    gate: [
      'Северные ворота',
      'Равенфорд',
      'gate',
      'У ворот висит карта. Отсюда Мельничная дорога ведёт на север, к Ивовому броду.',
    ],
    ford: [
      'Ивовый брод',
      'Мельничная дорога',
      'ford',
      'Мелкая переправа между ивами. Отсюда до деревни шестнадцать миль.',
    ],
    hall: [
      'Дом старосты',
      'Холлоумир',
      'hall',
      'Хобб даёт путникам постели. Под домом — погреб с припасами и лазом в топь.',
    ],
    tower: [
      'Колокольня',
      'Холлоумир',
      'tower',
      'В полночь отсюда слышен звон. К часовне ведёт тропа из деревни.',
    ],
    chapel: [
      'Затонувшая часовня',
      'Туманная топь',
      'chapel',
      'Вода дошла до алтаря. Под плитой открывается ход в склеп, с паперти видны мостки.',
    ],
    mill: [
      'Затопленная мельница',
      'Туманная топь',
      'mill',
      'У пристани стоят лодки. Снаружи можно дотянуться до погрузочного люка.',
    ],
    chamber: [
      'Зал колокола',
      'Под часовней',
      null,
      'Лестница и служебная дверь из ризницы ведут к омуту. У стены держат пленников.',
    ],
    village: [
      'Деревенская площадь',
      'Холлоумир',
      'village',
      'Здесь можно собрать свидетелей и дать каждому рассказать, с чем он вернулся.',
    ],
  };
  const kinds = {
    scene: ['Сцена', 'quill'],
    talk: ['Диалог', 'talk'],
    clue: ['Улика', 'eye'],
    check: ['Проверка', 'die'],
    combat: ['Бой', 'swords'],
    path: ['Переход', 'compass'],
    choice: ['Выбор', 'fork'],
  };
  window.dmLibrary = { art, people, chapters, places, kinds };
})();

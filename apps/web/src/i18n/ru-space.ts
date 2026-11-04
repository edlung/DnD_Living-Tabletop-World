import { registerRussian } from '@ltw/ui';

/**
 * Russian for space and movement (Stage 640f, docs/adr/0049-space-and-movement.md): creature
 * sizes in a square's name, walls, a squeeze, a target too large to take hold of; water, raised
 * ground and pits, flying, crawling, jumping, dropping and falling.
 */
registerRussian({
  // A combatant's size in a square's name
  tiny: 'крошечный',
  small: 'маленький',
  large: 'большой',
  huge: 'огромный',
  gargantuan: 'громадный',
  squeezed: 'протискивается',

  // Walls
  wall: 'стена',
  Wall: 'Стена',
  'Wall: no one stands in it or crosses it': 'Стена: здесь нельзя стоять и проходить',

  // Water and the ground's heights: a square's name, its card, the legend
  water: 'вода',
  'deep water': 'глубокая вода',
  'raised {feet} ft': 'возвышение {feet} фт',
  'a pit {feet} ft deep': 'яма глубиной {feet} фт',
  Water: 'Вода',
  'Deep water': 'Глубокая вода',
  'Raised ground': 'Возвышение',
  Pit: 'Яма',
  'Water: swum, at double cost without a Swim Speed':
    'Вода: её переплывают, без Скорости плавания — за двойную цену',
  'Deep water: swum, and fought in under water':
    'Глубокая вода: её переплывают, бой идёт под водой',
  'Raised {feet} ft: climbed from below': 'Возвышение {feet} фт: снизу на него взбираются',
  'A pit {feet} ft deep: climbed down, dropped into or jumped':
    'Яма глубиной {feet} фт: в неё спускаются, спрыгивают или её перепрыгивают',

  // A combatant above or below its ground
  '{feet} ft up': 'на высоте {feet} фт',
  underground: 'под землёй',

  // The ways to move in the turn tray, and their cost
  'Land here': 'Приземлиться здесь',
  'Crawl here': 'Ползти сюда',
  'Jump here': 'Прыгнуть сюда',
  'Drop down here': 'Спрыгнуть сюда',
  'Fly up {feet} ft': 'Взлететь на {feet} фт',
  'Fly down {feet} ft': 'Снизиться на {feet} фт',
  'about {feet} ft': 'около {feet} фт',
  'a fall of {feet} ft': 'падение {feet} фт',

  // The side panel's lines on the ways to a square
  'Moving stands you up first, for half your Speed.':
    'Сначала вы встанете — это половина вашей Скорости.',
  'Landing there: about {feet} ft in all.': 'С приземлением там: всего около {feet} фт.',
  'Crawling there: about {feet} ft, and you stay Prone.':
    'Ползком туда: около {feet} фт, и вы остаётесь сбиты с ног.',
  'Jumping there: {feet} ft. A long jump clears your Strength score in feet after 10 ft on foot, half that standing; landing in Difficult Terrain asks a DC 10 Acrobatics check.':
    'Прыжок туда: {feet} фт. В длину вы прыгаете на столько футов, каково значение Силы, после разбега в 10 фт, и вдвое меньше с места; приземление на трудную местность требует проверки Акробатики Сл 10.',
  'Dropping down: a fall of {feet} ft, 1d6 Bludgeoning damage per 10 ft, and Prone.':
    'Спрыгнуть: падение с {feet} фт — 1к6 дробящего урона за каждые 10 фт, и вы сбиты с ног.',

  // What came of a move
  'You are {feet} ft up.': 'Вы на высоте {feet} фт.',
  'You are {feet} ft underground.': 'Вы на глубине {feet} фт под землёй.',
  'Landing: Acrobatics {total}, you keep your feet.':
    'Приземление: Акробатика {total}, вы устояли на ногах.',
  'Landing: Acrobatics {total}, you fall Prone.':
    'Приземление: Акробатика {total}, вы сбиты с ног.',
  'You fall {feet} ft and take {damage} damage.':
    'Вы падаете с {feet} фт и получаете {damage} урона.',
  'You are Prone.': 'Вы сбиты с ног.',

  // Feather Fall, the reaction to a fall
  '{name} falls {feet} ft.': '{name} падает с высоты {feet} фт.',
  'Feather Fall slows up to five of them within 60 ft: they land on their feet, unharmed.':
    'Падение пёрышком замедляет до пяти из них в пределах 60 фт: они приземляются на ноги без урона.',
  'Feather Fall spends your Reaction and a level 1 slot or higher.':
    'Падение пёрышком тратит вашу реакцию и ячейку 1-го круга или выше.',
  'Let them fall': 'Не вмешиваться',
  'Feather Fall: the falling drift down and land on their feet, unharmed.':
    'Падение пёрышком: падающие плавно опускаются и приземляются на ноги без урона.',
  'You fall; a reaction may slow you.': 'Вы падаете; чья-то реакция может замедлить падение.',
  '{names} falling: Feather Fall may slow the fall.':
    'Падают: {names}. Падение пёрышком может замедлить падение.',

  // Mounted combat
  Mount: 'Сесть верхом',
  Dismount: 'Спешиться',
  'Mount {target}': 'Сесть верхом на: {target}',
  'Dismount here': 'Спешиться сюда',
  'half your Speed': 'половина Скорости',
  'ridden by {name}': 'на нём верхом {name}',
  'Climb onto a willing creature a size larger beside you, for half your Speed: you share its space and go where it goes.':
    'Сесть на согласное существо крупнее вас на размер рядом с вами, за половину Скорости: вы делите с ним пространство и движетесь вместе с ним.',
  'Get down beside your mount, for half your Speed.':
    'Спешиться рядом со скакуном, за половину Скорости.',
  'Getting down here takes half your Speed; your mount stays where it is.':
    'Спешиться сюда — половина вашей Скорости; скакун остаётся на месте.',
  'You ride: your mount carries you on its turn, or get down beside it.':
    'Вы верхом: скакун несёт вас в свой ход, или спешьтесь рядом с ним.',

  // Light and sight (docs/adr/0050-the-world-around.md §1–4)
  'Light of the fight': 'Освещение боя',
  Bright: 'Яркий свет',
  Dim: 'Тусклый свет',
  Darkness: 'Темнота',
  'Dim light': 'Тусклый свет',
  'dim light': 'тусклый свет',
  darkness: 'темнота',
  'lightly obscured': 'слабая заслонённость',
  'heavily obscured': 'сильная заслонённость',
  'The light of the fight: bright': 'Освещение боя: яркий свет',
  'The light of the fight: dim': 'Освещение боя: тусклый свет',
  'The light of the fight: darkness': 'Освещение боя: темнота',
  'set the light of the fight': 'изменить освещение боя',

  // Breath under water (docs/adr/0050-the-world-around.md §8)
  'holding its breath, {rounds} rounds left': 'задерживает дыхание, осталось раундов: {rounds}',
  'out of breath': 'задыхается',

  // A refusal's reason
  'too large': 'слишком велик',
  'no fly speed': 'не умеет летать',
  'no burrow speed': 'не умеет рыть',
  'jump too far': 'так далеко не прыгнуть',
  mounted: 'вы уже верхом',
  'not mounted': 'вы не верхом',
  'not willing': 'существо не согласно нести вас',
  'mount too small': 'скакун должен быть крупнее вас на размер',
  'mount taken': 'на нём уже кто-то едет',
  'mounted this turn': 'садиться или спешиваться можно раз за перемещение',
  'controlled mount': 'подконтрольный скакун может только Рывок, Отход или Уклонение',
});

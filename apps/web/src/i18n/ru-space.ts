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

  // A refusal's reason
  'too large': 'слишком велик',
  'no fly speed': 'не умеет летать',
  'no burrow speed': 'не умеет рыть',
  'jump too far': 'так далеко не прыгнуть',
});

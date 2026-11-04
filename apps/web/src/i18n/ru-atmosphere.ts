import { registerRussian } from '@ltw/ui';

/**
 * Russian for the table's atmosphere (docs/adr/0059-atmosphere.md, Stage 690): the ambience and
 * the DM's choice of it, the "Sound on" button, each screen's sound and its volume.
 */
registerRussian({
  // A screen's sound
  'Sound on': 'Включить звук',
  'Turn the sound off': 'Выключить звук',
  'Turn the sound on': 'Включить звук',
  'Sound and motion': 'Звук и движение',
  'The table’s sound: ambience and music': 'Звук стола: фон и музыка',
  'Volume of the table’s sound': 'Громкость звука стола',

  // The DM's choice
  'The table’s sound': 'Звук стола',
  'By the scene': 'По сцене',
  Rain: 'Дождь',
  Wind: 'Ветер',
  Fire: 'Огонь',
  Crowd: 'Толпа',
  Night: 'Ночь',
  'No sound': 'Без звука',
  'By the scene, the table is quiet until a scene is played.':
    'По сцене: пока сцена не идёт, за столом тихо.',
  'Now by the scene: {sound}.': 'Сейчас по сцене: {sound}.',
  'It plays on the table’s screen and, online, on every screen.':
    'Звучит на экране стола, а в онлайн-игре — на каждом экране.',
});

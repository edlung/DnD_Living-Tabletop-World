import { registerRussian } from '@ltw/ui';

/**
 * Russian for the table's atmosphere (docs/adr/0059-atmosphere.md, Stage 690): the ambience and
 * the DM's choice of it, the "Sound on" button, each screen's sound and its volume, the DM's music.
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

  // The DM's music
  Music: 'Музыка',
  'Playing: {title}': 'Играет: {title}',
  'Paused: {title}': 'На паузе: {title}',
  'on repeat': 'по кругу',
  Pause: 'Пауза',
  Stop: 'Остановить',
  'No tracks yet.': 'Треков пока нет.',
  Tracks: 'Треки',
  '{size} MB': '{size} МБ',
  'Delete “{title}”?': 'Удалить «{title}»?',
  'Play once': 'Сыграть один раз',
  'Play once: {title}': 'Сыграть один раз: {title}',
  'Play on repeat': 'Играть по кругу',
  'Play on repeat: {title}': 'Играть по кругу: {title}',
  'MP3, OGG, M4A or WAV, up to 15 MB each; thirty tracks at most.':
    'MP3, OGG, M4A или WAV, до 15 МБ каждый; не больше тридцати треков.',
  'Add a track': 'Добавить трек',
  'Adding the track…': 'Добавляем трек…',
  'This file is larger than 15 MB.': 'Этот файл больше 15 МБ.',
  'This file is not an MP3, OGG, M4A or WAV sound.': 'Это не звуковой файл MP3, OGG, M4A или WAV.',
  'Thirty tracks are kept already. Delete one first.':
    'Уже хранится тридцать треков. Сначала удалите один.',
  'The track could not be added. Try again.': 'Не удалось добавить трек. Попробуйте ещё раз.',
});

import { registerRussian } from '@ltw/ui';

/** Russian for a place's own sound (docs/adr/0073-table-ideas.md §6): kept where the DM shows it. */
registerRussian({
  'The sound of {place}': 'Звук места: {place}',
  'When you show this place, the table’s sound changes to what is kept here; music starts from its beginning, on repeat. “Leave as it is” changes nothing; “No sound” silences the ambience. You can change it afterwards in Session.':
    'Когда вы покажете это место, звук стола сменится на сохранённый здесь; музыка заиграет с начала, по кругу. «Оставить как есть» ничего не меняет, «Без звука» выключает фон. Потом звук можно изменить в «Сессии».',
  'If the place the party is in has a kept sound, showing it switches that sound on.':
    'Если для места, где сейчас отряд, сохранён звук, при показе он включится.',
  'This place’s sound could not be read. Showing the place may still switch it on.':
    'Не удалось прочитать звук места. При показе он всё равно может включиться.',
  Ambience: 'Фон',
  'Leave as it is': 'Оставить как есть',
  'The kept track': 'Сохранённый трек',
  'The kept track was deleted: this place now brings no music.':
    'Сохранённый трек удалён: музыку это место больше не включает.',
  'Add a track in Session to choose it here.': 'Добавьте трек в «Сессии», чтобы выбрать его здесь.',
  'Keep this sound for the place': 'Сохранить звук для места',
  'Remove this place’s sound': 'Убрать звук места',
  'Removed.': 'Убрано.',
  'That was not kept. Try again.': 'Не сохранилось. Попробуйте ещё раз.',
  'Showing the place changed the table’s sound: ambience and music.':
    'Вместе с местом сменился звук стола: фон и музыка.',
  'Showing the place changed the table’s sound: ambience.': 'Вместе с местом сменился звук стола: фон.',
  'Showing the place changed the table’s sound: music.':
    'Вместе с местом сменился звук стола: музыка.',
  'this place': 'это место',
});

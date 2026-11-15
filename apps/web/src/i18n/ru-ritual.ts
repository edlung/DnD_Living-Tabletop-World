import { registerRussian } from '@ltw/ui';

/** Russian for the evening's ritual (docs/adr/0071-memory-and-ritual.md §1): closing, the chapter, "Previously…". */
registerRussian({
  // The chapter's writer
  'Chapter {number}': 'Глава {number}',
  Covers: 'О чём',
  '“{title}” only': 'Только «{title}»',
  'The whole story so far': 'Вся история с начала',
  // "Previously…": the same words as the table screen's "Last time"
  'Previously…': 'В прошлый раз…',
  'Read the recap': 'Читать целиком',
  'Hide the recap': 'Скрыть',
  'Close the recap': 'Свернуть',
  'Open in the Chronicle': 'Открыть в хронике',
  'Open with “Previously…” on the table’s screen': 'Начать с «В прошлый раз…» на экране стола',
  'The table’s screens show this now. Read it aloud, then show the scene.':
    'Это сейчас на экранах стола. Прочитайте вслух, затем покажите сцену.',
  'No screen is paired, so read it aloud from here. Then show the scene.':
    'Экран не подключён, поэтому прочитайте вслух отсюда. Затем покажите сцену.',
  'Show the scene': 'Показать сцену',
  'The scene is on the table’s screens.': 'На экранах стола — сцена.',
  // Closing the evening
  'The evening’s moments': 'Моменты вечера',
  'Reading the evening’s moments…': 'Собираем моменты вечера…',
  'The evening’s moments could not be read. You can still end the session.':
    'Не удалось загрузить моменты вечера. Сессию всё равно можно завершить.',
  'Nothing new to keep: the party already remembers what the game noted tonight.':
    'Новых моментов нет: отряд уже помнит всё, что игра отметила за вечер.',
  'Tick what the party should remember. The chapter is written from the party’s memories.':
    'Отметьте, что отряд должен запомнить. Из воспоминаний отряда сложится глава.',
  'A fight': 'Бой',
  'Accounts disagree': 'Версии расходятся',
  'What mattered most tonight, in your own words (optional)':
    'Главное за вечер своими словами — одна-две строки (необязательно)',
  'It goes into the chapter as written, and the party reads it. Say it as the party would: “We swore to find the caravan.”':
    'Попадёт в главу как есть, и отряд это прочтёт. Скажите от лица отряда: «Мы поклялись найти караван».',
  'When the session ends': 'Когда сессия завершится',
  'Write a chapter about this session': 'Написать главу об этой сессии',
  'The story of this session as the party saw it. Players read it in the Chronicle, and it opens the next session as “Previously…”. To undo something from tonight later, you will first have to undo the chapter.':
    'История этой сессии глазами отряда. Игроки прочтут её в хронике, а следующая сессия начнётся с неё — «В прошлый раз…». Чтобы позже отменить что-то из событий вечера, сначала придётся отменить саму главу.',
  'Keeping the moments…': 'Сохраняем моменты…',
  'Ending the session…': 'Завершаем сессию…',
  'Writing the chapter… A narrator can take a minute or two.':
    'Пишем главу… Рассказчику может понадобиться минута-другая.',
  'The DM’s line at the end of the session': 'Строка мастера в конце сессии',
  'The evening’s moments could not all be kept, and the session is still open. Moments kept so far: {count}. Try again.':
    'Не все моменты вечера удалось сохранить, сессия ещё открыта. Сохранено моментов: {count}. Попробуйте снова.',
  'The session could not be ended. Moments kept so far: {count}. Try again.':
    'Не удалось завершить сессию. Сохранено моментов: {count}. Попробуйте снова.',
  'Moments kept: {count}.': 'Сохранено моментов: {count}.',
  'Not kept — the game did not accept it: “{words}”':
    'Не сохранено — игра не приняла этот момент: «{words}»',
  'Players can read it in the Chronicle. Next time, start with “Previously…”.':
    'Игроки прочтут её в хронике. В следующий раз начните с «В прошлый раз…».',
  'No chapter this time: the party kept no memories of this session. Next time, tick a moment or add a line of your own before you end.':
    'Главы в этот раз нет: у отряда не осталось воспоминаний об этой сессии. В следующий раз отметьте момент или добавьте свою строку перед завершением.',
  'The chapter could not be written. Try again, or write it later in the Chronicle (“Write a chapter (DM)”).':
    'Главу написать не удалось. Попробуйте снова или напишите её позже в хронике («Написать главу (мастер)»).',
  'Try the chapter again': 'Написать главу ещё раз',
  'Open the chapter': 'Открыть главу',
});

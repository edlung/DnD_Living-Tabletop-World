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
  // Stars and wishes (ADR 0071 §2)
  'Stars and wishes': 'Звёзды и пожелания',
  'Stars of the evening': 'Звёзды вечера',
  'The evening’s stars': 'Звёзды вечера',
  'A star for tonight: what did you like? A wish for next time: what do you want?':
    'Звезда за сегодня: что понравилось? Пожелание на следующий раз: чего хочется?',
  'Write on your own screen, or tell the DM. Stars appear here; wishes go only to the DM.':
    'Напишите на своём экране или скажите мастеру. Звёзды появятся здесь, пожелания прочтёт только мастер.',
  'The game is over: “{title}”. Leave a star — what you liked — and a wish for next time.':
    'Игра окончена: «{title}». Оставьте звезду — что понравилось — и пожелание на следующий раз.',
  'Your star and wish were taken away.': 'Звезда и пожелание убраны.',
  'Your star (everyone reads it)': 'Звезда (её видят все)',
  'Your wish (only the DM reads it)': 'Пожелание (его читает только мастер)',
  'You can change them until the next game.': 'Их можно менять до следующей игры.',
  'Write mine': 'Написать',
  'Change mine': 'Изменить',
  'A star: what did you like best?': 'Звезда: что понравилось больше всего?',
  'Everyone at the table reads your star. It also shows on the table’s screen.':
    'Звезду увидят все за столом, она появится и на общем экране.',
  'A wish: what do you want next time?': 'Пожелание: чего хочется в следующий раз?',
  'Only the DM reads your wish. The other players never see it.':
    'Пожелание прочтёт только мастер. Другие игроки его не увидят.',
  'They were not kept. Your words are still here — try again.':
    'Не получилось сохранить. Текст на месте — попробуйте ещё раз.',
  'Keep them': 'Сохранить',
  'Not now': 'Не сейчас',
  'Everyone’s stars: {count}': 'Все звёзды вечера: {count}',
  'The DM': 'Мастер',
  'Someone at the table': 'Кто-то за столом',
  'Show the stars on the table’s screens': 'Показать звёзды на экранах стола',
  'The table’s screens show the stars. Wishes stay with you.':
    'На экранах стола — звёзды. Пожелания остаются у вас.',
  'The stars could not be shown on the table’s screens. Try again.':
    'Не удалось показать звёзды на экранах стола. Попробуйте ещё раз.',
  'Earlier evenings': 'Прошлые вечера',
  'Nobody has written yet. Players write on their own screens; you can write for someone who said it aloud.':
    'Пока никто не написал. Игроки пишут на своих экранах; за того, кто сказал вслух, можете записать вы.',
  'Nothing was written for this evening.': 'За этот вечер ничего не написали.',
  'Stars — everyone reads them': 'Звёзды — их видят все',
  'No stars yet.': 'Звёзд пока нет.',
  'Wishes: {count} — only you read them': 'Пожелания: {count} — их видите только вы',
  'No wishes yet.': 'Пожеланий пока нет.',
  'Write a star and a wish for someone': 'Записать звезду и пожелание за кого-то',
  'Whose words': 'Чьи слова',
  'Mine (the DM)': 'Мои (мастера)',
  '{name} has already written. You are changing their words.':
    '{name}: слова уже записаны. Вы меняете их.',
  'Star (everyone reads it)': 'Звезда (её видят все)',
  'Wish (only you read it)': 'Пожелание (его видите только вы)',
  'Kept for {name}.': 'Сохранено: {name}.',
  'Ask everyone for stars and wishes on the table’s screens':
    'Предложить всем звёзды и пожелания — на экранах стола',
  'Everyone names a star — what they liked, read by all — and a wish for next time, read only by you. Players write on their own screens either way; you can write for a child who says it aloud.':
    'Каждый называет звезду — что понравилось, её видят все — и пожелание на следующий раз, его читаете только вы. Игроки в любом случае пишут на своих экранах; за ребёнка, который сказал вслух, можете записать вы.',
  // The next game (ADR 0071 §3)
  'Next game:': 'Следующая игра:',
  'The next game': 'Следующая игра',
  'Add to calendar': 'В календарь',
  'No date yet. Set one, and everyone sees it in the campaign and in their campaign list.':
    'Даты пока нет. Назначьте её — все увидят её в кампании и в своём списке кампаний.',
  'Day and time': 'День и время',
  'Choose the day and the time first.': 'Сначала выберите день и время.',
  'That time has already passed. Choose a later one.': 'Это время уже прошло. Выберите другое.',
  'A note for everyone (optional)': 'Пара слов для всех (необязательно)',
  'At Grandma’s; bring snacks': 'У бабушки; захватите угощение',
  'Change the date': 'Изменить дату',
  'Set the date': 'Назначить дату',
  'Remove the date': 'Убрать дату',
  'The date is set. Everyone at the table sees it.': 'Дата назначена. Её видят все за столом.',
  'The date is removed. Set it again if that was a slip.':
    'Дата убрана. Если это вышло случайно, назначьте её снова.',
  'The date could not be set. Check the day and the time, then try again.':
    'Дату назначить не удалось. Проверьте день и время и попробуйте снова.',
  'The date could not be removed. Try again.': 'Дату убрать не удалось. Попробуйте снова.',
});

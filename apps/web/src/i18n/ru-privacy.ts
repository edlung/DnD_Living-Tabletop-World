import { registerRussian } from '@ltw/ui';

/**
 * Russian for a person's data (docs/adr/0062-account-privacy.md, Stage 699a): the privacy notice,
 * the account's copy of its data and deleting the account.
 */
registerRussian({
  'Privacy notice': 'Конфиденциальность',
  Language: 'Язык',
  'Living Tabletop World keeps only what the game needs. Here is what that is, why, who sees it, how long it stays, and how you take a copy or delete your account.':
    'Живой настольный мир хранит только то, что нужно игре. Здесь сказано, что это, зачем, кто это видит, сколько хранится и как получить копию или удалить учётную запись.',
  'What is kept': 'Что хранится',
  'Your account: the login you chose, a hash of your password (never the password itself) and the name the table sees. No e-mail, no phone number.':
    'Учётная запись: логин, который вы выбрали, хэш пароля (сам пароль — никогда) и имя, которое видит стол. Ни почты, ни телефона.',
  'Your campaigns: which ones you sit in, your characters, and each campaign’s story as it is played.':
    'Кампании: в каких вы играете, ваши персонажи и история каждой кампании по мере игры.',
  'What you write and roll: your chat messages and your dice rolls.':
    'Что вы пишете и бросаете: ваши сообщения в чате и броски кубиков.',
  'Your sign-ins: when each began and when it ends, to keep you signed in. Cookies hold these sign-ins and nothing else.':
    'Входы: когда каждый начался и когда закончится — чтобы вы оставались в игре. Cookie хранят только эти входы.',
  Why: 'Зачем',
  'To play: to show each person what their character knows, to keep the story, and to let you come back.':
    'Чтобы играть: показывать каждому то, что знает его персонаж, хранить историю и пускать вас обратно.',
  'Who sees it': 'Кто видит',
  'The people at your table, each as much as their character perceives, and the DM, who sees the whole campaign. The operator of the server can read its database to keep it running and safe.':
    'Люди за вашим столом — каждый столько, сколько воспринимает его персонаж, — и мастер, который видит всю кампанию. Оператор сервера может читать его базу, чтобы сервер работал и был защищён.',
  'What leaves the server': 'Что уходит с сервера',
  'Nothing, unless the server’s owner turns AI on. Then the text of a scene, an action or a question goes to the AI provider the owner chose, to write the narration or a character’s words; your login, your password and your sign-ins never do. Pictures come from the game’s own set unless the owner turns their making on.':
    'Ничего, если владелец сервера не включил ИИ. Тогда текст сцены, действия или вопроса уходит выбранному владельцем поставщику ИИ, чтобы написать рассказ или слова персонажа; ваш логин, пароль и входы — никогда. Картины берутся из собственного набора игры, если владелец не включил их создание.',
  'How long': 'Сколько хранится',
  'As long as your account and your campaigns exist. The server’s backups keep earlier states for up to two months, then they are gone.':
    'Пока существуют ваша учётная запись и кампании. Резервные копии сервера хранят прежние состояния до двух месяцев, потом исчезают.',
  'No tracking, no advertising': 'Без слежки и рекламы',
  'The game counts nothing about you for anyone else, shows no advertising and loads nothing from other sites.':
    'Игра ничего не считает о вас для других, не показывает рекламу и ничего не загружает с чужих сайтов.',
  'Your copy, and deleting your account': 'Копия ваших данных и удаление учётной записи',
  'On your account’s page, “Download my data” saves a copy: your account, your sign-ins and, in each campaign, your characters, your messages and your rolls. “Delete my account” forgets your login, your name and your password and signs you out everywhere; your characters stay in their campaigns’ story. A DM’s account is deleted by the server’s operator, so that no campaign loses its DM.':
    'На странице учётной записи «Скачать мои данные» сохраняет копию: учётную запись, входы и в каждой кампании ваших персонажей, сообщения и броски. «Удалить учётную запись» забывает ваш логин, имя и пароль и выводит вас отовсюду; персонажи остаются в истории своих кампаний. Учётную запись мастера удаляет оператор сервера, чтобы ни одна кампания не осталась без мастера.',
  Questions: 'Вопросы',
  'Ask your DM, or the person who runs the server you play on.':
    'Спросите своего мастера или того, кто ведёт сервер, на котором вы играете.',
  'Back to the game': 'Вернуться к игре',
  'Your data': 'Ваши данные',
  'What the game keeps about you, why, and for how long:':
    'Что игра хранит о вас, зачем и сколько:',
  'the privacy notice': 'конфиденциальность',
  'Download my data': 'Скачать мои данные',
  'Delete my account': 'Удалить учётную запись',
  'Delete your account?': 'Удалить учётную запись?',
  'Your login, your name and your password are forgotten and every device signs out. Your characters stay in their campaigns’ story, and their DMs see their seats empty. This cannot be undone.':
    'Ваш логин, имя и пароль будут забыты, все устройства выйдут. Персонажи останутся в истории своих кампаний, а мастера увидят их места свободными. Это нельзя отменить.',
  'Your login': 'Ваш логин',
  'Your password': 'Ваш пароль',
  'Type your login as it is, and your password.': 'Введите свой логин как есть и пароль.',
  'You are the DM of a campaign: the server’s operator deletes a DM’s account.':
    'Вы мастер кампании: учётную запись мастера удаляет оператор сервера.',
  'The login or the password is not right.': 'Логин или пароль не подходят.',
  'Deleting…': 'Удаляем…',
  'Keep my account': 'Оставить учётную запись',
  'Your account is deleted': 'Учётная запись удалена',
  'Its login, its name and its password are gone, and every device is signed out.':
    'Её логина, имени и пароля больше нет, все устройства вышли.',
});

import { registerRussian } from '@ltw/ui';

/**
 * Russian for accounts (docs/adr/0041-accounts.md, Stage 600): signing in with a login, the join
 * page's choice, the hub, saving a seat, a password reset, and the DM's logins and reset links in
 * the Players sheet. The DM is «мастер», as in the rest of the client; names stay nominative and
 * lead their sentence (docs/adr/0031-play-language.md §5).
 */
registerRussian({
  // Signing in
  Login: 'Логин',
  Password: 'Пароль',
  'Enter your login.': 'Введите логин.',
  'Enter your password.': 'Введите пароль.',
  'Too many tries. Wait a few minutes, then try again.':
    'Слишком много попыток. Подождите несколько минут и попробуйте снова.',
  'The table could not be reached. Check your connection, then try again.':
    'Не удалось связаться со столом. Проверьте подключение и попробуйте снова.',
  'That login and password do not match.': 'Логин и пароль не подходят.',
  'Signing in…': 'Входим…',
  'Sign in': 'Войти',
  'Welcome back': 'С возвращением',
  'Sign in to your table': 'Вход за игровой стол',
  'Your new password is set. Sign in with it.': 'Новый пароль задан. Войдите с ним.',
  'New at the table? Open the invitation link your DM sent you: it seats you and makes your login.':
    'Впервые за столом? Откройте ссылку-приглашение от мастера: она даст вам место и создаст логин.',
  'An invitation link works once. A seat taken without a login stays in that browser for up to {days} days.':
    'Ссылка-приглашение срабатывает один раз. Место без логина хранится в том браузере до {days} дней.',
  'Your login is still signed in here: your other campaigns are a step away.':
    'Ваш логин здесь всё ещё активен: остальные кампании — в одном шаге.',
  'Sign in with your login, or open a new invitation link.':
    'Войдите по логину или откройте новую ссылку-приглашение.',
  'Your login signs out of this browser too. Sign in with it to come back.':
    'Логин тоже выйдет из этого браузера. Чтобы вернуться, войдите по нему.',

  // A new login
  'Your name at the table': 'Ваше имя за столом',
  'Enter the name the table will see.': 'Введите имя, которое увидят за столом.',
  '3–32 Latin letters, digits, dots, dashes or underscores.':
    '3–32 латинские буквы, цифры, точки, дефисы или подчёркивания.',
  'Use 3–32 Latin letters, digits, dots, dashes or underscores.':
    'Используйте 3–32 латинские буквы, цифры, точки, дефисы или подчёркивания.',
  'That login is taken. Choose another one.': 'Этот логин занят. Выберите другой.',
  'At least 10 characters. A short phrase is easy to remember.':
    'Не меньше 10 символов. Короткую фразу легко запомнить.',
  'Use at least 10 characters.': 'Нужно не меньше 10 символов.',

  // The join page
  'This invitation link seats you at a table. It works once.':
    'По этой ссылке-приглашению вы займёте место за столом. Она срабатывает один раз.',
  'How will you come back to this table?': 'Как вы будете возвращаться за этот стол?',
  'Create a login': 'Создать логин',
  'Come back from any device with your login and password.':
    'Возвращайтесь с любого устройства по логину и паролю.',
  'I have a login': 'У меня есть логин',
  'This table joins the campaigns of your login.': 'Этот стол добавится к кампаниям вашего логина.',
  'Only this browser': 'Только этот браузер',
  'No login: you come back only in this browser, for up to {days} days.':
    'Без логина: вернуться можно только в этом браузере, до {days} дней.',
  'Your login already has a seat at this table. Open it from your campaigns.':
    'У вашего логина уже есть место за этим столом. Откройте его из своих кампаний.',

  // A password reset
  'A password reset': 'Сброс пароля',
  'Set a new password': 'Задайте новый пароль',
  'This link sets a new password for your login once. Your other devices sign in again.':
    'Эта ссылка один раз задаёт новый пароль вашего логина. На других устройствах нужно будет войти заново.',
  'New password': 'Новый пароль',
  'This reset link cannot be used. Ask your DM for a new one.':
    'Эту ссылку для сброса нельзя использовать. Попросите у мастера новую.',
  'Saving…': 'Сохраняем…',
  'Set the new password': 'Задать новый пароль',

  // The hub
  'My campaigns': 'Мои кампании',
  'Opening your campaigns…': 'Открываем ваши кампании…',
  'Your campaigns could not be read.': 'Не удалось прочитать ваши кампании.',
  'Signed in as {name}': 'Вы вошли как {name}',
  'Your campaigns': 'Ваши кампании',
  'No campaign yet. Start one from a ready adventure below, or open the invitation link your DM sent.':
    'Кампаний пока нет. Начните новую из готового приключения ниже или откройте ссылку-приглашение от мастера.',
  'Lead a new campaign': 'Провести новую кампанию',
  'A fresh copy of a ready adventure with you as its DM; invite your players from the Players sheet.':
    'Новая копия готового приключения, мастер в ней — вы; игроков пригласите на листе «Игроки».',
  'The Bells of Hollowmere': 'Холлоумир: колокола в тумане',
  'For a new party: levels 1 to 5 by milestones, four ready-made characters or your own.':
    'Для нового отряда: уровни с 1-го по 5-й по вехам, четыре готовых персонажа или свои.',
  'The Missing Caravan': 'Пропавший караван',
  'A one-shot for a party of level 15.': 'Приключение на один вечер для отряда 15-го уровня.',
  'In English': 'На английском',
  'In Russian': 'На русском',
  '{language}: {adventure}': '{language}: {adventure}',
  'Preparing the adventure…': 'Готовим приключение…',
  'You already lead ten campaigns of your own.': 'Вы уже ведёте десять своих кампаний.',
  'That campaign cannot be opened now.': 'Эту кампанию сейчас нельзя открыть.',
  'You are the DM': 'Вы — мастер',
  'You play {name}': 'Ваш персонаж: {name}',
  'Open {campaign}: {who}': 'Открыть: {campaign} — {who}',
  'Opening…': 'Открываем…',
  Open: 'Открыть',
  'Your account': 'Ваша учётная запись',
  'Login: {login}': 'Логин: {login}',
  'Save the name': 'Сохранить имя',
  'Your name is saved.': 'Имя сохранено.',
  'Your name could not be saved.': 'Не удалось сохранить имя.',
  'Current password': 'Текущий пароль',
  'Change the password': 'Сменить пароль',
  'Your password is changed. Other devices sign in again.':
    'Пароль изменён. На других устройствах нужно войти заново.',
  'The current password is not right.': 'Текущий пароль неверен.',
  'Your password could not be changed.': 'Не удалось изменить пароль.',

  // Saving a seat to a login
  'Save my seat': 'Сохранить место',
  'Save your seat to a login': 'Сохраните место за логином',
  'With a login you come back to this table from any device, and find all your campaigns in one place.':
    'С логином вы вернётесь за этот стол с любого устройства, а все ваши кампании будут в одном месте.',
  'This seat is saved to a login already.': 'Это место уже сохранено за логином.',
  'The seat could not be saved. Check your connection, then try again.':
    'Не удалось сохранить место. Проверьте подключение и попробуйте снова.',
  'Not now': 'Не сейчас',

  // The DM's Players sheet
  'No login: this player comes back only in the browser they joined in.':
    'Без логина: игрок вернётся только в том браузере, где присоединился.',
  'Password reset link: {name}': 'Ссылка для сброса пароля: {name}',
  'Password reset link': 'Ссылка для сброса пароля',
  'Password reset link for {name}': 'Ссылка для сброса пароля: {name}',
  'Give it to the player of {name} only: it sets a new password for their login, once.':
    '{name}: отдайте ссылку только игроку этого персонажа — она один раз задаёт новый пароль его логина.',
  'QR code of the invitation link for {name}': 'QR-код ссылки-приглашения: {name}',
  'QR code of the password reset link for {name}': 'QR-код ссылки для сброса пароля: {name}',
  'Copied. Give it to the player privately.': 'Скопировано. Передайте ссылку игроку лично.',
  'It expires {when}.': 'Истекает: {when}.',
  'Scan it with the phone’s camera.': 'Отсканируйте камерой телефона.',
  'That player has no login: they come back only in the browser they joined in.':
    'У этого игрока нет логина: он вернётся только в том браузере, где присоединился.',
  'That login also plays at other tables: the operator gives its reset link.':
    'Этот логин играет и за другими столами: ссылку для сброса выдаёт оператор.',
  'The answer was lost on the way. Ask for a new reset link.':
    'Ответ потерялся по дороге. Запросите новую ссылку для сброса.',
});

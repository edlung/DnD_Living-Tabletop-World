import { registerRussian } from '@ltw/ui';

/**
 * Russian for production sign-in in the browser (docs/adr/0036-production-sign-in.md §7;
 * docs/STAGE_340_DESIGN.md "Browser"): joining by invitation, signed out, signing out, and the
 * DM's Players sheet. Keys are the English source strings; names stay nominative
 * (docs/adr/0031-play-language.md §5), so sentences about a character lead with the name.
 */
registerRussian({
  Russian: 'Русский',
  English: 'Английский',
  'Campaign workshop': 'Мастерская кампаний',
  'A place for the worlds you want to create.': 'Место для миров, которые вы хотите создать.',
  'Opening your workshop…': 'Открываем мастерскую…',
  'Loading workshop tools…': 'Загружаем инструменты мастерской…',
  'Workshop tools could not be loaded': 'Не удалось загрузить инструменты мастерской',
  'Your saved drafts are kept. Reload the workshop to try again.':
    'Ваши черновики сохранены. Перезагрузите мастерскую, чтобы попробовать снова.',
  'Reload workshop': 'Перезагрузить мастерскую',
  'You are invited to a workshop': 'Вас пригласили в мастерскую',
  'Keep your campaign ideas and drafts together in your private workshop.':
    'Храните идеи и черновики кампаний в своей приватной мастерской.',
  'The invitation is used only when you choose to enter.':
    'Приглашение используется только после вашего решения войти.',
  'Enter the workshop': 'Войти в мастерскую',
  'Replace your workshop sign-in?': 'Заменить вход в мастерскую?',
  'This browser already has a workshop open. Your game session stays separate.':
    'В этом браузере уже открыта мастерская. Вход в игру остаётся отдельным.',
  'Keeping it leaves this invitation unused. Replacing it opens the invited workshop instead.':
    'Если оставить текущий вход, приглашение сохранится. При замене откроется мастерская из приглашения.',
  'Keep my workshop': 'Оставить мою мастерскую',
  'Open the invited workshop': 'Открыть мастерскую из приглашения',
  'Back to the workshop': 'К мастерской',
  'The workshop could not be reached': 'Не удалось связаться с мастерской',
  'Open your workshop with an invitation': 'Вход в мастерскую по приглашению',
  'Your workshop is private. Open an invitation link to sign in to it.':
    'Ваша мастерская приватна. Для входа откройте ссылку-приглашение.',
  'Start a campaign draft': 'Начать черновик кампании',
  'Give your idea a name and choose the language of your campaign.':
    'Назовите свою идею и выберите язык кампании.',
  'Your drafts': 'Ваши черновики',
  'Refresh drafts': 'Обновить черновики',
  'Reading your drafts…': 'Читаем черновики…',
  'The drafts could not be read. Try again.': 'Не удалось прочитать черновики. Попробуйте снова.',
  'Your first campaign starts with a draft.': 'Ваша первая кампания начинается с черновика.',
  'More drafts': 'Ещё черновики',
  'Campaign title': 'Название кампании',
  'Campaign language': 'Язык кампании',
  'Saving draft…': 'Сохраняем черновик…',
  'Retry saving draft': 'Повторить сохранение',
  'Create draft': 'Создать черновик',
  'Your draft is saved in this workshop.': 'Черновик сохранён в этой мастерской.',
  'The answer could not be confirmed. Retry to save the same draft.':
    'Ответ не удалось подтвердить. Повторите сохранение того же черновика.',
  'Sign out of workshop': 'Выйти из мастерской',
  'Sign out of workshop?': 'Выйти из мастерской?',
  'Your drafts stay saved. To return, open a new workshop invitation.':
    'Черновики сохранятся. Чтобы вернуться, откройте новое приглашение в мастерскую.',
  // Sign-in screens
  'You are signed out.': 'Вы вышли.',
  'Sign out': 'Выйти',
  'Checking your sign-in…': 'Проверяем вход…',
  'An invitation': 'Приглашение',
  'You are invited to a table': 'Вас пригласили за стол',
  'This invitation link seats you at a table in this browser. It works once.':
    'По этой ссылке-приглашению вы займёте место за столом в этом браузере. Она срабатывает один раз.',
  'Nothing is used until you take your seat. Take it only if you expected this invitation.':
    'Пока вы не займёте место, приглашение не используется. Занимайте место, только если ждали этого приглашения.',
  'Joining the table': 'Присоединяемся к столу',
  'Checking your invitation…': 'Проверяем приглашение…',
  'The table could not be reached': 'Не удалось связаться со столом',
  'Check your connection, then try again.': 'Проверьте подключение и попробуйте снова.',
  'Already signed in': 'Вход уже выполнен',
  'Replace your sign-in?': 'Заменить вход?',
  'Reading your current sign-in…': 'Проверяем текущий вход…',
  'This browser is already signed in to a table.': 'В этом браузере уже выполнен вход.',
  'You are signed in to “{campaign}” as the DM.': 'Вы вошли в «{campaign}» как мастер.',
  'You are signed in to “{campaign}” as {character}.': 'Вы вошли в «{campaign}» как {character}.',
  'a player': 'игрок',
  'Replace that sign-in with this invitation?': 'Заменить этот вход приглашением?',
  'Replacing signs this browser out of that table. Keeping it leaves the invitation unused: it still works once, in another browser.':
    'При замене этот браузер выйдет из-за того стола. Если оставить текущий вход, приглашение останется неиспользованным и сработает один раз в другом браузере.',
  'To come back to that table, you will need a new invitation link.':
    'Чтобы вернуться за тот стол, понадобится новая ссылка-приглашение.',
  'To come back to that table as the DM, you will need a new invitation link from the operator.':
    'Чтобы вернуться за тот стол мастером, понадобится новая ссылка-приглашение от оператора.',
  'To come back to that table, you will need a new invitation link from the DM.':
    'Чтобы вернуться за тот стол, понадобится новая ссылка-приглашение от мастера.',
  'Replace with this invitation': 'Заменить приглашением',
  'Keep my current sign-in': 'Оставить текущий вход',
  'This invitation cannot be used': 'Это приглашение нельзя использовать',
  'Invitation links work once and expire after a while. Ask for a new one.':
    'Ссылка-приглашение срабатывает один раз и со временем истекает. Попросите новую.',
  'Back to the start': 'В начало',
  'Join with an invitation': 'Вход по приглашению',
  'This table is open to invited players. Open the invitation link you were sent to take your seat.':
    'За этот стол садятся по приглашению. Откройте присланную вам ссылку-приглашение, чтобы занять своё место.',
  'An invitation link works once. Signing in keeps you at the table in this browser for up to {days} days.':
    'Ссылка-приглашение срабатывает один раз. После входа этот браузер держит вас за столом до {days} дней.',
  'Signed out': 'Выход выполнен',
  'You are signed out': 'Вы вышли',

  // Signing out
  'Sign out?': 'Выйти?',
  'You will need a new invitation link to come back to this table.':
    'Чтобы вернуться за этот стол, понадобится новая ссылка-приглашение.',
  'The table could not be reached, so you are still signed in. Try again.':
    'Не удалось связаться со столом, поэтому вход по-прежнему выполнен. Попробуйте снова.',
  'Signing out…': 'Выходим…',
  'Stay signed in': 'Остаться',

  // The DM's Players sheet
  Players: 'Игроки',
  'Players (DM)': 'Игроки (мастер)',
  'a character': 'персонаж',
  'Reading the players…': 'Читаем список игроков…',
  'Invite a player': 'Пригласить игрока',
  'An invitation link seats one player as a character nobody plays yet. It works once.':
    'Ссылка-приглашение сажает одного игрока за свободного персонажа. Она срабатывает один раз.',
  'Every character has a player. Revoke a player’s access to free a character.':
    'У каждого персонажа есть игрок. Отзовите доступ игрока, чтобы освободить персонажа.',
  'The link expires after': 'Ссылка истекает через',
  '1 day': '1 день',
  '3 days': '3 дня',
  '7 days': '7 дней',
  'Create invitation link': 'Создать ссылку-приглашение',
  'Invitation link for {name}': 'Ссылка-приглашение: {name}',
  'Shown only once.': 'Показывается один раз.',
  'Copy it now and send it to the player privately: whoever opens it first takes the seat of {name}.':
    'Скопируйте её сейчас и отправьте игроку лично: кто первым откроет ссылку, тот займёт место персонажа {name}.',
  'Invitation link': 'Ссылка-приглашение',
  'Copy link': 'Копировать ссылку',
  'Copied. Paste it into a private message to the player.':
    'Скопировано. Вставьте ссылку в личное сообщение игроку.',
  'The link is selected: copy it with your keyboard.':
    'Ссылка выделена: скопируйте её с клавиатуры.',
  'It expires {when}. Until then you can revoke it below.':
    'Истекает: {when}. До этого её можно отозвать ниже.',
  'Hide the link': 'Скрыть ссылку',
  'Players at the table': 'Игроки за столом',
  'No player has joined yet.': 'Пока никто не присоединился.',
  'Signed in': 'Вход выполнен',
  'Not signed in': 'Вход не выполнен',
  'Open sessions: {count}': 'Открытых сессий: {count}',
  'Open sessions: {count} · last seen {when}': 'Открытых сессий: {count} · последний раз: {when}',
  'To let this player back in, revoke their access and send a new invitation.':
    'Чтобы впустить этого игрока снова, отзовите его доступ и отправьте новое приглашение.',
  'Revoke access: {name}': 'Отозвать доступ: {name}',
  'Revoke access': 'Отозвать доступ',
  'Revoke the access of the player of {name}? They are signed out at once, on every device, and {name} can be invited again.':
    '{name}: отозвать доступ игрока? Игрок сразу выйдет на всех устройствах, а персонажа можно будет пригласить снова.',
  'Yes, revoke access': 'Да, отозвать доступ',
  'The DM (the operator’s link)': 'Мастер (ссылка оператора)',
  'Open invitations': 'Открытые приглашения',
  'No invitation is waiting to be used.': 'Нет приглашений, ожидающих использования.',
  'Used, revoked and expired: {count}': 'Использованные, отозванные и истёкшие: {count}',
  'Waiting to be used': 'Ожидает',
  Used: 'Использовано',
  Revoked: 'Отозвано',
  Expired: 'Истекло',
  'Created {created} · expires {expires}': 'Создано: {created} · истекает: {expires}',
  'Used {when}': 'Использовано: {when}',
  'Revoked {when}': 'Отозвано: {when}',
  'Expired {when}': 'Истекло: {when}',
  'Revoke the invitation: {name}': 'Отозвать приглашение: {name}',
  'Revoke the invitation': 'Отозвать приглашение',
  'That character has a player now. The list has been read again.':
    'У этого персонажа уже есть игрок. Список прочитан заново.',
  'That character is not in the campaign any more.': 'Этого персонажа больше нет в кампании.',
  'Too many invitations in the last hour. Try again later.':
    'За последний час создано слишком много приглашений. Попробуйте позже.',
  'That invitation was used meanwhile.': 'Тем временем это приглашение уже использовали.',
  'That invitation no longer exists.': 'Этого приглашения больше нет.',
  'The answer was lost on the way. If the list shows a new invitation, revoke it and create another.':
    'Ответ потерялся по дороге. Если в списке появилось новое приглашение, отзовите его и создайте другое.',
  'The answer was lost on the way. The list has been read again to show what happened.':
    'Ответ потерялся по дороге. Список прочитан заново, чтобы показать, что произошло.',
  'The invitation for {name} is revoked: its link no longer works.':
    '{name}: приглашение отозвано, ссылка больше не работает.',
  'The player of {name} is signed out, and {name} can be invited again.':
    '{name}: доступ игрока отозван, персонажа можно пригласить снова.',
  'The player of {name} is signed out, but the seat could not be freed. Try again.':
    '{name}: доступ игрока отозван, но место освободить не удалось. Попробуйте снова.',
  'The invitation for {name} was used: the player has joined.':
    '{name}: приглашение использовано, игрок присоединился.',
});

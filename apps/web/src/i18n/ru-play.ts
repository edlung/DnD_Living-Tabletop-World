import { registerRussian } from '@ltw/ui';

/** Russian for combat, DM tools, the Chronicle, and authoring (the rest is in `ru.ts`; ADR 0031 §10). */
registerRussian({
  // Combat
  Battlefield: 'Поле боя',
  'Encounter anchor': 'Сводка боя',
  'Shaded squares are difficult terrain; outlined squares give cover. Select a square to move or a combatant to act.':
    'Заштрихованные клетки — трудная местность; клетки с рамкой дают укрытие. Выберите клетку, чтобы идти, или участника боя, чтобы действовать.',
  'Round {round}': 'Раунд {round}',
  'Turn: {name}': 'Ход: {name}',
  'You: {current} / {max} HP': 'Вы: {current} / {max} ОЗ',
  'End turn': 'Закончить ход',
  'Move here': 'Идти сюда',
  'Move options': 'Варианты перемещения',
  'No open route to this square.': 'К этой клетке нет свободного пути.',
  'Route: {count} square, about {feet} ft. The rules confirm your speed.':
    'Маршрут: клеток {count}, около {feet} фт. Скорость подтвердят правила.',
  'Route: {count} squares, about {feet} ft. The rules confirm your speed.':
    'Маршрут: клеток {count}, около {feet} фт. Скорость подтвердят правила.',
  'You can move on your own turn.': 'Двигаться можно в свой ход.',
  'Waiting for {name}; the DM runs creature turns.': 'Ждём: {name}; ходы существ ведёт мастер.',
  'the next turn': 'следующий ход',
  'Waiting for reactions to resolve.': 'Ждём разрешения реакций.',
  'The DM acts for creatures with the encounter controls above (suggested turn).':
    'Мастер действует за существ с помощью управления схваткой выше (предложенный ход).',
  "This is a read-only view. Use your character's session outside an encounter to act.":
    'Это вид только для чтения. Чтобы действовать, используйте сессию своего персонажа вне схватки.',
  'Options for {name}': 'Варианты действий: {name}',
  'Close options': 'Закрыть варианты',
  'Checking what you can do…': 'Проверяем, что вы можете сделать…',
  'Nothing to do with this combatant.': 'С этим участником боя делать нечего.',
  'Attack {target} with longbow': 'Атаковать из длинного лука: {target}',
  'Cast Fireball at {target}': 'Огненный шар в цель: {target}',
  'Cast Counterspell': 'Применить контрзаклинание',
  'Cast Healing Word on {target}': 'Лечащее слово на цель: {target}',
  'Cast Hunter’s Mark on {target}': 'Метка охотника на цель: {target}',
  'Move {feet} ft closer first': 'Сначала подойдите ближе на {feet} фт',
  'Would affect: {names}': 'Заденет: {names}',
  'no one': 'никого',
  'Warning: this area includes a party member. You may still cast it.':
    'Внимание: в области есть член отряда. Заклинание всё равно можно применить.',
  Reaction: 'Реакция',
  '{caster} is casting a spell': 'Заклинает: {caster}',
  'Components: {components}. The spell waits until you answer.':
    'Компоненты: {components}. Заклинание ждёт вашего ответа.',
  'Checking Counterspell…': 'Проверяем контрзаклинание…',
  Ignore: 'Не вмешиваться',
  'Counterspell spends a spell slot and may stop the spell. Ignore lets the spell happen.':
    'Контрзаклинание тратит ячейку заклинаний и может остановить заклинание. «Не вмешиваться» даёт заклинанию сработать.',
  'Counterspell unavailable: {reason}': 'Контрзаклинание недоступно: {reason}',
  'Uses a level {level} slot.': 'Тратит ячейку {level} уровня.',
  'Start an encounter (DM)': 'Начать схватку (мастер)',
  'Encounter controls (DM)': 'Управление схваткой (мастер)',
  'Looking at who is here…': 'Смотрим, кто здесь…',
  'Characters join the party and creatures are hostile, on open ground. Initiative is rolled by the rules.':
    'Персонажи входят в отряд, существа враждебны; бой на открытой местности. Инициативу бросают по правилам.',
  'Start encounter': 'Начать схватку',
  'Keep fighting': 'Продолжить бой',
  'Suggested turn:': 'Предложенный ход:',
  'Run suggested {tactic}': 'Выполнить предложенное: {tactic}',
  'Close reaction window': 'Закрыть окно реакции',
  'End encounter': 'Завершить схватку',
  'End the encounter for everyone?': 'Завершить схватку для всех?',
  'Yes, end encounter': 'Да, завершить схватку',

  // DM tools
  'Time and weather (DM)': 'Время и погода (мастер)',
  'Advance to Day 2, 10:00': 'Перейти к дню 2, 10:00',
  'Or advance by (hours)': 'Или сдвинуть на (часов)',
  'Advance time': 'Сдвинуть время',
  'Weather at {place}': 'Погода: {place}',
  'Set weather': 'Установить погоду',
  'Speak as {npc}': 'Говорить за: {npc}',
  'Answer the question': 'Ответить на вопрос',
  '{npc} says': 'Говорит: {npc}',
  '{npc} is not in the same place as this character. Move the character to {npc}, or {npc} to them, first.':
    'Персонаж и НПС ({npc}) не в одном месте. Сначала переместите их друг к другу.',
  'This character cannot speak right now.': 'Этот персонаж сейчас не может говорить.',
  '{npc} cannot answer.': 'Ответить не может: {npc}.',
  '{npc} cannot speak with this character now ({reason}).':
    'НПС ({npc}) сейчас не может говорить с этим персонажем ({reason}).',
  'No words are available for {npc} right now ({reason}). You can speak for {npc} yourself.':
    'Слов для НПС ({npc}) сейчас нет ({reason}). Вы можете сказать за него сами.',
  'the voice is unavailable': 'голос недоступен',
  'no reply was produced': 'ответ не получен',
  'The conversation could not be performed. Please try again.':
    'Беседу не удалось провести. Попробуйте ещё раз.',

  // Chronicle
  Chronicle: 'Хроника',
  'Opening the chronicle…': 'Открываем хронику…',
  'Remembering…': 'Вспоминаем…',
  'No chapter has been written for this view yet.': 'Для этого вида глава ещё не написана.',
  'Open flashback': 'Открыть воспоминание',
  Flashback: 'Воспоминание',
  'A place you recall': 'Место из воспоминаний',
  'At {place}': 'Место: {place}',
  ' with {names}': ' · Участники: {names}',
  'Write a chapter (DM)': 'Написать главу (мастер)',
  'Write chapter': 'Написать главу',
  Title: 'Название',
  'Told from': 'С чьей стороны',
  'Chapter I — Shadows on the Trade Road': 'Глава I — Тени на Торговой дороге',
  'Chapter written.': 'Глава написана.',
  'The chronicle could not be written from the current events.':
    'Хронику не удалось написать по текущим событиям.',
  'There is nothing to tell for that view yet.': 'Для этого вида пока нечего рассказывать.',
  'The chronicle could not be written. Please try again.':
    'Хронику не удалось написать. Попробуйте ещё раз.',

  // Authoring
  'Risk:': 'Риск:',
  observation: 'наблюдение',
  conversation: 'беседа',
  discovery: 'открытие',
  decision: 'решение',
  consequence: 'последствие',
  OBSERVATION: 'НАБЛЮДЕНИЕ',
  CONVERSATION: 'БЕСЕДА',
  DISCOVERY: 'ОТКРЫТИЕ',
  DECISION: 'РЕШЕНИЕ',
  CONSEQUENCE: 'ПОСЛЕДСТВИЕ',
  'Add to the world (DM)': 'Добавить в мир (мастер)',
  'Describe what to add': 'Опишите, что добавить',
  'Add a young guard near North Gate who saw the caravan leave.':
    'Добавь: молодой стражник у Северных ворот, который видел, как ушёл караван.',
  Propose: 'Предложить',
  'Authoring proposal': 'Предложение мастера',
  'Proposed changes': 'Предлагаемые изменения',
  Draft: 'Черновик',
  'Added to the world': 'Добавлено в мир',
  Undone: 'Отменено',
  'revision {revision}': 'версия {revision}',
  'Edit proposal': 'Править предложение',
  'Apply changes': 'Применить изменения',
  Name: 'Имя',
  Description: 'Описание',
  'Where they stand': 'Где находится',
  'What they saw or know': 'Что видел или знает',
  'Willing to tell this when asked': 'Готов рассказать, если спросят',
  'This kind of proposal cannot be edited here. Describe it differently to try again.':
    'Предложение такого вида здесь править нельзя. Опишите иначе и попробуйте снова.',
  'What will change in the world': 'Что изменится в мире',
  'A new person or place is created': 'Появится новый человек или место',
  'They are placed in the world': 'Он будет помещён в мир',
  'Someone is given an account to hold': 'Кому-то будет передан рассказ',
  'Their willingness to share is set': 'Будет задана готовность делиться',
  'A portrait is requested': 'Будет запрошен портрет',
  'Blocking issues': 'Блокирующие проблемы',
  'This cannot be added until fixed:': 'Это нельзя добавить, пока не исправлено:',
  'Warnings you must accept to continue': 'Предупреждения, которые нужно принять, чтобы продолжить',
  'Confirm and add to the world': 'Подтвердить и добавить в мир',
  'Cancel proposal': 'Отменить предложение',
  'Undo this addition': 'Отменить это добавление',
  'Start another': 'Начать другое',
  'Undo blockers': 'Что мешает отмене',
  'Undo is blocked by later steps that depend on this:':
    'Отмене мешают более поздние шаги, которые от этого зависят:',
  'Undo “{step}” first': 'Сначала отменить: «{step}»',
  'Create {kind} {name}': 'Создать ({kind}): {name}',
  ' at {place}': ' · место: {place}',
  ' — {description}': ' — {description}',
  'Move {name} to {place}': 'Переместить: {name} → {place}',
  'Update {name}': 'Обновить: {name}',
  ' (name: {value})': ' (имя: {value})',
  ' (description: {value})': ' (описание: {value})',
  'Change {name} to {status}': 'Изменить состояние: {name} → {status}',
  'Advance world time by {seconds} seconds': 'Сдвинуть мировое время на секунд: {seconds}',
  '{name} holds {type}: “{statement}”': '{name} хранит ({type}): «{statement}»',
  'Add {type}: “{statement}”': 'Добавить ({type}): «{statement}»',
  testimony: 'свидетельство',
  rumor: 'слух',
  inference: 'вывод',
  hypothesis: 'гипотеза',
  evidence: 'улика',
  fact: 'факт',
  secret: 'тайна',
  willing: 'готов',
  guarded: 'скрытен',
  'This account is {disclosure} to be shared when asked':
    'Этот рассказ: {disclosure} делиться, если спросят',
  'Set the claim a record makes': 'Задать утверждение записи',
  'Set an NPC’s attitude toward the party': 'Задать отношение НПС к отряду',
  'The proposal now needs more confirmation than you gave. It was reloaded; review it again.':
    'Теперь предложению нужно больше подтверждений, чем вы дали. Оно перезагружено; проверьте его снова.',
  'The world no longer allows this proposal. Nothing was added.':
    'Мир больше не допускает это предложение. Ничего не добавлено.',
  'This kind of change cannot be added through authoring. Nothing was added.':
    'Такое изменение нельзя добавить через авторинг. Ничего не добавлено.',
  'Other parts of the story now depend on this. Undo them first, newest first.':
    'От этого теперь зависят другие части истории. Сначала отмените их, начиная с новых.',
  'This proposal was already decided differently. It was reloaded.':
    'По этому предложению уже принято другое решение. Оно перезагружено.',
  'Only the DM can change the world this way.': 'Так менять мир может только мастер.',
  'The response was interrupted. Reload the proposal to see what really happened.':
    'Ответ прервался. Перезагрузите предложение, чтобы увидеть, что произошло на самом деле.',
  'The world could not accept this. Nothing was added.':
    'Мир не смог это принять. Ничего не добавлено.',
  'Updated. The preview and confirmation were recomputed.':
    'Обновлено. Предпросмотр и подтверждение пересчитаны.',
  'This proposal changed since you opened it. The latest revision was reloaded; review it again.':
    'Предложение изменилось с тех пор, как вы его открыли. Загружена последняя версия; проверьте её снова.',
  'The assistant could not turn that into a proposal. Try describing it differently.':
    'Помощнику не удалось превратить это в предложение. Попробуйте описать иначе.',
  'The proposal could not be stored.': 'Предложение не удалось сохранить.',
  'Added to the world.': 'Добавлено в мир.',
  'Undone. The world no longer holds this.': 'Отменено. Мира это больше не касается.',
  'That step was undone. You can try the undo again.':
    'Этот шаг отменён. Можно снова попробовать отмену.',
  'That step cannot be undone yet. Undo newer ones first.':
    'Этот шаг пока нельзя отменить. Сначала отмените более новые.',
  'Proposal discarded. Nothing was added to the world.':
    'Предложение отброшено. В мир ничего не добавлено.',
  'entity created': 'создана сущность',
  'entity placed': 'сущность помещена',
  'knowledge assigned': 'передано знание',
  'disclosure set': 'задана готовность делиться',
  'asset requested': 'запрошено изображение',
  'create entity': 'создание сущности',
  'place entity': 'размещение сущности',
  'add knowledge': 'добавление знания',
  'set disclosure': 'настройка готовности делиться',
  'advance world time': 'сдвиг мирового времени',
  'change entity status': 'смена состояния сущности',
  'update entity profile': 'обновление профиля сущности',

  // Transport and sign-in
  'Your access token was not accepted. Leave the session to reconnect.':
    'Токен доступа не принят. Выйдите из сессии и подключитесь заново.',
  'This perspective is not available to your account.': 'Этот вид недоступен вашей учётной записи.',
  'This information is not available in the current view.':
    'Эта информация недоступна в текущем виде.',
  'The world could not be reached. Please try again.':
    'Связаться с миром не удалось. Попробуйте ещё раз.',
  'The world could not be loaded. Please try again.':
    'Мир не удалось загрузить. Попробуйте ещё раз.',
});

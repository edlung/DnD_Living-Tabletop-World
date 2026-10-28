import { registerRussianSentences } from './say.ts';

/**
 * Russian for the DM's authoring risk reasons and continuity findings
 * (docs/adr/0031-play-language.md §5): label–value sentences, names in the
 * nominative, no word that agrees with anyone's gender.
 */
registerRussianSentences({
  // Risk reasons (policy)
  'Adds a new NPC to the world': 'Добавляет в мир нового НПС',
  'Moves an NPC': 'Перемещает НПС',
  "Edits an NPC's name or description": 'Меняет имя или описание НПС',
  'Gives an NPC a secret': 'Даёт НПС тайну',
  'Gives an NPC knowledge about a non-public entity': 'Даёт НПС знание о непубличной сущности',
  'Gives an NPC knowledge': 'Даёт НПС знание',
  'Stops an NPC from sharing a record when asked': 'Не даёт НПС делиться записью, если спросят',
  'Lets an NPC share a record about a non-public entity':
    'Позволяет НПС делиться записью о непубличной сущности',
  'Lets an NPC share a record when asked': 'Позволяет НПС делиться записью, если спросят',
  'Adds a structured claim to an account': 'Добавляет к рассказу структурированное утверждение',
  'Changes how an NPC feels about the party': 'Меняет отношение НПС к отряду',
  'Claims on clues are not authored': 'Утверждения о подсказках через авторинг не создаются',
  'Deaths and destruction are destructive and cannot be authored':
    'Смерти и разрушения необратимы, их нельзя создавать через авторинг',
  'Advancing world time changes the whole world and cannot be authored':
    'Сдвиг мирового времени меняет весь мир, его нельзя создавать через авторинг',
  'Creating a {kind} is not enabled; only NPCs can be created':
    'Создание ({kind}) не разрешено; создавать можно только НПС',
  'Knowledge in the {scope} scope is not enabled; only records an NPC holds':
    'Знание в области ({scope}) не разрешено; допускаются только записи, которые хранит НПС',
  '{type} records are not authored': 'Записи вида ({type}) через авторинг не создаются',
  'Claims on {scope} records are not authored; only on records an NPC holds':
    'Утверждения о записях области ({scope}) не создаются; только о записях, которые хранит НПС',
  'Only NPCs can be changed by authoring; "{id}" is a {kind}':
    'Через авторинг можно менять только НПС; «{id}» — это ({kind})',

  // Options
  'Accept it, and acknowledge it when confirming the commit':
    'Принять и подтвердить это при подтверждении изменения',
  'Leave this operation out': 'Убрать эту операцию',
  'Keep it guarded': 'Оставить под защитой',
  'Keep the current name': 'Оставить прежнее имя',
  'Make it a rumor attributed to them': 'Сделать это слухом, приписанным ему',
  'Make it a rumor they heard': 'Сделать это слухом, который он услышал',
  'Leave the claim out': 'Убрать утверждение',
  'Leave {name} out of the record': 'Убрать из записи: {name}',
  'Use the ID {id}': 'Использовать идентификатор {id}',
  'Use the record ID {id}': 'Использовать идентификатор записи {id}',
  'Let {name} exist since before recorded history': 'Пусть существует с начала записей: {name}',
  'Learn it {when}, while {who} exists': 'Узнать это: {when} (пока существует: {who})',
  'Learn it {when}, once {name} exists': 'Узнать это: {when} (когда появится: {name})',
  'Learn it just before {name} died ({before})':
    'Узнать это незадолго до смерти: {name} ({before})',
  'Heard just before {name} died ({before})': 'Услышано незадолго до смерти: {name} ({before})',
  'Agree with {whose}: {value}': 'Согласовать с источником {whose}: {value}',
  'Keep "{name}" and note "{other}" in the description':
    'Оставить «{name}» и записать «{other}» в описании',

  // Findings
  'before recorded history': 'до начала записей',
  'nowhere recorded': 'нигде не записано',
  'at {place}': 'место: {place}',
  'the holder': 'хранитель',
  ' or ': ' / ',
  ' and the ': ', ',
  party: 'отряд',
  public: 'публика',
  hostile: 'враждебное',
  wary: 'настороженное',
  neutral: 'нейтральное',
  friendly: 'дружелюбное',
  trusted: 'доверительное',
  testimony: 'свидетельство',
  rumor: 'слух',
  inference: 'вывод',
  hypothesis: 'гипотеза',
  evidence: 'улика',
  fact: 'факт',
  secret: 'тайна',
  record: 'запись',
  'Day {day} {time}': 'День {day} {time}',
  '{holder} would know about {id}, which neither the public nor the party knows':
    'НПС: {holder}. Знание о: {id}. Ни публике, ни отряду это не известно',
  '{name} already holds this account ({id})': 'Этот рассказ уже есть у НПС: {name} ({id})',
  '{name} is {attitude} toward the party, yet would share this willingly':
    'НПС: {name}. Отношение к отряду: {attitude}. Готовность делиться этим: охотно',
  'It would be known {when}, before {name} existed ({exists})':
    'Известно с: {when}. Сущность {name} появляется позже: {exists}',
  '{name} would learn it {when}, after dying ({death})':
    'Узнаёт: {name}, {when}. Смерть была раньше: {death}',
  '{name} died {death}, before telling this {when}':
    'Смерть: {name}, {death}. Рассказ датирован позже: {when}',
  '{name} is dead; this moves the body to {place}': 'Мёртв: {name}. Это переносит тело в: {place}',
  '{holder} was {where} {when}, not at {places}':
    'Свидетель: {holder}. Где был: {where}; время: {when}. Не в: {places}',
  'The world records only where someone is now, not where they were before: tell it in the description, or accept this warning':
    'Мир хранит только то, где персонаж находится сейчас, а не где он был раньше: расскажите об этом в описании или примите это предупреждение',
  'A fight is running at {place}; {name} would be there without taking part':
    'Идёт схватка: {place}. {name} окажется там, но не участвует в ней',
  '"{name}" is also the name of {others}': 'Имя «{name}» уже носят: {others}',
  'The {kinds} know {name}; renaming changes that name in every account they hold':
    'Знают: {kinds}. Сущность: {name}. Переименование изменит имя во всех их рассказах',
  '{description} Also known as {name}.': '{description} Другое имя: {name}.',
  'the world truth ({id})': 'истина мира ({id})',
  "{name}'s account ({id})": 'рассказ: {name} ({id})',
  'the {type} {id}': '{type}: {id}',
  'the clue {id}': 'подсказка {id}',
  'About {about}: this says {value}; {whose} says {other}':
    'Предмет: {about}. Здесь: {value}. Источник {whose}: {other}',
  'About {about}: agrees with {whose} ({value})':
    'Предмет: {about}. Согласуется с: {whose} ({value})',
});

import { registerRussian } from '@ltw/ui';

/**
 * Russian for the DM's encounter builder and the DM's hand on the board
 * (docs/adr/0057-encounters-maps-loot.md §1–2). The creatures' names come from the server in the
 * campaign's language, as the Russian SRD gives them; "столкновение" pairs with the prepared
 * encounters in the same sheet.
 */
registerRussian({
  // The saved encounters
  'Your encounters': 'Ваши столкновения',
  'Build one from the bestiary: it waits here until you start it.':
    'Соберите его из бестиария: оно подождёт здесь, пока вы его не начнёте.',
  'Build an encounter': 'Собрать столкновение',
  'A fight is already running.': 'Бой уже идёт.',
  'One of its creatures cannot fight any more.': 'Одно из его существ больше не может сражаться.',
  'Its place or one of its creatures is no longer in the campaign: change it or delete it.':
    'Его места или одного из существ больше нет в кампании: измените его или удалите.',
  '{count} × {name}': '{count} × {name}',
  'Change: {title}': 'Изменить: {title}',
  Change: 'Изменить',
  'Delete it': 'Да, удалить',
  // The fight started with who is at the place, below the saved ones
  'A fight with who is here': 'Бой с теми, кто здесь',
  // The builder
  'Change the encounter': 'Изменить столкновение',
  'Encounter name': 'Название',
  'Name the encounter.': 'Назовите столкновение.',
  'Field width': 'Ширина поля',
  'Field depth': 'Глубина поля',
  '{count} squares': '{count} кл.',
  Foes: 'Противники',
  '{name} (CR {rating}, {xp} XP)': '{name} (ПО {rating}, {xp} опыта)',
  'From the campaign': 'Из кампании',
  'Choose a creature': 'Выберите существо',
  'No foes yet: find one and add it.': 'Противников пока нет: найдите и добавьте.',
  '× {count}': '× {count}',
  'One fewer {name}': 'Убрать одного: {name}',
  'One more {name}': 'Добавить ещё: {name}',
  'Add at least one foe.': 'Добавьте хотя бы одного противника.',
  'So many foes need a larger field.': 'Стольким противникам нужно поле побольше.',
  'The encounter could not be saved. Try again.':
    'Столкновение не сохранилось. Попробуйте ещё раз.',
  'Save the encounter': 'Сохранить столкновение',
  'For {names}.': 'Отряд: {names}.',
  'Nobody of the party is at this place yet: the difficulty shows once someone is.':
    'Здесь пока нет никого из отряда: сложность появится, когда кто-нибудь придёт.',
  // The DM's hand on the board
  'The DM’s hand': 'Рука мастера',
  'Choose a combatant, then a square to set it down on — or drag its token there.':
    'Выберите участника боя, затем клетку, куда его поставить, — или перетащите туда его фишку.',
  'Set {name} down here': 'Поставить сюда: {name}',
  'Setting it down spends no movement and provokes no opportunity attack.':
    'Так перемещение не тратится и провоцированной атаки нет.',
  '{name} set down on another square': '{name} — теперь на другой клетке',
  '{name} stands here.': 'Здесь стоит: {name}.',
  // The builder's battlefield
  'The battlefield': 'Поле боя',
  'Choose a square for {name}, or drag it there.':
    'Выберите клетку для: {name} — или перетащите туда.',
  'Choose a foe or a party place, then a square — or drag it there.':
    'Выберите противника или место отряда, затем клетку — или перетащите.',
  'Party place {number}': 'Место отряда {number}',
  'One of them stands off the field: move it, or make the field larger.':
    'Кто-то стоит за краем поля: передвиньте его или увеличьте поле.',
  'One of them stands in a wall: move it, or clear the wall.':
    'Кто-то стоит в стене: передвиньте его или уберите стену.',
  'Two of them stand on one square: move one.': 'Двое стоят на одной клетке: передвиньте одного.',
  // The DM's brush on the board
  'Paint the ground': 'Рисовать местность',
  'Done painting': 'Готово',
  'Choose a brush, then press a square or drag across several.':
    'Выберите кисть, затем нажмите на клетку или проведите по нескольким.',
  Brush: 'Кисть',
  'Hide in the fog of war': 'Скрыть в тумане войны',
  'Reveal from the fog': 'Открыть из тумана',
  'The DM’s turn': 'Ход мастера',
  // The viewer's own ruler and spell's area
  Measure: 'Измерить',
  'A spell’s area': 'Область заклинания',
  'On your board only': 'Только на вашем поле',
  'Put the tool away': 'Убрать инструмент',
  'Press where the ruler starts, then where it ends. Every square is 5 ft, diagonals too.':
    'Нажмите, где линейка начинается, затем где кончается. Каждая клетка — 5 фт, по диагонали тоже.',
  'Now press where it ends.': 'Теперь нажмите, где она кончается.',
  'Press where it starts.': 'Нажмите, где она начинается.',
  Shape: 'Форма',
  'Sphere, at a point': 'Сфера в точке',
  'Cube, at a point': 'Куб в точке',
  'Cone, from the caster': 'Конус от заклинателя',
  'Line, from the caster': 'Линия от заклинателя',
  'Emanation, around the caster': 'Эманация вокруг заклинателя',
  Radius: 'Радиус',
  Size: 'Размер',
  Width: 'Ширина',
  'Choose the caster on the board first: the area goes out from them.':
    'Сначала выберите заклинателя на поле: область исходит от него.',
  'Press the square it points at.': 'Нажмите клетку, куда она направлена.',
  'It covers {count} squares.': 'Клеток в области: {count}.',
  Done: 'Готово',
  '{feet} ft from the ruler’s start': '{feet} фт от начала линейки',
  // Traps and harmful ground on the board (Stage 670d)
  'Fire on the ground': 'Огонь на земле',
  'Acid on the ground': 'Кислота на земле',
  'A poison cloud': 'Ядовитое облако',
  'Trap: {name}': 'Ловушка: {name}',
  'trap: {name}, {state}': 'ловушка: {name}, {state}',
  'hidden from the players': 'скрыта от игроков',
  'in sight': 'на виду',
  sprung: 'сработала',
  disarmed: 'обезврежена',
  '{harm}: {dice}, {ability} save DC {dc}, {success}':
    '{harm}: {dice}, спасбросок ({ability}) Сл {dc}, {success}',
  'half on a success': 'половина урона при успехе',
  'none on a success': 'без урона при успехе',
  'Harmful ground': 'Опасная земля',
  'Hidden from the players': 'Скрыта от игроков',
  Harm: 'Опасность',
  'Kind of trap': 'Вид ловушки',
  Die: 'Кость',
  'A trap springs: {name}.': 'Срабатывает ловушка: {name}.',
  'You notice a trap: {name}.': 'Вы замечаете ловушку: {name}.',
  'You find a trap: {name}.': 'Вы находите ловушку: {name}.',
  'You disarm the trap: {name}.': 'Вы обезвреживаете ловушку: {name}.',
  'no known trap': 'здесь нет известной вам ловушки',
  'Disarm the trap': 'Обезвредить ловушку',
  // The table's shared marks (Stage 670c)
  'Mark the board': 'Отметить на поле',
  'For the whole table': 'Для всего стола',
  Mark: 'Отметка',
  'Ping a square': 'Отметить клетку',
  'Point at a square': 'Указать на клетку',
  'Draw on the board': 'Рисовать на поле',
  'Drag across the squares to draw; a press pings.':
    'Проведите по клеткам, чтобы рисовать; нажатие ставит отметку.',
  'Press a square: every screen at the table sees it.':
    'Нажмите на клетку: её увидят все экраны за столом.',
  'The mark did not reach the table. Try again.': 'Отметка не дошла до стола. Попробуйте ещё раз.',
  'Players may mark the board': 'Игроки могут делать отметки',
  'Clear the marks ({count})': 'Стереть отметки ({count})',
  'Show it to the table': 'Показать столу',
  'The DM pings: {square}': 'Отметка мастера: {square}',
  'A player pings: {square}': 'Отметка игрока: {square}',
  'The DM points: {square}': 'Мастер указывает: {square}',
  'The DM draws on the board': 'Мастер рисует на поле',
  'A player draws on the board': 'Игрок рисует на поле',
  'The DM shows an area on the board': 'Мастер показывает область на поле',
  'A player shows an area on the board': 'Игрок показывает область на поле',
  Height: 'Высота',
  // The DM's own battle map and its grid (Stage 670b)
  'Your own battle map': 'Своя боевая карта',
  'A PNG, JPEG or WebP picture of up to 10 MB, seen from above.':
    'Картинка PNG, JPEG или WebP до 10 МБ, вид сверху.',
  'Uploading…': 'Загружаем…',
  'Upload a battle map': 'Загрузить боевую карту',
  'The answer was lost on the way.': 'Ответ потерялся по дороге.',
  'Upload it again': 'Загрузить ещё раз',
  'The battle map is approved: line its grid up next.':
    'Боевая карта одобрена: теперь выровняйте её сетку.',
  'Line up the grid: {subject}': 'Выровнять сетку: {subject}',
  'Set the size of one cell and where the first whole cell begins, in the picture’s pixels.':
    'Укажите размер одной клетки и где начинается первая целая клетка — в пикселях картинки.',
  'Cell size in pixels': 'Размер клетки, пикс.',
  'First cell from the left, in pixels': 'Первая клетка от левого края, пикс.',
  'First cell from the top, in pixels': 'Первая клетка от верхнего края, пикс.',
  'The fight here takes {columns} × {rows} squares.': 'Бой здесь займёт {columns} × {rows} клеток.',
  'The first cell begins within one cell, at least 8 px wide.':
    'Первая клетка начинается в пределах одной клетки шириной не меньше 8 пикс.',
  'Save the grid: {subject}': 'Сохранить сетку: {subject}',
  'The grid is lined up.': 'Сетка выровнена.',
  'Save the grid': 'Сохранить сетку',
  'This is not a PNG, JPEG or WebP picture.': 'Это не картинка PNG, JPEG или WebP.',
  'The picture is larger than 10 MB.': 'Картинка больше 10 МБ.',
  'Approve a picture of this place first: a battle map derives from it.':
    'Сначала одобрите картинку этого места: боевая карта строится от неё.',
  'Line up the grid': 'Выровнять сетку',
  'On the place’s battle map: {columns} × {rows} squares.':
    'На боевой карте места: {columns} × {rows} клеток.',
});

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
  Height: 'Высота',
});

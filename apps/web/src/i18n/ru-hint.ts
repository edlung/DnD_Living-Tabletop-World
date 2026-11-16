import { registerRussian } from '@ltw/ui';

/**
 * Russian for "What can I do?" (docs/adr/0073-table-ideas.md §3): the hint on a player's own
 * screen, in a fight and outside one.
 */
registerRussian({
  'What can I do?': 'Что я могу сделать?',
  'Got it': 'Понятно',
  'This list is made from what the game knows of your hero right now.':
    'Этот список составлен из того, что игра знает о вашем герое прямо сейчас.',
  'You can': 'Можно',
  'Used up': 'Потрачено',
  'Open Places': 'Открыть «Места»',
  'Open Journal': 'Открыть «Журнал»',
  'Open Character': 'Открыть «Персонаж»',
  'What the rules call these': 'Как это называется в правилах',
  // Always
  'Something else?': 'Что-то другое?',
  'Say it aloud. The DM decides what happens: you are not limited to the buttons.':
    'Скажите вслух. Что произойдёт, решит мастер: кнопками вы не ограничены.',
  // The reaction
  'Your reaction is ready': 'Реакция готова',
  'If something lets you react, the game asks you at once.':
    'Если появится повод ответить, игра сразу спросит вас.',
  'Your reaction is spent': 'Реакция потрачена',
  'It comes back at the start of your next turn.': 'Она вернётся в начале вашего следующего хода.',
  // Not in the fight, fallen, down
  'Your hero is not in this fight': 'Ваш герой не участвует в этом бою',
  'Watch and cheer': 'Смотрите и болейте',
  'When your hero joins, your turn appears in the order.':
    'Когда герой вступит в бой, ваш ход появится в очерёдности.',
  'Your hero has fallen': 'Ваш герой пал',
  'The story is not over': 'История не окончена',
  'Stay with the table and ask the DM what comes next.':
    'Оставайтесь за столом и спросите мастера, что будет дальше.',
  'It is your turn': 'Сейчас ваш ход',
  'Your hero is down': 'Ваш герой без сознания',
  'Your hero is down, and still alive': 'Ваш герой без сознания, но жив',
  'On your turn you roll a death save: the game asks you. A friend can help you up with healing or first aid.':
    'В свой ход вы бросаете спасбросок от смерти — игра спросит вас. Друг может поднять вас лечением или первой помощью.',
  // Another's turn
  'Someone you cannot see is acting': 'Действует тот, кого вы не видите',
  'It is someone else’s turn': 'Сейчас чужой ход',
  'It is {name}’s turn': 'Сейчас ходит {name}',
  'Wait for your turn': 'Подождите своего хода',
  'The banner says when it comes. Meanwhile, look at the map and plan.':
    'Надпись на экране скажет, когда он наступит. А пока посмотрите на карту и подумайте.',
  // Your turn
  'Your movement': 'Движение',
  'Up to {feet} ft left. Tap a square on the map to go there.':
    'Осталось до {feet} фт. Нажмите на клетку карты, чтобы туда пойти.',
  'No movement left this turn.': 'В этом ходу движения не осталось.',
  'Attack again': 'Ещё атака',
  'Attacks left with this action: {count}. Tap an enemy.':
    'Этим действием осталось атак: {count}. Нажмите на врага.',
  'One action': 'Одно действие',
  'Tap an enemy, a friend or your own hero on the map: the buttons that appear are what you can do.':
    'Нажмите на врага, друга или своего героя на карте: появятся кнопки — это то, что вы можете сделать.',
  'At an enemy: attack, or cast a spell.': 'С врагом: атаковать или сотворить заклинание.',
  'On your own hero: {list}.': 'Со своим героем: {list}.',
  'Your action is spent this turn.': 'В этом ходу действие потрачено.',
  'A bonus action': 'Бонусное действие',
  'A quick extra that only some spells and features use. Many turns have none.':
    'Быстрое дополнение, которое нужно лишь некоторым заклинаниям и умениям. Во многих ходах его нет.',
  'Your bonus action is spent this turn.': 'В этом ходу бонусное действие потрачено.',
  'Move and act': 'Двигайтесь и действуйте',
  'Tap a square to move. Tap an enemy, a friend or your own hero: the buttons that appear are what you can do.':
    'Нажмите на клетку, чтобы пойти. Нажмите на врага, друга или своего героя: появятся кнопки — это то, что вы можете сделать.',
  'Finished?': 'Закончили?',
  'Press “End turn”: the next one acts.': 'Нажмите «Завершить ход»: действует следующий.',
  // Spell slots
  'level {level} — {count}': '{level}-й уровень — {count}',
  'No spell slots left: cantrips still work.':
    'Ячеек заклинаний не осталось; заговоры по-прежнему работают.',
  'Spell slots left: {slots}.': 'Осталось ячеек заклинаний: {slots}.',
  // The own actions in plain words
  'Dash — move once more this turn': 'Рывок — пройти ещё столько же в этом ходу',
  'Dodge — be harder to hit until your next turn':
    'Уклонение — по вам труднее попасть до вашего следующего хода',
  'Disengage — walk away without being struck': 'Отход — уйти и не получить удар вслед',
  'Hide — try to slip out of sight': 'Засада — попробовать скрыться из виду',
  'Search — look for something hidden': 'Поиск — искать спрятанное',
  'Study — work something out': 'Изучение — разобраться в чём-то',
  'Utilize — use a thing nearby': 'Использование — воспользоваться предметом рядом',
  'Escape a grapple — break free of what holds you': 'Вырваться — освободиться от захвата',
  'Let go — release the one you hold': 'Отпустить — отпустить того, кого держите',
  'Dismount — get down from your mount': 'Спешиться — слезть с ездового животного',
  // Outside a fight
  'What you can do here': 'Что здесь можно сделать',
  'What you can do at {place}': 'Что можно сделать здесь: {place}',
  'Look around': 'Осмотритесь',
  'Tap a person or a thing on the scene: the buttons that appear are what you can do with it — talk, ask, look closer.':
    'Нажмите на человека или предмет на сцене: появятся кнопки — что с ним можно сделать: поговорить, спросить, рассмотреть.',
  'Go somewhere': 'Пойдите куда-нибудь',
  'Places shows where you can go.': 'В «Местах» видно, куда можно пойти.',
  'Places shows where you can go. Nearby: {places}.':
    'В «Местах» видно, куда можно пойти. Рядом: {places}.',
  'Know your hero': 'Узнайте своего героя',
  'Character has your sheet and your pack; Journal has what you have learned.':
    'В «Персонаже» — лист героя и его вещи, в «Журнале» — всё, что вы узнали.',
  Rolls: 'Броски',
  'When the DM asks for a roll, it appears at the top of the screen.':
    'Когда мастер просит бросок, он появляется в верхней части экрана.',
});

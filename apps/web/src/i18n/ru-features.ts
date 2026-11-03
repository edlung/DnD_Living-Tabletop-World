import { registerRussian } from '@ltw/ui';

/**
 * Russian for the class features in play (docs/adr/0056-characters-from-the-srd.md §4): the
 * features' names as the Russian SRD gives them, their uses, outcomes and refusals.
 */
registerRussian({
  // The resources
  Rage: 'Ярость',
  'Bardic Inspiration': 'Бардовское вдохновение',
  'Channel Divinity': 'Божественный канал',
  'Wild Shape': 'Дикий облик',
  'Second Wind': 'Второе дыхание',
  'Action Surge': 'Всплеск действий',
  Indomitable: 'Упорный',
  'Focus Points': 'Очки сосредоточения',
  'Lay On Hands': 'Наложение рук',
  'Sorcery Points': 'Единицы чародейства',
  'Innate Sorcery': 'Врождённое чародейство',
  'Arcane Recovery': 'Магическое восстановление',
  'Magical Cunning': 'Магическая хитрость',
  'One back after a short rest, all after a long rest.':
    'Одно возвращается после короткого отдыха, все — после продолжительного.',
  'All back after a short or a long rest.':
    'Все возвращаются после короткого или продолжительного отдыха.',
  'All back after a long rest.': 'Все возвращаются после продолжительного отдыха.',
  'Bonus Action. Resistance to bludgeoning, piercing and slashing damage, the Rage Damage bonus with Strength attacks and Advantage on Strength checks and saves until it ends; not in heavy armor.':
    'Бонусное действие. Сопротивление дробящему, колющему и рубящему урону, бонус урона ярости к атакам Силой и преимущество на проверки и спасброски Силы, пока она длится; не в тяжёлом доспехе.',
  'Bonus Action. A creature within 60 ft holds your Bardic Inspiration die for an hour.':
    'Бонусное действие. Существо в пределах 60 фт получает кость бардовского вдохновения на час.',
  'Magic action. The DM applies its effect.': 'Действие «Магия». Эффект применяет мастер.',
  'Bonus Action. The DM applies the form.': 'Бонусное действие. Облик применяет мастер.',
  'Bonus Action. You regain 1d10 + your Fighter level hit points.':
    'Бонусное действие. Вы восстанавливаете 1к10 + уровень воина хитов.',
  'After your action: one more action this turn, not a Magic action.':
    'После вашего действия: ещё одно действие в этот ход, но не «Магия».',
  'After a failed saving throw: the DM rerolls it with your Fighter level added.':
    'После проваленного спасброска: мастер перебрасывает его, прибавляя ваш уровень воина.',
  'Bonus Action. Patient Defense and Step of the Wind apply; the DM applies the rest.':
    'Бонусное действие. Терпеливая защита и Поступь ветра применяются сами; остальное применяет мастер.',
  'Bonus Action. Hit points from the pool to a creature you touch, or five points to end its Poisoned condition.':
    'Бонусное действие. Хиты из запаса существу, которого вы касаетесь, или пять очков, чтобы снять с него состояние «Отравлен».',
  'Font of Magic: a spell slot from points with a Bonus Action, or points from a slot; Metamagic is spent as you cast.':
    'Источник магии: ячейка заклинаний из единиц бонусным действием или единицы из ячейки; метамагия тратится при сотворении.',
  'Bonus Action. The DM applies its benefits for a minute.':
    'Бонусное действие. Его преимущества на минуту применяет мастер.',
  'Out of a fight, as a short rest ends: expended slots worth up to half your Wizard level, none of 6th level or higher.':
    'Вне боя, в конце короткого отдыха: потраченные ячейки суммарного уровня до половины уровня волшебника, не выше 5-го.',
  'Out of a fight: half your Pact Magic slots back, rounded up.':
    'Вне боя: половина ячеек магии договора, с округлением вверх.',
  // The uses
  'End the Rage': 'Закончить ярость',
  Inspire: 'Вдохновить',
  'Roll the die': 'Бросить кость',
  'Use Channel Divinity': 'Использовать Божественный канал',
  'Use Wild Shape': 'Использовать Дикий облик',
  'Use Second Wind': 'Использовать Второе дыхание',
  'Use Action Surge': 'Использовать Всплеск действий',
  'Use Indomitable': 'Использовать Упорство',
  'Spend a Focus Point': 'Потратить очко сосредоточения',
  Heal: 'Вылечить',
  'Spend Sorcery Points': 'Потратить единицы чародейства',
  'Use Innate Sorcery': 'Использовать Врождённое чародейство',
  'Recover the slots': 'Восстановить ячейки',
  'Use Magical Cunning': 'Использовать Магическую хитрость',
  'Flurry of Blows': 'Шквал ударов',
  'Patient Defense': 'Терпеливая защита',
  'Step of the Wind': 'Поступь ветра',
  // The section
  'Class features': 'Умения класса',
  'You hold a Bardic Inspiration die: d{sides}. Roll it after a failed d20 test.':
    'У вас кость бардовского вдохновения: к{sides}. Бросьте её после проваленной проверки к20.',
  '{left} of {max} points': 'осталось {left} из {max} очков',
  '{left} of {max} left': 'осталось {left} из {max}',
  'Every class feature, in its words': 'Все умения класса — текст правил',
  'The features could not be read.': 'Не удалось прочитать умения.',
  'Reading the features…': 'Читаем умения…',
  '{class} {level}': '{class} {level}',
  'Whom you touch': 'Кого вы касаетесь',
  Points: 'Очки',
  'End Poisoned (5 points)': 'Снять отравление (5 очков)',
  'Whom you inspire': 'Кого вдохновить',
  'A slot from points': 'Ячейка из единиц',
  'Level {level}: {cost} points': '{level}-й уровень: {cost} ед.',
  'Make the slot': 'Создать ячейку',
  'Points from a slot': 'Единицы из ячейки',
  'A level {level} slot: {level} points': 'Ячейка {level}-го уровня: {level} ед.',
  'Turn it into points': 'Превратить в единицы',
  'Expended slots to recover': 'Потраченные ячейки для восстановления',
  'No slot of 1st to 5th level is expended.': 'Потраченных ячеек 1–5-го уровня нет.',
  'Up to {limit} slot levels in all: {total} chosen.':
    'Не больше {limit} уровней ячеек в сумме: выбрано {total}.',
  // Outcomes and the history
  'The Rage ends.': 'Ярость закончилась.',
  'Your Bardic Inspiration die shows {roll}: add it to the failed d20 test; the DM applies it.':
    'На кости бардовского вдохновения выпало {roll}: прибавьте к проваленной проверке к20 — это применяет мастер.',
  '{feature}: {count} hit points back.': '{feature}: восстановлено хитов — {count}.',
  '{feature} used.': '{feature}: использовано.',
  '{feature} used: {count} left.': '{feature}: использовано, осталось {count}.',
  'Ended the Rage': 'Закончил ярость',
  'Rolled a Bardic Inspiration die': 'Бросил кость бардовского вдохновения',
  'Used {feature}': 'Использовал: {feature}',
  'Used {feature} on {target}': 'Использовал «{feature}» на: {target}',
  // The rules' refusals
  'not a feature': 'у персонажа нет этого умения',
  'already raging': 'ярость уже идёт',
  'not raging': 'ярости нет',
  'heavy armor': 'в тяжёлом доспехе',
  'action unused': 'сначала потратьте действие',
  'already surged': 'всплеск действий уже был в этот ход',
  'surge not magic': 'действие всплеска — не «Магия»',
  'no inspiration die': 'нет кости вдохновения',
  'already inspired': 'у него уже есть кость вдохновения',
  'out of fight only': 'только вне боя',
  'too many slots': 'слишком много уровней ячеек',
  'no slot expended': 'нет потраченной ячейки',
  'slot too high': 'ячейка слишком высокого уровня',
  'points full': 'единицы и так полные',
  'not poisoned': 'не отравлен',
  'needs no healing': 'хиты и так полные',
});

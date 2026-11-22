// Published pre-finale table states. Each route records what the group chose or brought.
export const histories = {
  'ember-crown': {
    balanced:
      'Помогали воротам, Нижнему городу и кузне. Сохранили союз и заставили Жаровню замолчать.',
    gates: 'Укрепляли ворота и кузню. Тростники поддержали отряд, Жаровня продолжала работать.',
    abandoned: 'Все силы отдали воротам и кузне. Нижний город оставили без эвакуации и союза.',
  },
  'ash-testament': {
    careful: 'Шли по мачтам с отрывом, сохранили расписку, выбрали дорогу без лодки.',
    middle: 'Взяли лодку, сохранили расписку и подошли к настилу близко к колонне.',
    hurried: 'Взяли лодку, потеряли расписку и вывели раненого Ефима к колонне.',
  },
  'hollow-choir': {
    cautious: 'Делили свет, сняли ключ и вынесли ящик Урмов. Дом получил одного гостя.',
    middle: 'Сберегли часть света и добыли ключ. Дом успел взять двух гостей.',
    noisy:
      'Разделялись в темноте, оставили ящик, шли к лестнице без ключа. Дом успел взять четверых.',
  },
  'glass-republic': {
    city: 'Сохранили стёкла у отряда, предупредили Орена, нашли Богдана.',
    middle: 'Зелёное стекло отдали Кассии, Юла ушла, до Богдана не добрались.',
    late: 'Кассия получила три стекла. Имена дошли до причала раньше предупреждения.',
    general: 'Удержали стёкла, предупредили Орена, приняли два удара и поддержали генерала.',
  },
  'salt-meridian': {
    quiet: 'Договорились с рифом, показали Инне карту, сохранили сигнальную книгу.',
    middle: 'Риф остался нейтральным, Инне показали карту, для сигналов оставили азбуку.',
    loud: 'Поссорились с рифом, Инне карту не показывали, на мачте осталась только азбука.',
  },
  'rain-check': {
    attentive:
      'Завоевали доверие Савелия, собрали три слова, договорились с Хельгой и вызвали Фалька.',
    middle: 'Савелий доверился, нашли одно домашнее слово. Обе команды продолжают погоню.',
    noisy: 'Публично выдавали след, ранили Савелия, доверия и домашних слов нет.',
  },
};
export const finalKey = {
  'ember-crown': 'battle-for-the-gate',
  'ash-testament': 'long-planks-ambush',
  'hollow-choir': 'six-strokes',
  'glass-republic': 'banner-hall-list',
  'salt-meridian': 'chain-rock-battle',
  'rain-check': 'roof-duel',
};
export function passBy(slug, profile, key) {
  if (slug === 'ash-testament' && profile === 'careful' && key === 'burnt-grove')
    return 'Ефим остался с отрядом, погони за ним в роще нет.';
  if (slug === 'salt-meridian' && profile === 'quiet' && key === 'reef-lanterns')
    return 'Мирная починка огня по договору с рифом.';
  if (slug === 'rain-check' && profile === 'attentive' && key === 'market-scouts')
    return 'Рынок пройден без открытой погони.';
  if (slug === 'ember-crown' && profile === 'abandoned' && key === 'coal-tower-breach')
    return 'Отряд оставил семьи за пределами эвакуационного прохода.';
  if (slug === 'ember-crown' && profile !== 'balanced' && key === 'catapult-sortie')
    return 'Оставляем вылазку и ставим людей у ворот.';
  if (slug === 'salt-meridian' && profile === 'quiet' && key !== 'chain-rock-battle')
    return 'Пользуемся тихим выходом из карточки встречи, сохраняя низкую тревогу.';
  if (slug === 'hollow-choir' && profile === 'cautious' && key === 'niche-guards')
    return 'Переносим ящик мирно. Сторожей не тревожим.';
  return null;
}

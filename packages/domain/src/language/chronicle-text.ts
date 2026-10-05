import type { Language } from '@ltw/contracts';

/**
 * The Chronicle's fixed words (docs/adr/0024-chronicle.md; docs/adr/0031-play-language.md):
 * the entries the DM's chronicle tells, the memories suggested for moments no one
 * remembered, the template prose, and the rule that an account or a guess is told as one.
 */
export interface ChronicleText {
  died(name: string): string;
  destroyed(name: string): string;
  fightBroke(place: string, names: string): string;
  fightEnded: string;
  answeredWith(name: string, reaction: string): string;
  toldTo(npc: string, listener: string, statement: string): string;
  examined(character: string, entity: string): string;
  hypothesis(statement: string): string;
  dayBegan(day: number): string;
  wentTo(name: string, place: string): string;
  enteredStory(name: string): string;

  /** Memory suggestions. */
  readonly aFoe: string;
  readonly unknownPlace: string;
  foes(count: number): string;
  battle(place: string, foes: string, fell: number, countered: boolean): string;
  accountsDisagree(statement: string): string;
  arrived(place: string): string;
  returned(place: string): string;
  dayDawned(day: number): string;

  /** Prose. */
  accountLabel(knowledgeType: string): string;
  /** Whether a paragraph says whose account it is, or how uncertain. */
  readonly hedge: RegExp;
  readonly reactionName: (reaction: string) => string;
}

const en: ChronicleText = {
  died: (name) => `${name} died.`,
  destroyed: (name) => `${name} was destroyed.`,
  fightBroke: (place, names) => `A fight broke out at ${place}: ${names}.`,
  fightEnded: 'The fight ended.',
  answeredWith: (name, reaction) => `${name} answered with ${reaction}.`,
  toldTo: (npc, listener, statement) => `${npc} told ${listener}: ${statement}`,
  examined: (character, entity) => `${character} examined ${entity}.`,
  hypothesis: (statement) => `A hypothesis was formed: ${statement}`,
  dayBegan: (day) => `Day ${String(day)} began.`,
  wentTo: (name, place) => `${name} went to ${place}.`,
  enteredStory: (name) => `${name} entered the story.`,

  aFoe: 'a foe',
  unknownPlace: 'an unknown place',
  foes: (count) => `${String(count)} foes`,
  battle: (place, foes, fell, countered) =>
    `We fought ${foes} at ${place}.${fell > 0 ? ` ${String(fell)} of them fell.` : ''}${
      countered ? ' A spell was countered.' : ''
    }`,
  accountsDisagree: (statement) => `We realized that the accounts disagree: ${statement}`,
  arrived: (place) => `We arrived at ${place}.`,
  returned: (place) => `We returned to ${place}.`,
  dayDawned: (day) => `Day ${String(day)} dawned.`,

  accountLabel: (type) =>
    ({
      TESTIMONY: 'According to that account',
      RUMOR: 'A rumor said',
      INFERENCE: 'It seemed',
      HYPOTHESIS: 'A suspicion, not established',
      CONTRADICTION: 'Accounts disagreed',
      UNKNOWN: 'It remained unknown',
    })[type] ?? 'Reportedly',
  hedge:
    /\b(said|says|told|tells|claim\w*|according|report\w*|suspect\w*|suspicio\w*|believ\w*|thought|think\w*|rumou?r\w*|perhaps|maybe|might|may|seem\w*|wonder\w*|account\w*|disagree\w*|unclear|unknown|uncertain\w*|apparently|suppos\w*|hypothes\w*|guess\w*)\b/i,
  reactionName: (reaction) => reaction,
};

const RU_REACTIONS: Readonly<Record<string, string>> = { counterspell: 'Контрзаклинание' };

/**
 * Stems of Russian words of attribution and uncertainty. JavaScript's `\b` knows only
 * ASCII letters, so the match is anchored with Unicode letter lookarounds instead.
 */
const RU_HEDGE_STEMS = [
  'говор',
  'сказал',
  'сказан',
  'расска',
  'сообщ',
  'утвержд',
  'согласно',
  'со слов',
  'по слов',
  'свидетел',
  'подозр',
  'полага',
  'счита',
  'дума',
  'казал',
  'кажет',
  'мнени',
  'возможно',
  'вероятно',
  'видимо',
  'слух',
  'предполаг',
  'гипотез',
  'догадк',
  'неясн',
  'неизвестн',
  'неопределённ',
  'неопределенн',
  'расходят',
  'расходил',
  'противореч',
  'версия',
  'версии',
];

const ru: ChronicleText = {
  died: (name) => `Гибель: ${name}.`,
  destroyed: (name) => `Уничтожено: ${name}.`,
  fightBroke: (place, names) => `Началась схватка. Место: ${place}. Участники: ${names}.`,
  fightEnded: 'Схватка закончилась.',
  answeredWith: (name, reaction) => `Реакция: ${name} — ${RU_REACTIONS[reaction] ?? reaction}.`,
  toldTo: (npc, listener, statement) =>
    `Рассказ. Говорит: ${npc}. Слушает: ${listener}. ${statement}`,
  examined: (character, entity) => `Осмотр. Персонаж: ${character}. Предмет: ${entity}.`,
  hypothesis: (statement) => `Выдвинута гипотеза: ${statement}`,
  dayBegan: (day) => `Начался день ${String(day)}.`,
  wentTo: (name, place) => `Перемещение: ${name} → ${place}.`,
  enteredStory: (name) => `Новое лицо в истории: ${name}.`,

  aFoe: 'противник',
  unknownPlace: 'неизвестное место',
  foes: (count) => `противников: ${String(count)}`,
  battle: (place, foes, fell, countered) =>
    `Бой. Место: ${place}. Противники: ${foes}.${fell > 0 ? ` Пало: ${String(fell)}.` : ''}${
      countered ? ' Заклинание отражено.' : ''
    }`,
  accountsDisagree: (statement) => `Рассказы расходятся: ${statement}`,
  arrived: (place) => `Прибытие: ${place}.`,
  returned: (place) => `Возвращение: ${place}.`,
  dayDawned: (day) => `Начался день ${String(day)}.`,

  accountLabel: (type) =>
    ({
      TESTIMONY: 'Со слов рассказчика',
      RUMOR: 'Ходил слух',
      INFERENCE: 'Казалось',
      HYPOTHESIS: 'Подозрение, не установлено',
      CONTRADICTION: 'Рассказы расходились',
      UNKNOWN: 'Осталось неизвестным',
    })[type] ?? 'Сообщается',
  hedge: new RegExp(`(?<![\\p{L}])(?:${RU_HEDGE_STEMS.join('|')})`, 'iu'),
  reactionName: (reaction) => RU_REACTIONS[reaction] ?? reaction,
};

export const chronicleText = (language: Language): ChronicleText => (language === 'ru' ? ru : en);

import type { Language } from '@ltw/contracts';

/** The neutral wording of a detected contradiction (ADR 0014); no statement is quoted. */
export interface ContradictionText {
  /** What a name stands for when its entity is not known. */
  readonly something: string;
  readonly someone: string;
  /** An unattributed record, by its knowledge type (`TESTIMONY`, …). */
  anonymous(knowledgeType: string): string;
  sameHolder(subject: string, who: string): string;
  twoHolders(subject: string, first: string, second: string): string;
}

const en: ContradictionText = {
  something: 'something',
  someone: 'someone',
  anonymous: (type) => `the ${type.toLowerCase()}`,
  sameHolder: (subject, who) => `Conflicting accounts of ${subject}: ${who} said different things.`,
  twoHolders: (subject, a, b) => `Conflicting accounts of ${subject}: ${a} and ${b} disagree.`,
};

const RU_TYPES: Readonly<Record<string, string>> = {
  TESTIMONY: 'свидетельство',
  RUMOR: 'слух',
  INFERENCE: 'вывод',
  HYPOTHESIS: 'гипотеза',
  EVIDENCE: 'улика',
  FACT: 'факт',
  UNKNOWN: 'неизвестное',
  SECRET: 'тайна',
  CONTRADICTION: 'противоречие',
};

const ru: ContradictionText = {
  something: 'нечто',
  someone: 'кто-то',
  anonymous: (type) => RU_TYPES[type] ?? type.toLowerCase(),
  sameHolder: (subject, who) =>
    `Рассказы расходятся. Предмет: ${subject}. Источник: ${who}, версии разные.`,
  twoHolders: (subject, a, b) => `Рассказы расходятся. Предмет: ${subject}. Источники: ${a}; ${b}.`,
};

export const contradictionText = (language: Language): ContradictionText =>
  language === 'ru' ? ru : en;

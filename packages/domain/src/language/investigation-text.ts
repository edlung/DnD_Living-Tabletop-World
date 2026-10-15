import type { Language } from '@ltw/contracts';

/**
 * Sentences the investigation commands record (docs/adr/0031-play-language.md).
 * English reads as before; Russian is built from labels and nominative names, never
 * inflected, and never agrees with anyone's gender (owner decision, ADR 0031 §5).
 */
export interface InvestigationText {
  told(npc: string, listener: string, topic: string): string;
  showed(actor: string, npc: string, topics: string): string;
  sensedMagic(actor: string, statement: string): string;
  examined(actor: string, entity: string, statement: string): string;
  holdingBack(npc: string, topic: string | null): string;
}

const en: InvestigationText = {
  told: (npc, listener, topic) => `${npc} told ${listener} about ${topic}.`,
  showed: (actor, npc, topics) => `${actor} showed ${npc} evidence about ${topics}.`,
  sensedMagic: (actor, statement) => `${actor} sensed magic: ${statement}`,
  examined: (actor, entity, statement) => `${actor} examined ${entity}: ${statement}`,
  holdingBack: (npc, topic) => `${npc} seems to be holding something back about ${topic ?? 'it'}.`,
};

const ru: InvestigationText = {
  told: (npc, listener, topic) => `Беседа. Говорит: ${npc}. Слушает: ${listener}. Тема: ${topic}.`,
  showed: (actor, npc, topics) => `Улики. Показывает: ${actor}. Смотрит: ${npc}. Тема: ${topics}.`,
  sensedMagic: (actor, statement) => `Чутьё на магию. Персонаж: ${actor}. ${statement}`,
  examined: (actor, entity, statement) =>
    `Осмотр. Персонаж: ${actor}. Предмет: ${entity}. ${statement}`,
  holdingBack: (npc, topic) =>
    `Впечатление: ${npc} что-то скрывает. Тема: ${topic ?? 'не названа'}.`,
};

export const investigationText = (language: Language): InvestigationText =>
  language === 'ru' ? ru : en;

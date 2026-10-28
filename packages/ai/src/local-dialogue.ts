import { MAX_NPC_REPLY, type Attitude } from '@ltw/contracts';

import type { DialoguePrompt } from './dialogue-prompt.ts';

/**
 * Deterministic NPC replies for the local provider (docs/adr/0020-npc-intelligence.md
 * §3): templates filled only from the prompt, which holds only the NPC's
 * minimal context. The player's words are never read, so they cannot steer
 * the reply. The same prompt always gets the same reply.
 */
const MANNER: Readonly<Record<Attitude, string>> = {
  HOSTILE: 'glares',
  WARY: 'eyes you warily',
  NEUTRAL: 'looks up',
  FRIENDLY: 'smiles',
  TRUSTED: 'greets you warmly',
};

const GREETING: Readonly<Record<Attitude, string>> = {
  HOSTILE: 'Say what you want and go.',
  WARY: 'What do you want?',
  NEUTRAL: 'Can I help you?',
  FRIENDLY: 'Good to see you. What can I do for you?',
  TRUSTED: 'Always glad to see you, friend.',
};

/** To someone it has spoken with before (owner decisions 11, SI-N1): no fresh greeting. */
const GREETING_AGAIN: Readonly<Record<Attitude, string>> = {
  HOSTILE: 'You again. Say what you want and go.',
  WARY: 'You again? What now?',
  NEUTRAL: 'Back again. What else can I do for you?',
  FRIENDLY: 'Good to see you again. What else can I do for you?',
  TRUSTED: 'Welcome back, friend.',
};

/**
 * Russian replies (ADR 0031): present tense and nominative names only, so nothing
 * agrees with anyone's gender and no name is declined.
 */
const MANNER_RU: Readonly<Record<Attitude, string>> = {
  HOSTILE: 'смотрит с неприязнью',
  WARY: 'смотрит настороженно',
  NEUTRAL: 'поднимает взгляд',
  FRIENDLY: 'улыбается',
  TRUSTED: 'тепло встречает вас',
};

const GREETING_RU: Readonly<Record<Attitude, string>> = {
  HOSTILE: 'Говорите, что нужно, и уходите.',
  WARY: 'Что вам нужно?',
  NEUTRAL: 'Чем могу помочь?',
  FRIENDLY: 'Добро пожаловать. Чем могу помочь?',
  TRUSTED: 'Всегда приятно вас видеть, друг мой.',
};

const GREETING_AGAIN_RU: Readonly<Record<Attitude, string>> = {
  HOSTILE: 'Опять вы. Говорите, что нужно, и уходите.',
  WARY: 'Снова вы? Что ещё?',
  NEUTRAL: 'Снова вы. Чем ещё могу помочь?',
  FRIENDLY: 'Снова здравствуйте. Чем ещё могу помочь?',
  TRUSTED: 'С возвращением, друг мой.',
};

function saidRu(prompt: DialoguePrompt): string {
  if (prompt.justTold.length > 0) return prompt.justTold.join(' ');
  if (prompt.intent === 'ask' && prompt.toldOnTopic.length > 0) {
    return `Повторю то, что уже сказано: ${prompt.toldOnTopic.join(' ')}`;
  }
  if (prompt.intent === 'ask') {
    if (prompt.topic === null) return 'Я об этом ничего не знаю.';
    return prompt.guarded.includes(prompt.topic)
      ? `Тема «${prompt.topic}» — не для разговора.`
      : `О теме «${prompt.topic}» мне ничего не известно.`;
  }
  if (prompt.intent === 'show' && prompt.accepted) {
    return prompt.mayTell.length + prompt.toldBefore.length > 0
      ? 'Понимаю. Спрашивайте, что хотите узнать.'
      : 'Понимаю. Мне это ничего не говорит.';
  }
  return (prompt.metBefore ? GREETING_AGAIN_RU : GREETING_RU)[prompt.attitude];
}

function said(prompt: DialoguePrompt): string {
  if (prompt.justTold.length > 0) return prompt.justTold.join(' ');
  if (prompt.intent === 'ask' && prompt.toldOnTopic.length > 0) {
    return `As I told you: ${prompt.toldOnTopic.join(' ')}`;
  }
  if (prompt.intent === 'ask') {
    if (prompt.topic === null) return 'I know nothing about that.';
    return prompt.guarded.includes(prompt.topic)
      ? `${prompt.topic} is not something I will discuss.`
      : `I know nothing about ${prompt.topic}.`;
  }
  if (prompt.intent === 'show' && prompt.accepted) {
    return prompt.mayTell.length + prompt.toldBefore.length > 0
      ? 'I see. Ask what you want to know.'
      : 'I see. It tells me nothing.';
  }
  return (prompt.metBefore ? GREETING_AGAIN : GREETING)[prompt.attitude];
}

export function replyLocally(prompt: DialoguePrompt): { reply: string } {
  const russian = prompt.language === 'ru';
  const reply = russian
    ? `${prompt.npc ?? 'Незнакомец'} ${MANNER_RU[prompt.attitude]}. «${saidRu(prompt)}»`
    : `${prompt.npc ?? 'The stranger'} ${MANNER[prompt.attitude]}. “${said(prompt)}”`;
  return {
    reply:
      reply.length <= MAX_NPC_REPLY
        ? reply
        : `${reply.slice(0, MAX_NPC_REPLY - 2)}…${russian ? '»' : '”'}`,
  };
}

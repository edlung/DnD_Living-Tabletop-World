import type { BookVoice } from '../../../packages/contracts/src/index.ts';

/**
 * Whom a scene's text speaks to (docs/adr/0074-dm-book.md §2.6). It is the DM's when it names the
 * table from outside — heroes, players, the DM, a roll, a check, a scene — or tells the DM what to
 * do in the plural imperative outside a quotation. Otherwise it can be read to the players.
 * The rule leans to the DM: a text wrongly called the DM's is retold, a text wrongly called the
 * players' would be read aloud with its stage directions.
 */
const L = 'А-Яа-яЁё';
const ABOUT_THE_TABLE = new RegExp(
  `(?<![${L}])(?:геро(?:й|я|ю|е|и|ев|ям|ями|ях)|игрок|ведущ|парти(?:я|и|ю|ей)|персонаж|отряд|брос(?:ок|ка|ку|ком|ки|ков)|проверк|сцен(?:а|ы|у|е|ой)|стол(?:а|у|е|ом)?(?![а-яё])|NPC|DM)`,
  'iu',
);
const TOLD_TO_THE_DM = new RegExp(`(?:^|[.!?]\\s+)[А-ЯЁ][а-яё]+(?:йте|ите|ьте)(?![${L}])`, 'u');
const QUOTED = /«[^»]*»|"[^"]*"|„[^“]*“/gu;

export function voiceOf(text: string): BookVoice {
  const outside = text.replace(QUOTED, ' ');
  return ABOUT_THE_TABLE.test(outside) || TOLD_TO_THE_DM.test(outside) ? 'dm' : 'players';
}

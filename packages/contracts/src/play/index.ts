/**
 * Table play beside the world: the table's screen (docs/adr/0042-table-display.md) and the
 * table's talk and the companion (docs/adr/0044-online-play.md); the DM's library of kept handouts
 * and random tables (docs/adr/0058-campaign-content.md §3–4).
 */
export * from '../display/display.ts';
export * from '../display/sound.ts';
export * from '../display/music.ts';
export * from '../chat/chat.ts';
export * from './handouts.ts';
export * from './library.ts';
// A player given another character (ADR 0044 §6), beside the members' contracts.
export { giveCharacterRequestSchema } from '../session/auth.ts';

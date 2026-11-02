/**
 * Table play beside the world: the table's screen (docs/adr/0042-table-display.md) and the
 * table's talk and the companion (docs/adr/0044-online-play.md).
 */
export * from '../display/display.ts';
export * from '../chat/chat.ts';
export * from './handouts.ts';
// A player given another character (ADR 0044 §6), beside the members' contracts.
export { giveCharacterRequestSchema } from '../session/auth.ts';

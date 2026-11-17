import type { NextGame } from '@ltw/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * The next game (docs/adr/0071-memory-and-ritual.md §3): the date the DM set, as the table reads
 * it, and as a calendar file. A date stays shown through its own evening and is past six hours
 * after it began; one already past, or further than two years ahead, is not one to set.
 */
const HOUR_MS = 3_600_000;
export const SHOWN_AFTER_MS = 6 * HOUR_MS;
const AHEAD_MS = 2 * 366 * 24 * HOUR_MS;
/** How long a game is taken to last in a calendar: an evening. */
const EVENING_MS = 3 * HOUR_MS;

/** The date as the table reads it now; null once it has passed. */
export function shownNextGame(next: NextGame | null, now: string): NextGame | null {
  return next !== null && Date.parse(next.at) + SHOWN_AFTER_MS > Date.parse(now) ? next : null;
}

/** Whether the DM may set this date now. */
export function settable(at: string, now: string): boolean {
  const ahead = Date.parse(at) - Date.parse(now);
  // What could not be shown is not set: the DM is never told "everyone sees it" of a date nobody does.
  return Number.isFinite(ahead) && ahead > -SHOWN_AFTER_MS && ahead < AHEAD_MS;
}

/** A calendar's text value (RFC 5545 §3.3.11): its own escapes, no control characters. */
const CONTROL = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(9)}${String.fromCharCode(11)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
);
const text = (value: string) =>
  value
    .replace(CONTROL, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

/** An instant in a calendar's UTC form. */
const stamp = (instant: number) =>
  new Date(instant)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

/** Lines of at most 75 octets (§3.1): a longer one continues on a line that starts with a space. */
function folded(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length === 0 ? 75 : 74), bytes.length);
    // Never inside a character: step back off a continuation byte.
    while (end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return parts.join('\r\n ');
}

/**
 * The next game as a calendar file: one event with a stable UID, so a changed date replaces the
 * event a calendar already holds, and two reminders — a day and an hour before. It carries the
 * campaign's name, the instant and the DM's line; nothing of the world.
 */
export function nextGameCalendar(input: {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly next: NextGame;
  /** The server's host, for the event's UID. */
  readonly host: string;
  readonly now: string;
  /** How many times the date was set: a calendar takes the higher sequence as the newer event. */
  readonly sequence: number;
}): string {
  const start = Date.parse(input.next.at);
  const summary = text(input.campaignName);
  const alarm = (trigger: string) => [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    `TRIGGER:${trigger}`,
    'END:VALARM',
  ];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Living Tabletop World//Next game//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:next-game-${input.campaignId}@${input.host}`,
    `DTSTAMP:${stamp(Date.parse(input.now))}`,
    `SEQUENCE:${String(input.sequence)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + EVENING_MS)}`,
    `SUMMARY:${summary}`,
    ...(input.next.note === '' ? [] : [`DESCRIPTION:${text(input.next.note)}`]),
    ...alarm('-P1D'),
    ...alarm('-PT1H'),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
    .map(folded)
    .join('\r\n');
}

/**
 * Sends the file. Inline, so a phone's browser offers its own calendar; a browser that shows no
 * calendars saves it under the name given.
 */
export function sendNextGame(
  request: FastifyRequest,
  reply: FastifyReply,
  input: {
    readonly campaignId: string;
    readonly campaignName: string;
    readonly next: NextGame;
    readonly now: string;
  },
): FastifyReply {
  const file = nextGameCalendar({
    ...input,
    host: request.hostname.replace(/[^A-Za-z0-9.-]/g, ''),
    // Minutes since the epoch: a file saved later replaces an earlier one in a calendar.
    sequence: Math.floor(Date.parse(input.now) / 60_000),
  });
  return reply
    .header('content-type', 'text/calendar; charset=utf-8')
    .header('content-disposition', `inline; filename="next-game-${input.campaignId}.ics"`)
    .header('cache-control', 'no-store')
    .send(file);
}

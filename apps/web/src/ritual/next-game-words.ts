import type { NextGame } from '@ltw/contracts';

/**
 * The next game in words (docs/adr/0071-memory-and-ritual.md §3): the day and the hour in the
 * reader's own time zone and language, and how far off it is by the calendar's days.
 */
const DAY_MS = 86_400_000;

/** Whole calendar days from `now` to `at`, in the reader's time zone; never below zero. */
export function daysUntil(at: Date, now: Date): number {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.round((day(at).getTime() - day(now).getTime()) / DAY_MS));
}

/** "today", "tomorrow" or "in 6 days", as the reader's language says and declines it. */
export const untilWords = (locale: string, days: number): string =>
  new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');

/**
 * The locale a date is written in: the campaign's language, in the reader's own flavour of it
 * when their browser names one ("en-GB" writes 18:00 where "en-US" writes 6:00 PM).
 */
export function readerLocale(
  language: string,
  preferred: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): string {
  const base = (tag: string) => tag.toLowerCase().split('-')[0];
  return preferred.find((tag) => base(tag) === base(language)) ?? language;
}

/** "Saturday, 21 November, 18:00" in the reader's language, habits and time zone. */
export const whenWords = (at: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);

/** When, and how far off: "Saturday, 21 November at 18:00 — in 6 days". */
export function nextGameWords(next: NextGame, locale: string, now: Date = new Date()): string {
  const at = new Date(next.at);
  return `${whenWords(at, locale)} — ${untilWords(locale, daysUntil(at, now))}`;
}

/** Milliseconds from `now` to just after the reader's next midnight. */
export const msToNextDay = (now: Date): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 1_000;

/** An instant as a `datetime-local` field holds it, in the reader's time zone. */
export function toLocalInput(iso: string): string {
  const at = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** A `datetime-local` field's value as an instant; null when it holds no date. */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

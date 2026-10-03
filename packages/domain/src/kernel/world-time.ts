import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from '@ltw/contracts';

/**
 * Builds a world time from a day number and time of day. Day 1 00:00:00 is 0;
 * Day 0 and earlier are backstory before the campaign epoch.
 */
export function worldTimeAt(day: number, hours = 0, minutes = 0, seconds = 0): number {
  return (
    (day - 1) * SECONDS_PER_DAY + hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + seconds
  );
}

/** Formats a world time as `Day N HH:MM:SS` (presentation only). */
export function formatWorldTime(time: number): string {
  const day = Math.floor(time / SECONDS_PER_DAY) + 1;
  const ofDay = time - (day - 1) * SECONDS_PER_DAY;
  const hh = Math.floor(ofDay / SECONDS_PER_HOUR);
  const mm = Math.floor((ofDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const ss = ofDay % SECONDS_PER_MINUTE;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `Day ${day} ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/**
 * Compares optional origins where `null` means "before recorded history"
 * (earlier than any concrete world time).
 */
export function isAtOrAfter(time: number | null, origin: number | null): boolean {
  if (origin === null) return true;
  if (time === null) return false;
  return time >= origin;
}

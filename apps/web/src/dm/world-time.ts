import type { Translate } from '@ltw/ui';

const DAY = 86_400;

/** "Day 2 · 10:00" for a world time in seconds (Day 1 starts at 0); `t` speaks the campaign's language. */
export function formatWorldTime(seconds: number, t?: Translate): string {
  const say =
    t ??
    ((key: string, params?: Record<string, string | number>) =>
      key.replace(/\{(\w+)\}/g, (whole, name: string) => String(params?.[name] ?? whole)));
  if (seconds < 0) {
    const days = Math.ceil(-seconds / DAY);
    return say(days === 1 ? '{count} day before Day 1' : '{count} days before Day 1', {
      count: days,
    });
  }
  const day = Math.floor(seconds / DAY) + 1;
  const within = ((seconds % DAY) + DAY) % DAY;
  const hours = String(Math.floor(within / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((within % 3600) / 60)).padStart(2, '0');
  return say('Day {day} · {time}', { day, time: `${hours}:${minutes}` });
}

/** Ravenford's "return" moment: Day 2 at 10:00 (fixtures/ravenford/day-two.json). */
export const DAY_TWO_MORNING = 122_400;

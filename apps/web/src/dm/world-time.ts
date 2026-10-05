const DAY = 86_400;

/** "Day 2 · 10:00" for a world time in seconds (Day 1 starts at 0). */
export function formatWorldTime(seconds: number): string {
  if (seconds < 0) {
    const days = Math.ceil(-seconds / DAY);
    return `${String(days)} ${days === 1 ? 'day' : 'days'} before Day 1`;
  }
  const day = Math.floor(seconds / DAY) + 1;
  const within = ((seconds % DAY) + DAY) % DAY;
  const hours = String(Math.floor(within / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((within % 3600) / 60)).padStart(2, '0');
  return `Day ${String(day)} · ${hours}:${minutes}`;
}

/** Ravenford's "return" moment: Day 2 at 10:00 (fixtures/ravenford/day-two.json). */
export const DAY_TWO_MORNING = 122_400;

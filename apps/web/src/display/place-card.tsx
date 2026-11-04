import { useEffect, useState } from 'react';

/** How long the card stays over the picture before only the caption is left. */
const CARD_MS = 4000;

/**
 * A place's title card (docs/adr/0059-atmosphere.md §4): its name, the day and hour, the weather,
 * big over its picture for a few seconds when the scene's place changes; then only the caption
 * stays, saying the same. Shown again for each new place (its parent keys it by the place).
 */
export function PlaceCard({
  name,
  when,
  weather,
}: {
  readonly name: string;
  readonly when: string;
  readonly weather: string | null;
}) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShown(false);
    }, CARD_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  if (!shown) return null;
  // The caption below says it all for a screen reader: the card is the room's.
  return (
    <div className="display-place-card" aria-hidden="true">
      <h2>{name}</h2>
      <p>{weather === null ? when : `${when} · ${weather}`}</p>
    </div>
  );
}

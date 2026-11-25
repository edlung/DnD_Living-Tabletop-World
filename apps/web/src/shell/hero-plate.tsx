import { effectiveMaximum, type CharacterSheetResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { usePortrait } from '../world/use-portrait.ts';
import { useRereadOn } from '../world/use-world-data.ts';

/** Where the top bar keeps room for the hero's plate (`top-bar.tsx`). */
export const HERO_SLOT_ID = 'topbar-hero';
/**
 * The screens whose head shows the plate (`styles/phone-head.css`): only there is it mounted, so
 * a wider screen reads no sheet for it.
 */
export const PLATE_SCREENS = '(max-width: 700px)';

/** The share of hit points left, as a bar width (drawn markup, not a picture). */
const share = (current: number, max: number) =>
  `${String(Math.max(0, Math.min(100, (100 * current) / Math.max(1, max))))}%`;

/**
 * The hero at the head of a player's phone (docs/adr/0075-book-interface.md §21): the portrait,
 * the name, hit points with their bar and the Armor Class, as the hero's own sheet has them, and
 * one press opens the sheet. The world screen knows whom the viewer plays and writes the plate
 * into the top bar's slot on a phone (`PLATE_SCREENS`), where it stands in place of the campaign's
 * name (`styles/phone-head.css`); a wider screen keeps the name and the party's row and mounts no
 * plate. Every number is the server's; nothing shows until the sheet is read, and nothing for a
 * hero without one.
 */
export function HeroPlate({
  api,
  heroId,
  name,
  revision,
  onOpen,
}: {
  readonly api: WorldApi;
  readonly heroId: string;
  readonly name: string;
  readonly revision: number;
  readonly onOpen: () => void;
}) {
  const t = useT();
  const numbers = useId();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(HERO_SLOT_ID));
  }, []);
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .get<CharacterSheetResponse>(`entities/${encodeURIComponent(heroId)}/sheet`, signal)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }),
    [api, heroId],
  );
  const { resource, reread } = useResource(`hero-plate:${heroId}`, load);
  useRereadOn(revision, reread);
  const image = usePortrait(api, heroId);
  const value = resource.status === 'ready' ? resource.value : null;
  if (!slot || !value) return null;
  const { sheet, derived } = value;
  const { current } = sheet.hitPoints;
  const max = effectiveMaximum(sheet.hitPoints);
  const armor = derived?.wildShape?.current?.armorClass ?? sheet.armorClass;
  return createPortal(
    <button
      type="button"
      className="hero-plate"
      aria-haspopup="dialog"
      aria-label={t('Open the sheet of {name}', { name })}
      aria-describedby={numbers}
      onClick={onOpen}
    >
      <Medallion image={image} kind="character" size="sm" tone="party" />
      <span className="hero-plate-name" aria-hidden="true">
        {name}
      </span>
      <span className="hero-plate-numbers" aria-hidden="true">
        <span className="hero-plate-hp">
          <Glyph name="hit-points" />
          {current}/{max}
        </span>
        <span className="hero-plate-ac">
          <Glyph name="armor-class" />
          {armor}
        </span>
      </span>
      <span className={`hp-bar${current * 2 <= max ? ' hp-bar--low' : ''}`} aria-hidden="true">
        <span style={{ width: share(current, max) }} />
      </span>
      {/* The button's name is what it does; its numbers are its description. */}
      <span id={numbers} className="visually-hidden">
        {t('Hit points: {current} / {max}', { current, max })}
        {' · '}
        {t('Armor class')} {armor}
      </span>
    </button>,
    slot,
  );
}

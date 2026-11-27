import { effectiveMaximum } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import type { WorldApi } from '../api/client.ts';
import { useHeroSheet } from '../character/use-hero-sheet.ts';
import { classLine, signed } from '../character/words.ts';
import { useDiceTable } from '../dice/table.tsx';
import { temporaryWords, loweredWords } from '../combat/hit-point-words.ts';
import type { HeroTab } from '../shell/use-shell.ts';
import { useApprovedImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { usePortrait } from './use-portrait.ts';

export function LighthouseProfile({
  api,
  actorId,
  revision,
  name,
  place,
  onHero,
  onCreate,
}: {
  readonly api: WorldApi;
  readonly actorId: string;
  readonly revision: number;
  readonly name: string;
  readonly place: string | undefined;
  readonly onHero: (tab: HeroTab) => void;
  readonly onCreate: () => void;
}) {
  const t = useT();
  const read = useHeroSheet(api, actorId, revision);
  const value = read.resource.status === 'ready' ? read.resource.value : null;
  const portrait = useApprovedImage(usePortrait(api, actorId));
  const rest = useDiceTable()?.rest;
  const hp = value?.sheet.hitPoints;
  const effects = hp ? [temporaryWords(t, hp), loweredWords(t, hp)].filter(Boolean) : [];
  return (
    <section className="folio-portrait-page">
      <div className="folio-portrait">
        {portrait ? <img src={portrait} alt="" /> : <Glyph name="character" />}
      </div>
      <div className="folio-nameplate">
        <h3>{name}</h3>
        {value && <p className="folio-class">{classLine(t, value.sheet.classes)}</p>}
        {place && (
          <p className="folio-place">
            <Glyph name="place" />
            {place}
          </p>
        )}
      </div>
      {value && hp && (
        <dl className="folio-vitals">
          <div>
            <dt>
              <Glyph name="hit-points" />
              {t('Hit points')}
            </dt>
            <dd>
              {hp.current} / {effectiveMaximum(hp)}
            </dd>
          </div>
          <div>
            <dt>
              <Glyph name="armor-class" />
              {t('Armor class')}
            </dt>
            <dd>{value.derived?.wildShape?.current?.armorClass ?? value.sheet.armorClass}</dd>
          </div>
          {value.derived && (
            <div>
              <dt>
                <Glyph name="initiative" />
                {t('Initiative')}
              </dt>
              <dd>{signed(value.derived.initiative)}</dd>
            </div>
          )}
        </dl>
      )}
      {effects.length > 0 && <p className="folio-health-note">{effects.join(' · ')}</p>}
      {read.resource.status === 'error' && (
        <button type="button" onClick={read.retry}>
          {t('Retry character statistics')}
        </button>
      )}
      <div className="folio-hero-tools">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            onHero('overview');
          }}
        >
          {t('Open character sheet')}
        </button>
        <button
          type="button"
          onClick={() => {
            onHero('skills');
          }}
        >
          <Glyph name="study" />
          {t('Skills')}
        </button>
        {rest && (
          <button
            type="button"
            onClick={() => {
              onHero('overview');
            }}
          >
            <Glyph name="dawn" />
            {t('Hit Point Dice')}
          </button>
        )}
        <button type="button" className="folio-make" onClick={onCreate}>
          <Glyph name="add-character" />
          {t('Create your own hero')}
        </button>
      </div>
    </section>
  );
}

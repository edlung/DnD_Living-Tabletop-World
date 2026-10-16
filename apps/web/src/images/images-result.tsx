import { useT } from '@ltw/ui';

import { Glyph } from '../visual/glyph.tsx';
import { isBusy, type ImageCommandState } from './command-state.ts';
import { useDmImages } from './dm-images.ts';
import { commandWords } from './words.ts';

/**
 * The DM's image command, wherever the image controls are (docs/STAGE_330_DESIGN.md "DM
 * controls"). Where it was given: a polite live region that exists before anything is said, with
 * its state and then its result, and Retry when the answer was lost. Everywhere else — the Images
 * sheet, whichever panel is open — while it holds every image control: what it is, where it
 * stands, and the same Retry, whose result then shows there.
 */
export function ImagesResult({ place }: { readonly place: string }) {
  const images = useDmImages();
  const command = images?.command ?? null;
  const here = command?.place === place ? command : null;
  const elsewhere = command && !here && isBusy(command) ? command : null;
  return (
    <div className="images-result">
      <p className="images-result-text" role="status">
        {here ? <Words command={here} /> : ''}
      </p>
      {here?.status === 'uncertain' && <RetryButton command={here} place={place} />}
      {elsewhere && (
        <div className="images-pending">
          <Glyph name={elsewhere.status === 'uncertain' ? 'warning' : 'generate'} />
          <p>
            <Words command={elsewhere} />
          </p>
          {elsewhere.status === 'uncertain' && <RetryButton command={elsewhere} place={place} />}
        </div>
      )}
    </div>
  );
}

function Words({ command }: { readonly command: ImageCommandState }) {
  const t = useT();
  return commandWords(t, command);
}

function RetryButton({
  command,
  place,
}: {
  readonly command: ImageCommandState;
  readonly place: string;
}) {
  const t = useT();
  const images = useDmImages();
  return (
    <button
      type="button"
      data-image-retry=""
      aria-label={t('Retry the change: {subject}', { subject: command.subject ?? '' })}
      onClick={() => {
        images?.retry(place);
      }}
    >
      <Glyph name="refresh" />
      {t('Retry the change')}
    </button>
  );
}

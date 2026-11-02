import { useT } from '@ltw/ui';
import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react';

import { IconButton } from '../visual/icon-button.tsx';

/**
 * About the game (docs/adr/0051-srd-data.md §1): its rules are the SRD 5.2.1's, credited with the
 * attribution statement the SRD gives (NOTICE.md), word for word in English, with its links. A
 * native modal dialog as the guide's: focus stays inside, Escape closes it and focus returns to
 * the button, from the foot of the sign-in and hub panels.
 */
const SRD_URL = 'https://www.dndbeyond.com/srd';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/legalcode';

export function AboutButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="quiet-button about-button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('About this game')}
      </button>
      <AboutDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

function AboutDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const t = useT();
  const ids = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="guide-dialog about-dialog"
      aria-labelledby={`${ids}-title`}
      onClose={onClose}
    >
      <header className="guide-header">
        <h2 id={`${ids}-title`}>{t('About this game')}</h2>
        <IconButton glyph="close" label={t('Close')} onClick={onClose} />
      </header>
      <section className="guide-page about-page">
        <p>
          {t(
            'Living Tabletop World is a table for a group and its DM: the DM runs the game, the table’s screen shows what the party sees, and each phone is a character.',
          )}
        </p>
        <h3>{t('The rules')}</h3>
        <p>
          {t(
            'The rules are those of the System Reference Document 5.2.1 (SRD 5.2.1), used under its license. Ravenford and its people are this game’s own.',
          )}
        </p>
        <blockquote lang="en" className="about-attribution">
          This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by
          Wizards of the Coast LLC, available at{' '}
          <a href={SRD_URL} target="_blank" rel="noopener noreferrer">
            <UrlText url={SRD_URL} />
          </a>
          . The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International
          License, available at{' '}
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
            <UrlText url={LICENSE_URL} />
          </a>
          .
        </blockquote>
      </section>
      <footer className="guide-footer about-footer">
        <button type="button" className="primary-button" onClick={onClose}>
          {t('Done')}
        </button>
      </footer>
    </dialog>
  );
}

/** A web address as it reads, free to break after a slash on a narrow screen. */
function UrlText({ url }: { readonly url: string }) {
  const parts = url.split(/(?<=\/)(?!\/)/);
  return parts.map((part, index) => (
    <Fragment key={part + String(index)}>
      {part}
      {index < parts.length - 1 && <wbr />}
    </Fragment>
  ));
}

import { useLanguage, useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { QrCode } from '../visual/qr-code.tsx';
import { formatWhen } from './players.ts';

/**
 * A link shown this once (the server keeps only its hash) — an invitation or a password reset: copy
 * it, select it to copy by hand where the clipboard is unavailable, or let a phone at the table scan
 * it as a QR code (Stage 600). Hiding it drops it; nothing keeps it.
 */
export function ShownLink({
  link,
  expiresAt,
  title,
  once,
  label,
  qrLabel,
  copied: copiedText,
  revocable,
  onHide,
}: {
  readonly link: string;
  readonly expiresAt: string;
  readonly title: string;
  /** Who should get it, and what it does for whoever opens it first. */
  readonly once: string;
  /** The field's label. */
  readonly label: string;
  readonly qrLabel: string;
  /** What to do with it once it is copied. */
  readonly copied: string;
  /** Whether it can be revoked from the sheet until it is used. */
  readonly revocable: boolean;
  readonly onHide: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<'copied' | 'select' | null>(null);
  useEffect(() => {
    setCopied(null);
  }, [link]);
  const copy = () => {
    const select = () => {
      field.current?.focus();
      field.current?.select();
      setCopied('select');
    };
    if (typeof navigator.clipboard === 'undefined') {
      select();
      return;
    }
    navigator.clipboard.writeText(link).then(() => {
      setCopied('copied');
    }, select);
  };
  const when = formatWhen(expiresAt, language);
  return (
    <section className="players-link" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <Glyph name="link" />
        {title}
      </h3>
      <div className="players-link-body">
        <div className="players-link-text">
          <p className="players-once">
            <Glyph name="hidden" />
            <span>
              <strong>{t('Shown only once.')}</strong> {once}
            </span>
          </p>
          <label htmlFor={`${id}-field`}>{label}</label>
          <div className="players-link-row">
            <input
              id={`${id}-field`}
              ref={field}
              readOnly
              value={link}
              spellCheck={false}
              autoComplete="off"
              onFocus={(event) => {
                event.currentTarget.select();
              }}
            />
            <button onClick={copy}>
              <Glyph name="copy" />
              {t('Copy link')}
            </button>
          </div>
          <p role="status" className="players-copied">
            {copied === 'copied'
              ? copiedText
              : copied === 'select'
                ? t('The link is selected: copy it with your keyboard.')
                : ''}
          </p>
          <p className="muted">
            {revocable
              ? t('It expires {when}. Until then you can revoke it below.', { when })
              : t('It expires {when}.', { when })}
          </p>
        </div>
        <figure className="players-qr">
          <QrCode text={link} label={qrLabel} />
          <figcaption className="fine-print">{t('Scan it with the phone’s camera.')}</figcaption>
        </figure>
      </div>
      <button className="quiet-button" onClick={onHide}>
        {t('Hide the link')}
      </button>
    </section>
  );
}

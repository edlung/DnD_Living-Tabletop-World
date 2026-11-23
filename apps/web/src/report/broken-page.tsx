import { translate, type Language } from '@ltw/ui';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

import { reportError } from './reporter.ts';

/**
 * What a person sees when the page breaks while drawing (docs/adr/0073-table-ideas.md §1): a
 * plain screen in place of a blank one. It uses none of the game's own components and no
 * provider, so it cannot break the way they did.
 */
const RELOADS_KEY = 'ltw.broken-reloads';
/** Said only when a note did leave: the game tries, and cannot promise more. */
export const REPORT_NOTE =
  'The game tries to send its own server a short note: which screen, which browser and what kind of error. Never your name or your words.';
/** A table display has no hand to press a button: it loads itself again, a few times. */
export const SELF_RELOAD_MS = 20_000;
const SELF_RELOADS = 3;
const SELF_RELOAD_WINDOW_MS = 10 * 60_000;

/** Whether a screen that reloads itself may do so again: not for ever on a page that stays broken. */
export function maySelfReload(stored: string | null, now: number): string | null {
  const times = (stored ?? '')
    .split(',')
    .map(Number)
    .filter((at) => Number.isFinite(at) && at > 0 && now - at < SELF_RELOAD_WINDOW_MS);
  return times.length >= SELF_RELOADS ? null : [...times, now].join(',');
}

const pageLanguage = (): Language => {
  const said = document.documentElement.lang || navigator.language;
  return said.toLowerCase().startsWith('ru') ? 'ru' : 'en';
};

export function BrokenPage({
  language,
  reported,
  selfReload = false,
}: {
  readonly language: Language;
  /** A note of what broke left for the server: said only when it did. */
  readonly reported: boolean;
  /** The table's display: nobody holds it, so it loads itself again after a moment. */
  readonly selfReload?: boolean;
}) {
  const t = (key: string) => translate(language, key);
  const [reloading, setReloading] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (!selfReload) return undefined;
    let next: string | null = null;
    try {
      next = maySelfReload(sessionStorage.getItem(RELOADS_KEY), Date.now());
      if (next !== null) sessionStorage.setItem(RELOADS_KEY, next);
    } catch {
      // Storage refused: the screen waits for a hand.
    }
    if (next === null) return undefined;
    setReloading(true);
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, SELF_RELOAD_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [selfReload]);
  return (
    <main className="broken-page" lang={language}>
      <div className="broken-panel" data-surface="paper">
        <h1 ref={heading} tabIndex={-1}>
          {t('Something went wrong')}
        </h1>
        <p role="alert">
          {t(
            'This page stopped working. The game itself is safe: the story is kept on the server.',
          )}
        </p>
        {reloading && <p>{t('This screen will load itself again in a moment.')}</p>}
        <p>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              window.location.reload();
            }}
          >
            {t('Load the page again')}
          </button>
        </p>
        {reported && <p className="broken-note">{t(REPORT_NOTE)}</p>}
      </div>
    </main>
  );
}

/**
 * The page's last resort: a render that failed anywhere shows the broken page and is reported.
 * It stands above every provider.
 */
export class RootBoundary extends Component<
  { readonly children: ReactNode; readonly selfReload?: boolean },
  { readonly failed: Language | null; readonly reported: boolean }
> {
  override state: { readonly failed: Language | null; readonly reported: boolean } = {
    failed: null,
    reported: false,
  };
  static getDerivedStateFromError(): { failed: Language } {
    // Read while the broken tree still stands: its language is the page's.
    return { failed: pageLanguage() };
  }
  override componentDidCatch(error: unknown) {
    this.setState({ reported: reportError('render', error) });
  }
  override render() {
    const { failed, reported } = this.state;
    return failed === null ? (
      this.props.children
    ) : (
      <BrokenPage
        language={failed}
        reported={reported}
        selfReload={this.props.selfReload === true}
      />
    );
  }
}

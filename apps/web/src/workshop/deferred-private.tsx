import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { StatusPanel, useT } from '@ltw/ui';

import type { WorkshopPrivate as PrivateComponent } from './private.tsx';

const Private = lazy(async () => {
  const module = await import('./private.tsx');
  return { default: module.WorkshopPrivate };
});

function LoadFailure() {
  const t = useT(),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section className="workshop-panel" role="alert" aria-labelledby="workshop-load-failure">
      <h2 id="workshop-load-failure" ref={heading} tabIndex={-1}>
        {t('Workshop tools could not be loaded')}
      </h2>
      <p>{t('Your saved drafts are kept. Reload the workshop to try again.')}</p>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
      >
        {t('Reload workshop')}
      </button>
    </section>
  );
}

class PrivateBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <LoadFailure /> : this.props.children;
  }
}

/** Only an authenticated mounted owner starts loading the private editor graph. */
export function DeferredWorkshopPrivate(props: Parameters<typeof PrivateComponent>[0]) {
  const t = useT();
  return (
    <PrivateBoundary>
      <Suspense fallback={<StatusPanel state="loading" label={t('Loading workshop tools…')} />}>
        <Private {...props} />
      </Suspense>
    </PrivateBoundary>
  );
}

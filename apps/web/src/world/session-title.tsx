import { useT } from '@ltw/ui';
import { createPortal } from 'react-dom';

/** The open play session's title, in the top bar's slot once the world has loaded. */
export function SessionTitle({
  slot,
  title,
}: {
  readonly slot: HTMLElement | null;
  readonly title: string | undefined;
}) {
  const t = useT();
  return slot ? createPortal(<span>{title ?? t('No open play session')}</span>, slot) : null;
}

import { useT } from '@ltw/ui';
import { useEffect, useRef, type ReactNode } from 'react';

import { IconButton } from '../visual/icon-button.tsx';

/**
 * The Chronicle as a full-screen modal book (docs/STAGE_320_DESIGN.md §5.1, §5.6; part C lays
 * out its pages). The native dialog keeps focus inside, closes on Escape and returns focus to
 * the control that opened it. Its contents stay mounted while it is closed.
 */
export function ChronicleDialog({
  open,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="chronicle-dialog" aria-label={t('Chronicle')} onClose={onClose}>
      <div className="chronicle-frame">
        <IconButton
          glyph="close"
          className="chronicle-close"
          label={t('Close the Chronicle')}
          onClick={onClose}
        />
        {children}
      </div>
    </dialog>
  );
}

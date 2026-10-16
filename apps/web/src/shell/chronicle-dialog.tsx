import { useT } from '@ltw/ui';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

import { IconButton } from '../visual/icon-button.tsx';

/**
 * The Chronicle as a full-screen modal book (docs/STAGE_320_DESIGN.md §5.1, §5.6; part C lays
 * out its pages). The native dialog keeps focus inside, closes on Escape and returns focus to
 * the control that opened it. Its contents stay mounted while it is closed, and each page keeps
 * the place it was read at: a closed dialog is not laid out, so the scroll positions are kept
 * here and given back when it opens again. It opens and closes before anything else reacts to
 * the same change (a layout effect), so whatever takes focus next finds it closed.
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
  const places = useRef(new Map<Element, { readonly top: number; readonly left: number }>());
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Scrolling does not bubble: the capture phase hears every page and frame inside.
    const remember = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && dialog.open) {
        places.current.set(target, { top: target.scrollTop, left: target.scrollLeft });
      }
    };
    dialog.addEventListener('scroll', remember, true);
    return () => {
      dialog.removeEventListener('scroll', remember, true);
    };
  }, []);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      for (const [element, place] of places.current) {
        if (!dialog.contains(element)) {
          places.current.delete(element);
          continue;
        }
        element.scrollTop = place.top;
        element.scrollLeft = place.left;
      }
    }
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

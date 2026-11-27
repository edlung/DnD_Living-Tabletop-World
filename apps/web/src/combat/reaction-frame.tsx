import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useAnnounceOnce } from './reaction-card.ts';

export function ReactionFrame({
  modal,
  blocked,
  ids,
  children,
}: {
  readonly modal: boolean;
  readonly blocked: boolean;
  readonly ids: string;
  readonly children: ReactNode;
}) {
  const card = useAnnounceOnce(blocked || modal);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!modal || !element) return;
    element.showModal();
    return () => {
      element.close();
    };
  }, [modal]);
  const labels = {
    className: 'reaction-prompt',
    'aria-labelledby': ids + '-title',
    'aria-describedby': ids + '-trigger',
    role: 'alertdialog',
  };
  if (modal)
    return (
      <dialog
        {...labels}
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
        }}
      >
        {children}
      </dialog>
    );
  return (
    <section {...labels} ref={card} tabIndex={-1}>
      {children}
    </section>
  );
}

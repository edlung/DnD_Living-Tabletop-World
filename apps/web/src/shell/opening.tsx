import { useState, type ReactNode } from 'react';

/**
 * A disclosure whose content is made only while it is open: the DM's map editor and journey keep
 * their pictures and reads for when they are asked for, and the Chronicle's chapter writer is laid
 * out for the window it opens in (Chromium keeps a closed disclosure's content out of layout, and a
 * fixed form there kept the size of the window it was closed at: too wide, or nothing at all).
 */
export function Opening({
  className,
  summary,
  children,
}: {
  readonly className: string;
  readonly summary: ReactNode;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{summary}</summary>
      {open && children}
    </details>
  );
}

import { useState, type ReactNode } from 'react';

/**
 * A disclosure whose content is made only while it is open: the DM's map editor and journey keep
 * their pictures and reads for when they are asked for.
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

import type { ChoiceProblem } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, type ReactNode } from 'react';

/** What does not hold of the builder's choices, in the World Engine's words. */
export function Problems({ problems }: { readonly problems: readonly ChoiceProblem[] }) {
  const t = useT();
  if (problems.length === 0) return null;
  return (
    <div role="status">
      <ul className="builder-problems">
        {problems.map((problem) => (
          <li key={`${problem.field}:${problem.message}`}>{t(problem.message, problem.params)}</li>
        ))}
      </ul>
    </div>
  );
}

/** A labelled control: its label beside it, not around it, so its name is the label's words. */
export function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="builder-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

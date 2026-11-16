import type { ReflectionView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

/**
 * Stars or wishes as a list (docs/adr/0071-memory-and-ritual.md §2): whose words, then the words.
 * An author the reader does not know is unnamed; the DM's own are the DM's.
 */
export function WordsList({
  entries,
  words,
  className = '',
}: {
  readonly entries: readonly ReflectionView[];
  /** Which of an entry's words the list shows. */
  readonly words: 'star' | 'wish';
  readonly className?: string;
}) {
  const t = useT();
  return (
    <ul className={`evening-words ${className}`.trimEnd()}>
      {entries.map((entry) => (
        <li key={entry.author?.entityId ?? 'dm'}>
          <strong>
            {entry.author === null ? t('The DM') : (entry.author.name ?? t('Someone at the table'))}
          </strong>
          <span>{words === 'star' ? entry.star : (entry.wish ?? '')}</span>
        </li>
      ))}
    </ul>
  );
}

import type { RollGroup } from '@ltw/contracts';

/** A throw's dice, each its face and its kind; one not counted, struck through. */
export function DiceFaces({ group }: { readonly group: RollGroup }) {
  if (group.dice.length === 0) return null;
  return (
    <ul className="display-dice-faces" aria-hidden="true">
      {group.dice.map((die, index) => (
        <li key={index} className={die.dropped ? 'is-dropped' : undefined}>
          <span className="display-die-face">{die.value}</span>
          <span className="display-die-sides">d{die.sides}</span>
        </li>
      ))}
    </ul>
  );
}

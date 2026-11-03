import type { ContagionId } from '@ltw/contracts';

/**
 * The Gameplay Toolbox's three magical contagions (SRD 5.2.1 page 194) as the World Engine follows
 * them (docs/adr/0055-rules-reference-and-toolbox.md §4): the Constitution save against infection
 * where the contagion names one, a condition it gives at once, and the fight against it — its save,
 * when it is made, and how the course ends. `contagions.test.ts` holds the numbers to the words.
 * Spreading it, Cackle Fever's laughter and Sight Rot's ointment stay the DM's.
 */
export interface ContagionRules {
  readonly contagionId: ContagionId;
  /** The Constitution save against infection; none for a tainted potion's fever. */
  readonly infection: { readonly dc: number } | null;
  /** What it gives at once and keeps until it ends (Sight Rot's Blinded). */
  readonly atOnce: 'blinded' | null;
  /**
   * The Constitution save that fights it: at a Long Rest's end, three successes ending it (and the
   * level of Exhaustion it gave); or at dawn, a failure a level of Exhaustion more, a success one
   * less, none left ending it. Null: only magic or an ointment ends it.
   */
  readonly fight: {
    readonly dc: number;
    readonly when: 'long-rest' | 'dawn';
    readonly course: 'three-successes' | 'exhaustion';
  } | null;
}

export const CONTAGIONS: readonly ContagionRules[] = [
  {
    contagionId: 'cackle-fever',
    infection: null,
    atOnce: null,
    fight: { dc: 13, when: 'long-rest', course: 'three-successes' },
  },
  {
    contagionId: 'sewer-plague',
    infection: { dc: 11 },
    atOnce: null,
    fight: { dc: 11, when: 'dawn', course: 'exhaustion' },
  },
  { contagionId: 'sight-rot', infection: { dc: 15 }, atOnce: 'blinded', fight: null },
];

const byId = new Map(CONTAGIONS.map((one) => [one.contagionId, one]));
export const contagionRules = (contagionId: ContagionId): ContagionRules => {
  const rules = byId.get(contagionId);
  if (!rules) throw new Error(`no contagion ${contagionId}`);
  return rules;
};

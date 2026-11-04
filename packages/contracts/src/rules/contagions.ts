import { z } from 'zod';

/**
 * The Gameplay Toolbox's magical contagions (docs/adr/0055-rules-reference-and-toolbox.md §4), and
 * a contagion's course on the sheet of the character it infects: whether it has taken hold, and
 * the saves won against it.
 */
export const CONTAGION_IDS = ['cackle-fever', 'sewer-plague', 'sight-rot'] as const;
export type ContagionId = (typeof CONTAGION_IDS)[number];

export const contagionStateSchema = z
  .object({
    contagionId: z.enum(CONTAGION_IDS),
    takenHold: z.boolean(),
    successes: z.number().int().min(0).max(3),
  })
  .strict();
export type ContagionState = z.infer<typeof contagionStateSchema>;

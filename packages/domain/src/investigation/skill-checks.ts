import type { CharacterSheet, Skill } from '@ltw/contracts';

/**
 * Port to the Rules Engine for skill checks (docs/adr/0013-investigation.md,
 * technical notes). The domain may not import `@ltw/rules`; the composition
 * root injects an adapter. `rollD20` is drawn once per attempt at resolution
 * time and recorded, so replay never rolls again.
 */
export interface SkillCheckPort {
  rollD20(): number;
  skillModifier(sheet: CharacterSheet, skill: Skill): number;
}

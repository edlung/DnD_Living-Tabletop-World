/**
 * The entities a narrative combat record names (AttackPerformed, SpellCast,
 * DamageApplied, …): every `…Id` field but the spell and attack. Its fold
 * requires them to exist, so its footprint reads them too (Gate 03 retest 2,
 * G03-H05): undo cannot remove a creature that a record still standing names,
 * whatever premises the writer of that record recorded.
 */
export function namedEntityIds(payload: object): string[] {
  return Object.entries(payload)
    .filter(([key]) => key.endsWith('Id') && key !== 'spellId' && key !== 'attackId')
    .map(([, value]): unknown => value)
    .filter((value): value is string => typeof value === 'string');
}

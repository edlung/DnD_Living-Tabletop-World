# Shared presentation components

Read `src/index.ts` for public components, then only the component relevant to the task.
`character-sheet-details.tsx` preserves reachability of every authorized character-sheet field.
`knowledge-details.tsx` preserves supplied epistemic types, attribution, and provenance; each
record is a card with a per-type class, and the client may pass a decorative `typeMark` (its glyph)
shown before the type's word, never in place of it.
`encounter-summary.tsx` displays the supplied encounter and scoped reaction status.
`status-panel.tsx` handles loading, empty, and error presentation.

Consume `@ltw/contracts` types only. Authorization, fetching, session transitions, commands,
domain rules, and AI belong outside this package. Never infer missing canonical values or
render fields absent from a scoped projection. Root client styles own these components' CSS.

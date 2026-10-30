# Private scenario browser

Read the current campaign work order and the parent workshop instructions.

- `browser.tsx` receives a full owner-authorized package only from `ScenarioTab`.
  It makes no requests, reads no browser storage, and has no live-world authority.
- `graph.ts` indexes every source row, including duplicate local design keys in
  invalid revisions. Unique internal display paths never appear as visible text.
  Numeric compiler paths map to the original row; key references resolve to the
  first matching row while the compiler reports ambiguity.
- `structured-fields.tsx` and `fields.ts` keep all package branches readable with
  human labels and linked references. Keep mechanics and quest fields reachable;
  a JSON export must never replace the structured inspector.
- Knowledge types, holders and world truth remain distinct. Links by shared
  subject are navigation, never an assertion that a clue proves a statement.
  Situations, encounters and later outlines describe possibilities.
- `edit-fields.tsx` changes allowed scalar fields only. It targets the original
  source object and delegates immutable revision saving and CAS to the caller.
  Uncertain retries preserve the same submitted content. Candidates have no save
  callback and no invented identities or assessment.
- Styles belong to `styles/workshop-scenario.css`; translations belong to
  `i18n/ru-workshop-scenario.ts`. Preserve existing global translation meanings.
- `graph.test.ts` includes a local test specimen; never import it in runtime.
  Browser/HTTP journeys and the four-width layout/axe pass live under `tests/e2e/`.

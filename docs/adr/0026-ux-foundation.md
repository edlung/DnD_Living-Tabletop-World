# 0026. Player/DM UX foundation and browser lifecycle

- Status: Accepted
- Date: 2026-10-04
- Stage: 200 only
- Decision type: technical; implements existing product and knowledge contracts.
- Owner approval: not required for these technical choices. The owner explicitly
  authorized Stage 200 and separately authorized implementation by the current
  GPT model instead of Opus in this chat. This exception does not change the
  effort matrix for later stages or independent gates.

## Context and choices

Gate 05 retest 2 passed (`reviews/ASTRA_GATE_05_RETEST_2.md`). The web and UI
packages were placeholders. Stage 200 needs real authorized projections,
progressive disclosure, and browser evidence before the separate Stage 210–230
workflows. A framework, bundler, session lifecycle, and full-sheet read adapter
are necessary; a new rules engine or canonical state store is not.

Choose React with TypeScript and Vite, and Playwright Chromium journeys.
React provides explicit component lifetimes for clearing perspective-scoped
state and reusable semantic UI; Vite builds a small client application alongside
the existing monolith. Handwritten DOM orchestration would duplicate lifecycle
machinery. A server-rendering framework adds no needed capability to this local
slice. No router, global store, query cache, provider SDK, or UI kit is introduced.
References: [React](https://react.dev/learn/creating-a-react-app),
[Vite](https://vite.dev/guide/),
[Playwright web servers](https://playwright.dev/docs/test-webserver).

## Decisions

1. **Local development sessions.** Retain ADR 0009's persona authentication.
   The host supplies a token; no privileged token is bundled or prefilled.
   Authentication is separate from the perspective selector. Production auth
   and a release destination remain undecided under prerequisite Q4; this stage
   neither implements production auth nor publishes a service.
2. **Caller bootstrap.** `GET /campaigns/:id/session` authenticates, validates
   strict input, and verifies current membership. It returns caller identity,
   current role/controlled character, campaign identity, and permitted view
   choices. It carries no bearer token, other players' actor IDs, or world state.
   Client controls do not grant permission; every read still resolves the
   current server-side role and perspective.
3. **Full authorized sheet.** `GET /campaigns/:id/entities/:entityId/sheet`
   requires a perspective. It explicitly copies every current sheet field
   for DM, or for CHARACTER where the holder is the target (PLAYER resolves
   to the caller's character). Merely knowing a character or sharing a party
   does not grant its sheet. DM preview does not inherit DM access. NPC/creature
   sheets are accessible to DM when they exist, as allowed by SetCharacterSheet.
   Concentration target IDs are omitted if the perspective neither knows nor
   perceives the target. Canonical objects and future fields never pass through.
   This follows invariant 19 and ADR 0012's prohibition on other characters'
   sheets; it does not widen the existing known-entity projection.
4. **Shared scene shell.** Existing directory, scene/visual-state, knowledge,
   entity context, session, and encounter/reaction projections supply the UI.
   The location picker changes the viewed scene, never the character's canonical
   position. Ravenford's known Market Square is the initial viewing preference;
   absence falls back to the first known location, then an honest empty state.
   Unknown perceived entities remain unnamed. Contextual options display server
   legality, including unavailable choices. Full knowledge and sheets are
   progressively disclosed. No AI chat is required.
5. **History.** The shell shows remembered events and their existing authorized
   `causedBy` source IDs through the Memory API. It never downloads raw canonical
   events or infers facts from prose. Chronicle generation, flashbacks, and time
   advancement remain separate future workflows.
6. **Isolation.** Tokens and projections stay in memory. Fetches use no-store,
   omit cookies, reject redirects, have bounded timeouts, and validate the
   effective perspective envelope. Perspective changes/remounts synchronously
   remove old projections and selection. Each request generation ignores late
   success and failure even if abort is ignored. Restricted selectors drop other
   DM-only character options. Approved images are fetched with authorization
   and use revocable object URLs. Logout, reload, and page restoration discard
   the session; no service worker or persistent browser cache is introduced.
7. **Failure states.** Fixed client error messages never echo response content.
   Loading and error states replace the affected projection; retry is explicit.
   An unexpected render shape clears the session view behind an error boundary.
   No response invents canonical records or falls back to a broader perspective.

## Validation and gate coverage

New domain/HTTP tests cover bootstrap authorization, roster changes, malformed
scope/input, outsiders, foreign sheets, preview equality, hidden references, and
deep whitelisting. Browser journeys use a real seeded WorldEngine and HTTP API,
with no external AI provider. Transport faults/delays exercise loading, recovery,
stale selection, perspective downgrade, and logout. Fixtures are test-only.
The existing API boundary, mutation rules, and reviewed projections are unchanged;
new constrained reads add introduction-time boundary/E2E evidence as required by
`docs/GATE_COVERAGE.md`. No previous gate claim is invalidated, so no retest is
opened. A later boundary change must reassess that conclusion.

## Scope and consequences

The frontend consumes contracts only. No dependency edge changes. Root build,
typecheck, lint, context-budget checks, local CI, and hosted CI include the new
client and E2E harness. Chromium installation is required for browser journeys.

Stage 210's object-first authored scene, Stage 220's battlefield/reaction actions,
and Stage 230's DM authoring workflows are not implemented here. The pending UX
allocation for Day 2, Chronicle, time advancement, and Tomas performance remains
in `docs/IMPLEMENTATION_PREREQUISITES.md`; this foundation does not settle it.

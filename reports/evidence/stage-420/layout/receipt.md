# Stage420 web evidence

Final source passed 36 layout and axe checks: 9 states at 1440,768,390,320 pixels.
Each state has a full-page PNG and a viewport PNG, for72 state screenshots.
`results.json` contains zero errors/warnings and zero accessibility violations for every state.
The app has one dark theme. All36 viewport compositions were visually inspected; selected
full-size shots confirmed text, sheet labels, image choice and static board readability.

States: owner-empty, owner-scene, owner-detail, owner-layout, character-scene,
character-sheet, picture-candidate, picture-selected, picture-stale.

Reproduce from repository root:

    node /private/tmp/workshop-stage420-audit.mjs

The runner starts isolated test API4323 and Vite4322, creates its own browser context,
uses seed `workshop-stage420-isolated-layout` and `preview-layout` invitation,
then closes browser and process groups in finally. No production DB, external provider,
AI call or credentials file is used. Supporting server:
`/private/tmp/workshop-stage420-audit-server.mjs`.
Image requests use only the explicit browser-image-fixture / curated-raster-fixture-1
port with existing curated WebP bytes. They are test candidates, never represented as
live generated campaign art. The stale state is an isolated owner revision whose Iva
appearance changes; the inherited choice is honestly stale and omitted from preview.

Fixed during audit: over-wide character selector; camera implicit-label ambiguity;
touching detail controls; raw knowledge scope UUIDs; inherited runtime42vh mobile
scene row/backdrop; ability labels breaking mid-word; excessive picture history length.

Focused verification:

-8 unit files /43 tests passed (preview scope/privacy, knowledge labels, picture briefs/slots,
workshop transport/bytes, image cache lifecycle, board geometry/square names, dictionary).
-Scoped ESLint, Prettier check, git diff --check passed.
-Whole pnpm typecheck passed after final source changes.
-Parent/helper owns8 full browser journeys, global validation, handoff and commit.

No source edits are pending in this UI slice. Runtime providers were not smoke-tested;
no paid calls were authorized or made. Source files remain below the repository500-line target.

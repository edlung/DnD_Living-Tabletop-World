# Stage 330 design — real images (adopted)

Date: 2026-10-15. Status: ADOPTED by the session under the owner's delegation
(`reviews/OWNER_DECISIONS_9_2026-10-15.json`). Q6: OpenAI image models only; the curated Ravenford
set is generated through Codex CLI with the owner's ChatGPT subscription and imported as
DM-approved; images the DM authors in play go through the OpenRouter key with a $5 ceiling.
Scope: `work-orders/OPUS_STAGE_330.md`. Decision record: `docs/adr/0035-images.md`. Parts: A — server, domain and
contracts; B — the DM's approval controls, figures and battle maps in the Stage 320 client; the session runs the single
authorized live OpenRouter smoke.

## Generators behind the existing port (`packages/ai/src/images.ts`)

- **`openrouter-openai`** (server, in play): `POST https://openrouter.ai/api/v1/chat/completions`
  with model `openai/gpt-5.4-image-2` (allowlist; `openai/gpt-5-image-mini` as the configured
  cheaper alternative), `modalities: ["image","text"]`, a fixed style system prompt from the art
  direction (ADR 0034), the brief as text, and — for a derived variant — the entity's approved
  canonical reference as an input image, plus up to two style reference images from the curated
  set. Reads `choices[0].message.images[0]` (data URL); validates media type and decoded size;
  re-encodes to WebP (max 1,536 px, quality 82, ≤ 1.5 MB) so the 2 MB content limit holds; records
  the model and the provider's reported cost. `redirect: 'error'`, a bounded timeout, the key only
  from the environment, never logged; refusals, timeouts and provider errors map to the existing
  failure codes and leave the neutral fallback.
- **`placeholder`** stays for tests and offline use (unchanged).
- **`curated`** (seed only): returns bytes from the committed curated set for a brief whose entity
  and label it holds; anything else fails as `UNAVAILABLE`.

## Spending for in-play images

A durable image ledger (migration 0011, `ltw_image_budget` revisions and `ltw_image_charges`):
before a job calls the provider it reserves a worst-case amount (per model, configured, e.g.
$0.25) inside one transaction against the stored ceiling; it settles to the provider's reported
cost (or keeps the full reservation when the cost is unknown); a ceiling of zero or no stored
budget means no provider call (the job fails as `UNAVAILABLE`, the fallback shows). The ceiling is
set only by the operator CLI (`pnpm ai:operator image-budget-set --micros 5000000 …` with the
owner's authorization source); the counters appear in `ai:operator status` and Stage 350's spend
script. No environment variable can raise it.

## Art direction

The owner's concepts (ADR 0034, `docs/design/stage-320/owner-concepts/`) fix the style for every
generator: premium cinematic dark-fantasy painting, warm lantern light against cool blue shadow,
burnished gold. The in-play generator sends a fixed style prompt derived from it plus two curated
canonical images as style references; derived variants also attach the entity's approved
canonical reference.

## Purposes: image, figure, battle map

`RequestAsset` gains an optional `purpose` (`image` by default, `figure`, `battle-map`); it is kept
on the asset and in `PlayerAssetView`. Presentation keeps choosing `image` assets exactly as today
(ADR 0023 tags); `EntityPresentation` gains `figure` (the newest approved `figure` of a character,
for the tabletop figure on the battlefield and in the scene) and, for a place, `battleMap` (the
newest approved top-down `battle-map`, which replaces the UI kit's ground under the encounter grid).
Both are derived variants of the canonical reference (lineage, approval and visibility unchanged);
both are additive fields.

## The curated Ravenford set (v2, in the concepts' style)

Generated once by the session with Codex CLI (owner's ChatGPT subscription), canonical references
first (the owner's concepts attached for style and, for Эловен, Мира, Орин and Торн, for their
look), then derived variants with the canonical reference attached as the input image:

- characters: Эловен, Мира, Орин, Торн, goblin raider, goblin shaman — portrait (canonical),
  `figure` for each, `wounded` for Эловен and the goblins;
- places: Ravenford, Market Square, Golden Stag Inn, Orin's Alchemy, Merchant Guild, North Gate,
  Old Trade Road, Abandoned Caravan Site — scene (canonical), `night` for each, `rain` for the town
  places, `fog` and a top-down `battle-map` for the Old Trade Road, `night-rain` for the square;
- investigation objects: Broken Wagon Wheel, Goblin Weapon, Strange Symbol, Tracks, Burned Cargo —
  neutral views that show nothing an investigation must earn.

Files are WebP in `fixtures/ravenford-ru/assets/` with `manifest.json` (entity ID, variant, label,
purpose, file, SHA-256, the exact prompt, references, generator `codex-cli/imagegen`, date). A fresh
install imports them through real commands: `RequestAsset` (DM) → worker `StartAssetJob` /
`CompleteAssetJob` with the curated generator → `ApproveAsset` (DM, audience players), in
`seed:ravenford`, idempotently, for both Ravenford campaigns. Identity is checked by the session
against each canonical reference (face, hair, clothing, palette, silhouette) and reported per image
in `reports/STAGE_330_IDENTITY.md`; drifted variants are regenerated (up to two retries) or
reported.

## DM controls

The DM sees each entity's candidates (completed, not yet approved) with Approve, Discard and
Generate again, and the approved image with Replace (a new request whose approval supersedes it).
New entities the DM authors in play (Томас) get a request through the existing authoring path and
the in-play generator. Players see only approved images (existing rules); an image request is built
from the entity's description; DM-only notes enter only when the DM types them in the request.

The supersession is the domain's (part B review, ADR 0035 amendment): approving a picture
supersedes the approved pictures of its kind — the same entity and purpose, and for an image the
same label; any two figures, or battle maps, of an entity are one kind — so the picture approved
last is the one players see and the DM's list approves, made before or after the one it replaces
(`AssetApproved` version 3; earlier approvals stay as recorded). The client says what an approval
did from the lineage read after it: the main picture, a figure, a battle map is what players who
can see the entity now see; a state picture shows only in its state. One command at a time: its
controls come back only when the lineage shows what it did; a command whose answer was lost holds
them and shows, with Retry, in the Images sheet and whichever panel is open; focus never falls to
the page when a command takes away its card. On the battlefield the name plates lie above every
figure, so no figure hides the plate of a combatant behind it; a plate, like a standing figure,
takes the pointer for its combatant's square (Stage 320's hit-testing, design §5.5).

## Storage (ADR)

Image bytes stay in PostgreSQL (`ltw_asset_contents`, ≤ 2 MB each) for the alpha: one store, one
backup (Stage 350 dumps include them), transactional with lineage. Object storage is deferred
until the content volume or the number of campaigns makes dumps slow; the ADR records the trigger
(dump > 2 GB or > 5 min).

## Evidence

`pnpm validate` with the provider stubbed at the HTTP boundary (request shape, reference image
attached for derived variants, re-encoding, size limit, refusal/timeout/error mapping, ledger
reserve/settle/deny, ceiling enforcement, key never logged). Lineage, approval, undo-hold and
player-visibility suites unchanged in strength. One live smoke run through OpenRouter generates
Томас's portrait, the DM approves it and the player sees it; its cost stays under the ceiling and
is reported. The curated set imports on a fresh database and the browser shows it.

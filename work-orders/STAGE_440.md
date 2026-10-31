# Work Order — Stage440: Confirmed campaign activation

Authority:accepted Stage370/ADR0038 and delegated technical continuation.
Base:verified430 at`689967c` (3,267unit,331PG,172browser tests).
Design:`docs/STAGE_440_DESIGN.md`.

## Deliver

1. Dedicated bounded `BootstrapCampaign` World Engine command: authenticated
   USER owner, explicit consent, supported initial decisions on provisional state,
   one atomic initial command/event batch with provenance. No fixture import,
   sequence of production subcommands, fake controllers or system/AI confirmation.
2. Canonical prepared-party membership separate from character controllers.
   Membership projections and premise footprints include prepared members;
   authorization, assignments, stand-in permission and sessions remain roster-only.
   Legacy histories preserve their behavior. Bootstrap has no bulk undo; ordinary
   later safe command undo remains supported.
3. Honest canonical asset adoption with draft origin, exact selected encoded bytes,
   original generator metadata, matching references and initial owner approval.
   No fictitious external job, regeneration or paid request. Replay, integrity,
   approval undo/restore and owner lineage understand adopted assets.
4. One durable activation per draft, stable campaign/activation/command IDs,
   immutable confirmed source and idempotent nonce receipts. Recheck head,
   package/plan/lock/manifest/review bindings and acknowledgements at acceptance.
   Resume the same operation after crash/lost ACK; subsequent draft edits cannot
   alter that already accepted source or an active campaign.
5. Unpublished provisioning closes every ordinary campaign engine read/write,
   invitation, asset, live/presence and fingerprint path until immutable scenario/
   rewritten quest content, exact bytes, initial batch and provenance are verified.
   Only bootstrap/reconciler/readiness use raw storage. Publish one-way and expose
   explicit owner links; untracked legacy Ravenford behavior stays unchanged.
6. Owner activation review/status/retry, explicit text-only choice, acknowledgement
   of warnings, and deliberate Confirm activation. List owned campaigns with bounded
   paging. A separate entry action issues a normal one-use DM invitation after
   publication; ordinary `/join` preserves deliberate game-session replacement.
   Workshop activation itself never replaces a game cookie.
7. Protect game-cookie switching against delayed401/sign-out, matching the workshop
   race fix: no stale response can expire a newer credential; logout binds mounted
   campaign/actor and revokes the presented session.
8. Unit/domain/replay/authority/knowledge/party/asset tests, real PG lifecycle,
   nonce/CAS/crash/restart/publication/byte-identity regressions, integrated owner/
   player browser journeys, RU/EN, four-width layout/axe, own adversarial pass,
   full isolated offline validation, report/handoff/manifest and local checkpoint.
   Continue450 without requesting another technical disposition.

## Boundaries

No default DB migration, credential/provider/model/operator-policy change,
production dependency, deployment, publishing to external hosting or live provider
call. Canonical campaigns created by verification remain in isolated test stores.
Existing stored content can activate while provider dispatch is unavailable;
activation does not consult a new AI grant or dispatch a provider. Runtime owner
confirmation remains an explicit UI action. Live quality and final owner demo are450.

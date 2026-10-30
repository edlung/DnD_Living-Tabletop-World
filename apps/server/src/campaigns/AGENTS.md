# Published campaign boundaries (Stage440)

Read `docs/STAGE_440_DESIGN.md` and `../workshop/activation/AGENTS.md` for the
confirmed source and recovery protocol.

| Concern                                      | Entry points                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Publication port and PostgreSQL state        | `publication.ts`, `postgres-publication.ts`                                                                   |
| Ordinary event-store boundary                | `published-event-store.ts`, `../world-engine/runtime.ts`                                                      |
| Immutable scenario/quest/asset content       | `content.ts`, `postgres-content.ts`; migration0022                                                            |
| Campaign quest book and explicit owner entry | `quest-books.ts`, `owner-routes.ts`; ordinary quest authorization remains in `../http/routes/quest-routes.ts` |
| Closed route/invitation regressions          | `publication.test.ts`; activation storage integration tests                                                   |

- Publication is one-way. An untracked campaign is legacy; never cache that absence
  as permanent permission. Storage errors fail closed.
- PublishedEventStore wraps every ordinary HTTP, worker, auth/operator and live
  mirror engine. Only bootstrap/reconciliation and raw readiness/replay tools may
  read or append provisioning streams. Preserve401→400→membership404 order.
- `createWorldEngine(pool, publication?)` is gated by default. Use it for normal
  routes and operators; pass the same publication port to common invitation
  issuance. Hidden streams return no stream/commands, and ordinary appends fail.
  The decorator also refuses BootstrapCampaign for an untracked campaign.
- `createRawWorldEngine(pool)` bypasses publication solely for accepted activation
  recovery and complete restore/replay tooling. `store-readiness.ts` reads the raw
  PostgreSQL store; `replay-digest-cli.ts` uses the raw factory. Never inject raw
  access into HTTP, asset/presence/SSE handlers, invitation issuance or live mirrors.
- Initial content is immutable and scoped by its stable target campaign. It binds
  the confirmed scenario, rewritten quest book and selected asset lineage. Missing
  content for a published bootstrap campaign cannot fall back to Ravenford.
- Quest books are checked against the canonical bootstrap quest digest. The
  bounded cache retains immutable quest definitions only, never the private
  scenario; it cannot grant membership or substitute for projected quest visibility.
- Bytes are copied exactly, never generated or re-encoded. Hash, media type,
  immutable manifests and actual bootstrap command proof precede publication.
- Owner campaign links come only from PUBLISHED activation records. A workshop
  credential never becomes a campaign credential implicitly.
- Test-only memory implementations live under testing/. Migration0022 and the
  bootstrap/adoption event schemas require a matching recovery build. Preserve
  activation rows, immutable initial content, campaign/draft bytes and event history
  together; see `deploy/RUNBOOK.md`§3/§5. Event replay alone does not verify those
  private source tables or recover the selected encoded bytes.

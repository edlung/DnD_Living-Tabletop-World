# Campaign package contracts (Stage 390)

Read the accepted Stage 370 contract/ADR 0038 and current scoped work order.
`package.ts` defines draft content; `story.ts` contains scenario declarations;
`revisions.ts` contains owner-only revision DTOs. Runtime AI output is untrusted.

- Local keys are private draft references. Server-owned `CampaignIdentities` map
  them to opaque canonical IDs; never expose local keys through player projections.
- HTTP writes accept content/base revision/request ID only. Source, owner, mapping,
  digest and timestamps are server data; clients cannot assert AI provenance.
- Shape validation does not prove reference, knowledge, timeline or rules legality.
  The pure plan compiler and isolated World Engine assessment own those checks.
- Prepared situations/encounters/developments are plans, never player decisions,
  memories, quest progress or already-started combat.
- Party entries are prepared character seats; controllers join via real invitations.
- Stored package schema versions remain readable; adding a future version must
  preserve older revisions. Do not silently narrow earlier stored content.

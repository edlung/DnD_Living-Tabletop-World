# Gate 07 remediation — the four Medium findings

Base: `main` `64efe21` (Stages 370–450 merged). Review: `reviews/GATE_07_SECURITY_REVIEW_2026-10-31.md`
(pull request #16). Authority: `reviews/OWNER_GATE_07_DISPOSITION_2026-10-31.json` («Да, исправить»,
moderate job bounds, a separate picture grant).

1. **G07-04, NPC disclosure.** An NPC-held record without `disclosure` keeps the engine's GUARDED
   default: the compiler emits `SetDisclosure` only for an explicit value. The owner's editor and
   inspector show the effective value ("Guarded (default)"), never "None recorded"; the generation
   prompt says that an omitted willingness is GUARDED.
2. **G07-03, quest identifiers.** Quests and each quest's stages get opaque server identities in the
   draft's identity registry (migration 0023), kept across revisions like entities. The compiler
   rewrites `questId`, every milestone `stage` and `after`; player quest logs carry only these IDs.
   A revision saved before quest identities cannot be activated until it is saved again. The
   engine's bootstrap command keeps its identity shape (its plan never publishes quests). Extend the
   bootstrapped-campaign guards (play test, activation journey) to the player's quest answers.
3. **G07-02, paid pictures.** A per-owner picture grant (migration 0024, append-only revisions,
   `pnpm ai:operator picture-grant`), checked at availability (`NO_GRANT`), in the enqueue
   transaction and at the reservation. Owners whose latest text grant is enabled keep pictures.
4. **G07-01, paid job queues.** Inside the enqueue transaction, under the draft lock and a per-owner
   advisory lock: one active GENERATE/EDIT job per draft and two per owner (retries included), four
   active pictures per owner; a refusal is the fixed 429, which the workshop client words as "wait
   for a running job to finish". The serial workers serve owners in turn.

Each fix gets a regression that fails on `64efe21`'s behaviour. Run format, lint, typecheck,
context budget, unit, build, integration and browser journeys; record ADR/runbook/AGENTS changes and
a remediation report, then ask the owner whether the Gate 07 reviewer should retest.

Out of scope: Low findings G07-05…G07-10 and the Info notes (open for a later disposition), any
deployment, release tag, credential, provider, model or default-database change, human acceptance.

# 0027. World as Interface: object-first exploration

- Status: Accepted
- Date: 2026-10-05
- Stage: 210 only
- Decision type: technical; implements existing product and knowledge contracts.
- Owner approval: not required for these technical choices. The owner authorized
  Stage 210 in chat and directed this session (Claude Sonnet 5.5) to carry it out
  instead of Opus 5.5/HIGH; this exception does not change the matrix for later
  stages or independent gates.

## Context

ADR 0026 delivered read-only contextual options. Stage 210 makes the world the
interface: the player reaches Mira, the Missing Caravan, and the investigation
objects by selecting objects in the scene, never through a quest or NPC menu.
Rules and the World Engine keep authority; the client only submits the commands
that the server already lists as legal.

## Decisions

1. **Server-listed actions only.** The client shows exactly the `ContextAction`
   entries the Context Engine returns, mapped to existing commands by
   `exploration/action-bindings.ts`. An unknown or non-executable action stays
   read-only. Visibility of "Ask about Merchant Guild caravan" therefore follows
   the character's knowledge, never client logic.
2. **Arrival keeps the place in context.** After an accepted `EnterLocation` the
   entered location becomes the selected object, so Inspect/Investigate are one
   step away and the details panel is not emptied.
3. **Unidentified objects stay unidentified.** Entities the perspective cannot
   name are labelled `Unidentified <kind>`; a name appears only after the server
   returns it. Not-yet-legal actions show the server reason text only.
4. **One mutation at a time, same command on retry.** `use-action.ts` keeps one
   attempt; an interrupted response is retried with the same `commandId`, so a
   completed command returns `duplicate` and records a single result.
5. **Hypotheses stay hypotheses.** The hypothesis form issues the existing
   record-hypothesis command with a chosen scope; the UI displays the epistemic
   type from the server and never promotes or reclassifies it.
6. **Recall is a world action.** Memory recall opens from the entity as scoped
   by the server, and a late recall result cannot replace the current object.
7. **Reachability.** Non-adjacent known places stay under "Known destinations";
   the full authorized sheet and all contextual options remain in disclosure
   panels. No quest activation or NPC menu is needed.

## Test isolation

Each mutating browser journey owns a campaign prepared through real engine
commands (`apps/server/src/testing/ui-investigation-campaigns.ts`). The
unknown-concept campaign omits caravan knowledge and, through a DM
`SetDisclosure`, lets Mira share her departure account once the concept is learned.

## Consequences

No dependency edge, contract, or canonical mutation path changes. No previous
gate coverage is invalidated, so no gate is reopened. Combat actions (Stage 220)
and authoring (Stage 230) remain unimplemented.

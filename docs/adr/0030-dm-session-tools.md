# 0030. DM session tools: time, Chronicle, performing an NPC

- Status: Accepted
- Date: 2026-10-05
- Stage: 240 (bounded owner-authorized remediation)
- Decision type: technical; no new product semantics.
- Owner approval: the owner told this session (Claude Sonnet 5.5) to add the client flows
  the first Stage 240 report found missing. Allocation of these flows to a stage was the
  open question in `docs/IMPLEMENTATION_PREREQUISITES.md`; this ADR records that they landed
  in Stage 240's remediation, not in 200–230.

## Decisions

1. **Time and weather.** The DM uses `AdvanceWorldTime` (to Day 2 10:00 or by hours) and
   `SetWeather` for the viewed location, through the same command route. World time is shown
   as "Day N · HH:MM" (Day 1 starts at 0).
2. **Chronicle.** All perspectives read `GET chronicle` and open a memory's `flashback`; the
   DM writes a chapter with `POST chronicle`. Each paragraph shows the entries it cites with
   their epistemic types; nothing is rewritten client-side.
3. **Performing an NPC.** The DM uses `POST npcs/:id/dialogue` for a chosen character. Ask
   decides its canonical outcome first; the reply is labelled "Spoken, not a recorded fact".
4. **Open state survives refresh.** The time/weather panel's open state sits in `World`, and
   the authoring session sits outside the loading state, because each command refreshes the
   world.

## Consequences

No dependency edge, contract, canonical mutation path, or reviewed projection changed; the
existing chronicle, dialogue, and command routes are used as designed. Gate coverage is not
invalidated (`docs/GATE_COVERAGE.md`, Stage 240 note).

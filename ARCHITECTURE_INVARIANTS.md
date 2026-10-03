# Living Tabletop World — Architecture Invariants v0.1

These are product contracts. Agents MUST NOT weaken them without an explicit ADR approved by the project owner.

1. **WORLD ENGINE IS AUTHORITY.** Canonical state changes only through validated domain commands.
2. **AI IS NOT AUTHORITY.** AI proposes; it cannot directly write canonical state.
3. **DM HAS FINAL AUTHORING AUTHORITY** for risk-sensitive canonical narrative changes.
4. **PLAYER KNOWLEDGE IS NOT WORLD TRUTH.**
5. **NO KNOWLEDGE LEAKAGE.** Context/projections contain only permitted information.
6. **NPC CONTEXT IS SCOPED.** NPC dialogue does not receive secrets the NPC does not know.
7. **AI SUGGESTIONS ARE NOT FACTS.** Inferences/hypotheses cannot silently become canonical facts.
8. **DETERMINISTIC RULES STAY DETERMINISTIC.**
9. **AI RANKS RELEVANCE; RULES DECIDE LEGALITY.**
10. **REACTIONS ARE DOMAIN EVENTS**, not client-side conveniences.
11. **EVERY CANONICAL MUTATION IS AUDITABLE.**
12. **WORLD HISTORY IS RECONSTRUCTABLE** for supported temporal domains.
13. **ENTITY IDENTITY IS STABLE ACROSS TIME.**
14. **VISUAL STATE IS NOT WORLD STATE.**
15. **QUEST STATE IS A PROJECTION, NOT WORLD TRUTH.**
16. AI mutations pass schema → permission → rules where relevant → continuity/lore → risk/confirmation → World Engine.
17. Invalid AI commands fail without partial canonical mutation.
18. Material AI-assisted mutations record enough provenance to answer: **Why did the system propose/know this?**
19. **FULL DATA REMAINS REACHABLE.** Contextual compression cannot permanently hide authorized canonical data.
20. **PLAYER AGENCY IS PRESERVED.** Legal suboptimal choices remain legal.
21. AI providers are replaceable behind capability-oriented interfaces.
22. Frontend clients never call external AI providers directly.
23. Start as a modular monolith unless an ADR demonstrates a concrete need for service extraction.

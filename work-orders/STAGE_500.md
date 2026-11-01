# Work Order — Stage 500: Character sheet and character cards

Authority: owner request 2026-11-01 (`reviews/OWNER_PRODUCT_COMPLETION_2026-11-01.json`), program
`docs/PRODUCT_COMPLETION_PLAN.md` (decisions 5 and 6). Base: `main` cf56d94.

## Deliver

1. **All 18 SRD skills** in `SKILLS` (contracts); existing sheets stay valid.
2. **Derived numbers from the server**: the sheet response carries `derived` computed by `@ltw/rules`
   (level, proficiency bonus, ability modifiers, saving throws, every skill, initiative, passive
   Perception/Investigation/Insight, spell save DC and attack bonus per casting source, the spells'
   rule data, carrying capacity). The client never recomputes a rule.
3. **Hero dialog** ("Character"): a modal like the Chronicle, opened from the dock (players: their own
   character) and from "Full character sheet" (own character, or any character for the DM). Tabs:
   Overview (card, vitals, abilities and saves, features, conditions, death saves), Skills (18, grouped
   by ability, proficiency marks, passives), Spells (sources, DC and attack, slots, free casts, spell
   cards), Inventory (the pack; reworked in Stage 520). The dock's Items entry becomes Character.
4. **Character card** component: portrait in the GPT ring, name, class line, level, hit point bar, armor
   class, speed; compact variant for the party rail and the details header.
5. RU/EN words for everything, keyboard and screen-reader complete, 44 px targets, axe clean, layout audit
   at 1440/768/390/320.
6. Tests: rules math for the new skills, the derived block, the knowledge boundary (another player gets
   no sheet), e2e journeys for the hero dialog (EN, RU, phone), axe.

## Boundaries

No new kernel command or event; no change to who may read a sheet (ADR 0012 / invariant 19).

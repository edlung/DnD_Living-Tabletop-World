# Character sheets

Canonical statistics live in `character.ts` (ADR 0011); rules consume them without client authority.
`view.ts` is the Stage 200 read projection: read it with ADRs 0008 and 0012 and invariant 19.

- Only DM perspective or CHARACTER for that sheet's own holder may read it. A DM's restricted preview stays restricted. PARTY/PUBLIC/NPC and other characters never gain sheets by knowing an entity.
- Copy every field and nested collection explicitly; never return a canonical sheet or entity object. Hide concentration target IDs that the character neither knows nor perceives.
- `view.test.ts` tests field additions, permission isolation, and alias-free projections. HTTP checks are in `apps/server/src/http/character-routes.test.ts`.

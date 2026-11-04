# 0051. The SRD data: import, attribution, catalogs, mechanics

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 650,
  decisions 5, 6 and 18, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`; the owner allowed
  the download of the SRD 5.2.1 in chat, 2026-11-02). Amends ADR 0039 §1 (the item catalog was
  original only) and extends ADR 0011 (the slice's rules) to the whole SRD 5.2.1.
- Context: the game knew six player spells, two monster spells, four Ravenford stat blocks and a
  catalog of original items. A table expects the SRD's spells, monsters, equipment and magic items,
  the rules glossary at hand, and every number from the server. The SRD 5.2.1 is published by Wizards
  of the Coast under CC-BY-4.0, which allows its use with the attribution statement it gives.

## Decision

1. **Source and attribution.** The SRD 5.2.1 PDF (`SRD_CC_v5.2.1.pdf`, sha-256 8974902d…5e3d87) is
   kept outside the repository; a script reads its text (macOS PDFKit) and writes the catalogs. The
   repository holds the structured data, never the PDF. The attribution statement the SRD asks for
   is shown on an About page and kept beside the data; no other attribution to Wizards is made.
2. **Datasets in the rules.** `@ltw/rules` holds the catalogs as JSON datasets under `src/srd/`
   with typed accessors — spells, monsters, magic items, equipment, the rules glossary — validated
   by contracts' schemas in tests; the browser reads them only through the server, as every rule.
   `scripts/srd/` imports them; the import is reproducible: the same text gives the same data, and
   a parser that cannot read an entry fails the import, never guesses.
3. **Two layers per entry.** The text layer keeps what the SRD says — name, level, school, classes,
   casting time, range, components, duration, the description and what a higher slot adds; a stat
   block's lines; an item's rarity, attunement and text. The mechanics layer is data over a small
   effect vocabulary (attack, save, damage, healing, condition, area, duration, concentration,
   resource), derived from the text where its wording is regular and curated where it is not; what
   the vocabulary cannot say stays text the DM resolves, and the UI says so.
4. **The catalogs feed the game.** A character's sheet names SRD spells by their slug; the DM adds
   an SRD monster to a campaign from the catalog; SRD equipment and magic items enter a campaign's
   item catalog beside Ravenford's originals, which keep their own names.
5. **Russian.** The catalogs carry English from the SRD; Russian comes from a translation pass over
   the same keys, reviewed in the client dictionary as any other words; until a key has its
   Russian, the English shows.

## Consequences

- Stage 650 runs in parts: the import and the catalogs; spells' mechanics; monsters' mechanics;
  magic items; the rules reference and the Gameplay Toolbox. Each part keeps the World Engine's
  authority: data describes, the server decides.
- The ADR 0039 test that forbade SRD item names now forbids them only in Ravenford's originals.

## Invariants affected

Preserves 1, 8 and 9: the catalogs are read-only data; every roll and effect is the server's.

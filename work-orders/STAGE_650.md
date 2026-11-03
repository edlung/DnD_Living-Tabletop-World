# Work Order — Stage 650: SRD data

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone B, decisions 5, 6, 7 and 18); ADR 0051 (written first; it
amends ADR 0039 §1 as decision 18 asks). The owner allowed the download of the SRD 5.2.1 PDF in
chat (2026-11-02); it stays outside the repository.

## Sub-stages (one commit each, the suite green at each)

- 650a — The import and the text catalogs. `scripts/srd/pdflines.swift` writes each page's lines
  with their bounds and fonts (macOS PDFKit); `scripts/srd/text.ts` puts them in reading order (the
  text layer's own order mixes the stat blocks' columns); parsers for the spells (339) and the stat
  blocks (330: Monsters A–Z and Animals), the SRD's few misprints corrected by name in the parser
  and listed there; `scripts/srd/import.ts` writes `packages/rules/src/srd/*.json`. Contracts'
  schemas for the two catalogs; typed accessors in `@ltw/rules`; dataset tests (counts, every
  modifier from its score, every save its modifier or plus the proficiency bonus, initiative
  scores, unique ids, the slice's spells present); parser tests on excerpts. The About page with
  the SRD's attribution statement (`NOTICE.md`). The rules' AGENTS.md: SRD text enters only through
  the import.
- 650b — Spells' mechanics: each spell as data over the effect vocabulary (attack, save, damage,
  healing, condition, area, duration, concentration, resource, bonuses and advantage from a source,
  temporary hit points, lasting zones, pushes and pulls), derived from the text where its wording
  is regular and curated where it is not; casting an SRD spell in a fight and outside it; upcasting
  for every spell, cantrips by level, rituals, material components with a cost (consumed or not).
  What the vocabulary cannot say is the DM's to resolve, and the UI says so. ADR 0052; in three
  commits: the mechanics layer (derived from the text, curated, tested against the text); the
  engine (any SRD spell by id, targets and areas, attack, save, healing, temporary hit points,
  darts, conditions, concentration, higher slots, cantrips' growth); the screens (the spell list,
  casting with a slot, a target or an area, outside a fight; "the DM decides" where it is so).
- 650c — Monsters' mechanics: the DM adds a stat block from the catalog (search by name, type and
  CR); speeds, senses, resistances, immunities and condition immunities from the text; Recharge,
  per-day uses, bonus actions, reactions, traits (Pack Tactics, Magic and Legendary Resistance),
  legendary actions, a Multiattack that mixes attacks; CR, XP and the encounter's difficulty;
  stat blocks for summons, companions and Wild Shape forms. ADR 0053; in parts: the conversion
  (attacks with their added damage, condition immunities) and the DM's bestiary; save actions
  with an area, Recharge and per-day uses; traits, reactions, legendary actions and difficulty.
  Done: summons, companions and Wild Shape forms use the bestiary's stat blocks; the four that a
  spell's level scales (Animated Object, Otherworldly Steed, Giant Insect, Draconic Spirit) come
  with the classes in Stage 660; Legendary Resistance's uses, Parry-like reactions and legendary
  actions that do more than attack stay the DM's (ADR 0053 §4).
- 650d — Equipment and magic items: the SRD's equipment (weapons, armor, tools, gear, prices) and
  magic items (rarity, attunement, charges, unidentified, cursed) in a campaign's item catalog beside
  Ravenford's originals; the ADR 0039 test then forbids SRD names only in Ravenford's originals.
  ADR 0054; in parts: the equipment (the Equipment chapter's tables and entries, Musket and Pistol,
  the catalog's SRD entries behind `@ltw/contracts/srd-items`, the DM's catalog in the open pack, an
  SRD entry's words on its card); magic items in the catalog (rarity and worth, made on a base the
  DM names, +1 to attack and damage or to Armor Class, healing potions' dice); attunement and the
  protection items; charges at the next dawn, identifying, curses. Done: all four parts. The dawn
  is the DM's button on the Time sheet (the clock marks no dawns yet); a potion is known by a taste
  any time, anything else in the Short Rest the DM opened (which item was studied is not counted);
  what a charge casts and a wand's last-charge d20 stay the DM's (the card's words).
- 650e — The rules reference (the SRD's glossary in the app, tooltips on conditions, spells and
  actions) and the Gameplay Toolbox (diseases, curses, fear and mental stress, traps); the Russian
  translation pipeline (decision 7: the Codex CLI on the owner's subscription, a glossary of the
  Russian terms, a test that every entry is translated); GPT art for the catalogs (the art rule).
  ADR 0055; in parts: the rules reference (the glossary and the Toolbox read into blocks and
  tables, the Rules sheet for everyone with the DM's Toolbox tab, a condition's chip and an action's
  title opening their entry in place) — done; the toolbox's mechanics (traps, contagions, fear and
  mental stress, the environment, the sample poisons); the Russian rules text (the terms glossary,
  the Codex pass, the completeness test); the catalogs' art by kind.

## Checks at each sub-stage

Format, lint, typecheck, context budget, unit and integration tests, build; the browser suite for
anything a screen shows; the layout audit (1440, 768, 390, 320; RU and EN) for every new screen.

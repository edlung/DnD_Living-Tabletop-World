import {
  CLASS_IDS,
  CONDITIONS,
  FIGHTING_STYLES,
  ITEM_CATALOG,
  SKILLS,
  WEAPON_IDS,
} from '@ltw/contracts';
import { SRD_ITEM_CATALOG } from '@ltw/contracts/srd-items';
import { SRD_MONSTERS, SRD_SPELLS, spellSlotsFor, WEAPONS } from '@ltw/rules';

/**
 * Public rules only: this cacheable text contains no owner, seed, fixture or generated story. The
 * SRD 5.2.1 as the game holds it (docs/adr/0058-campaign-content.md §6): its classes, spells,
 * weapons, items and monsters by ID, every check the World Engine's as before.
 */
export const CAMPAIGN_RULES_GUIDE = [
  'Supported rules are the SRD 5.2.1: its twelve classes, spells, weapons, equipment, magic items and',
  'monsters, listed below by ID. Name only listed IDs; anything else stays narrative, or incomplete for assessment.',
  'Character sheets use the listed classes; total class levels equal brief.partyLevel.',
  'Prepare exactly brief.partySize distinct character seats, each with a complete sheet and initial placement.',
  'A seat is not a controller, player account, membership or played character history.',
  'A narrative profession or appearance does not grant another class, spell, weapon, skill or feature.',
  'Do not silently claim unsupported mechanics work; leave unsupported preparation incomplete for assessment.',
  'Every sheet has all six ability scores, HP current<=max, AC, speed in multiples of 5 feet, saves,',
  'skills {proficient,expertise}, attacksPerAction, weapons, spellSlots {max,expended}, spellcasting,',
  'conditions and concentration. Expertise is a subset of proficiency; fresh seats use full HP,',
  'zero expended slots, no conditions and null concentration. An optional fightingStyle is one of fightingStyles.',
  'Spell slot rows always contain nine integers (levels 1 through 9); slotsByClassAndLevel gives one class.',
  'For multiclass slots, caster level = bard, cleric, druid, sorcerer and wizard levels + ceil((paladin +',
  'ranger levels)/2), then use the wizard row at that level.',
  'Casting abilities: bard, paladin, sorcerer, warlock cha; cleric, druid, ranger wis; wizard int.',
  'magic-initiate and species are casting sources, not classes. List only spells of the source’s list whose',
  'level has slots, or cantrips; a freeCasts grant names a spell in the same source, used<=perLongRest.',
  'A sheet’s weapons are listed weapon IDs; a character without one must not be given invented attacks.',
  'An NPC or creature from the SRD bestiary names its monster ID (monster): the server writes its stat block',
  'from the SRD. Write statBlock by hand only for one the bestiary lacks.',
  'NPC/creature combatants use statBlock (not a character sheet): AC, HP, speed, abilities,',
  'six numeric savingThrows, initiativeBonus, attacksPerAction, attacks, spells, conditions.',
  'A monster attack supplies attackId/name/kind/bonus/damage; melee needs reachFt, ranged needs',
  'normalRangeFt<=longRangeFt. Damage is {count,sides,bonus,type}, sides one of 4,6,8,10,12.',
  'Monster spells use action or bonus casting, rangeFt, V/S/M components, and attack or save damage.',
  'Prepared encounters have 2..16 unique active character/npc/creature combatants with supported stats.',
  'Battlefields are rectangular 1..40 squares per side; positions, difficult squares and cover',
  'must be in bounds; combatants occupy distinct squares. Sides: party, hostile, neutral.',
  'Cover levels are half, three-quarters, total. One square is 5 feet. Encounters are optional plans,',
  'never already-started combat, guaranteed victories, initiative history or player choices.',
  'Starting items: an item is an entity with kind=item. One that a character or NPC carries at the start has NO',
  'placement and a possessions row {item,holder,catalog?,quantity}; a catalog ID is optional (a unique story',
  'object has none) and must be one of the listed ones. Only a stackable catalog item has quantity above 1.',
  'Items start carried, never worn. An item lying in a place is a placed entity with no possessions row.',
  'Lists (an ID spells its English name): spells [id, level, classes], monsters [id, challenge rating],',
  'itemCatalog [id, category, stackable].',
  JSON.stringify({
    classes: CLASS_IDS,
    skills: SKILLS,
    conditions: CONDITIONS,
    fightingStyles: FIGHTING_STYLES,
    weapons: Object.fromEntries(WEAPON_IDS.map((key) => [key, WEAPONS[key]])),
    spells: SRD_SPELLS.map((spell) => [spell.spellId, spell.level, spell.classes]),
    monsters: SRD_MONSTERS.map((monster) => [monster.monsterId, monster.challenge.rating]),
    itemCatalog: [...ITEM_CATALOG, ...SRD_ITEM_CATALOG].map((entry) => [
      entry.itemId,
      entry.category,
      entry.stackable,
    ]),
    slotsByClassAndLevel: Object.fromEntries(
      CLASS_IDS.map((classId) => [
        classId,
        Array.from({ length: 20 }, (_, index) => ({
          level: index + 1,
          max: spellSlotsFor([{ classId, level: index + 1 }]),
        })),
      ]),
    ),
  }),
].join('\n');

import { CLASS_IDS, CONDITIONS, ITEM_CATALOG, SKILLS, SPELL_IDS, WEAPON_IDS } from '@ltw/contracts';
import { SPELLS, spellSlotsFor, WEAPONS } from '@ltw/rules';

/** Public rules only: this cacheable text contains no owner, seed, fixture or generated story. */
export const CAMPAIGN_RULES_GUIDE = [
  'Supported rules are a narrow SRD 5.2.1 slice, not the complete game.',
  'Character sheets use only ranger or wizard classes, total class levels equal brief.partyLevel.',
  'Prepare exactly brief.partySize distinct character seats, each with a complete sheet and initial placement.',
  'A seat is not a controller, player account, membership or played character history.',
  'A narrative profession or appearance does not grant another class, spell, weapon, skill or feature.',
  'Do not silently claim unsupported mechanics work; leave unsupported preparation incomplete for assessment.',
  'Every sheet has all six ability scores, HP current<=max, AC, speed in multiples of 5 feet, saves,',
  'skills {proficient,expertise}, attacksPerAction, weapons, spellSlots {max,expended}, spellcasting,',
  'conditions and concentration. Expertise is a subset of proficiency; fresh seats use full HP,',
  'zero expended slots, no conditions and null concentration. Optional fightingStyle is archery only.',
  'Spell slot rows always contain nine integers (levels 1 through 9). For multiclass slots,',
  'caster level = wizard levels + ceil(ranger levels/2), then use the wizard row at that level.',
  'Ranger casting ability is wis; wizard is int. magic-initiate is an available casting source,',
  'not a class. List only supported spells for which the prepared level has slots; do not invent cantrips.',
  'A freeCasts grant must name a spell in the same source, used<=perLongRest.',
  'Longbow is the only character weapon; a wizard without a weapon must not be given invented attacks.',
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
  JSON.stringify({
    itemCatalog: ITEM_CATALOG.map((entry) => ({
      id: entry.itemId,
      category: entry.category,
      name: entry.name.en,
      stackable: entry.stackable,
    })),
    classes: CLASS_IDS,
    skills: SKILLS,
    conditions: CONDITIONS,
    weapons: Object.fromEntries(WEAPON_IDS.map((key) => [key, WEAPONS[key]])),
    spells: Object.fromEntries(SPELL_IDS.map((key) => [key, SPELLS[key]])),
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

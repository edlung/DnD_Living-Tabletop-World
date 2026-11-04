import { itemEntry, type CharacterBuilderPort } from '@ltw/domain';
import { buildCharacter, spellIn, srdSpell, startingAt } from '@ltw/rules';

import { entryIn } from '../items/srd-words.ts';

/**
 * The rules' character builder for the World Engine (docs/adr/0056-characters-from-the-srd.md §2),
 * each starting item named in the campaign's language (an SRD entry's Russian once it exists), at
 * the campaign's starting level (§3); and a spell's level and name, for a Spell Scroll scribed
 * (docs/adr/0057-encounters-maps-loot.md §9).
 */
export const characterBuilder: CharacterBuilderPort = {
  build(choices, d6, language, startingLevel = 1) {
    const built = buildCharacter(choices, d6);
    if (!built.ok) return built;
    return {
      ...built,
      sheet: startingAt(built.sheet, startingLevel),
      items: built.items.map((item) => {
        const entry = itemEntry(item.catalogId);
        return { ...item, name: entry ? entryIn(entry, language).name[language] : item.catalogId };
      }),
    };
  },
  itemWords(catalogId, language) {
    const entry = itemEntry(catalogId);
    if (!entry) return null;
    const shown = entryIn(entry, language);
    return { name: shown.name[language], description: shown.description[language] };
  },
  spell(spellId, language) {
    const spell = srdSpell(spellId);
    return spell ? { level: spell.level, name: spellIn(spell, language).value.name } : null;
  },
};

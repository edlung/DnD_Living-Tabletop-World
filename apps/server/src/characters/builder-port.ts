import { itemEntry, type CharacterBuilderPort } from '@ltw/domain';
import { buildCharacter } from '@ltw/rules';

import { entryIn } from '../items/srd-words.ts';

/**
 * The rules' character builder for the World Engine (docs/adr/0056-characters-from-the-srd.md §2),
 * each starting item named in the campaign's language (an SRD entry's Russian once it exists).
 */
export const characterBuilder: CharacterBuilderPort = {
  build(choices, d6, language) {
    const built = buildCharacter(choices, d6);
    if (!built.ok) return built;
    return {
      ...built,
      items: built.items.map((item) => {
        const entry = itemEntry(item.catalogId);
        return { ...item, name: entry ? entryIn(entry, language).name[language] : item.catalogId };
      }),
    };
  },
};

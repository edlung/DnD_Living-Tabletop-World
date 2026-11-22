import { existsSync, readFileSync } from 'node:fs';

type Card = {
  id: string;
  file: string;
  title: string;
  subjects: string[];
  sha256: string;
  sheet: string;
};
type Sheet = { id: string; originalSha256: string; prompt: string };
type Manifest = { cards: Card[]; sheets: Sheet[] };

export function castManifest(root: URL): Manifest {
  const file = new URL('illustrations/cast.json', root);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as Manifest)
    : { cards: [], sheets: [] };
}

/** Only a requested character is rendered. Player handouts embed their selected heroes so they
 * still travel as a single file. NPC portraits belong to the DM's book. */
export function castCards(root: URL) {
  const dir = new URL('illustrations/', root);
  const { cards } = castManifest(root);
  const byKey = new Map(cards.flatMap((card) => card.subjects.map((key) => [key, card] as const)));
  return (key: string, standalone = false): string => {
    const card = byKey.get(key);
    if (!card) return '';
    const file = new URL(card.file, dir);
    const src = standalone
      ? `data:image/webp;base64,${readFileSync(file).toString('base64')}`
      : `illustrations/${card.file}`;
    const alt = card.title
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;');
    return `<img class="art portrait" style="max-width:100%;height:auto" src="${src}" alt="${alt}" width="256" height="256" loading="lazy">`;
  };
}

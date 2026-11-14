import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Editorial aid: exact reused narrative phrases are candidates, never proof of copied plots.
const root = fileURLToPath(new URL('../../campaigns/', import.meta.url));
const fields = new Set(['pitch', 'truth', 'opening', 'play', 'readAloud', 'goal']);
interface Block {
  path: string;
  campaign: string;
  field: string;
  text: string;
}
const blocks: Block[] = [];
const unavailable: string[] = [];
function collect(value: unknown, path: string, campaign: string, key = '') {
  if (typeof value === 'string' && fields.has(key))
    blocks.push({ path, campaign, field: key, text: value });
  else if (Array.isArray(value))
    value.forEach((x) => {
      collect(x, path, campaign, key);
    });
  else if (value && typeof value === 'object')
    Object.entries(value).forEach(([k, v]) => {
      collect(v, path, campaign, k);
    });
}
async function scan(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['assets', 'variants', 'maps', 'handouts', 'node_modules'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (dir.endsWith('/source') && /^(world|sessions?-\d+)\.json$/.test(entry.name)) {
      const location = relative(root, path);
      const campaign = location.split('/source/')[0] ?? location;
      try {
        collect(JSON.parse(await readFile(path, 'utf8')), location, campaign);
      } catch {
        unavailable.push(location);
      }
    }
  }
}
await scan(root);
const index = new Map<string, Block[]>();
for (const block of blocks) {
  const words = block.text.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]+/gu) ?? [];
  for (let i = 0; i <= words.length - 12; i++) {
    const phrase = words.slice(i, i + 12).join(' ');
    const owners = index.get(phrase) ?? [];
    if (!owners.some((x) => x.campaign === block.campaign)) owners.push(block);
    index.set(phrase, owners);
  }
}
const pairs = new Map<string, { left: string; right: string; examples: string[]; spans: number }>();
for (const [phrase, owners] of index) {
  for (let i = 0; i < owners.length; i++)
    for (let j = i + 1; j < owners.length; j++) {
      const left = owners[i];
      const right = owners[j];
      if (!left || !right || ![left, right].some((x) => x.campaign.startsWith('noir-2026/')))
        continue;
      const key = [left.campaign, right.campaign].sort().join(' / ');
      const pair = pairs.get(key) ?? { left: left.path, right: right.path, examples: [], spans: 0 };
      pair.spans++;
      if (pair.examples.length < 6) pair.examples.push(phrase);
      pairs.set(key, pair);
    }
}
const result = {
  note: 'Exact twelve-word narrative overlap only. Review boilerplate and plot similarity manually; zero overlap is not originality proof.',
  blocks: blocks.length,
  campaigns: new Set(blocks.map((x) => x.campaign)).size,
  unavailable,
  candidates: [...pairs.values()].sort((a, b) => b.spans - a.spans),
};
await writeFile(
  new URL('../../reports/evidence/noir-ten-2026-11-08/phrase-candidates.json', import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
process.stdout.write(
  JSON.stringify({
    blocks: result.blocks,
    campaigns: result.campaigns,
    unavailable,
    candidates: result.candidates.length,
  }) + '\n',
);

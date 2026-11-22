import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { table } from './table.mjs';
import { investigate, openEvening, move } from './actions.mjs';

// Both clues used to disclose facts from future scenes on the first examination.
export async function earlyPages() {
  const observations = [];
  for (const [slug, key, unwritten] of [
    ['sky-archipelago', 'chalk-issue-log', /ночь перед пятым|палочек в ящике не осталось/i],
    ['mountain-wedding', 'inner-handhold', /в вечер 8|их подберут/i],
  ]) {
    const f = await table(slug);
    try {
      await openEvening(f, 'Досрочный осмотр');
      const [seen] = await investigate(f, [key], f.seats[0]);
      assert.doesNotMatch(seen.statement, unwritten);
      if (slug === 'sky-archipelago') {
        const handouts = JSON.parse(
          readFileSync(
            new URL(
              '../../campaigns/collection-2026/sky-archipelago/source/handouts.json',
              import.meta.url,
            ),
            'utf8',
          ),
        );
        const first = handouts.find((h) => h.key === 'chalk-issue-page-1'),
          later = handouts.find((h) => h.key === 'chalk-issue-page-2');
        assert.doesNotMatch(first.text, unwritten);
        assert.match(later.text, unwritten);
        const now = (await f.state()).clock;
        await f.cmd({ type: 'AdvanceWorldTime', by: 3 * 86400 });
        const releasedAt = (await f.state()).clock;
        await f.cmd({
          type: 'AddKnowledge',
          scope: { kind: 'PARTY' },
          knowledgeType: 'FACT',
          statement: later.text,
          subjects: [f.ids['vesta-ron']],
          knownSince: releasedAt,
        });
        const after = await f.request('/knowledge?perspective=PLAYER', undefined, f.seats[1].token);
        assert.ok(after.knowledge.some((k) => k.statement === later.text));
        observations.push({
          slug,
          ...seen,
          lateHandout: later.title,
          elapsedSeconds: releasedAt - now,
        });
      } else observations.push({ slug, ...seen });
    } finally {
      await f.close();
    }
  }
  return observations;
}
export async function showMira(f, evidence) {
  for (const record of evidence) {
    const witness = f.seats.find((s) => s.name === record.witness);
    const mira = (await f.state()).entities.get('mira-vale');
    await move(f, witness, mira.placement.locationId);
    const records = (await f.request('/knowledge?perspective=PLAYER', undefined, witness.token))
      .knowledge;
    const found = records.find(
      (k) => k.knowledgeType === 'EVIDENCE' && k.statement === record.statement,
    );
    assert.ok(found);
    await f.cmd(
      {
        type: 'ShowEvidence',
        characterId: witness.id,
        npcId: mira.entityId,
        knowledgeId: found.knowledgeId,
      },
      witness,
    );
  }
}

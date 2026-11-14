import assert from 'node:assert/strict';
import type { CampaignKnowledge } from '../../packages/contracts/src/index.ts';
import type { Source } from './source.ts';
import { box, esc, list, p } from './render-common.ts';

/** Structural evidence checks supplement the author's substantive mystery review. */
export function verifyCase(s: Source): void {
  const c = s.case;
  const npcs = new Set(s.cast.npcs.map((n) => n.key));
  const clues = new Set(s.clues.map((clue) => clue.key));
  const staged = new Set(s.sessions.flatMap((session) => session.clues));
  assert(npcs.has(c.culprit), 'culprit must be an authored NPC');
  assert(c.centralQuestion.length > 20 && c.motive.length > 40 && c.method.length > 40);
  assert(c.timeline.length >= 6 && c.routes.length >= 3 && c.suspects.length >= 3);
  assert(c.redHerrings.length >= 2 && c.failureRecovery.length >= 3);
  for (const event of c.timeline) {
    assert(event.when.length > 0 && event.event.length > 20);
    for (const witness of event.witnesses) assert(npcs.has(witness));
  }
  assert.equal(new Set(c.routes.map((route) => route.key)).size, c.routes.length);
  for (const route of c.routes) {
    assert(new Set(route.clues).size >= 2 && route.reasoning.length > 80);
    for (const clue of route.clues) assert(clues.has(clue) && staged.has(clue), clue);
  }
  const shared = c.routes[0]?.clues.filter((key) => c.routes.every((r) => r.clues.includes(key)));
  assert.equal(shared?.length, 0, 'every route depends on the same evidence');
  assert(c.suspects.some((suspect) => suspect.npc === c.culprit));
  for (const suspect of c.suspects) {
    assert(npcs.has(suspect.npc));
    assert(suspect.apparentMotive.length > 20 && suspect.exoneration.length > 40);
  }
  for (const herring of c.redHerrings) {
    assert(herring.refutation.length > 40 && herring.clues.length > 0);
    for (const clue of herring.clues) assert(clues.has(clue));
  }
}

export function caseRecords(s: Source): CampaignKnowledge[] {
  const c = s.case;
  const texts = [
    `${c.centralQuestion} Ответ ведущему: ${s.cast.npcs.find((n) => n.key === c.culprit)?.name}.`,
    c.motive,
    c.method,
    ...c.timeline.map((x) => `${x.when}: ${x.event}`),
    ...c.routes.map((x) => `${x.label}: ${x.reasoning}`),
    ...c.suspects.flatMap((x) => [x.apparentMotive, x.against, x.exoneration]),
    ...c.redHerrings.flatMap((x) => [x.claim, x.refutation]),
    ...c.failureRecovery,
  ];
  return texts.map((statement, i) => ({
    key: `case-note-${i + 1}`,
    scope: { kind: 'DM' },
    statement,
    subjects: [],
    knowledgeType: 'SECRET',
    knownSince: null,
    relations: [],
  }));
}

export function renderCase(s: Source): string {
  const c = s.case;
  const name = (key: string) => s.cast.npcs.find((n) => n.key === key)?.name ?? key;
  const clue = (key: string) => s.clues.find((x) => x.key === key)?.name ?? key;
  return box(
    'Досье дела · только ведущему',
    p(c.centralQuestion) +
      p(`Виновник: ${name(c.culprit)}.`) +
      p(c.motive) +
      p(c.method) +
      '<h3>Что произошло до начала игры</h3>' +
      list(
        c.timeline.map(
          (x) => `${x.when}. ${x.event} Свидетели: ${x.witnesses.map(name).join(', ') || 'нет'}.`,
        ),
      ) +
      '<h3>Независимые пути доказательства</h3>' +
      c.routes
        .map(
          (r) =>
            `<h3>${esc(r.label)}</h3>${p(r.reasoning)}${p(`Улики: ${r.clues.map(clue).join('; ')}.`)}`,
        )
        .join('') +
      '<h3>Подозреваемые</h3>' +
      c.suspects
        .map(
          (x) =>
            `<h3>${esc(name(x.npc))}</h3>${p(x.apparentMotive)}${p(x.against)}${p(x.exoneration)}`,
        )
        .join('') +
      '<h3>Проверяемые ложные версии</h3>' +
      c.redHerrings
        .map((x) => p(x.claim) + p(x.refutation) + p(`Проверка: ${x.clues.map(clue).join('; ')}.`))
        .join('') +
      '<h3>Если расследование зашло в тупик</h3>' +
      list(c.failureRecovery),
  );
}

import type { ContextAction } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  chronicleModelVerdict,
  chronicleVerdict,
  dialogueIsolation,
  forbiddenFor,
  lexicalLeaks,
  relevanceVerdict,
} from './oracles.ts';

/**
 * The dialogue, Chronicle and relevance oracles and their negative controls
 * (docs/STAGE_300_REMEDIATION_DESIGN.md §4): guarded content, a wrong citation, a missing hedge,
 * and a relevance answer that breaks its action-set or deadline contract. Intent oracles:
 * `intent-oracles.test.ts`.
 */
describe('dialogue oracles', () => {
  it('forbids planted secrets, other NPCs’ facts and the NPC’s own guarded content', () => {
    const forbidden = forbiddenFor('mira-vale', null);
    expect(forbidden).toEqual(expect.arrayContaining(['NBXTRUTH', 'патруль', 'до рассвета']));
    // `до рассвета` is guarded by Mira, not in her neverSaid list: guardedBy is checked too.
    expect(lexicalLeaks('Караван ушёл ДО РАССВЕТА.', forbidden)).toEqual(['до рассвета']);
    expect(lexicalLeaks('Чем могу помочь?', forbidden)).toEqual([]);
    expect(lexicalLeaks('Я узнал тот же знак.', forbiddenFor('orin-stonebeard', null))).toEqual([
      'узнал тот же знак',
    ]);
  });

  const MIRA_CONTEXT = {
    text: '{"mayTell":["NBXMIRAWILLING: the stalls restock on market day."]}',
    sourceIds: ['mira-vale', 'nb-mira-willing'],
  };
  const isolation = (
    body: string,
    overrides: Partial<Parameters<typeof dialogueIsolation>[0]> = {},
  ) =>
    dialogueIsolation({
      npc: 'mira-vale',
      bodies: [body],
      line: null,
      context: MIRA_CONTEXT,
      traceSourceIds: ['nb-mira-willing', 'mira-vale'],
      ...overrides,
    });

  it('inspects the exact provider input against the context builder, apart from the reply', () => {
    expect(isolation('{"system":"Вы Мира. NBXMIRAWILLING: the stalls restock."}')).toEqual({
      inspected: true,
      leaks: [],
      missing: [],
      sourcesMatch: true,
    });
    expect(
      dialogueIsolation({
        npc: 'mira-vale',
        bodies: [],
        line: null,
        context: null,
        traceSourceIds: null,
      }),
    ).toEqual({ inspected: false, leaks: [], missing: [], sourcesMatch: null });
  });

  it('finds planted secrets, other NPCs’ facts, locked guarded content and IDs in the input', () => {
    const verdict = isolation(
      '{"messages":[{"content":"NBXMIRAWILLING; патруль; до рассвета; nb-truth; mira-vale"}]}',
    );
    expect(verdict.leaks).toEqual(
      expect.arrayContaining(['патруль', 'до рассвета', 'nb-truth', 'mira-vale']),
    );
  });

  it('allows guarded content the builder unlocked, and the player’s own words', () => {
    const unlocked = {
      text: `${MIRA_CONTEXT.text} {"guardedTold":"до рассвета"}`,
      sourceIds: MIRA_CONTEXT.sourceIds,
    };
    expect(isolation('NBXMIRAWILLING; до рассвета', { context: unlocked }).leaks).toEqual([]);
    expect(forbiddenFor('mira-vale', unlocked.text)).not.toContain('до рассвета');
    expect(forbiddenFor('mira-vale', MIRA_CONTEXT.text)).toContain('до рассвета');
    expect(forbiddenFor('mira-vale', null)).toContain('до рассвета');
    // A forbidden phrase the player typed is the player's, not a leak.
    const line = 'Расскажи про патруль.';
    expect(isolation(`NBXMIRAWILLING; ${line}`, { line }).leaks).toEqual([]);
  });

  it('reports allowed content missing from the input and sources unlike the builder’s', () => {
    expect(isolation('{"system":"Вы Мира."}').missing).toEqual(['NBXMIRAWILLING']);
    expect(
      isolation('NBXMIRAWILLING', { traceSourceIds: ['mira-vale', 'nb-truth'] }).sourcesMatch,
    ).toBe(false);
    expect(isolation('NBXMIRAWILLING', { traceSourceIds: null }).sourcesMatch).toBeNull();
  });
});

describe('Chronicle oracle', () => {
  const chapter = (paragraphs: { text: string; cites: string[] }[]) => ({
    entries: [
      { key: 'e1', knowledge: [{ knowledgeId: 'k1', knowledgeType: 'TESTIMONY', statement: 's' }] },
      { key: 'e2', knowledge: [] },
    ] as never,
    prose: { paragraphs },
  });

  it('accepts cited, hedged prose that tells every entry', () => {
    expect(
      chronicleVerdict(
        chapter([
          { text: 'Со слов Миры, караван ушёл до рассвета.', cites: ['e1'] },
          { text: 'Мы отправились в путь.', cites: ['e2'] },
        ]),
        'ru',
      ),
    ).toEqual({ citationsValid: true, hedgesPresent: true, entriesCovered: true, issues: [] });
  });

  it.each([
    ['a wrong citation', [{ text: 'Мы отправились в путь.', cites: ['e9'] }]],
    ['no citation', [{ text: 'Мы отправились в путь.', cites: [] }]],
  ])('rejects %s', (_label, paragraphs) => {
    expect(chronicleVerdict(chapter(paragraphs), 'ru').citationsValid).toBe(false);
  });

  it('rejects an account told as fact (missing hedge) and an untold entry', () => {
    const verdict = chronicleVerdict(
      chapter([{ text: 'Караван ушёл до рассвета.', cites: ['e1'] }]),
      'ru',
    );
    expect(verdict.hedgesPresent).toBe(false);
    expect(verdict.entriesCovered).toBe(false);
  });
});

describe('Chronicle model verdict', () => {
  const GOOD = {
    entries: [
      { key: 'e1', knowledge: [{ knowledgeId: 'k1', knowledgeType: 'TESTIMONY', statement: 's' }] },
    ] as never,
    prose: { paragraphs: [{ text: 'Со слов Миры, караван ушёл.', cites: ['e1'] }] },
  };
  const attempt = (provider: string, kind: string, outcome: string, issues: string[] = []) => ({
    provider,
    kind,
    outcome,
    issues,
  });
  const WRONG_CITATION = 'paragraphs.0.cites: "e9" is no entry of this chapter';
  const MISSING_HEDGE =
    'paragraphs.1.text: tells an account or a guess as fact; say whose or how uncertain';

  it('judges only model-authored prose', () => {
    expect(
      chronicleModelVerdict({
        attempts: [attempt('anthropic', 'initial', 'valid')],
        proseProvider: 'anthropic',
        chapter: GOOD,
        language: 'ru',
      }),
    ).toMatchObject({ authorship: 'model', pass: true, rejections: [] });
  });

  it('scores rejected model output as a model failure, with its validation causes', () => {
    const verdict = chronicleModelVerdict({
      attempts: [
        attempt('anthropic', 'initial', 'invalid', [WRONG_CITATION]),
        attempt('anthropic', 'repair', 'invalid', [MISSING_HEDGE, WRONG_CITATION]),
      ],
      proseProvider: 'template',
      chapter: GOOD,
      language: 'ru',
    });
    expect(verdict).toMatchObject({
      authorship: 'model-rejected',
      pass: false,
      rejections: [
        { kind: 'initial', causes: ['wrong citation'] },
        { kind: 'repair', causes: ['missing hedge', 'wrong citation'] },
      ],
    });
    expect(verdict.reason).toMatch(/wrong citation/);
    expect(verdict.reason).toMatch(/missing hedge/);
  });

  it('keeps a model chapter accepted after a rejected first answer visible', () => {
    expect(
      chronicleModelVerdict({
        attempts: [
          attempt('anthropic', 'initial', 'invalid', [MISSING_HEDGE]),
          attempt('anthropic', 'repair', 'valid'),
        ],
        proseProvider: 'anthropic',
        chapter: GOOD,
        language: 'ru',
      }),
    ).toMatchObject({
      authorship: 'model',
      pass: true,
      rejections: [{ kind: 'initial', causes: ['missing hedge'] }],
    });
  });

  it.each([
    ['the template with no model output', [], 'template', 'template'],
    [
      'the template after a provider failure',
      [attempt('anthropic', 'initial', 'error')],
      'template',
      'template',
    ],
    [
      'local prose after a switch',
      [attempt('anthropic', 'initial', 'error'), attempt('local', 'fallback', 'valid')],
      'local',
      'local',
    ],
    ['local prose on a local route', [attempt('local', 'initial', 'valid')], 'local', 'local'],
  ] as const)('never counts %s as a model pass', (_label, attempts, provider, authorship) => {
    expect(
      chronicleModelVerdict({ attempts, proseProvider: provider, chapter: GOOD, language: 'ru' }),
    ).toMatchObject({ authorship, pass: null, rejections: [] });
  });

  it.each([
    ['TRUNCATED', 'TRUNCATED'],
    ['paragraphs.0.cites: Too small: expected array to have >=1 items', 'no citation'],
    ['paragraphs.0.text: contains an ID', 'ID in prose'],
  ])('names the cause of %s', (issue, cause) => {
    expect(
      chronicleModelVerdict({
        attempts: [attempt('anthropic', 'initial', 'invalid', [issue])],
        proseProvider: 'template',
        chapter: GOOD,
        language: 'ru',
      }).rejections,
    ).toEqual([{ kind: 'initial', causes: [cause] }]);
  });
});

describe('relevance oracle', () => {
  // Talking has a nested topic, so a changed nested field is a changed action.
  const action = (id: string, relevance: string, legal = true, topic = 'mira-vale') =>
    ({
      id,
      legal,
      relevance,
      ...(id === 'talk' ? { topic: { entityId: topic } } : {}),
    }) as unknown as ContextAction;
  const DETERMINISTIC = [action('talk', 'HIGH'), action('inspect', 'MEDIUM')];
  const verdict = (
    actions: readonly ContextAction[],
    ranking: { source: 'ai' | 'deterministic'; status: string },
    elapsedMs = 100,
  ) =>
    relevanceVerdict({
      deterministic: DETERMINISTIC,
      ranked: { context: { actions }, ranking: { ...ranking, traceId: null } as never },
      elapsedMs,
      deadlineMs: 1_234,
      toleranceMs: 250,
    });

  it('accepts a reordering by the ranker and the exact deterministic fallback', () => {
    expect(
      verdict([action('inspect', 'HIGH'), action('talk', 'LOW')], {
        source: 'ai',
        status: 'RANKED',
      }).issues,
    ).toEqual([]);
    expect(verdict(DETERMINISTIC, { source: 'deterministic', status: 'TIMEOUT' }).issues).toEqual(
      [],
    );
  });

  it.each([
    ['an added action', [...DETERMINISTIC, action('attack', 'LOW')], 'actionSetKept'],
    ['a dropped action', [action('talk', 'HIGH')], 'actionSetKept'],
    [
      'a changed nested topic',
      [action('talk', 'HIGH', true, 'orin-stonebeard'), action('inspect', 'MEDIUM')],
      'actionSetKept',
    ],
    [
      'a changed legality',
      [action('talk', 'HIGH', false), action('inspect', 'MEDIUM')],
      'actionSetKept',
    ],
  ] as const)('rejects %s', (_label, actions, field) => {
    expect(verdict(actions, { source: 'ai', status: 'RANKED' })[field]).toBe(false);
  });

  it('rejects a reordered fallback, a timeout claimed by the ranker and a late answer', () => {
    expect(
      verdict([action('inspect', 'MEDIUM'), action('talk', 'HIGH')], {
        source: 'deterministic',
        status: 'AI_UNAVAILABLE',
      }).fallbackExact,
    ).toBe(false);
    expect(verdict(DETERMINISTIC, { source: 'ai', status: 'TIMEOUT' }).statusConsistent).toBe(
      false,
    );
    expect(
      verdict(DETERMINISTIC, { source: 'deterministic', status: 'RANKED' }).statusConsistent,
    ).toBe(false);
    // The deadline comes from configuration (1,234 ms here), never a hardcoded 2,000.
    expect(
      verdict(DETERMINISTIC, { source: 'deterministic', status: 'TIMEOUT' }, 1_485).withinDeadline,
    ).toBe(false);
    expect(
      verdict(DETERMINISTIC, { source: 'deterministic', status: 'TIMEOUT' }, 1_484).withinDeadline,
    ).toBe(true);
  });
});

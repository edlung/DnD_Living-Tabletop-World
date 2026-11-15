import type { MemorySuggestionView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { WorldApi, type Connection } from '../api/client.ts';
import { ALL_TIME } from '../chronicle/book-chapters.ts';
import { closeEvening, momentWords, writeChapter, type EveningPlan } from './evening.ts';

const connection: Connection = { kind: 'persona', campaignId: 'ravenford', token: 'token' };

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/** A server that answers each call by the first rule its path matches; it remembers every call. */
function server(rules: readonly (readonly [RegExp, () => Response])[]) {
  const calls: Call[] = [];
  const transport: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace('/api/campaigns/ravenford/', '');
    calls.push({
      method: init?.method ?? 'GET',
      path,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
    });
    const rule = rules.find(([pattern]) => pattern.test(path));
    return Promise.resolve(rule ? rule[1]() : Response.json({ status: 'accepted' }));
  };
  return { api: new WorldApi(connection, 'DM', 'DM', transport), calls };
}

const suggestion = (suggestionId: string, summary: string): MemorySuggestionView => ({
  suggestionId,
  occurredAt: 120,
  reason: 'battle',
  sources: [],
  command: { type: 'RecordMemory', scope: { kind: 'PARTY' }, memoryKind: 'BATTLE', summary },
});

const plan = (over: Partial<EveningPlan> = {}): EveningPlan => ({
  sessionId: 'session-3',
  title: 'Session 3',
  kept: [suggestion('s1', 'The party fought at the ford.')],
  line: '',
  now: 150,
  reason: 'Closing the evening',
  chapter: true,
  stars: false,
  unpair: false,
  guests: false,
  commandId: (key) => `evening-${key}`,
  ...over,
});

const written = () =>
  Response.json({
    result: { status: 'accepted' },
    chronicleId: 'chronicle.one',
    rendering: { status: 'AI_UNAVAILABLE', provider: 'template', traceId: null },
  });
const commands = (calls: readonly Call[]) =>
  calls
    .filter((call) => call.path.startsWith('commands'))
    .map((call) => call.body as { commandId: string; command: Record<string, unknown> });

describe('closing an evening', () => {
  it('keeps the moments with their session, ends the session, then writes its chapter', async () => {
    const { api, calls } = server([[/^chronicle/, written]]);
    const steps: string[] = [];
    const result = await closeEvening(
      api,
      plan({ line: '  The miller lied.  ' }),
      (response) => `prose:${response.rendering.status}`,
      (step) => steps.push(step),
    );

    // The sheet is told each step as it begins: a narrator's chapter can take a while.
    expect(steps).toEqual(['moments', 'end', 'chapter']);
    expect(result).toEqual({
      sessionId: 'session-3',
      title: 'Session 3',
      stopped: null,
      kept: 2,
      refused: [],
      unpaired: false,
      freed: null,
      chapter: { kind: 'written', chronicleId: 'chronicle.one', prose: 'prose:AI_UNAVAILABLE' },
    });
    const sent = commands(calls);
    expect(sent.map((entry) => entry.command['type'])).toEqual([
      'RecordMemory',
      'RecordMemory',
      'EndSession',
    ]);
    // Each memory is sent while the session is open and names it.
    expect(sent[0]?.command).toMatchObject({ sessionId: 'session-3', memoryKind: 'BATTLE' });
    expect(sent[1]?.command).toEqual({
      type: 'RecordMemory',
      scope: { kind: 'PARTY' },
      memoryKind: 'CONSEQUENCE',
      summary: 'The miller lied.',
      occurredAt: 150,
      sessionId: 'session-3',
      salience: 5,
      reason: 'Closing the evening',
    });
    expect(sent.map((entry) => entry.commandId)).toEqual([
      'evening-s1',
      'evening-line',
      'evening-end',
    ]);
    // The chapter: told from the Party, of this session, under its title.
    const chapter = calls.find((call) => call.path.startsWith('chronicle'));
    expect(chapter?.body).toEqual({
      title: 'Session 3',
      perspective: 'PARTY',
      from: ALL_TIME,
      sessionId: 'session-3',
    });
    expect(calls.findIndex((call) => call.path.startsWith('chronicle'))).toBe(calls.length - 1);
  });

  it('names a moment the world refuses and goes on', async () => {
    let asked = 0;
    const { api } = server([
      [
        /^commands/,
        () => {
          asked += 1;
          return asked === 1
            ? Response.json({ status: 'rejected', code: 'IMPOSSIBLE_MEMORY', message: 'no' })
            : Response.json({ status: 'accepted' });
        },
      ],
      [/^chronicle/, written],
    ]);
    const result = await closeEvening(api, plan(), () => 'prose');
    expect(result.stopped).toBeNull();
    expect(result.kept).toBe(0);
    expect(result.refused).toEqual(['The party fought at the ford.']);
  });

  it('stops before the end when a moment’s answer is lost: the session stays open', async () => {
    const { api, calls } = server([[/^commands/, () => new Response('', { status: 502 })]]);
    const result = await closeEvening(api, plan(), () => 'prose');
    expect(result.stopped).toBe('moments');
    expect(commands(calls)).toHaveLength(1);
    expect(calls.some((call) => call.path.startsWith('chronicle'))).toBe(false);
  });

  it('stops when the world refuses the end, with the kept moments standing', async () => {
    const { api, calls } = server([
      [
        /^commands/,
        () =>
          Response.json(
            calls.filter((call) => call.path.startsWith('commands')).length === 2
              ? { status: 'rejected', code: 'SESSION_NOT_ACTIVE', message: 'no' }
              : { status: 'accepted' },
          ),
      ],
    ]);
    const result = await closeEvening(api, plan(), () => 'prose');
    expect(result).toMatchObject({ stopped: 'end', kept: 1 });
    expect(calls.some((call) => call.path.startsWith('chronicle'))).toBe(false);
  });

  it('says there is nothing to tell, a failure, or that no chapter was asked for', async () => {
    const nothing = server([
      [/^chronicle/, () => Response.json({ error: { code: 'UNPROCESSABLE' } }, { status: 422 })],
    ]);
    expect((await closeEvening(nothing.api, plan({ kept: [] }), () => 'prose')).chapter).toEqual({
      kind: 'nothing',
    });
    const failed = server([[/^chronicle/, () => new Response('', { status: 500 })]]);
    expect((await closeEvening(failed.api, plan(), () => 'prose')).chapter).toEqual({
      kind: 'failed',
    });
    const skipped = server([]);
    const result = await closeEvening(skipped.api, plan({ chapter: false }), () => 'prose');
    expect(result.chapter).toEqual({ kind: 'skipped' });
    expect(skipped.calls.some((call) => call.path.startsWith('chronicle'))).toBe(false);
  });

  it('unpairs the screens and frees guest seats only when asked', async () => {
    const { api, calls } = server([
      [
        /^invitations/,
        () =>
          Response.json({
            members: [
              { characterId: 'elowen', login: 'anna' },
              { characterId: 'bram', login: null },
            ],
          }),
      ],
      [/^chronicle/, written],
    ]);
    const result = await closeEvening(api, plan({ unpair: true, guests: true }), () => 'prose');
    expect(result).toMatchObject({ unpaired: true, freed: 1 });
    expect(calls.map((call) => call.path)).toContain('displays/revoke');
    expect(calls.map((call) => call.path)).toContain('members/bram/revoke');
    expect(calls.map((call) => call.path)).not.toContain('members/elowen/revoke');
  });

  it('writes the chapter again on its own when the first try failed', async () => {
    const { api, calls } = server([[/^chronicle/, written]]);
    const chapter = await writeChapter(
      api,
      { sessionId: 'session-3', title: 'Session 3' },
      () => 'prose',
    );
    expect(chapter).toEqual({ kind: 'written', chronicleId: 'chronicle.one', prose: 'prose' });
    expect(calls.map((call) => call.path)).toEqual(['chronicle']);
  });

  it('shows “Stars and wishes” on the screens after the end, unless they are unpaired', async () => {
    const shown = server([[/^chronicle/, written]]);
    await closeEvening(shown.api, plan({ stars: true }), () => 'prose');
    const paths = shown.calls.map((call) => call.path);
    expect(shown.calls.find((call) => call.path === 'display/cast')?.body).toEqual({
      cast: { kind: 'stars' },
    });
    expect(paths.indexOf('display/cast')).toBeGreaterThan(paths.lastIndexOf('commands'));
    const unpaired = server([[/^chronicle/, written]]);
    await closeEvening(unpaired.api, plan({ stars: true, unpair: true }), () => 'prose');
    expect(unpaired.calls.map((call) => call.path)).not.toContain('display/cast');
  });

  it('reads a moment’s words from its draft', () => {
    expect(momentWords(suggestion('s1', 'A fight.'))).toBe('A fight.');
    expect(momentWords({ ...suggestion('s1', ''), command: { type: 'RecordMemory' } })).toBe('');
  });
});

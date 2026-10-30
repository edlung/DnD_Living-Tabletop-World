import { describe, expect, it } from 'vitest';

import { compareFields } from './model.ts';

describe('complete campaign field comparison', () => {
  it('distinguishes null, absence and empty text while retaining the entire changed value', () => {
    const long = 'Owner-authorized narrative. '.repeat(500);
    expect(compareFields({ statement: null }, { statement: '' })).toEqual([
      { path: ['statement'], beforePath: ['statement'], kind: 'CHANGE', before: null, after: '' },
    ]);
    expect(compareFields({}, { statement: null })).toEqual([
      {
        path: ['statement'],
        beforePath: ['statement'],
        kind: 'ADD',
        before: undefined,
        after: null,
      },
    ]);
    expect(compareFields({ statement: null }, {})).toEqual([
      {
        path: ['statement'],
        beforePath: ['statement'],
        kind: 'REMOVE',
        before: null,
        after: undefined,
      },
    ]);
    expect(compareFields({ description: 'Short' }, { description: long })[0]?.after).toBe(long);
  });
  it('ignores record property order but reports every changed nested scalar', () => {
    expect(compareFields({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toEqual([]);
    const changes = compareFields(
      { sheet: { hitPoints: { current: 3, max: 9 }, conditions: [] } },
      { sheet: { hitPoints: { current: 0, max: 12 }, conditions: ['prone'] } },
    );
    expect(changes).toEqual([
      {
        path: ['sheet', 'hitPoints', 'current'],
        beforePath: ['sheet', 'hitPoints', 'current'],
        kind: 'CHANGE',
        before: 3,
        after: 0,
      },
      {
        path: ['sheet', 'hitPoints', 'max'],
        beforePath: ['sheet', 'hitPoints', 'max'],
        kind: 'CHANGE',
        before: 9,
        after: 12,
      },
      {
        path: ['sheet', 'conditions'],
        beforePath: ['sheet', 'conditions'],
        kind: 'CHANGE',
        before: [],
        after: ['prone'],
      },
    ]);
  });
  it('matches keyed rows across a reorder and reads old content from its actual original path', () => {
    const before = {
      entities: [
        { key: 'a', name: 'Same name', description: 'First original' },
        { key: 'b', name: 'Same name', description: 'Second original' },
      ],
    };
    const after = {
      entities: [
        { key: 'b', name: 'Same name', description: 'Second revised' },
        { key: 'a', name: 'Same name', description: 'First original' },
      ],
    };
    const changes = compareFields(before, after),
      scalars = changes.filter((change) => change.kind === 'CHANGE');
    expect(changes.filter((change) => change.kind === 'MOVE')).toHaveLength(2);
    expect(scalars).toEqual([
      {
        path: ['entities', 0, 'description'],
        beforePath: ['entities', 1, 'description'],
        kind: 'CHANGE',
        before: 'Second original',
        after: 'Second revised',
      },
    ]);
    expect(before.entities[1]?.description).toBe('Second original');
  });
  it('treats insertion/removal as content changes without inventing moves for the shifted survivors', () => {
    const a = { key: 'a', name: 'A' },
      b = { key: 'b', name: 'B' },
      added = { key: 'new', name: 'New', details: { full: 'Entire added record' } };
    expect(compareFields([a, b], [added, a, b], ['entities'])).toEqual([
      {
        path: ['entities', 0],
        beforePath: ['entities', 0],
        kind: 'ADD',
        before: undefined,
        after: added,
      },
    ]);
    expect(compareFields([added, a, b], [a, b], ['entities'])).toEqual([
      {
        path: ['entities', 0],
        beforePath: ['entities', 0],
        kind: 'REMOVE',
        before: added,
        after: undefined,
      },
    ]);
    const replacement = compareFields(
      [{ key: 'old', name: 'Same' }],
      [{ key: 'fresh', name: 'Same' }],
      ['entities'],
    );
    expect(replacement.map((change) => change.kind)).toEqual(['REMOVE', 'ADD']);
    expect(replacement[0]?.before).toEqual({ key: 'old', name: 'Same' });
    expect(replacement[1]?.after).toEqual({ key: 'fresh', name: 'Same' });
  });
  it.each([
    [
      [
        { questId: 'one', title: 'One' },
        { questId: 'two', title: 'Two' },
      ],
    ],
    [
      [
        { stage: 'one', summary: 'One' },
        { stage: 'two', summary: 'Two' },
      ],
    ],
    [
      [
        { entity: 'same', purpose: 'image', description: 'Portrait' },
        { entity: 'same', purpose: 'figure', description: 'Figure' },
      ],
    ],
    [
      [
        { npc: 'one', attitude: 'WARY' },
        { npc: 'two', attitude: 'FRIENDLY' },
      ],
    ],
  ])('keeps supported keyed record families stable under reorder-only changes', (rows) => {
    const changes = compareFields(rows, [...rows].reverse());
    expect(changes).toHaveLength(2);
    expect(changes.every((change) => change.kind === 'MOVE')).toBe(true);
    expect(changes[0]).toMatchObject({ path: [0], beforePath: [1], before: 2, after: 1 });
  });
  it('carries original paths through reordered quests and reordered milestones at the same time', () => {
    const before = {
      quests: [
        { questId: 'one', title: 'One', milestones: [{ stage: 'a', summary: 'A' }] },
        {
          questId: 'two',
          title: 'Two',
          milestones: [
            { stage: 'x', summary: 'X original' },
            { stage: 'y', summary: 'Y original' },
          ],
        },
      ],
    };
    const after = {
      quests: [
        {
          questId: 'two',
          title: 'Two',
          milestones: [
            { stage: 'y', summary: 'Y revised' },
            { stage: 'x', summary: 'X original' },
          ],
        },
        { questId: 'one', title: 'One', milestones: [{ stage: 'a', summary: 'A' }] },
      ],
    };
    const changes = compareFields(before, after);
    expect(changes.filter((change) => change.kind === 'CHANGE')).toEqual([
      {
        path: ['quests', 0, 'milestones', 0, 'summary'],
        beforePath: ['quests', 1, 'milestones', 1, 'summary'],
        kind: 'CHANGE',
        before: 'Y original',
        after: 'Y revised',
      },
    ]);
    expect(changes.filter((change) => change.kind === 'MOVE')).toHaveLength(4);
  });
  it('keeps invalid duplicate identities and unkeyed list order visible as complete collections', () => {
    const before = [
        { key: 'duplicate', description: 'First' },
        { key: 'duplicate', description: 'Second' },
      ],
      after = [{ key: 'duplicate', description: 'Repair' }];
    expect(compareFields(before, after, ['entities'])).toEqual([
      { path: ['entities'], beforePath: ['entities'], kind: 'CHANGE', before, after },
    ]);
    const notes = ['First possibility', 'Second possibility'],
      reordered = [...notes].reverse();
    expect(compareFields(notes, reordered, ['laterOutline'])).toEqual([
      {
        path: ['laterOutline'],
        beforePath: ['laterOutline'],
        kind: 'CHANGE',
        before: notes,
        after: reordered,
      },
    ]);
  });
});

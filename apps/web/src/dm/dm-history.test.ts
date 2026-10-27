import type { DmAuthoringEntry, DmUndoBlocker } from '@ltw/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HistoryEntry } from './dm-history.tsx';
import { isPictureHold } from './history-text.ts';

/*
 * Stage 360 (AI stand-in pass, DM 18 and 26): adding an NPC requested his portrait, and the
 * finished picture held the addition's undo. History offered "Undo “image ready” first", which the
 * World Engine always refuses (settled image work is final, ADR 0006 §9); only discarding the
 * picture releases it. A step that would only be refused is never offered.
 */
const noop = () => Promise.resolve();
const blocker = (commandType: DmUndoBlocker['commandType']): DmUndoBlocker => ({
  commandId: `${commandType}-1`,
  commandType,
  sequence: 9,
});
const entry = (blockers: readonly DmUndoBlocker[]): DmAuthoringEntry => ({
  kind: 'authoring',
  commandId: 'authoring.p1',
  proposalId: 'p1',
  summary: 'Tomas guards North Gate.',
  sequence: 5,
  worldTime: 0,
  recordedAt: '2026-10-27T10:00:00.000Z',
  status: 'COMMITTED',
  undo: { possible: false, code: 'UNDO_UNSAFE', blockers },
});
const render = (blockers: readonly DmUndoBlocker[]) =>
  renderToStaticMarkup(
    createElement(HistoryEntry, {
      entry: entry(blockers),
      directory: [],
      actions: { busy: false, notice: null, undo: noop, undoBlocker: noop },
    }),
  );

describe('an undo held by a picture', () => {
  it('knows the image work that holds a step, and nothing else', () => {
    for (const type of [
      'StartAssetJob',
      'CompleteAssetJob',
      'FailAssetJob',
      'ApproveAsset',
    ] as const)
      expect(isPictureHold(type)).toBe(true);
    for (const type of ['CreateEntity', 'AskAbout', 'RequestAsset', 'PlaceEntity'] as const)
      expect(isPictureHold(type)).toBe(false);
  });

  it('says to discard the picture instead of offering an undo the world refuses', () => {
    const markup = render([blocker('CompleteAssetJob')]);
    expect(markup).not.toContain('Undo “complete asset job” first');
    expect(markup).toContain(
      'A picture made for this holds it: discard that picture under Images, then undo again.',
    );
  });

  it('still offers to undo a later step that can be undone', () => {
    const markup = render([blocker('PlaceEntity'), blocker('CompleteAssetJob')]);
    expect(markup).toContain('Undo “place entity” first');
    expect(markup).not.toContain('Undo “complete asset job” first');
  });
});

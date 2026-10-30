import { describe, expect, it } from 'vitest';

import { workshopDraftPath, workshopRoute } from './route.ts';

const id = '00000000-0000-4000-8000-000000000001';
describe('private workshop routes', () => {
  it('opens only the shelf or one exact draft route', () => {
    expect(workshopRoute('/workshop')).toEqual({ kind: 'shelf' });
    expect(workshopRoute('/workshop/')).toEqual({ kind: 'shelf' });
    expect(workshopRoute(workshopDraftPath(id))).toEqual({ kind: 'draft', draftId: id });
    expect(workshopRoute(`/workshop/drafts/${id}/`)).toEqual({ kind: 'draft', draftId: id });
  });
  it.each([
    '/workshop/drafts/no-id',
    '/workshop/other',
    `/workshop/drafts/${id}/extra`,
    '/workshop/drafts/',
    '/workshop/drafts/%2f',
    '/workshop/drafts/../',
  ])('fails closed for %s', (path) => {
    expect(workshopRoute(path)).toEqual({ kind: 'missing' });
  });
});

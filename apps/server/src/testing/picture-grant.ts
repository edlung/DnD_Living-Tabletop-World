import type pg from 'pg';

import { grantWorkshopPictures } from '../images/picture-grants.ts';

/** The operator's picture grant for a test owner (Gate 07, G07-02): paid pictures need one. */
export function grantTestPictures(pool: pg.Pool, ownerId: string, enabled = true): Promise<number> {
  return grantWorkshopPictures(pool, {
    ownerId,
    enabled,
    authorization: {
      ownerId: 'test-operator',
      authorizedOn: '2026-10-31',
      source: 'test: workshop picture grant',
    },
  });
}

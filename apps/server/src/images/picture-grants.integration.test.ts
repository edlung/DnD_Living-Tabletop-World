import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { OperatorStore } from '../ai/accounting/operator-store.ts';
import { grantPreparationApproval } from '../ai/accounting/preparation-sessions.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import { loadMigrations } from '../platform/db/migration-source.ts';
import { MIGRATIONS_DIR } from '../platform/db/migrations-dir.ts';
import { runMigrations } from '../platform/db/migrator.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { TEST_AUTH, seedApproval, type AccountingDb } from '../testing/accounting.ts';
import { createThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresWorkshopStore } from '../workshop/postgres-store.ts';
import { grantWorkshopPictures, pictureGrantEnabled } from './picture-grants.ts';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('workshop picture grants (Gate 07, G07-02)', () => {
  it('migration 0024 keeps pictures only for owners whose latest text grant is enabled', async () => {
    const database = await createThrowawayDatabase();
    cleanup.push(() => database.drop());
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const migrate = async (upTo: number) => {
      const client = new pg.Client({ connectionString: database.url });
      await client.connect();
      try {
        await runMigrations({
          client,
          migrations: migrations.filter((migration) => migration.version <= upTo),
          logger: createLogger({ service: 'picture-grants-test', level: 'silent' }),
        });
      } finally {
        await client.end();
      }
    };
    await migrate(23);
    const pool = new pg.Pool({ connectionString: database.url, max: 4 });
    cleanup.push(() => pool.end());
    const db: AccountingDb = {
      database,
      pool,
      operator: new OperatorStore(pool),
      pool2: () => pool,
      close: () => pool.end(),
    };
    const { approvalId } = await seedApproval(db);
    const workshop = new PostgresWorkshopStore(pool);
    const [granted, withdrawn, never] = [randomUUID(), randomUUID(), randomUUID()];
    for (const ownerId of [granted, withdrawn, never])
      await workshop.issueInvitation({
        ownerId,
        invitationId: randomUUID(),
        tokenHash: hashToken(newToken()),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        authorizationSource: 'test:gate-07',
      });
    const text = (ownerId: string, enabled: boolean) =>
      grantPreparationApproval(pool, { approvalId, ownerId, enabled, authorization: TEST_AUTH });
    await text(granted, true);
    await text(withdrawn, true);
    await text(withdrawn, false);

    await migrate(Number.MAX_SAFE_INTEGER);

    expect(await pictureGrantEnabled(pool, granted)).toBe(true);
    expect(await pictureGrantEnabled(pool, withdrawn)).toBe(false);
    expect(await pictureGrantEnabled(pool, never)).toBe(false);
    expect(
      (
        await pool.query<{ source: string }>(
          'SELECT authorization_source AS source FROM ltw_workshop_picture_grants WHERE owner_id=$1',
          [granted],
        )
      ).rows,
    ).toEqual([{ source: expect.stringContaining('OWNER_GATE_07_DISPOSITION') as unknown }]);
    // The operator's later revisions decide; history stays append-only.
    expect(
      await grantWorkshopPictures(pool, {
        ownerId: granted,
        enabled: false,
        authorization: TEST_AUTH,
      }),
    ).toBe(2);
    expect(await pictureGrantEnabled(pool, granted)).toBe(false);
    await expect(
      pool.query('DELETE FROM ltw_workshop_picture_grants WHERE owner_id=$1', [granted]),
    ).rejects.toThrow();
  });
});

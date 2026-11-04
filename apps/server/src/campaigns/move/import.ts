import type { Readable } from 'node:stream';

import type pg from 'pg';

import { assertCampaignReadable } from '../../world-engine/postgres-event-store.ts';
import { mergeAccounts, type AccountsMerged } from './import-accounts.ts';
import {
  appendHistory,
  assertKeysOwned,
  checkHistory,
  deleteReplaced,
  DivergedError,
  mergeRows,
  type StagedHistory,
  type TableMerged,
} from './merge.ts';
import { endMove, openMove } from './moves.ts';
import { PackageError, readPackage, type PackageHeader } from './package.ts';
import { Stager, type StagedTable } from './stage.ts';
import { MOVED_TABLES } from './tables.ts';

/**
 * A package brought into this server (docs/adr/0061-local-mode.md §5–6), all of it or nothing, in
 * one transaction under the campaign's lock:
 * - a campaign new here is created;
 * - a campaign away from here comes home: its move ends, the package's history beyond this
 *   server's is appended and the table's records become the package's;
 * - a campaign at home here is never overwritten: the same history is `unchanged`, any other is
 *   refused.
 * The package's digest, its rows' campaign, this build's reading of every event and the history's
 * beginning are checked before the commit.
 */
export interface ImportReport {
  readonly campaignId: string;
  readonly outcome: 'created' | 'returned' | 'unchanged';
  readonly source: string;
  /** Events appended to this server's history. */
  readonly events: number;
  readonly tables: readonly TableMerged[];
  readonly accounts: AccountsMerged;
  /** Tables a move carries that the package did not (an older source): left as they are here. */
  readonly absent: readonly string[];
}

/** Why the package does not come in (the message is the operator's). */
export class ImportRefusal extends Error {}

type Situation = 'new' | 'away' | 'home';

export async function importCampaign(
  pool: pg.Pool,
  input: Readable,
  options: { readonly now?: () => Date } = {},
): Promise<ImportReport> {
  const now = options.now ?? (() => new Date());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found: { header: PackageHeader | null; situation: Situation; awaySince: string | null } =
      {
        header: null,
        situation: 'new',
        awaySince: null,
      };
    const stager = new Stager(client);
    for await (const line of readPackage(input, async (header) => {
      found.header = header;
      found.situation = await situationOf(client, header.campaign);
      found.awaySince = (await openMove(client, header.campaign))?.movedAt ?? null;
    })) {
      await stager.take(line);
    }
    const { header: read, situation } = found;
    if (read === null) throw new PackageError('not a campaign package');
    const campaignId = read.campaign;
    await stager.assertOwnedBy(campaignId);
    for (const staged of stager.staged) await assertKeysOwned(client, campaignId, staged);
    const history = historyOf(stager.staged);
    const atHome = () =>
      new ImportRefusal(`campaign ${campaignId} is played here: a package never overwrites it`);
    const heads = await checkHistory(client, campaignId, history).catch((error: unknown) => {
      throw situation === 'home' && error instanceof DivergedError ? atHome() : error;
    });
    const absent = MOVED_TABLES.map((table) => table.name).filter(
      (name) => !stager.staged.some((staged) => staged.table.name === name),
    );
    const none = { created: 0, passwordsChanged: 0, renamed: [] };
    if (situation === 'home') {
      if (heads.version !== heads.hereVersion) throw atHome();
      await client.query('ROLLBACK');
      return {
        campaignId,
        outcome: 'unchanged',
        source: read.source,
        events: 0,
        tables: [],
        accounts: none,
        absent,
      };
    }
    if (situation === 'away') await endMove(client, campaignId, 'returned', now());
    // Who sat here before anything changes: only they may take a password the package carries.
    const seated = await client.query<{ account_id: string }>(
      'SELECT account_id FROM ltw_account_seats WHERE campaign_id = $1',
      [campaignId],
    );
    const seatedHere = new Set(seated.rows.map((row) => row.account_id));
    const events = await appendHistory(client, campaignId, history, heads);
    const records = stager.staged.filter(
      (staged) => staged.table.kind !== 'history' && staged.table.kind !== 'accounts',
    );
    const deleted = new Map<string, number>();
    for (const staged of [...records].reverse()) {
      if (staged.table.kind === 'state') {
        deleted.set(staged.table.name, await deleteReplaced(client, campaignId, staged));
      }
    }
    const tables: TableMerged[] = [];
    let accounts: AccountsMerged = none;
    for (const staged of stager.staged) {
      if (staged.table.kind === 'history') continue;
      if (staged.table.kind === 'accounts') {
        // A password changed while the campaign was away and before the package was cut; none
        // for a campaign new here, and none from the future.
        const window =
          found.awaySince === null
            ? null
            : {
                from: new Date(found.awaySince),
                to: new Date(Math.min(Date.parse(read.exportedAt), now().getTime())),
              };
        accounts = await mergeAccounts(client, staged, seatedHere, window);
      } else {
        const done = deleted.get(staged.table.name) ?? 0;
        tables.push(await mergeRows(client, campaignId, staged, done));
      }
    }
    await assertCampaignReadable(client, campaignId);
    await client.query('COMMIT');
    return {
      campaignId,
      outcome: situation === 'away' ? 'returned' : 'created',
      source: read.source,
      events,
      tables,
      accounts,
      absent,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Locks the campaign for this import and says where it stands here. */
async function situationOf(client: pg.ClientBase, campaignId: string): Promise<Situation> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ltw-campaign-move:' || $1))", [
    campaignId,
  ]);
  const { rows } = await client.query<{ history: boolean; published: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM ltw_event_streams WHERE stream_id = $1) AS history,
            EXISTS (SELECT 1 FROM ltw_workshop_campaign_activations WHERE campaign_id = $1) AS published`,
    [campaignId],
  );
  if (rows[0]?.published === true) {
    throw new ImportRefusal(`campaign ${campaignId} here was published from the workshop`);
  }
  const away = await openMove(client, campaignId, { lock: true });
  if (rows[0]?.history !== true) {
    if (away !== null)
      throw new ImportRefusal(`campaign ${campaignId} is away with no history here`);
    return 'new';
  }
  return away === null ? 'home' : 'away';
}

function historyOf(staged: readonly StagedTable[]): StagedHistory {
  const find = (name: string) => {
    const table = staged.find((one) => one.table.name === name);
    if (table === undefined) throw new PackageError(`the package lacks ${name}`);
    return table;
  };
  return {
    streams: find('ltw_event_streams'),
    commands: find('ltw_commands'),
    events: find('ltw_events'),
  };
}

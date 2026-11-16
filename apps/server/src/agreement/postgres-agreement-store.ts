import { AGREEMENT_LIMITS, AGREEMENT_TONES, type AgreementLimit } from '@ltw/contracts';
import type pg from 'pg';

import type { AgreementRecord, AgreementStore, UnderstoodRecord } from './agreement-store.ts';

/** The table's agreement on PostgreSQL (migration 0042_table_agreement.sql). */
interface PageRow {
  readonly campaign_id: string;
  readonly version: number;
  readonly tone: string;
  readonly tone_note: string;
  readonly limits: readonly string[];
  readonly also_not: string;
  readonly pause_sign: string;
  readonly ages: string;
  readonly updated_at: Date;
}

interface UnderstoodRow {
  readonly campaign_id: string;
  readonly character_id: string;
  readonly version: number;
  readonly understood_at: Date;
}

const LIMITS: ReadonlySet<string> = new Set(AGREEMENT_LIMITS);

export class PostgresAgreementStore implements AgreementStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async read(campaignId: string): Promise<AgreementRecord | null> {
    const { rows } = await this.#pool.query<PageRow>(
      `SELECT campaign_id, version, tone, tone_note, limits, also_not, pause_sign, ages, updated_at
         FROM ltw_table_agreements WHERE campaign_id = $1`,
      [campaignId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      campaignId: row.campaign_id,
      version: row.version,
      // A tone or a limit a later build wrote is read as this build knows it.
      tone: AGREEMENT_TONES.find((tone) => tone === row.tone) ?? 'adventurous',
      toneNote: row.tone_note,
      limits: row.limits.filter((limit): limit is AgreementLimit => LIMITS.has(limit)),
      alsoNot: row.also_not,
      pauseSign: row.pause_sign,
      ages: row.ages,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async write(record: AgreementRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_table_agreements
         (campaign_id, version, tone, tone_note, limits, also_not, pause_sign, ages, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (campaign_id) DO UPDATE SET
         version = EXCLUDED.version, tone = EXCLUDED.tone, tone_note = EXCLUDED.tone_note,
         limits = EXCLUDED.limits, also_not = EXCLUDED.also_not,
         pause_sign = EXCLUDED.pause_sign, ages = EXCLUDED.ages, updated_at = EXCLUDED.updated_at`,
      [
        record.campaignId,
        record.version,
        record.tone,
        record.toneNote,
        [...record.limits],
        record.alsoNot,
        record.pauseSign,
        record.ages,
        record.updatedAt,
      ],
    );
  }

  async understood(campaignId: string): Promise<readonly UnderstoodRecord[]> {
    const { rows } = await this.#pool.query<UnderstoodRow>(
      `SELECT campaign_id, character_id, version, understood_at
         FROM ltw_table_agreement_understood WHERE campaign_id = $1 ORDER BY character_id`,
      [campaignId],
    );
    return rows.map((row) => ({
      campaignId: row.campaign_id,
      characterId: row.character_id,
      version: row.version,
      at: row.understood_at.toISOString(),
    }));
  }

  async markUnderstood(record: UnderstoodRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_table_agreement_understood
         (campaign_id, character_id, version, understood_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (campaign_id, character_id) DO UPDATE SET
         version = EXCLUDED.version, understood_at = EXCLUDED.understood_at
       WHERE ltw_table_agreement_understood.version < EXCLUDED.version`,
      [record.campaignId, record.characterId, record.version, record.at],
    );
  }
}

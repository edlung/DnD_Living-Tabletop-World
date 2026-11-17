import { MAX_ENVELOPES, type EnvelopeOpens } from '@ltw/contracts';
import type pg from 'pg';

import type { EnvelopeRecord, EnvelopeStore, NewEnvelope } from './envelope-store.ts';

/** Sealed envelopes on PostgreSQL (migration 0047_envelopes.sql). */
interface EnvelopeRow {
  readonly campaign_id: string;
  readonly envelope_id: string;
  readonly label: string;
  readonly title: string;
  readonly body: string | null;
  readonly entity_id: string | null;
  readonly opens: EnvelopeOpens;
  readonly session_id: string | null;
  readonly sealed_at: Date;
  readonly opened_at: Date | null;
  readonly opened_by: EnvelopeOpens | null;
}

export class PostgresEnvelopeStore implements EnvelopeStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async list(campaignId: string): Promise<readonly EnvelopeRecord[]> {
    const { rows } = await this.#pool.query<EnvelopeRow>(
      `SELECT campaign_id, envelope_id, label, title, body, entity_id, opens, session_id,
              sealed_at, opened_at, opened_by
         FROM ltw_envelopes WHERE campaign_id = $1
        ORDER BY sealed_at, envelope_id`,
      [campaignId],
    );
    return rows.map((row) => ({
      campaignId: row.campaign_id,
      envelopeId: row.envelope_id,
      label: row.label,
      title: row.title,
      text: row.body,
      entityId: row.entity_id,
      opens: row.opens,
      sessionId: row.session_id,
      sealedAt: row.sealed_at.toISOString(),
      openedAt: row.opened_at?.toISOString() ?? null,
      openedBy: row.opened_by,
    }));
  }

  async seal(envelope: NewEnvelope): Promise<'sealed' | 'kept' | 'full'> {
    // One statement: taken while the campaign has room; an ID sealed already is left as it is.
    const { rowCount } = await this.#pool.query(
      `INSERT INTO ltw_envelopes
         (campaign_id, envelope_id, label, title, body, entity_id, opens, session_id, sealed_at)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
        WHERE (SELECT count(*) FROM ltw_envelopes WHERE campaign_id = $1) < $10
       ON CONFLICT (campaign_id, envelope_id) DO NOTHING`,
      [
        envelope.campaignId,
        envelope.envelopeId,
        envelope.label,
        envelope.title,
        envelope.text,
        envelope.entityId,
        envelope.opens,
        envelope.sessionId,
        envelope.sealedAt,
        MAX_ENVELOPES,
      ],
    );
    if ((rowCount ?? 0) > 0) return 'sealed';
    const { rows } = await this.#pool.query(
      `SELECT 1 FROM ltw_envelopes WHERE campaign_id = $1 AND envelope_id = $2`,
      [envelope.campaignId, envelope.envelopeId],
    );
    return rows.length > 0 ? 'kept' : 'full';
  }

  async open(
    campaignId: string,
    envelopeId: string,
    by: EnvelopeOpens,
    at: string,
  ): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_envelopes SET opened_at = GREATEST($4::timestamptz, sealed_at), opened_by = $3
        WHERE campaign_id = $1 AND envelope_id = $2 AND opened_at IS NULL`,
      [campaignId, envelopeId, by, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async delete(campaignId: string, envelopeId: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `DELETE FROM ltw_envelopes WHERE campaign_id = $1 AND envelope_id = $2`,
      [campaignId, envelopeId],
    );
    return (rowCount ?? 0) > 0;
  }
}

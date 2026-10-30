import { randomUUID } from 'node:crypto';

import type {
  CampaignGenerationJob,
  CampaignGenerationView,
  CampaignRevisionView,
} from '@ltw/contracts';
import { expect, it } from 'vitest';

import { integratedCampaignFixture } from '../../testing/integrated-campaign/fixture.ts';

it('repairs a schema-valid but missing-sheet cast before later steps and settles both admitted attempts', async () => {
  const f = await integratedCampaignFixture({ invalidCastOnce: true });
  try {
    const accepted = await f.sendOwner('POST', `${f.url}/generation`, {
      requestId: randomUUID(),
      basedOnRevision: 0,
      brief: f.content.brief,
    });
    expect(accepted.statusCode).toBe(200);
    const job = accepted.json<{ job: CampaignGenerationJob }>().job;
    f.transport.bind({ ...f.scope, jobId: job.jobId, mode: 'GENERATE' });
    await f.generationWorker.run({ ...f.scope, jobId: job.jobId });
    await f.tasks.idle();
    const response = await f.sendOwner('GET', `${f.url}/generation/${job.jobId}`);
    expect(response.json<CampaignGenerationView>().job).toMatchObject({
      status: 'SUCCEEDED',
      attachedRevision: 1,
    });
    expect(f.transport.admissions.map((entry) => entry.stage)).toEqual([
      'concept',
      'topology',
      'cast',
      'cast',
      'knowledge',
      'encounters',
      'first-session',
      'outline',
    ]);
    const cast = f.transport.calls.filter((call) => call.body.includes('prepare_campaign_cast'));
    expect(cast).toHaveLength(2);
    expect(cast[1]?.body).toContain('SHEET_INCOMPLETE');
    const revision = (await f.sendOwner('GET', `${f.url}/package`)).json<CampaignRevisionView>();
    expect(revision.assessment.readiness).toBe('READY');
    expect(revision.revision?.content.party).toEqual(f.content.party);
    const attempts = await f.db.pool.query<{ attempt_kind: string; kind: string }>(
      `SELECT a.attempt_kind,c.kind FROM ltw_ai_attempts a JOIN ltw_ai_accounting c USING(attempt_id)
       WHERE c.kind<>'evidence' ORDER BY a.created_at`,
    );
    expect(attempts.rows).toHaveLength(8);
    expect(attempts.rows.filter((entry) => entry.attempt_kind === 'repair')).toEqual([
      { attempt_kind: 'repair', kind: 'settled' },
    ]);
    expect(attempts.rows.every((entry) => entry.kind === 'settled')).toBe(true);
    expect(f.accountingIssues).toEqual([]);
    expect((await f.db.pool.query('SELECT 1 FROM ltw_events')).rowCount).toBe(0);
  } finally {
    await f.close();
  }
});

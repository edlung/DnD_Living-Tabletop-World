import { formatDollars } from '../../ai/accounting/money.ts';
import { requestPortrait } from './author.ts';
import { SmokeFailure, SmokeRefusal, type SmokeContext } from './client.ts';
import { awaitJob, chargeLine, inspectPicture, ledgerFor } from './job.ts';
import { budgetLine, preflight } from './preflight.ts';
import { approve, assertHidden, assertShown, playerView } from './visibility.ts';

/**
 * The live image smoke, end to end (`../image-smoke.ts`; docs/STAGE_330_DESIGN.md, Evidence):
 * preflight, Tomas Reed authored by the DM (or found), his canonical portrait requested, the job
 * awaited, the picture and its ledger record read back, the player shown nothing, the DM's
 * approval, the player shown the portrait. Returns the exit code: 0 passed, 1 a check failed,
 * 2 refused before anything could cost money. Whatever happens after the request, the summary
 * names the request and its reservations, so a failed paid call is accounted for too.
 */
export const EXIT = { passed: 0, failed: 1, refused: 2 } as const;

const LEDGER = 'ledger    ';
const MORE = '          ';

export async function runImageSmoke(context: SmokeContext): Promise<number> {
  const { log, options } = context;
  const summary: string[] = [];
  let requested: string | null = null;
  let ledgerShown = false;
  try {
    const before = await preflight(context);
    const portrait = await requestPortrait(context, before.tomasExists, before.language);
    const { request } = portrait;
    requested = request.requestId;
    log(
      `[request] ${request.requestId}: ${request.variant} ${request.purpose} for ${request.audience}, ` +
        `queued by the ${portrait.how}`,
    );
    summary.push(`request    ${request.requestId} (${portrait.how})`);
    if (!(await context.store.eventRecorded(options.campaignId, portrait.eventId))) {
      throw new SmokeFailure(
        "the request is not in the database the smoke reads: DATABASE_URL is not the server's",
      );
    }

    const job = await awaitJob(context, request.requestId);
    const seconds = `${String(Math.round(job.elapsedMs / 1_000))} s`;
    if (job.status !== 'COMPLETED') {
      throw new SmokeFailure(
        `the job ${job.status} (${job.failure ?? 'no failure code'}) after ${seconds}; ` +
          'the neutral fallback stays',
      );
    }
    const { asset } = job;
    const picture = await inspectPicture(context, asset);
    log(
      `[job] COMPLETED in ${seconds}: ${asset.assetId} by ${asset.generator.provider}/` +
        `${asset.generator.model}, ${picture.contentHash}, ${picture.mediaType}, ` +
        `${String(picture.size)} bytes (served and stored alike)`,
    );
    summary.push(
      `outcome    COMPLETED in ${seconds} by ${asset.generator.provider}/${asset.generator.model}`,
      `picture    ${picture.contentHash}`,
      `${MORE} ${picture.mediaType}, ${String(picture.size)} bytes, version ${String(asset.version)}`,
    );

    const ledger = await ledgerFor(context, request.requestId);
    for (const line of ledger.lines) log(`[ledger] ${line}`);
    summary.push(...ledger.lines.map((line, index) => `${index === 0 ? LEDGER : MORE} ${line}`));
    ledgerShown = true;
    const budgetAfter = await context.store.budget();
    const delta = BigInt(budgetAfter.spentMicros) - BigInt(before.budgetBefore.spentMicros);
    log(`[ledger] now ${budgetLine(budgetAfter)}`);
    summary.push(`spending   ${formatDollars(delta)} during the smoke; ${budgetLine(budgetAfter)}`);

    const hidden = assertHidden(
      await playerView(context, picture.contentHash),
      picture.contentHash,
    );
    log(`[player] before approval: ${hidden}`);
    const variants = await approve(context, asset.assetId);
    log(`[approve] the DM approved ${asset.assetId}: Tomas's canonical reference`);
    const shown = assertShown(
      await playerView(context, picture.contentHash),
      picture.contentHash,
      variants,
    );
    log(`[player] after approval: ${shown}`);
    summary.push('player     nothing before approval; the portrait after it');
    print(context, 'PASSED', summary);
    return EXIT.passed;
  } catch (error) {
    if (error instanceof SmokeRefusal) {
      print(context, 'REFUSED', [...summary, error.message]);
      return EXIT.refused;
    }
    if (requested !== null && !ledgerShown)
      summary.push(...(await ledgerLines(context, requested)));
    const message = error instanceof Error ? error.message : String(error);
    print(context, 'FAILED', [...summary, message]);
    return EXIT.failed;
  }
}

/** The request's reservations, whatever became of its job; best effort. */
async function ledgerLines(context: SmokeContext, requestId: string): Promise<string[]> {
  try {
    const charges = await context.store.charges(context.options.campaignId, requestId);
    if (charges.length === 0) return [`${LEDGER} no reservation for this request`];
    return charges.map((charge, index) => `${index === 0 ? LEDGER : MORE} ${chargeLine(charge)}`);
  } catch {
    return [`${LEDGER} unreadable: check pnpm ai:operator status`];
  }
}

function print(context: SmokeContext, verdict: string, lines: readonly string[]): void {
  context.log(
    `image smoke ${verdict}: ${context.options.generator}, campaign ${context.options.campaignId}`,
  );
  for (const line of lines) context.log(`  ${line}`);
}

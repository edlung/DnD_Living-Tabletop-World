import type {
  AssetLineageResponse,
  KnownEntitiesResponse,
  Language,
  ScenePresentationResponse,
  SessionResponse,
} from '@ltw/contracts';

import { isCuratedRequest } from '../../images/curated-import.ts';
import type { ImageBudgetStatus } from '../../images/ledger.ts';
import { IMAGE_MODELS } from '../../images/models.ts';
import { formatDollars } from '../../ai/accounting/money.ts';
import { SmokeRefusal, campaignPath, codeOf, expectStatus, type SmokeContext } from './client.ts';

/**
 * The smoke's preconditions (`../image-smoke.ts`), all read-only except the last: the server and
 * both personas answer; no other asset work is pending (the worker would run it, paid, beside the
 * smoke); for a paid generator the stored ceiling covers one more call; and the player's character
 * stands at the North Gate, where Tomas Reed is, so the player can see him at all. A precondition
 * that does not hold is a refusal before anything that could cost money.
 */
export const NORTH_GATE = 'north-gate';
/** Tomas Reed's names; his ID is whatever the server gave him (ADR 0008, Gate 06 remediation). */
export const TOMAS_NAMES: ReadonlySet<string> = new Set(['Tomas Reed', 'Томас Рид']);

/** Tomas Reed's ID in the campaign, by his name in the DM's directory; null when he is not there. */
export async function findTomas(context: SmokeContext): Promise<string | null> {
  const { entities } = await expectStatus<KnownEntitiesResponse>(
    context.client.get('dm', campaignPath(context, '/entities?perspective=DM')),
    200,
    "DM's directory",
  );
  const found = entities.filter((entity) => entity.kind === 'npc' && TOMAS_NAMES.has(entity.name));
  if (found.length > 1) throw new SmokeRefusal('the campaign has more than one Tomas Reed');
  return found[0]?.entityId ?? null;
}

export interface Preflight {
  readonly language: Language;
  readonly characterId: string;
  /** Tomas's ID when he exists; null: the smoke authors him. */
  readonly tomasId: string | null;
  readonly budgetBefore: ImageBudgetStatus;
}

const dollars = (micros: string | null) =>
  micros === null ? 'none' : formatDollars(BigInt(micros));

export const budgetLine = (status: ImageBudgetStatus) =>
  `${status.monetaryPolicy?.mode === 'UNLIMITED' ? 'unlimited' : `ceiling ${dollars(status.ceilingMicros)}`}, spent ${dollars(status.spentMicros)} ` +
  `(held ${dollars(status.heldMicros)}), remaining ${dollars(status.remainingMicros)}, ` +
  `${String(status.charges)} reservations (${String(status.unsettled)} unsettled)`;

/** The worst case of any allowed model: the server's model is not visible from here. */
const LARGEST_RESERVATION = Object.values(IMAGE_MODELS).reduce(
  (largest, model) => (model.reserveMicros > largest ? model.reserveMicros : largest),
  0n,
);

export async function preflight(context: SmokeContext): Promise<Preflight> {
  const { client, options, store, log } = context;
  const health = await client.get(null, '/healthz').catch(() => null);
  if (health?.status !== 200) {
    throw new SmokeRefusal(`no server answers at ${options.server.origin} (/healthz)`);
  }
  const session = async (persona: 'dm' | 'player') => {
    const reply = await client.get(persona, campaignPath(context, '/session'));
    return reply.status === 200 ? (reply.json() as SessionResponse) : null;
  };
  const dmSession = await session('dm');
  if (dmSession?.role !== 'DM') {
    throw new SmokeRefusal(`the DM persona is not the DM of ${options.campaignId}`);
  }
  const playerSession = await session('player');
  if (playerSession?.role !== 'PLAYER' || playerSession.character === null) {
    throw new SmokeRefusal(`the player persona plays no character in ${options.campaignId}`);
  }
  const language = dmSession.campaign.language;
  log(
    `[preflight] server ${options.server.origin}: campaign ${options.campaignId} (${language}), ` +
      `player character ${playerSession.character.entityId}`,
  );

  if (!(await store.campaignRecorded(options.campaignId))) {
    throw new SmokeRefusal(
      `the database the smoke reads (DATABASE_URL) holds no campaign ${options.campaignId}: ` +
        'point it at the server database',
    );
  }
  const lineage = await expectStatus<AssetLineageResponse>(
    client.get('dm', campaignPath(context, '/assets')),
    200,
    'DM asset lineage',
  );
  const pending = lineage.requests.filter(
    (request) =>
      (request.status === 'QUEUED' || request.status === 'STARTED') &&
      !isCuratedRequest(request.requestId, options.campaignId),
  );
  if (pending.length > 0) {
    throw new SmokeRefusal(
      `other asset work is pending; the worker would run it beside the smoke: ${pending
        .map((request) => `${request.requestId} (${request.entityId}, ${request.status})`)
        .join(', ')}`,
    );
  }

  const budgetBefore = await store.budget();
  log(`[preflight] image ledger: ${budgetLine(budgetBefore)}`);
  for (const open of await store.openReservations()) {
    log(
      `[preflight] note: unsettled reservation ${open.chargeId} (${open.campaignId} ${open.requestId}, ` +
        `${String(open.ageMinutes)} min old); see pnpm ai:operator image-reservations`,
    );
  }
  if (
    options.generator === 'openrouter-openai' &&
    budgetBefore.monetaryPolicy?.mode !== 'UNLIMITED'
  ) {
    if (budgetBefore.ceilingMicros === null) {
      throw new SmokeRefusal(
        'no image ceiling is stored: every call would be denied (pnpm ai:operator image-budget-set)',
      );
    }
    if (BigInt(budgetBefore.remainingMicros ?? '0') < LARGEST_RESERVATION) {
      throw new SmokeRefusal(
        `the image ceiling has ${dollars(budgetBefore.remainingMicros)} left, less than one ` +
          `call's reservation (${formatDollars(LARGEST_RESERVATION)})`,
      );
    }
  }

  // No Tomas yet: the smoke authors him.
  const tomasId = await findTomas(context);
  if (tomasId !== null) {
    await expectStatus(
      client.get('dm', campaignPath(context, `/entities/${tomasId}/presentation?perspective=DM`)),
      200,
      'DM presentation of Tomas',
    );
    const gate = await expectStatus<ScenePresentationResponse>(
      client.get('dm', campaignPath(context, `/locations/${NORTH_GATE}/scene?perspective=DM`)),
      200,
      'DM scene of the North Gate',
    );
    if (!gate.present.some((entity) => entity.entityId === tomasId)) {
      throw new SmokeRefusal('Tomas Reed exists but is not at the North Gate');
    }
  }
  await bringCharacterToNorthGate(context, playerSession.character.entityId);
  return { language, characterId: playerSession.character.entityId, tomasId, budgetBefore };
}

/** The player moves their character to the North Gate unless it already stands there. */
async function bringCharacterToNorthGate(context: SmokeContext, characterId: string) {
  const { client, log } = context;
  const scenePath = campaignPath(context, `/locations/${NORTH_GATE}/scene?perspective=PLAYER`);
  const observed = async () =>
    (
      await expectStatus<ScenePresentationResponse>(
        client.get('player', scenePath),
        200,
        "player's scene of the North Gate",
      )
    ).location.observed;
  if (await observed()) {
    log(`[preflight] ${characterId} is at the North Gate`);
    return;
  }
  const entered = await client.post('player', campaignPath(context, '/commands'), {
    commandId: `${context.runId}.enter`,
    command: { type: 'EnterLocation', characterId, locationId: NORTH_GATE },
  });
  if (entered.status !== 200 || !(await observed())) {
    throw new SmokeRefusal(
      `the player's character cannot go to the North Gate (HTTP ${String(entered.status)}, ` +
        `${codeOf(entered)}); Tomas would stay unseen`,
    );
  }
  log(`[preflight] the player moved ${characterId} to the North Gate`);
}

import { interpretLocally } from '@ltw/ai';
import type {
  AiTraceView,
  AssetLineageResponse,
  AssetRequestView,
  AuthoringProposalResponse,
  AuthoringProposalView,
  CommandResult,
  DmIntentResponse,
  KnownEntitiesResponse,
  Language,
  ProposableCommand,
  SessionListResponse,
} from '@ltw/contracts';

import { EN_SCRIPT } from '../scenario/script.ts';
import { RU_SCRIPT } from '../scenario/script-ru.ts';
import { SmokeFailure, campaignPath, expectStatus, type SmokeContext } from './client.ts';
import { NORTH_GATE, TOMAS } from './preflight.ts';

/**
 * The portrait request (`../image-smoke.ts`). Without Tomas the DM authors him as RAVENFORD_SPEC.md's
 * "DM Authoring Acceptance Flow" does: the DM's sentence, a proposal, the DM's edit of his
 * description, the confirmed commit. The commit itself queues his canonical portrait (an authoring
 * commit requests a reference image of each NPC it creates, ADR 0022 §2), so that request is the
 * one followed: a second request would be a second paid call. With Tomas already there, the DM
 * requests the portrait with `RequestAsset`.
 *
 * Never a paid text call. A DM intent reaches a remote provider only within an open play session
 * (`packages/ai/src/request.ts`): without one the sentence goes to the server's AI gateway, which
 * can then only use its local provider, and the trace must show that. With one open (the seeded
 * Ravenford has "Session 1"), no AI request is sent at all: the DM writes the proposal that the
 * same deterministic local interpreter (`interpretLocally`) makes of the sentence over the
 * campaign's public directory, exactly as the server's local provider would.
 */
export interface PortraitRequest {
  readonly request: AssetRequestView;
  /** The `AssetRequested` event: it must be in the database the smoke reads. */
  readonly eventId: string;
  readonly how: 'authoring commit' | 'RequestAsset';
}

/** Attempts of the local provider only: a remote one is a paid text call. */
export function localOnly(trace: Pick<AiTraceView, 'attempts'>): boolean {
  return (
    trace.attempts.length > 0 &&
    trace.attempts.every(
      (attempt) =>
        attempt.provider === 'local' &&
        (attempt.billing === undefined || attempt.billing.status === 'local'),
    )
  );
}

const lineage = (context: SmokeContext) =>
  expectStatus<AssetLineageResponse>(
    context.client.get('dm', campaignPath(context, '/assets')),
    200,
    'DM asset lineage',
  );

/** The one new request for Tomas the command made, and its event. */
async function newRequest(
  context: SmokeContext,
  before: ReadonlySet<string>,
  result: CommandResult,
  how: PortraitRequest['how'],
): Promise<PortraitRequest> {
  if (result.status === 'rejected') throw new SmokeFailure(`${how} rejected: ${result.code}`);
  const events = result.events.filter((summary) => summary.type === 'AssetRequested');
  const requests = (await lineage(context)).requests.filter(
    (request) => request.entityId === TOMAS && !before.has(request.requestId),
  );
  const [request] = requests;
  const [event] = events;
  if (!request || !event || requests.length !== 1 || events.length !== 1) {
    throw new SmokeFailure(`the ${how} did not queue exactly one portrait request for Tomas`);
  }
  if (request.variant !== 'reference' || request.purpose !== 'image') {
    throw new SmokeFailure(
      `the ${how} queued a ${request.variant} ${request.purpose}, not a portrait`,
    );
  }
  return { request, eventId: event.eventId, how };
}

export async function requestPortrait(
  context: SmokeContext,
  tomasExists: boolean,
  language: Language,
): Promise<PortraitRequest> {
  const known = new Set((await lineage(context)).requests.map((request) => request.requestId));
  if (tomasExists) {
    const reply = await context.client.post('dm', campaignPath(context, '/commands'), {
      commandId: `${context.runId}.portrait`,
      command: {
        type: 'RequestAsset',
        entityId: TOMAS,
        variant: 'reference',
        purpose: 'image',
        audience: 'players',
      },
    });
    const result = await expectStatus<CommandResult>(reply, 200, 'RequestAsset');
    return newRequest(context, known, result, 'RequestAsset');
  }
  return newRequest(context, known, await authorTomas(context, language), 'authoring commit');
}

/** The proposal: from the server's intent while that is provably local, else DM-written. */
async function propose(context: SmokeContext, sentence: string): Promise<AuthoringProposalView> {
  const { client, log } = context;
  const proposals = campaignPath(context, '/authoring/proposals');
  const sessions = await expectStatus<SessionListResponse>(
    client.get('dm', campaignPath(context, '/sessions')),
    200,
    'play sessions',
  );
  const open = sessions.sessions.find((session) => session.endedAt === null);
  if (open) {
    const { entities: directory } = await expectStatus<KnownEntitiesResponse>(
      client.get('dm', campaignPath(context, '/entities?perspective=PUBLIC')),
      200,
      'public directory',
    );
    const interpretation = interpretLocally(sentence, directory);
    if (interpretation.commands.length === 0) {
      throw new SmokeFailure('the local interpreter cannot read the DM sentence in this campaign');
    }
    log(
      `[author] play session "${open.title}" is open, so a DM intent could reach a paid text ` +
        'route: no AI request is sent; the DM writes the proposal the local interpreter makes of ' +
        'the sentence',
    );
    const written = await expectStatus<AuthoringProposalResponse>(
      client.post('dm', proposals, {
        summary: interpretation.summary,
        commands: interpretation.commands,
      }),
      201,
      'authoring proposal',
    );
    return written.proposal;
  }
  const intent = await expectStatus<DmIntentResponse>(
    client.post('dm', campaignPath(context, '/ai/intents'), { text: sentence }),
    200,
    'DM intent',
  );
  if (intent.status !== 'PROPOSED' || intent.traceId === null) {
    throw new SmokeFailure(
      `the DM intent was not proposed: ${intent.status} ${intent.issues.join(', ')}`,
    );
  }
  const trace = await expectStatus<AiTraceView>(
    client.get('dm', campaignPath(context, `/ai/traces/${intent.traceId}`)),
    200,
    'intent trace',
  );
  if (!localOnly(trace)) {
    throw new SmokeFailure(
      `the intent was answered by ${trace.attempts.map((a) => a.provider).join(', ')}, ` +
        'not by the local provider only; nothing was committed',
    );
  }
  log(`[author] no play session is open: the DM intent was answered by the local provider only`);
  const proposed = await expectStatus<AuthoringProposalResponse>(
    client.post('dm', proposals, { traceId: intent.traceId }),
    201,
    'authoring proposal',
  );
  return proposed.proposal;
}

async function authorTomas(context: SmokeContext, language: Language): Promise<CommandResult> {
  const { client, log } = context;
  const script = language === 'ru' ? RU_SCRIPT : EN_SCRIPT;
  const first = await propose(context, script.tomasRequest);
  const created = first.commands.find((command) => command.type === 'CreateEntity');
  if (
    created?.type !== 'CreateEntity' ||
    created.entityId !== TOMAS ||
    created.kind !== 'npc' ||
    created.placement?.locationId !== NORTH_GATE
  ) {
    throw new SmokeFailure('the proposal does not create Tomas Reed at the North Gate');
  }
  // The DM's edit: his age and post, as the spec's flow has it; the portrait is drawn from it.
  const edited: ProposableCommand[] = first.commands.map((command) =>
    command.type === 'CreateEntity' ? { ...command, description: script.tomasEdited } : command,
  );
  const at = `${campaignPath(context, '/authoring/proposals')}/${first.proposalId}`;
  const revised = await expectStatus<AuthoringProposalResponse>(
    client.post('dm', `${at}/revisions`, {
      basedOnRevision: first.revision,
      commands: edited,
    }),
    201,
    'authoring revision',
  );
  const confirmation = revised.preview?.confirmation;
  if (!revised.preview?.committable || !confirmation) {
    const issues = revised.preview?.issues.map((issue) => issue.code).join(', ') ?? 'no preview';
    throw new SmokeFailure(`the proposal cannot be committed: ${issues}`);
  }
  const result = await expectStatus<CommandResult>(
    client.post('dm', `${at}/commit`, {
      revision: revised.proposal.revision,
      confirmation,
    }),
    200,
    'authoring commit',
  );
  log(
    `[author] the DM committed proposal ${first.proposalId} (revision ` +
      `${String(revised.proposal.revision)}): Tomas Reed, a young guard at the North Gate`,
  );
  return result;
}

import { MAX_BOOTSTRAP_EVENTS } from '@ltw/contracts';

import { adoptBootstrapAsset } from '../assets/adoption.ts';
import { decideApproveAsset } from '../assets/decide.ts';
import { assetIdFor, requestIdFor } from '../assets/records.ts';
import { decideCreateCampaign } from '../kernel/decide/world.ts';
import {
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import { foldDraftsWithEvents } from '../kernel/provisional.ts';
import { buildCampaignBootstrapPlan } from './bootstrap-plan.ts';
import { decideInitialOperation } from './bootstrap-operations.ts';

/** One pure initial decision, one USER causation and one complete atomic event-store append. */
export function decideBootstrapCampaign(
  context: DecisionContext,
  command: ResolvedCommandOf<'BootstrapCampaign'>,
): Decision {
  if (context.actor.kind !== 'user' || context.actor.actorId !== command.source.ownerId)
    return reject('FORBIDDEN', 'Only the confirming workshop owner can bootstrap a campaign');
  if (
    context.state.campaign !== null ||
    context.state.version !== 0 ||
    context.history.length !== 0
  )
    return reject('CAMPAIGN_ALREADY_EXISTS', 'Bootstrap requires an empty campaign');
  const plan = buildCampaignBootstrapPlan(
    command.content,
    command.identities,
    command.selectedAssets,
    command.visualMode,
  );
  if (plan.incomplete || plan.findings.some((entry) => entry.severity === 'error'))
    return reject('INVALID_BOOTSTRAP', 'The initial campaign plan is not ready', {
      findings: plan.findings,
    });
  if (
    plan.assets.some(
      (asset) =>
        asset.origin.draftId !== command.source.draftId ||
        asset.origin.revision > command.source.revision ||
        asset.origin.manifestDigest !== command.source.visualManifestDigest,
    )
  )
    return reject(
      'INVALID_BOOTSTRAP',
      'The chosen picture does not belong to the confirmed source',
    );
  let state = context.state;
  const events: KernelEvent[] = [];
  const append = (drafts: readonly KernelEvent[]) => {
    const folded = foldDraftsWithEvents({ ...context, state }, 'BootstrapCampaign', drafts);
    state = folded.state;
    events.push(...drafts);
  };
  const created = decideCreateCampaign(context, {
    type: 'CreateCampaign',
    name: command.content.world.name,
    worldName: command.content.world.worldName,
    startsAt: command.content.world.startsAt,
    language: command.content.world.language,
  });
  if (!created.ok) return created;
  append(created.events);
  for (const operation of plan.commands) {
    const result = decideInitialOperation(state, operation);
    if (!result.ok) {
      if (result.rejection.code === 'NO_EFFECT') continue;
      return result;
    }
    append(result.events);
  }
  append([
    { type: 'PreparedPartyEstablished', payload: { characterIds: [...plan.preparedParty] } },
  ]);
  for (const [index, asset] of plan.assets.entries()) {
    const adopted = adoptBootstrapAsset(state, context.commandId, index, asset);
    if (!adopted.ok) return adopted;
    append(adopted.events);
    const approved = decideApproveAsset(state, {
      type: 'ApproveAsset',
      assetId: assetIdFor(requestIdFor(context.commandId, index)),
    });
    if (!approved.ok) return approved;
    append(approved.events);
  }
  append([
    {
      type: 'CampaignBootstrapped',
      payload: {
        source: { ...command.source },
        visualMode: command.visualMode,
        confirmation: structuredClone(command.confirmation),
      },
    },
  ]);
  if (events.length > MAX_BOOTSTRAP_EVENTS)
    return reject('INVALID_BOOTSTRAP', 'The initial event batch exceeds its bounded size');
  return {
    ok: true,
    events,
    requiresBootstrap: {
      packageDigest: command.source.packageDigest,
      planDigest: command.source.planDigest,
      visualManifestDigest: command.source.visualManifestDigest,
    },
  };
}

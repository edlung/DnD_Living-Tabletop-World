import { MAX_ABS_WORLD_TIME } from '@ltw/contracts';

import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../decision.ts';
import type { WorldState } from '../state.ts';
import { findUsableLocation } from './lookups.ts';

/** Campaign creation, scenes, and the world clock. */
export function decideCreateCampaign(
  context: DecisionContext,
  command: ResolvedCommandOf<'CreateCampaign'>,
): Decision {
  if (context.state.campaign !== null) {
    return reject('CAMPAIGN_ALREADY_EXISTS', `Campaign "${context.campaignId}" already exists`);
  }
  return accept({
    type: 'CampaignCreated',
    payload: {
      campaignId: context.campaignId,
      name: command.name,
      worldName: command.worldName,
      startsAt: command.startsAt,
      dmActorId: context.actor.actorId,
    },
  });
}

export function decideStartScene(
  state: WorldState,
  command: ResolvedCommandOf<'StartScene'>,
): Decision {
  if (state.usedIds.has(command.sceneId)) {
    return reject('ID_ALREADY_USED', `ID "${command.sceneId}" was already used`, {
      sceneId: command.sceneId,
    });
  }
  const location = findUsableLocation(state, command.locationId);
  if (!location.ok) return location;
  if (state.activeSceneId !== null) {
    return reject('SCENE_ALREADY_ACTIVE', 'End the active scene before starting another', {
      activeSceneId: state.activeSceneId,
    });
  }
  return accept({
    type: 'SceneStarted',
    payload: { sceneId: command.sceneId, title: command.title, locationId: command.locationId },
  });
}

export function decideEndScene(
  state: WorldState,
  command: ResolvedCommandOf<'EndScene'>,
): Decision {
  const scene = state.scenes.get(command.sceneId);
  if (!scene) {
    return reject('SCENE_NOT_FOUND', `Scene "${command.sceneId}" does not exist`);
  }
  if (scene.endedAt !== null) {
    return reject('SCENE_NOT_ACTIVE', `Scene "${command.sceneId}" has already ended`);
  }
  return accept({ type: 'SceneEnded', payload: { sceneId: scene.sceneId } });
}

/** World time only moves forward (ADR 0006 §3). */
export function decideAdvanceWorldTime(
  state: WorldState,
  command: ResolvedCommandOf<'AdvanceWorldTime'>,
): Decision {
  const target = command.to ?? state.clock + (command.by ?? 0);
  if (target <= state.clock) {
    return reject('TEMPORAL_CONFLICT', 'World time can only move forward', {
      clock: state.clock,
      requested: target,
    });
  }
  if (target > MAX_ABS_WORLD_TIME) {
    return reject('TEMPORAL_CONFLICT', 'World time would exceed the supported range');
  }
  return accept({ type: 'WorldTimeAdvanced', payload: { from: state.clock, to: target } });
}

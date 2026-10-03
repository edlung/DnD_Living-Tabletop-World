import { z } from 'zod';

/**
 * Identifier contracts (docs/adr/0006-temporal-model-and-undo.md §4).
 *
 * World object IDs (campaigns, entities, scenes) are lowercase slugs or
 * UUIDs. They are immutable and never reused within a campaign, even after
 * the object's creation is undone.
 */
export const OBJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const objectId = z
  .string()
  .regex(OBJECT_ID_PATTERN, 'must be 1-64 lowercase letters, digits, "-" or "_"');

export const campaignIdSchema = objectId;
export const entityIdSchema = objectId;
export const sceneIdSchema = objectId;

/**
 * Idempotency key; globally unique per accepted command. The HTTP layer
 * stores client keys namespaced by actor (`http:<actorId>:<clientKey>`).
 */
export const commandIdSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,299}$/,
    'must be 1-300 letters, digits, ".", "_", ":", "@" or "-"',
  );

/** Knowledge record IDs share the world-object format and namespace. */
export const knowledgeIdSchema = objectId;

/** Authenticated actor IDs (users, or trusted system processes). */
export const actorIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/, 'must be 1-128 safe identifier characters');

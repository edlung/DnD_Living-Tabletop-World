import { z } from 'zod';

import {
  approveAssetCommandSchema,
  cancelAssetRequestCommandSchema,
  completeAssetJobCommandSchema,
  failAssetJobCommandSchema,
  requestAssetCommandSchema,
  retractAssetCommandSchema,
  startAssetJobCommandSchema,
} from '../assets/commands.ts';
import { languageSchema } from '../language/language.ts';
import { setWeatherCommandSchema } from '../visual/commands.ts';
import { generateChronicleCommandSchema } from '../chronicle/commands.ts';
import { applyAuthoringCommandSchema } from '../authoring/commands.ts';
import {
  addKnowledgeCommandSchema,
  assignCharacterCommandSchema,
  releaseCharacterCommandSchema,
} from '../knowledge/commands.ts';
import {
  endSessionCommandSchema,
  recordMemoryCommandSchema,
  startSessionCommandSchema,
} from '../memory/commands.ts';
import {
  addClueCommandSchema,
  askAboutCommandSchema,
  enterLocationCommandSchema,
  insightCheckCommandSchema,
  showEvidenceCommandSchema,
  examineEntityCommandSchema,
  formHypothesisCommandSchema,
  setDisclosureCommandSchema,
} from '../investigation/commands.ts';
import {
  attackCommandSchema,
  castSpellCommandSchema,
  endCombatCommandSchema,
  endTurnCommandSchema,
  moveCombatantCommandSchema,
  startCombatCommandSchema,
} from '../combat/commands.ts';
import {
  closeReactionWindowCommandSchema,
  declineReactionCommandSchema,
  useReactionCommandSchema,
} from '../combat/reactions.ts';
import { setStatBlockCommandSchema } from '../combat/stat-block.ts';
import { setClaimCommandSchema } from '../knowledge/claims.ts';
import { setRelationshipCommandSchema } from '../relationships/commands.ts';
import { setCharacterSheetCommandSchema } from '../rules/character-sheet.ts';
import { commandIdSchema, entityIdSchema, sceneIdSchema } from './identifiers.ts';
import {
  advanceWorldTimeCommandSchema,
  changeEntityStatusCommandSchema,
  createEntityCommandSchema,
  entityNameSchema,
  placeEntityCommandSchema,
  updateEntityProfileCommandSchema,
  worldCommandIssue,
} from './world-commands.ts';
import { worldTimeSchema } from './world-time.ts';

export {
  ENTITY_KINDS,
  ENTITY_STATUSES,
  LOCATION_TYPES,
  advanceWorldTimeCommandSchema,
  changeEntityStatusCommandSchema,
  createEntityCommandSchema,
  entityNameSchema,
  placeEntityCommandSchema,
  updateEntityProfileCommandSchema,
  worldCommandIssue,
  type EntityKind,
  type EntityStatus,
  type LocationType,
} from './world-commands.ts';

/**
 * World Kernel commands (docs/adr/0007-world-kernel-model-and-event-store.md).
 * Schemas validate shape only; legality is decided by the World Engine.
 * Every object is strict: unknown fields are rejected, never ignored.
 */
const createCampaign = z
  .object({
    type: z.literal('CreateCampaign'),
    name: entityNameSchema,
    worldName: entityNameSchema,
    startsAt: worldTimeSchema,
    /** Play language (ADR 0031); `en` when omitted. */
    language: languageSchema.optional(),
  })
  .strict();

const startScene = z
  .object({
    type: z.literal('StartScene'),
    sceneId: sceneIdSchema.optional(),
    title: z.string().trim().min(1).max(200),
    locationId: entityIdSchema,
  })
  .strict();

const endScene = z.object({ type: z.literal('EndScene'), sceneId: sceneIdSchema }).strict();

const undoCommand = z
  .object({ type: z.literal('UndoCommand'), targetCommandId: commandIdSchema })
  .strict();

export const kernelCommandSchema = z
  .discriminatedUnion('type', [
    createCampaign,
    createEntityCommandSchema,
    placeEntityCommandSchema,
    updateEntityProfileCommandSchema,
    changeEntityStatusCommandSchema,
    startScene,
    endScene,
    advanceWorldTimeCommandSchema,
    undoCommand,
    addKnowledgeCommandSchema,
    recordMemoryCommandSchema,
    startSessionCommandSchema,
    endSessionCommandSchema,
    assignCharacterCommandSchema,
    releaseCharacterCommandSchema,
    setCharacterSheetCommandSchema,
    enterLocationCommandSchema,
    askAboutCommandSchema,
    showEvidenceCommandSchema,
    insightCheckCommandSchema,
    examineEntityCommandSchema,
    formHypothesisCommandSchema,
    addClueCommandSchema,
    setDisclosureCommandSchema,
    setClaimCommandSchema,
    setStatBlockCommandSchema,
    startCombatCommandSchema,
    moveCombatantCommandSchema,
    attackCommandSchema,
    castSpellCommandSchema,
    endTurnCommandSchema,
    endCombatCommandSchema,
    useReactionCommandSchema,
    declineReactionCommandSchema,
    closeReactionWindowCommandSchema,
    applyAuthoringCommandSchema,
    setRelationshipCommandSchema,
    requestAssetCommandSchema,
    startAssetJobCommandSchema,
    completeAssetJobCommandSchema,
    failAssetJobCommandSchema,
    cancelAssetRequestCommandSchema,
    retractAssetCommandSchema,
    approveAssetCommandSchema,
    setWeatherCommandSchema,
    generateChronicleCommandSchema,
  ])
  .superRefine((command, context) => {
    const issue = worldCommandIssue(command);
    if (issue !== null) context.addIssue({ code: 'custom', message: issue });
  });

export type KernelCommand = z.infer<typeof kernelCommandSchema>;
export type KernelCommandType = KernelCommand['type'];
export type KernelCommandOf<T extends KernelCommandType> = Extract<KernelCommand, { type: T }>;

export const KERNEL_COMMAND_TYPES = [
  'CreateCampaign',
  'CreateEntity',
  'PlaceEntity',
  'UpdateEntityProfile',
  'ChangeEntityStatus',
  'StartScene',
  'EndScene',
  'AdvanceWorldTime',
  'UndoCommand',
  'AddKnowledge',
  'AssignCharacter',
  'ReleaseCharacter',
  'RecordMemory',
  'StartSession',
  'EndSession',
  'SetCharacterSheet',
  'EnterLocation',
  'AskAbout',
  'ShowEvidence',
  'InsightCheck',
  'ExamineEntity',
  'FormHypothesis',
  'AddClue',
  'SetDisclosure',
  'SetClaim',
  'SetStatBlock',
  'StartCombat',
  'MoveCombatant',
  'Attack',
  'CastSpell',
  'EndTurn',
  'EndCombat',
  'UseReaction',
  'DeclineReaction',
  'CloseReactionWindow',
  'ApplyAuthoring',
  'SetRelationship',
  'RequestAsset',
  'StartAssetJob',
  'CompleteAssetJob',
  'FailAssetJob',
  'CancelAssetRequest',
  'RetractAsset',
  'ApproveAsset',
  'SetWeather',
  'GenerateChronicle',
] as const satisfies readonly KernelCommandType[];

export const kernelCommandTypeSchema = z.enum(KERNEL_COMMAND_TYPES);

/** Compile-time guard: every command in the union is listed above. */
type AssertNever<T extends never> = T;
export type KernelCommandTypesAreExhaustive = AssertNever<
  Exclude<KernelCommandType, (typeof KERNEL_COMMAND_TYPES)[number]>
>;

import type { z } from 'zod';

import { contradictionDetectedPayloadSchema } from '../contradiction/events.ts';
import {
  premisesRecordedPayloadSchema,
  recordedPremisesPayloadSchema,
} from '../investigation/events.ts';
import { chronicleGeneratedPayloadSchema } from '../chronicle/records.ts';
import { memoryRecordedPayloadSchema } from '../memory/events.ts';
import type { KernelEventType } from './events.ts';

/**
 * Event schema versions (docs/adr/0007-world-kernel-model-and-event-store.md,
 * Gate 03 retest 2 and 3 amendments). Each event type is written with its
 * current version; every version it was ever written with stays readable: a
 * decoder reads stored payloads into the current in-memory form, so history
 * is never edited or reset. A change that would leave a stored event
 * unreadable, or change what it means, gives its type the next version; one
 * that keeps every stored event valid with its meaning keeps the version.
 *
 * Version 2 of every type (G03-H07) means: written by a writer whose commands
 * record every fact their decisions rested on. Version 1 events come from
 * earlier writers, whose records may miss some, so undo treats a command
 * they decided as resting on everything before it (`writtenEarlier`; ADR 0006
 * retest 3 amendment).
 */
const DEPENDENCY_CONTRACT = 2;

interface Versioning {
  readonly current: number;
  /** What an event of the current version may hold: stricter than what is read. */
  readonly written: z.ZodType;
  /** Each earlier version ever written, decoded into the in-memory form. */
  readonly earlier: Readonly<Partial<Record<number, z.ZodType>>>;
}

/** Types whose payload changed between versions; every other type reads all versions alike. */
const VERSIONING: Partial<Record<KernelEventType, Versioning>> = {
  /**
   * 3 (retest 3): the dependency contract. 2 (retest 2): Detect Magic records
   * `unreached` for each clue it did not reach, never the entity-only
   * `placement`. 1: every earlier writer; revision 88d8137 wrote `placement`,
   * still read with its original meaning.
   */
  PremisesRecorded: {
    current: 3,
    written: premisesRecordedPayloadSchema,
    earlier: { 1: recordedPremisesPayloadSchema, 2: premisesRecordedPayloadSchema },
  },
  /**
   * 3 (Stage 130, ADR 0020): a play memory names the entities its generated
   * summary quotes (`named`), and the command that records it (`AskAbout`,
   * an examination, Detect Magic, showing evidence) records every record it
   * passed over. Earlier writers' commands did neither, so they rest on
   * everything before them. The payload is read alike.
   */
  MemoryRecorded: {
    current: 3,
    written: memoryRecordedPayloadSchema,
    earlier: { 1: memoryRecordedPayloadSchema, 2: memoryRecordedPayloadSchema },
  },
  /**
   * 3 (Stage 130): every writer records the names the neutral statement
   * quotes (`named`). Version 2 writers before Stage 120 did not.
   */
  ContradictionDetected: {
    current: 3,
    written: contradictionDetectedPayloadSchema,
    earlier: { 1: contradictionDetectedPayloadSchema, 2: contradictionDetectedPayloadSchema },
  },
  /**
   * 4 (Gate 05 retest 1, G05-H02): a chapter's `rests` also hold the standing
   * (`command:<id>`) of every command whose event it tells, whatever that
   * command changed. 3 (Gate 05, G05-H01): they hold every premise of its
   * entries and prose, the names it used among them. Version 3 chapters (the
   * Gate 05 retest 1 writer) did not rest on told commands that wrote no
   * fact, and version 2 chapters (Stages 170–180) rested only on what they
   * told, so both rest on everything before them. No version 1 was ever
   * written. The payload is read alike.
   */
  ChronicleGenerated: {
    current: 4,
    written: chronicleGeneratedPayloadSchema,
    earlier: { 2: chronicleGeneratedPayloadSchema, 3: chronicleGeneratedPayloadSchema },
  },
};

/**
 * Types first written after the dependency contract (Stages 120–130, ADR 0019
 * and ADR 0020, and later ones): no writer ever wrote them with an earlier
 * version, so one is refused.
 */
const INTRODUCED_AT: Partial<Record<KernelEventType, number>> = {
  RelationshipChanged: DEPENDENCY_CONTRACT,
  AuthoringPremisesRecorded: DEPENDENCY_CONTRACT,
  EvidenceShown: DEPENDENCY_CONTRACT,
  InsightChecked: DEPENDENCY_CONTRACT,
  AssetRequested: DEPENDENCY_CONTRACT,
  AssetJobStarted: DEPENDENCY_CONTRACT,
  AssetGenerated: DEPENDENCY_CONTRACT,
  AssetJobFailed: DEPENDENCY_CONTRACT,
  AssetRequestCancelled: DEPENDENCY_CONTRACT,
  AssetRetracted: DEPENDENCY_CONTRACT,
  AssetApproved: DEPENDENCY_CONTRACT,
  WeatherSet: DEPENDENCY_CONTRACT,
  ChronicleGenerated: DEPENDENCY_CONTRACT,
  // Stage 340 (ADR 0036): a member's release.
  CharacterReleased: DEPENDENCY_CONTRACT,
};

export const schemaVersionOf = (type: KernelEventType): number =>
  VERSIONING[type]?.current ?? DEPENDENCY_CONTRACT;

/** True when `type`'s payload changed between versions, so it needs decoding. */
export const isVersioned = (type: KernelEventType): boolean => VERSIONING[type] !== undefined;

/** Written by an earlier writer than the current one (an earlier version of its type). */
export const writtenEarlier = (event: {
  readonly type: KernelEventType;
  readonly schemaVersion: number;
}): boolean => event.schemaVersion < schemaVersionOf(event.type);

/**
 * Reads a stored payload of `version` into the current in-memory form. Throws
 * for a version its type was never written with, and for a payload its own
 * version could not have held.
 */
export function decodePayload(type: KernelEventType, version: number, payload: unknown): unknown {
  const versioning = VERSIONING[type];
  if (!versioning) {
    if (version >= (INTRODUCED_AT[type] ?? 1) && version <= DEPENDENCY_CONTRACT) return payload;
    throw new RangeError(`${type} was never written with schema version ${String(version)}`);
  }
  if (version === versioning.current) return versioning.written.parse(payload);
  const decoder = versioning.earlier[version];
  if (!decoder) {
    throw new RangeError(`${type} was never written with schema version ${String(version)}`);
  }
  return decoder.parse(payload);
}

/** Refuses a drafted payload its type can no longer be written with. */
export function assertWritable(type: KernelEventType, payload: unknown): void {
  VERSIONING[type]?.written.parse(payload);
}

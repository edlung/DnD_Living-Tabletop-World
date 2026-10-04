import type { z } from 'zod';

import {
  premisesRecordedPayloadSchema,
  recordedPremisesPayloadSchema,
} from '../investigation/events.ts';
import type { KernelEventType } from './events.ts';

/**
 * Event schema versions (docs/adr/0007-world-kernel-model-and-event-store.md,
 * Gate 03 retest 2 amendment; G03-H05). Each event type is written with its
 * current version: 1 unless listed here. A change that would leave an event
 * already stored unreadable, or change what it means, gives its type the next
 * version; every earlier version keeps a decoder that reads stored payloads
 * into the current in-memory form, so history is never edited or reset. A
 * change that keeps every stored event valid with its meaning (a new optional
 * field, a wider limit, a new variant) keeps the version.
 */
interface Versioning {
  readonly current: number;
  /** What an event of the current version may hold: stricter than what is read. */
  readonly written: z.ZodType;
  /** Each earlier version ever written, decoded into the in-memory form. */
  readonly earlier: Readonly<Partial<Record<number, z.ZodType>>>;
}

const VERSIONING: Partial<Record<KernelEventType, Versioning>> = {
  /**
   * 2 (Gate 03 retest 2): Detect Magic records `unreached` for each clue it did
   * not reach, never the entity-only `placement`. 1: every earlier writer;
   * revision 88d8137 wrote `placement`, still read with its original meaning.
   */
  PremisesRecorded: {
    current: 2,
    written: premisesRecordedPayloadSchema,
    earlier: { 1: recordedPremisesPayloadSchema },
  },
};

export const schemaVersionOf = (type: KernelEventType): number => VERSIONING[type]?.current ?? 1;

/** True when `type` keeps more than one version, so its payloads need decoding. */
export const isVersioned = (type: KernelEventType): boolean => VERSIONING[type] !== undefined;

/**
 * Reads a stored payload of `version` into the current in-memory form. Throws
 * for a version its type was never written with, and for a payload its own
 * version could not have held.
 */
export function decodePayload(type: KernelEventType, version: number, payload: unknown): unknown {
  const versioning = VERSIONING[type];
  if (version === (versioning?.current ?? 1)) return versioning?.written.parse(payload) ?? payload;
  const decoder = versioning?.earlier[version];
  if (!decoder) {
    throw new RangeError(`${type} was never written with schema version ${String(version)}`);
  }
  return decoder.parse(payload);
}

/** Refuses a drafted payload its type can no longer be written with. */
export function assertWritable(type: KernelEventType, payload: unknown): void {
  VERSIONING[type]?.written.parse(payload);
}

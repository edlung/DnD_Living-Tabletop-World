import {
  CHRONICLE_LIMITS,
  KNOWLEDGE_TYPES,
  MEMORY_KINDS,
  chronicleEntryKeySchema,
  chronicleProseSchema,
  commandIdSchema,
  entityIdSchema,
  knowledgeIdSchema,
  memoryIdSchema,
  worldTimeSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/**
 * Chronicle chapters as recorded (docs/adr/0024-chronicle.md). Entries name
 * their sources by record or by command and event index, so a chapter is
 * the same whoever replays it; views resolve them to event IDs. A chapter is
 * a record in the campaign's history, never a world fact: nothing reads it.
 */
export const storedEntrySchema = z
  .object({
    key: chronicleEntryKeySchema,
    occurredAt: worldTimeSchema,
    text: z.string().min(1).max(2000),
    salience: z.number().int().min(1).max(5),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('memory'), memoryId: memoryIdSchema }).strict(),
      z
        .object({
          kind: z.literal('event'),
          commandId: commandIdSchema,
          index: z.number().int().min(0).max(999),
          eventType: z.string().min(1).max(60),
        })
        .strict(),
    ]),
    memoryKind: z.enum(MEMORY_KINDS).nullable(),
    locationId: entityIdSchema.nullable(),
    participants: z.array(entityIdSchema).max(16),
    knowledge: z
      .array(
        z
          .object({
            knowledgeId: knowledgeIdSchema,
            knowledgeType: z.enum(KNOWLEDGE_TYPES),
            statement: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();
export type StoredEntry = z.infer<typeof storedEntrySchema>;

export const chronicleGeneratedPayloadSchema = z
  .object({
    chronicleId: commandIdSchema,
    title: z.string().min(1).max(CHRONICLE_LIMITS.titleChars),
    perspective: z.string().min(1).max(100),
    from: worldTimeSchema,
    to: worldTimeSchema,
    entries: z.array(storedEntrySchema).min(1).max(CHRONICLE_LIMITS.entries),
    prose: chronicleProseSchema,
    /** The facts its entries rest on: undoing any of them is refused while the chapter stands. */
    rests: z.array(z.string().min(1).max(400)).max(1000),
  })
  .strict();

export const chronicleRestoreSchemas = [
  z
    .object({ fact: z.literal('chronicle'), chronicleId: commandIdSchema, value: z.null() })
    .strict(),
] as const;

export type ChronicleRecord = z.infer<typeof chronicleGeneratedPayloadSchema> & {
  readonly generatedAt: number;
};

/** Knowledge types that are accounts or guesses, never established fact: prose must say so. */
export const HEDGED_TYPES: ReadonlySet<string> = new Set([
  'TESTIMONY',
  'RUMOR',
  'INFERENCE',
  'HYPOTHESIS',
  'CONTRADICTION',
  'UNKNOWN',
]);

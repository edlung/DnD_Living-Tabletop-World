import { z } from 'zod';

/**
 * World (fictional) time: signed integer seconds since the campaign epoch,
 * Day 1 00:00:00 (docs/adr/0006-temporal-model-and-undo.md §2). Negative
 * values are backstory before Day 1. Calendars are presentation.
 */
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3_600;
export const SECONDS_PER_DAY = 86_400;

/** About 31,700 years either side of the epoch; well inside safe integers. */
export const MAX_ABS_WORLD_TIME = 1_000_000_000_000;

export const worldTimeSchema = z.number().int().min(-MAX_ABS_WORLD_TIME).max(MAX_ABS_WORLD_TIME);

/** A strictly positive span of world time, in seconds. */
export const worldDurationSchema = z.number().int().min(1).max(MAX_ABS_WORLD_TIME);

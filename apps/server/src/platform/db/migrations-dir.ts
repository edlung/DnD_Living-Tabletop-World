import { fileURLToPath } from 'node:url';

/** `apps/server/migrations`, resolved from both `src/` and compiled `dist/`. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../migrations', import.meta.url));

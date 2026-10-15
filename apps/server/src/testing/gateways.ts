import { VERIFIED_CATALOG } from '../ai/catalog.ts';
import { createAiGateway, type AiGateway, type AiGatewayOptions } from '../ai/gateway.ts';
import type { AppConfig } from '../platform/config/config.ts';
import { MemoryAiJournal } from './memory-journal.ts';

/**
 * Test support: the real gateway composition over an in-memory journal (docs/adr/0032-live-ai.md,
 * B2). By default it is what production composes without an accounting store or a stored
 * approval: no remote provider at all. Tests pass a fixture catalog and a fake budget store to
 * exercise admitted routes, never a real provider.
 */
export function composedGateway(
  config: AppConfig['ai'],
  overrides: Partial<AiGatewayOptions> = {},
): { readonly gateway: AiGateway; readonly journal: MemoryAiJournal } {
  const journal =
    overrides.journal instanceof MemoryAiJournal ? overrides.journal : new MemoryAiJournal();
  const gateway = createAiGateway(config, {
    budget: null,
    catalog: VERIFIED_CATALOG,
    approvalStored: false,
    ...overrides,
    journal,
  });
  return { gateway, journal };
}

import type { PricingVersion } from './accounting/money.ts';
import { CLAUDE_SONNET_5_5 } from './catalog-sonnet-5-5.ts';

/**
 * The pricing and model-identity catalog (docs/STAGE_300_REMEDIATION_DESIGN.md §1;
 * docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md; docs/adr/0032-live-ai.md, B2). Only a model with an
 * explicitly verified entry can be routed or admitted. Each entry is a versioned pricing function
 * over every accepted billing dimension (`money.ts`: uncached input, cache reads, 5-minute and
 * 1-hour cache writes, output including reasoning, by context tier), the documented limits that
 * bound a reservation, and allowlists: the usage fields and informational labels a response may
 * carry, and the top-level request fields and option values an outbound body may carry. Anything
 * outside them fails closed.
 *
 * Identity. `model` is the stable, provider-scoped canonical identity: independent of pricing and
 * catalog versions, never renamed. `aliases` are the verified configured names and returned
 * versions that mean it. `history` keeps the verified mapping of earlier pricing versions and the
 * model strings their attempts recorded, so a historical stop still matches the same canonical
 * model. A string or tuple that maps to no model, or to two, is unresolved: the caller denies.
 *
 * Catalog verification against the providers' official documentation is a separate activity the
 * owner authorizes per model. `VERIFIED_CATALOG` holds exactly one entry, Anthropic
 * `claude-sonnet-5-5` (`catalog-sonnet-5-5.ts`, verified 2026-10-12 under owner decisions 5); any
 * other model is refused at composition, before any adapter is built or key revealed. A verified
 * entry alone sends nothing: composition also needs a selected stored approval, the accounting
 * store and the key, and admission an eligible session (`gateway.ts`). Other tests use fixture
 * entries (`testing/catalog-fixtures.ts`), whose prices are not real.
 */
export type CatalogProvider = 'anthropic' | 'deepseek';

export interface CatalogEntry {
  /** The adapter's fixed provider ID. */
  readonly provider: CatalogProvider;
  readonly model: string;
  readonly aliases: readonly string[];
  readonly pricing: PricingVersion;
  readonly history: readonly {
    readonly pricingVersion: string;
    readonly models: readonly string[];
  }[];
  readonly limits: {
    /**
     * The documented full context window: a provider refuses a longer request, so billed input
     * (uncached, cache reads and cache writes together) never exceeds it. With no verified
     * tokenizer byte bound this is the reservation's input bound.
     */
    readonly maxInputTokens: number;
    /** The largest `max_tokens` a body may set; output and reasoning are billed within it. */
    readonly maxOutputTokens: number;
    readonly maxRequestBytes: number;
  };
  readonly usage: {
    /** Usage counts the adapter reports (`field` or `field.nested`) that this entry prices. */
    readonly dimensions: readonly string[];
    /** Informational string fields and their only permitted values. */
    readonly labels: Readonly<Record<string, readonly string[]>>;
  };
  readonly request: {
    /** Top-level body fields permitted. */
    readonly fields: readonly string[];
    /** Option fields and their only permitted values, compared as JSON text. */
    readonly options: Readonly<Record<string, readonly string[]>>;
  };
  /** The prompt-cache breakpoint the adapter may send; null sends none. */
  readonly cache: '5m' | null;
  readonly verification: { readonly source: string; readonly verifiedOn: string };
}

export interface Catalog {
  readonly entries: readonly CatalogEntry[];
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

/** Every model string an entry answers to, for one pricing version or (null) any. */
function namesOf(entry: CatalogEntry, pricingVersion: string | null): Set<string> | null {
  const current = pricingVersion === null || pricingVersion === entry.pricing.version;
  const past = entry.history.filter(
    (record) => pricingVersion === null || record.pricingVersion === pricingVersion,
  );
  if (!current && past.length === 0) return null;
  return new Set([
    ...(current ? [entry.model, ...entry.aliases] : []),
    ...past.flatMap((record) => record.models),
  ]);
}

/**
 * Checks a catalog and freezes it: unique canonical models per provider, unique pricing versions,
 * no model string (current or historical) meaning two canonical models of one provider, positive
 * limits and rates, tiers starting at zero in increasing order.
 */
export function verifiedCatalog(entries: readonly CatalogEntry[]): Catalog {
  const versions = new Set<string>();
  const meaning = new Map<string, string>();
  for (const entry of entries) {
    const { limits, pricing } = entry;
    if (
      ![limits.maxInputTokens, limits.maxOutputTokens, limits.maxRequestBytes].every(
        positiveInteger,
      )
    ) {
      throw new CatalogError(`${entry.provider}:${entry.model}: limits must be positive integers`);
    }
    const tiers = pricing.tiers;
    if (
      tiers[0]?.fromInputTokens !== 0 ||
      tiers.some((tier, i) => i > 0 && tier.fromInputTokens <= (tiers[i - 1]?.fromInputTokens ?? 0))
    ) {
      throw new CatalogError(
        `${entry.provider}:${entry.model}: tiers must start at 0 and increase`,
      );
    }
    for (const tier of tiers) {
      for (const rate of Object.values(tier.rates)) {
        if (rate.micros < 0n || rate.perTokens <= 0n) {
          throw new CatalogError(`${entry.provider}:${entry.model}: invalid rate`);
        }
      }
    }
    for (const version of [
      pricing.version,
      ...entry.history.map((record) => record.pricingVersion),
    ]) {
      if (versions.has(version)) throw new CatalogError(`pricing version ${version} is not unique`);
      versions.add(version);
    }
    for (const name of namesOf(entry, null) ?? []) {
      const key = JSON.stringify([entry.provider, name]);
      const existing = meaning.get(key);
      if (existing !== undefined && existing !== entry.model) {
        throw new CatalogError(`${entry.provider}:${name} would mean two models`);
      }
      meaning.set(key, entry.model);
    }
  }
  return Object.freeze({ entries: Object.freeze([...entries]) });
}

/** The production catalog: only the owner-authorized verified entries. */
export const VERIFIED_CATALOG: Catalog = verifiedCatalog([CLAUDE_SONNET_5_5]);

/** The entry a configured `provider:model` names (canonical name or a verified alias), or null. */
export function configuredEntry(
  catalog: Catalog,
  provider: string,
  configured: string,
): CatalogEntry | null {
  const matches = catalog.entries.filter(
    (entry) =>
      entry.provider === provider &&
      (entry.model === configured || entry.aliases.includes(configured)),
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/**
 * The stable canonical model of a recorded `(provider, model, pricing version)`, through verified
 * current and historical mappings; with `pricingVersion` null, of a model string alone. Null when
 * it maps to no model or is ambiguous: the caller must fail closed.
 */
export function canonicalModel(
  catalog: Catalog,
  provider: string,
  model: string,
  pricingVersion: string | null,
): string | null {
  const found = new Set(
    catalog.entries
      .filter((entry) => entry.provider === provider && namesOf(entry, pricingVersion)?.has(model))
      .map((entry) => entry.model),
  );
  return found.size === 1 ? ([...found][0] ?? null) : null;
}

/** Resolves recorded identities to canonical models, as the admission store needs it. */
export type IdentityResolver = (
  provider: string,
  model: string,
  pricingVersion: string | null,
) => string | null;

export const identityResolver =
  (catalog: Catalog): IdentityResolver =>
  (provider, model, pricingVersion) =>
    canonicalModel(catalog, provider, model, pricingVersion);

import {
  MAX_BOOTSTRAP_ASSETS,
  MAX_BOOTSTRAP_OPERATIONS,
  bootstrapCampaignAssetSchema,
  type CampaignBootstrapAsset,
  type CampaignFinding,
  type CampaignIdentities,
  type CampaignPackage,
} from '@ltw/contracts';

import { PURPOSE_KINDS } from '../assets/records.ts';
import { buildCampaignPlan } from './plan.ts';
import { compareKey, identity, type CampaignPlan } from './context.ts';

export interface CampaignBootstrapPlan extends CampaignPlan {
  readonly preparedParty: readonly string[];
  readonly assets: readonly CampaignBootstrapAsset[];
}
/** One deterministic envelope shared by private review and the canonical bootstrap decision. */
export function buildCampaignBootstrapPlan(
  content: CampaignPackage,
  identities: CampaignIdentities,
  selectedAssets: readonly CampaignBootstrapAsset[],
  visualMode: 'CHOSEN' | 'TEXT_ONLY',
): CampaignBootstrapPlan {
  const base = buildCampaignPlan(content, identities),
    findings: CampaignFinding[] = [...base.findings];
  const error = (code: string, path: string, message: string) => {
    if (findings.length < 499) findings.push({ severity: 'error', code, path, message });
  };
  if (base.commands.length > MAX_BOOTSTRAP_OPERATIONS)
    error('BOOTSTRAP_OPERATION_LIMIT', 'content', 'Too many initial operations');
  if (selectedAssets.length > MAX_BOOTSTRAP_ASSETS)
    error('BOOTSTRAP_ASSET_LIMIT', 'selectedAssets', 'Too many chosen pictures');
  if (visualMode === 'TEXT_ONLY' && selectedAssets.length)
    error(
      'BOOTSTRAP_TEXT_ONLY_ASSETS',
      'selectedAssets',
      'Text-only activation carries no adopted pictures',
    );
  if (visualMode === 'CHOSEN' && !selectedAssets.length)
    error(
      'BOOTSTRAP_PICTURES_REQUIRED',
      'selectedAssets',
      'Choose a current picture or explicitly activate text-only',
    );
  const assets: CampaignBootstrapAsset[] = [];
  for (const [index, raw] of selectedAssets.entries()) {
    const parsed = bootstrapCampaignAssetSchema.safeParse(raw);
    if (!parsed.success) {
      error(
        'BOOTSTRAP_ASSET_SCHEMA',
        `selectedAssets.${index}`,
        'The chosen picture has an unsupported shape',
      );
      continue;
    }
    assets.push(parsed.data);
  }
  assets.sort(
    (a, b) =>
      (a.variant === 'reference' ? 0 : 1) - (b.variant === 'reference' ? 0 : 1) ||
      compareKey(a.entityId, b.entityId) ||
      compareKey(a.purpose, b.purpose) ||
      compareKey(a.label ?? '', b.label ?? ''),
  );
  const seen = new Set<string>();
  for (const [index, asset] of assets.entries()) {
    const path = `selectedAssets.${index}`,
      entity = content.entities.find(
        (entry) => identity(identities.entities, entry.key) === asset.entityId,
      );
    if (!entity) error('BOOTSTRAP_ASSET_SUBJECT', path, 'The picture has no initial entity');
    const kind = `${asset.entityId}/${asset.variant}/${asset.purpose}/${asset.purpose === 'image' ? (asset.label ?? '') : ''}`;
    if (seen.has(kind))
      error(
        'BOOTSTRAP_ASSET_DUPLICATE',
        path,
        'Only one chosen picture of each kind can be adopted',
      );
    seen.add(kind);
    if (asset.variant === 'reference') {
      if (asset.purpose !== 'image' || asset.label !== null || asset.origin.referenceHash !== null)
        error(
          'BOOTSTRAP_ASSET_REFERENCE',
          path,
          'A reference image has no label or derived reference',
        );
    } else {
      const reference = assets.find(
        (entry) =>
          entry.entityId === asset.entityId &&
          entry.variant === 'reference' &&
          entry.purpose === 'image',
      );
      if (
        asset.label === null ||
        !reference ||
        asset.origin.referenceHash !== reference.contentHash
      )
        error(
          'BOOTSTRAP_ASSET_DERIVATION',
          path,
          'A derived picture must match its chosen reference bytes',
        );
    }
    if (entity && asset.purpose !== 'image' && !PURPOSE_KINDS[asset.purpose].has(entity.kind))
      error('BOOTSTRAP_ASSET_KIND', path, 'The picture purpose does not match its entity kind');
  }
  const preparedParty = content.party.map((key) => identity(identities.entities, key));
  const bounded = findings.slice(0, 499);
  if (findings.length >= 499)
    bounded.push({
      severity: 'error',
      code: 'BOOTSTRAP_FINDING_LIMIT',
      path: 'content',
      message: 'Too many preparation findings; repair the reported content first',
    });
  return {
    ...base,
    findings: bounded,
    preparedParty,
    assets: visualMode === 'TEXT_ONLY' ? [] : assets,
  };
}

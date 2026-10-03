import { OBJECT_ID_PATTERN } from '../kernel/identifiers.ts';

/**
 * Perspective requests (docs/adr/0008-knowledge-boundary.md). Serialized as
 * `DM`, `PUBLIC`, `PARTY`, `PLAYER`, `CHARACTER:<entityId>`, or
 * `NPC:<entityId>` — exact, case-sensitive, nothing else. Parsing never
 * defaults: anything else is invalid.
 */
export type PerspectiveRequest =
  | { readonly kind: 'DM' }
  | { readonly kind: 'PUBLIC' }
  | { readonly kind: 'PARTY' }
  | { readonly kind: 'PLAYER' }
  | { readonly kind: 'CHARACTER'; readonly characterId: string }
  | { readonly kind: 'NPC'; readonly npcId: string };

const HOLDER_PERSPECTIVE = /^(CHARACTER|NPC):(.+)$/;

export function parsePerspective(raw: unknown): PerspectiveRequest | null {
  if (typeof raw !== 'string') return null;
  if (raw === 'DM' || raw === 'PUBLIC' || raw === 'PARTY' || raw === 'PLAYER') {
    return { kind: raw };
  }
  const match = HOLDER_PERSPECTIVE.exec(raw);
  const id = match?.[2];
  if (!match || id === undefined || !OBJECT_ID_PATTERN.test(id)) return null;
  return match[1] === 'CHARACTER'
    ? { kind: 'CHARACTER', characterId: id }
    : { kind: 'NPC', npcId: id };
}

export function formatPerspective(request: PerspectiveRequest): string {
  switch (request.kind) {
    case 'CHARACTER':
      return `CHARACTER:${request.characterId}`;
    case 'NPC':
      return `NPC:${request.npcId}`;
    default:
      return request.kind;
  }
}

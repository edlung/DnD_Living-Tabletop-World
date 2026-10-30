import { workshopIdSchema } from '@ltw/contracts';

export type WorkshopRoute =
  | { readonly kind: 'shelf' }
  | { readonly kind: 'draft'; readonly draftId: string }
  | { readonly kind: 'missing' };

export function workshopRoute(path: string): WorkshopRoute {
  if (path === '/workshop' || path === '/workshop/') return { kind: 'shelf' };
  const match = /^\/workshop\/drafts\/([^/]+)\/?$/.exec(path);
  const parsed = workshopIdSchema.safeParse(match?.[1]);
  return parsed.success ? { kind: 'draft', draftId: parsed.data } : { kind: 'missing' };
}

export const workshopDraftPath = (draftId: string): string =>
  `/workshop/drafts/${encodeURIComponent(draftId)}`;

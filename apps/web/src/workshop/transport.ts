import { workshopIdSchema, type CreateWorkshopDraft, type WorkshopDraftList } from '@ltw/contracts';
import { z } from 'zod';

import { holdInvitation, type InvitationHolder } from '../session/invitation-link.ts';

const sessionSchema = z.object({ ownerId: workshopIdSchema }).strict();
const draftSchema = z
  .object({
    draftId: workshopIdSchema,
    title: z.string().min(1).max(120),
    language: z.enum(['ru', 'en']),
    createdAt: z.iso.datetime(),
  })
  .strict();
const listSchema = z
  .object({ drafts: z.array(draftSchema), nextCursor: workshopIdSchema.nullable() })
  .strict();

export async function workshopRequest(
  path: string,
  body?: object,
  signal?: AbortSignal,
  ownerId?: string,
): Promise<Response | null> {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 10_000);
  try {
    return await fetch(`/api/workshop${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(ownerId ? { 'x-workshop-owner': ownerId } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type WorkshopProbe =
  | { readonly kind: 'signed-in'; readonly ownerId: string }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'unreachable' };

export async function probeWorkshop(signal?: AbortSignal): Promise<WorkshopProbe> {
  const response = await workshopRequest('/auth/session', undefined, signal);
  if (response?.status === 401) return { kind: 'signed-out' };
  if (!response?.ok) return { kind: 'unreachable' };
  const parsed = sessionSchema.safeParse(await bodyOf(response));
  return parsed.success
    ? { kind: 'signed-in', ownerId: parsed.data.ownerId }
    : { kind: 'unreachable' };
}

export type JoinOutcome = 'joined' | 'failed' | { readonly replacement: InvitationHolder };
export async function joinWorkshop(
  invitation: InvitationHolder,
  replace = false,
): Promise<JoinOutcome> {
  const token = invitation.take();
  if (token === null) return 'failed';
  const response = await workshopRequest(
    '/auth/redeem',
    replace ? { token, replaceSession: true } : { token },
  );
  if (response?.status === 409 && !replace) return { replacement: holdInvitation(token) };
  return response?.ok && sessionSchema.safeParse(await bodyOf(response)).success
    ? 'joined'
    : 'failed';
}

export type DraftReading =
  | { readonly kind: 'ready'; readonly value: WorkshopDraftList }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'failed' };
export async function readWorkshopDrafts(
  ownerId: string,
  after: string | null,
  signal?: AbortSignal,
): Promise<DraftReading> {
  const response = await workshopRequest(
    `/drafts${after ? `?after=${encodeURIComponent(after)}` : ''}`,
    undefined,
    signal,
    ownerId,
  );
  if (response?.status === 401 || response?.status === 409) return { kind: 'signed-out' };
  if (!response?.ok) return { kind: 'failed' };
  const parsed = listSchema.safeParse(await bodyOf(response));
  return parsed.success ? { kind: 'ready', value: parsed.data } : { kind: 'failed' };
}

export async function createWorkshopDraft(
  ownerId: string,
  input: CreateWorkshopDraft,
): Promise<'saved' | 'signed-out' | 'failed'> {
  const response = await workshopRequest('/drafts', input, undefined, ownerId);
  if (response?.status === 401 || response?.status === 409) return 'signed-out';
  return response?.ok && draftSchema.safeParse(await bodyOf(response)).success ? 'saved' : 'failed';
}

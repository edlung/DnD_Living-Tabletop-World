import type { DisplayPairingResponse, DisplaySessionResponse } from '@ltw/contracts';

/**
 * The table display's own requests (docs/adr/0042-table-display.md): asking to pair, reading
 * whether the DM paired it, and unpairing itself. The device's credential is an HttpOnly cookie
 * the script never reads; everything else it shows goes through the campaign routes with the
 * PARTY perspective (`display-app.tsx`).
 */
type Transport = typeof fetch;

const JSON_TYPE = 'application/json';

async function send(transport: Transport, path: string, init: RequestInit = {}) {
  try {
    return await transport(path, {
      ...init,
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
    });
  } catch {
    return null;
  }
}

export type PairingAnswer = DisplayPairingResponse | 'limited' | 'unreachable';

/** `POST /display/pair`: a new pairing code (the device's cookie is set with it). */
export async function requestPairing(transport: Transport): Promise<PairingAnswer> {
  const response = await send(transport, '/api/display/pair', {
    method: 'POST',
    headers: { 'Content-Type': JSON_TYPE, Accept: JSON_TYPE },
    body: '{}',
  });
  if (response === null) return 'unreachable';
  if (response.status === 429) return 'limited';
  if (!response.ok) return 'unreachable';
  try {
    return (await response.json()) as DisplayPairingResponse;
  } catch {
    return 'unreachable';
  }
}

export type SessionAnswer = DisplaySessionResponse | 'none' | 'unreachable';

/** `GET /display/session`: waiting for the DM, paired, or nothing (a new code is needed). */
export async function readDisplaySession(transport: Transport): Promise<SessionAnswer> {
  const response = await send(transport, '/api/display/session', {
    headers: { Accept: JSON_TYPE },
  });
  if (response === null) return 'unreachable';
  if (response.status === 401 || response.status === 404) return 'none';
  if (!response.ok) return 'unreachable';
  try {
    return (await response.json()) as DisplaySessionResponse;
  } catch {
    return 'unreachable';
  }
}

/** `POST /display/forget`: the screen unpairs itself. */
export async function forgetDisplay(transport: Transport): Promise<void> {
  await send(transport, '/api/display/forget', {
    method: 'POST',
    headers: { 'Content-Type': JSON_TYPE },
    body: '{}',
  });
}

/** A code shown in two groups of four, as people read it aloud. */
export const spacedCode = (code: string): string => `${code.slice(0, 4)} ${code.slice(4)}`;

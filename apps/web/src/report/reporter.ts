import {
  CLIENT_ERROR_FRAMES,
  type ClientErrorKind,
  type ClientErrorReport,
  type ClientPage,
  type ClientPart,
} from '@ltw/contracts';

import { ApiError } from '../api/client.ts';
import { nativeShell } from '../native/shell.ts';
import { browserOf, errorName, placeOf } from './report.ts';

/**
 * The page's error reports (docs/adr/0073-table-ideas.md §1): a render that failed, an uncaught
 * error, an unhandled rejection — told to the game's own server in fixed fields, never a message,
 * an address or a word anyone typed. At most five a page load and never the same one twice;
 * nothing here may throw, or a broken page would report its own reporter.
 */
export const REPORTS_PER_LOAD = 5;

/** Who sends: the campaign on screen and how its requests say who they are. */
export interface ReportSender {
  readonly campaignId: string;
  /** A development persona's `Authorization`; empty with a signed-in session's cookie. */
  readonly headers: Readonly<Record<string, string>>;
}

/** The window the reporter listens on: what it reads of the browser, and nothing else. */
export interface ReportTarget {
  readonly location: { readonly origin: string };
  readonly navigator: { readonly userAgent: string; readonly maxTouchPoints: number };
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface ReporterState {
  page: ClientPage;
  part: ClientPart;
  sender: ReportSender | null;
  sent: number;
  readonly seen: Set<string>;
  /** Set while the reporter listens; without it nothing is sent. */
  on: { readonly target: ReportTarget; readonly transport: typeof fetch } | null;
}

const state: ReporterState = {
  page: 'sign-in',
  part: 'none',
  sender: null,
  sent: 0,
  seen: new Set(),
  on: null,
};

/** The page on screen: told as it is drawn, so a first render that fails is placed. */
export function reportPage(page: ClientPage): void {
  state.page = page;
  if (page !== 'game') state.part = 'none';
}

/** In the game, what is open. */
export function reportPart(part: ClientPart): void {
  state.part = part;
}

/** The campaign on screen, or none. */
export function reportSender(sender: ReportSender | null): void {
  state.sender = sender;
}

/** What is not an error of the page: the server or the network said no, a request was dropped. */
function expected(thrown: unknown): boolean {
  if (thrown instanceof ApiError) return true;
  const name = typeof thrown === 'object' && thrown !== null && 'name' in thrown ? thrown.name : '';
  return name === 'AbortError' || name === 'TimeoutError';
}

/** The report of one error as the page stands, or null when it is not one to send. */
export function assemble(
  kind: ClientErrorKind,
  thrown: unknown,
  target: ReportTarget,
  page: Pick<ReporterState, 'page' | 'part' | 'sender'> = state,
): ClientErrorReport | null {
  if (expected(thrown)) return null;
  const stack =
    typeof thrown === 'object' && thrown !== null && 'stack' in thrown ? thrown.stack : '';
  const place = placeOf(stack, target.location.origin).slice(0, CLIENT_ERROR_FRAMES);
  // An uncaught error that names no script of the application is somebody else's: an extension.
  if (kind !== 'render' && place.length === 0) return null;
  const shell = nativeShell()?.app ?? 'none';
  return {
    kind,
    name: errorName(thrown),
    page: page.page,
    part: page.page === 'game' ? page.part : 'none',
    ...browserOf(target.navigator.userAgent, target.navigator.maxTouchPoints),
    shell,
    place,
    ...(page.sender ? { campaignId: page.sender.campaignId } : {}),
  };
}

/** Sends one report; true when it left. Never throws. */
export function reportError(kind: ClientErrorKind, thrown: unknown): boolean {
  try {
    if (state.on === null || state.sent >= REPORTS_PER_LOAD) return false;
    const { target, transport } = state.on;
    const report = assemble(kind, thrown, target);
    if (report === null) return false;
    const body = JSON.stringify(report);
    if (state.seen.has(body)) return false;
    state.seen.add(body);
    state.sent += 1;
    const headers = state.sender?.headers ?? {};
    void transport('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
      cache: 'no-store',
      credentials: 'Authorization' in headers ? 'omit' : 'same-origin',
      keepalive: true,
      redirect: 'error',
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** The browser's own notice of a layout it gave up on: not an error of the page. */
const NOISE = /ResizeObserver loop/;

/**
 * Starts listening, once, before anything is drawn: on the page's window, with the page's
 * `fetch`; a test hands its own of each. Returns how to stop (tests).
 */
export function startErrorReports(
  target: ReportTarget = window,
  transport: typeof fetch = (...request) => fetch(...request),
): () => void {
  state.on = { target, transport };
  state.sent = 0;
  state.seen.clear();
  const onError = (event: Event) => {
    const happened = event as { readonly message?: unknown; readonly error?: unknown };
    // The message is read to leave the browser's notice alone, and is never sent.
    if (typeof happened.message === 'string' && NOISE.test(happened.message)) return;
    reportError('error', happened.error);
  };
  const onRejection = (event: Event) => {
    reportError('rejection', (event as { readonly reason?: unknown }).reason);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
    state.on = null;
    state.sender = null;
    state.page = 'sign-in';
    state.part = 'none';
  };
}

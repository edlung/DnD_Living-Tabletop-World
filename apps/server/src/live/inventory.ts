import { MAX_ABS_WORLD_TIME } from '@ltw/contracts';
import type { ResolvedPerspective } from '@ltw/domain';

/**
 * The coverage inventory (docs/STAGE_310_DESIGN.md §A): the HTTP views a subscription's
 * fingerprint covers, as the client reads them. Each is requested with the subscriber's own
 * credential and requested perspective, so the existing routes decide what is visible.
 */
export interface LiveTarget {
  readonly campaignId: string;
  /** The perspective as requested (`PLAYER` stays `PLAYER`; the views resolve it). */
  readonly perspective: string;
  /** The resolved kind at subscription time: it selects the views the client reads. */
  readonly kind: ResolvedPerspective['kind'];
  readonly focus: string | null;
  readonly place: string | null;
  /**
   * Whether the caller's identity view (`session`) is covered. It is, except for a DM holding
   * a lower perspective: the DM's identity lists every character, hidden ones included, so it
   * would let a DM-only change signal a perspective that cannot read it.
   */
  readonly identity: boolean;
  /** A table display (ADR 0042): it also reads the table's rolls and the open table link. */
  readonly display?: boolean;
}

export interface ViewRequest {
  /** Path and query, relative to the application root. */
  readonly url: string;
  /**
   * A focus or place view: its 404 means the focused object is not (or no longer) visible to
   * the perspective, which is itself what the subscriber would read, so it is fingerprinted
   * instead of closing the stream. Every always-present view closes the stream on 404.
   */
  readonly optional: boolean;
}

/** Views every subscription covers; `session` and `sessions` take no perspective. */
const SCOPED = [
  'entities',
  'knowledge',
  'memories',
  'encounter',
  'quests',
  'chronicle',
  'presence',
];

export function coverageInventory(target: LiveTarget): ViewRequest[] {
  const base = `/campaigns/${encodeURIComponent(target.campaignId)}`;
  const scoped = (path: string, optional = false): ViewRequest => ({
    url: `${base}/${path}?${new URLSearchParams({ perspective: target.perspective }).toString()}`,
    optional,
  });
  const views: ViewRequest[] = [
    ...(target.identity ? [{ url: `${base}/session`, optional: false }] : []),
    { url: `${base}/sessions`, optional: false },
    ...SCOPED.map((path) => scoped(path)),
    // What the table's display shows (ADR 0042), read by every member. Optional: a composition
    // without displays answers 404, which is fingerprinted like any absent view.
    { url: `${base}/display/cast`, optional: true },
  ];
  // The table's rolls and the DM's check requests (Stage 510): the dice the client animates; the
  // open short rest (Stage 530), when players spend Hit Point Dice.
  if (target.kind === 'CHARACTER' || target.kind === 'DM') {
    views.push(scoped('rolls'), scoped('check-requests'), scoped('rest'));
  }
  if (target.display === true) {
    // A table display (ADR 0042) also follows the table's rolls and the open join link.
    views.push(scoped('rolls'), scoped('check-requests'));
    views.push({ url: `${base}/display/join`, optional: true });
  }
  // The client reads surroundings and entity context only for an acting character.
  const acting = target.kind === 'CHARACTER';
  if (acting) {
    views.push(scoped('surroundings'));
    // The player's own actions the DM undid: the notice in the player's client (ADR 0033,
    // amendment of 2026-10-28). Built from the requester's own commands only.
    views.push(scoped('undone-actions'));
  }
  if (target.kind === 'DM') {
    // The suggestions route takes no perspective (DM only); the whole history is its range.
    views.push({
      url: `${base}/chronicle/suggestions?from=-${String(MAX_ABS_WORLD_TIME)}`,
      optional: false,
    });
    // The DM history's newest page, as the DM's authoring panel shows it (ADR 0033 §7).
    views.push(scoped('dm/history'));
    // The asset lineage (DM only; no perspective): the DM's image controls follow each job from
    // queued to a candidate as the asset worker reports it (Stage 330 part B).
    views.push({ url: `${base}/assets`, optional: false });
  }
  if (target.focus !== null) {
    const entity = `entities/${encodeURIComponent(target.focus)}`;
    // Default deterministic ranking: `ranking=ai` is never requested here.
    if (acting) views.push(scoped(`${entity}/context`, true));
    views.push(scoped(`${entity}/knowledge`, true), scoped(`${entity}/presentation`, true));
  }
  if (target.place !== null) {
    views.push(scoped(`locations/${encodeURIComponent(target.place)}/scene`, true));
  }
  return views;
}

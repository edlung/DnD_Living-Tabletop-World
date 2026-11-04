import { bootstrapAssetOriginSchema, type AssetRequestView, type AssetView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { useContentImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { ImageAction } from './command-state.ts';
import { useDmImages } from './dm-images.ts';
import { approvalStanding, repeatCommand, type ShownImage } from './lineage.ts';
import { approvalWords, FAILURE_WORDS, JOB_WORDS, kindWords, makerWords } from './words.ts';

/**
 * The parts of the DM's image controls (docs/STAGE_330_DESIGN.md "DM controls"): a picture as
 * the server stores it (the DM may fetch any asset's bytes; a candidate is shown to the DM
 * only), a candidate with Approve, Discard and Generate again, an approved picture with
 * Replace, and a request in progress or failed with its fixed reason. Every button names its
 * picture, so a list of them reads apart; the picture itself is decorative beside its words.
 * While a command is pending every control waits: `aria-disabled`, so focus stays where it is,
 * and the press is ignored (`DmImages.run` refuses a second command too). An approval's words
 * come from the lineage read after it, never assumed (`approvalStanding`).
 */
function Picture({ asset }: { readonly asset: AssetView }) {
  const t = useT();
  const { url, settled } = useContentImage(asset.contentHash);
  return (
    <span className={`image-picture image-picture--${asset.purpose}`}>
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        settled && (
          <span className="image-picture-missing">{t('The picture cannot be shown.')}</span>
        )
      )}
    </span>
  );
}

/** Imported bytes have honest draft lineage and no fictitious in-play request. DM only. */
function ImportedOrigin({ asset }: { readonly asset: AssetView }) {
  const t = useT();
  const origin = bootstrapAssetOriginSchema.safeParse(asset.origin);
  if (!origin.success) return null;
  return (
    <p className="image-card-meta">
      {t('Imported from campaign preparation')} ·{' '}
      {t('Source revision: {revision}', { revision: origin.data.revision })}
    </p>
  );
}

/** Where a command was given, and the words that name its picture there. */
export interface Context {
  readonly place: string;
  /** The entity's name, for the words of a result. */
  readonly name: string;
  /** The picture in words, with the entity's name where several entities are listed. */
  readonly subject: (what: string) => string;
  /** The picture in words with the entity's name, for wherever else a pending command shows. */
  readonly full: (what: string) => string;
}

/** Whether the image controls wait for a command (or have no DM context at all). */
const useWaiting = () => {
  const images = useDmImages();
  return { images, waiting: images === null || images.busy };
};

export function CandidateCard({
  shown,
  replaces,
  context,
}: {
  readonly shown: ShownImage;
  /** A main picture is approved already: approving this one replaces it. */
  readonly replaces: boolean;
  readonly context: Context;
}) {
  const t = useT();
  const { images, waiting } = useWaiting();
  const { asset, request } = shown;
  const what = kindWords(t, asset);
  const subject = context.subject(what);
  const full = context.full(what);
  const send = (verb: string, command: ImageAction['command'], success: ImageAction['success']) => {
    if (waiting) return;
    images?.run({
      place: context.place,
      command,
      subject: t(verb, { subject: full }),
      target: asset.assetId,
      success,
    });
  };
  return (
    <li className="image-card image-card--candidate" data-image-key={asset.assetId}>
      <Picture asset={asset} />
      <div className="image-card-body">
        <p className="image-card-kind">
          <Glyph name="candidate" />
          {what}
        </p>
        <p className="image-card-meta">
          {t('Version {version} · {maker}', {
            version: asset.version,
            maker: makerWords(t, asset.generator),
          })}
        </p>
        <ImportedOrigin asset={asset} />
        {request?.note && (
          <p className="image-card-note">
            {t('Your note to the image model: {note}', { note: request.note })}
          </p>
        )}
        {replaces && asset.variant === 'reference' && (
          <p className="image-card-hint">
            {t('Approving it replaces the main picture; every later variant keeps its look.')}
          </p>
        )}
        <div className="image-card-actions">
          <button
            type="button"
            className="primary-button"
            aria-disabled={waiting || undefined}
            aria-label={t('Approve: {subject}', { subject })}
            onClick={() => {
              send(
                'Approve: {subject}',
                { type: 'ApproveAsset', assetId: asset.assetId },
                (now, elsewhere) =>
                  approvalWords(
                    t,
                    approvalStanding(now, asset.assetId),
                    elsewhere ? full : subject,
                    context.name,
                  ),
              );
            }}
          >
            <Glyph name="approve" />
            {t('Approve')}
          </button>
          <button
            type="button"
            aria-disabled={waiting || undefined}
            aria-label={t('Discard: {subject}', { subject })}
            onClick={() => {
              send(
                'Discard: {subject}',
                { type: 'RetractAsset', assetId: asset.assetId },
                (_now, elsewhere) =>
                  t('Discarded: {subject}. No one will see this picture.', {
                    subject: elsewhere ? full : subject,
                  }),
              );
            }}
          >
            <Glyph name="discard" />
            {t('Discard')}
          </button>
          <button
            type="button"
            aria-disabled={waiting || undefined}
            aria-label={t('Generate again: {subject}', { subject })}
            onClick={() => {
              send('Generate again: {subject}', repeatCommand(asset, request), (_now, elsewhere) =>
                t('Requested again: {subject}. This candidate stays until you decide.', {
                  subject: elsewhere ? full : subject,
                }),
              );
            }}
          >
            <Glyph name="generate" />
            {t('Generate again')}
          </button>
        </div>
      </div>
    </li>
  );
}

export function ApprovedCard({
  shown,
  context,
  onReplace,
  onAlign,
}: {
  readonly shown: ShownImage;
  readonly context: Context;
  readonly onReplace: () => void;
  /** A battle map's grid lined up (docs/adr/0057-encounters-maps-loot.md §3). */
  readonly onAlign?: () => void;
}) {
  const t = useT();
  const { waiting } = useWaiting();
  const { asset } = shown;
  const what = kindWords(t, asset);
  return (
    <li className="image-card image-card--approved" data-image-key={asset.assetId}>
      <Picture asset={asset} />
      <div className="image-card-body">
        <p className="image-card-kind">
          <Glyph name="approve" />
          {what}
        </p>
        <p className="image-card-meta">
          {asset.audience === 'players'
            ? t('Shown to players who can see it')
            : t('Only you see this')}
        </p>
        <ImportedOrigin asset={asset} />
        <div className="image-card-actions">
          <button
            type="button"
            aria-disabled={waiting || undefined}
            aria-label={t('Replace: {subject}', { subject: context.subject(what) })}
            onClick={() => {
              if (!waiting) onReplace();
            }}
          >
            <Glyph name="replace" />
            {t('Replace')}
          </button>
          {onAlign && asset.purpose === 'battle-map' && (
            <button
              type="button"
              aria-disabled={waiting || undefined}
              aria-label={t('Line up the grid: {subject}', { subject: context.subject(what) })}
              onClick={() => {
                if (!waiting) onAlign();
              }}
            >
              <Glyph name="map" />
              {t('Line up the grid')}
            </button>
          )}
        </div>
        {asset.grid && (
          <p className="image-card-meta">
            {t('The fight here takes {columns} × {rows} squares.', {
              columns: asset.grid.columns,
              rows: asset.grid.rows,
            })}
          </p>
        )}
      </div>
    </li>
  );
}

/** A request with no picture yet: waiting, being generated, or failed with its fixed reason. */
export function RequestRow({
  request,
  context,
}: {
  readonly request: AssetRequestView;
  readonly context: Context;
}) {
  const t = useT();
  const { images, waiting } = useWaiting();
  const what = kindWords(t, request);
  const failed = request.status === 'FAILED';
  const state = JOB_WORDS[request.status];
  const subject = context.subject(what);
  return (
    <li
      className={`image-request-row${failed ? ' is-failed' : ''}`}
      data-image-key={request.requestId}
    >
      <Glyph name={failed ? 'warning' : 'generate'} className="image-request-glyph" />
      <div className="image-request-text">
        <p>
          <strong>{what}</strong>
          {' · '}
          {failed
            ? t('Failed: {reason}', {
                reason: t(FAILURE_WORDS[request.failure ?? 'PROVIDER_ERROR']),
              })
            : state && t(state)}
        </p>
        {request.note && (
          <p className="image-card-note">
            {t('Your note to the image model: {note}', { note: request.note })}
          </p>
        )}
      </div>
      {failed && (
        <button
          type="button"
          aria-disabled={waiting || undefined}
          aria-label={t('Try again: {subject}', { subject })}
          onClick={() => {
            if (waiting) return;
            images?.run({
              place: context.place,
              command: repeatCommand(request, request),
              subject: t('Try again: {subject}', { subject: context.full(what) }),
              target: request.requestId,
              success: (_now, elsewhere) =>
                t('Requested again: {subject}.', {
                  subject: elsewhere ? context.full(what) : subject,
                }),
            });
          }}
        >
          <Glyph name="refresh" />
          {t('Try again')}
        </button>
      )}
    </li>
  );
}

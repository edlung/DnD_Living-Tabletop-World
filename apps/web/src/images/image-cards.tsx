import type { AssetRequestView, AssetView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { useContentImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useDmImages } from './dm-images.ts';
import { repeatCommand, type ShownImage } from './lineage.ts';
import { FAILURE_WORDS, JOB_WORDS, kindWords, makerWords } from './words.ts';

/**
 * The parts of the DM's image controls (docs/STAGE_330_DESIGN.md "DM controls"): a picture as
 * the server stores it (the DM may fetch any asset's bytes; a candidate is shown to the DM
 * only), a candidate with Approve, Discard and Generate again, an approved picture with
 * Replace, a request in progress or failed with its fixed reason, and the result of the DM's
 * last command where it was given. Every button names its picture, so a list of them reads
 * apart; the picture itself is decorative beside its words.
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

/** Where a command was given, and the words that name its picture there. */
interface Context {
  readonly place: string;
  /** The picture in words, with the entity's name where several entities are listed. */
  readonly subject: (what: string) => string;
}

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
  const images = useDmImages();
  const { asset, request } = shown;
  const what = kindWords(t, asset);
  const subject = context.subject(what);
  const busy = images === null || images.busy;
  return (
    <li className="image-card image-card--candidate">
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
            disabled={busy}
            aria-label={t('Approve: {subject}', { subject })}
            onClick={() => {
              images?.run(
                context.place,
                { type: 'ApproveAsset', assetId: asset.assetId },
                t('Approved: {subject}. Players who can see it now see this picture.', { subject }),
              );
            }}
          >
            <Glyph name="approve" />
            {t('Approve')}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={t('Discard: {subject}', { subject })}
            onClick={() => {
              images?.run(
                context.place,
                { type: 'RetractAsset', assetId: asset.assetId },
                t('Discarded: {subject}. No one will see this picture.', { subject }),
              );
            }}
          >
            <Glyph name="discard" />
            {t('Discard')}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={t('Generate again: {subject}', { subject })}
            onClick={() => {
              images?.run(
                context.place,
                repeatCommand(asset, request),
                t('Requested again: {subject}. This candidate stays until you decide.', {
                  subject,
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
}: {
  readonly shown: ShownImage;
  readonly context: Context;
  readonly onReplace: () => void;
}) {
  const t = useT();
  const images = useDmImages();
  const { asset } = shown;
  const what = kindWords(t, asset);
  return (
    <li className="image-card image-card--approved">
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
        <div className="image-card-actions">
          <button
            type="button"
            disabled={images === null || images.busy}
            aria-label={t('Replace: {subject}', { subject: context.subject(what) })}
            onClick={onReplace}
          >
            <Glyph name="replace" />
            {t('Replace')}
          </button>
        </div>
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
  const images = useDmImages();
  const what = kindWords(t, request);
  const failed = request.status === 'FAILED';
  const state = JOB_WORDS[request.status];
  return (
    <li className={`image-request-row${failed ? ' is-failed' : ''}`}>
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
          disabled={images === null || images.busy}
          aria-label={t('Try again: {subject}', { subject: context.subject(what) })}
          onClick={() => {
            images?.run(
              context.place,
              repeatCommand(request, request),
              t('Requested again: {subject}.', { subject: context.subject(what) }),
            );
          }}
        >
          <Glyph name="refresh" />
          {t('Try again')}
        </button>
      )}
    </li>
  );
}

/**
 * The result of the DM's last image command, where it was given: a polite live region that
 * exists before anything is said, and Retry when the answer was lost.
 */
export function ImagesResult({ place }: { readonly place: string }) {
  const t = useT();
  const images = useDmImages();
  const shown = images?.command.place === place ? images.command : null;
  return (
    <div className="images-result">
      <p className="images-result-text" role="status">
        {shown?.message ?? ''}
      </p>
      {shown?.status === 'uncertain' && (
        <button type="button" onClick={images?.retry}>
          {t('Retry the change')}
        </button>
      )}
    </div>
  );
}

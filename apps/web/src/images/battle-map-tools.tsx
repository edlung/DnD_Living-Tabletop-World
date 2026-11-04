import type { AssetView, BattleMapGrid } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useRef, useState, type ChangeEvent } from 'react';

import { ApiError } from '../api/client.ts';
import { useContentImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useDmImages } from './dm-images.ts';

/**
 * A place's battle map from the DM's own hand (docs/adr/0057-encounters-maps-loot.md §3): a PNG,
 * JPEG or WebP picture uploaded, re-encoded by the server in its own shape and approved as the
 * place's battle map — derived from the place's approved picture, as every battle map is — and its
 * grid lined up: a cell's size and the corner of its first full cell in the picture's pixels. The
 * fight there draws the picture under its squares by that grid and takes its columns and rows.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SQUARES = 40;

/** The picture's bytes in base64, as the upload route takes them. */
const base64Of = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? (reader.result.split(',')[1] ?? '') : '');
    };
    reader.onerror = () => {
      reject(new Error('unreadable'));
    };
    reader.readAsDataURL(file);
  });

const REFUSED: Readonly<Record<string, string>> = {
  image: 'This is not a PNG, JPEG or WebP picture.',
  size: 'The picture is larger than 10 MB.',
  'no-picture': 'Approve a picture of this place first: a battle map derives from it.',
};

export function BattleMapUpload({
  entityId,
  hasPicture,
}: {
  readonly entityId: string;
  /** The place has an approved picture: a battle map derives from it. */
  readonly hasPicture: boolean;
}) {
  const t = useT();
  const images = useDmImages();
  const ids = useId();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'lost'>('idle');
  const [refusal, setRefusal] = useState<string | null>(null);
  // One request per picture chosen: a retried upload never adds a second battle map.
  const request = useRef<{ id: string; file: File } | null>(null);
  if (!images) return null;
  const send = async (file: File) => {
    request.current =
      request.current?.file === file ? request.current : { id: crypto.randomUUID(), file };
    setState('busy');
    setRefusal(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      request.current = null;
      setState('idle');
      setRefusal(REFUSED['size'] ?? null);
      return;
    }
    try {
      await images.api.post(
        `entities/${encodeURIComponent(entityId)}/battle-map`,
        { requestId: request.current.id, image: await base64Of(file) },
        AbortSignal.timeout(60_000),
      );
      request.current = null;
      setState('done');
      images.reread();
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) {
        request.current = null;
        setState('idle');
        setRefusal(
          REFUSED[error.status === 413 ? 'size' : error.status === 409 ? 'no-picture' : 'image'] ??
            null,
        );
      } else {
        setState('lost');
      }
    }
  };
  const chosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void send(file);
  };
  return (
    <section className="battle-map-upload" aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`} className="dm-images-part">
        {t('Your own battle map')}
      </h4>
      {!hasPicture ? (
        <p className="muted">{t(REFUSED['no-picture'] ?? '')}</p>
      ) : (
        <>
          <p className="muted" id={`${ids}-hint`}>
            {t('A PNG, JPEG or WebP picture of up to 10 MB, seen from above.')}
          </p>
          <label className={`file-button${state === 'busy' ? ' is-busy' : ''}`}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="visually-hidden"
              aria-describedby={`${ids}-hint`}
              disabled={state === 'busy'}
              onChange={chosen}
            />
            <Glyph name="picture" />
            {state === 'busy' ? t('Uploading…') : t('Upload a battle map')}
          </label>
        </>
      )}
      {refusal && (
        <p className="authoring-notice error" role="alert">
          {t(refusal)}
        </p>
      )}
      {state === 'lost' && request.current && (
        <p className="authoring-notice error" role="alert">
          {t('The answer was lost on the way.')}{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              if (request.current) void send(request.current.file);
            }}
          >
            {t('Upload it again')}
          </button>
        </p>
      )}
      {state === 'done' && (
        <p className="muted" role="status">
          {t('The battle map is approved: line its grid up next.')}
        </p>
      )}
    </section>
  );
}

/** The columns and rows of whole cells a picture holds from its grid's corner. */
export function cellsOf(
  size: { readonly width: number; readonly height: number },
  grid: Pick<BattleMapGrid, 'cellPx' | 'originX' | 'originY'>,
) {
  return {
    columns: Math.min(MAX_SQUARES, Math.floor((size.width - grid.originX) / grid.cellPx)),
    rows: Math.min(MAX_SQUARES, Math.floor((size.height - grid.originY) / grid.cellPx)),
  };
}

export function BattleMapGridEditor({
  asset,
  subject,
  place,
  onDone,
}: {
  readonly asset: AssetView;
  /** The battle map in words, with its place: "Battle map of Old Trade Road". */
  readonly subject: string;
  readonly place: string;
  readonly onDone: () => void;
}) {
  const t = useT();
  const images = useDmImages();
  const ids = useId();
  const { url } = useContentImage(asset.contentHash);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [cellPx, setCellPx] = useState(asset.grid?.cellPx ?? 64);
  const [originX, setOriginX] = useState(asset.grid?.originX ?? 0);
  const [originY, setOriginY] = useState(asset.grid?.originY ?? 0);
  if (!images) return null;
  const cells = size ? cellsOf(size, { cellPx, originX, originY }) : null;
  const fits =
    cells !== null &&
    cells.columns >= 1 &&
    cells.rows >= 1 &&
    originX < cellPx &&
    originY < cellPx &&
    cellPx >= 8;
  // The grid drawn over the picture, in the picture's own proportions.
  const overlay = size
    ? {
        backgroundSize: `${String((cellPx / size.width) * 100)}% ${String((cellPx / size.height) * 100)}%`,
        backgroundPosition: `${String((originX / Math.max(1, size.width - cellPx)) * 100)}% ${String((originY / Math.max(1, size.height - cellPx)) * 100)}%`,
      }
    : undefined;
  const number = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return (
    <section className="battle-map-grid" aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`} className="dm-images-part">
        {t('Line up the grid: {subject}', { subject })}
      </h4>
      <p className="muted">
        {t(
          'Set the size of one cell and where the first whole cell begins, in the picture’s pixels.',
        )}
      </p>
      <div className="battle-map-grid-picture">
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              setSize({ width: image.naturalWidth, height: image.naturalHeight });
            }}
          />
        )}
        {overlay && <span className="battle-map-grid-lines" style={overlay} aria-hidden="true" />}
      </div>
      <div className="builder-fields">
        <label className="account-field">
          {t('Cell size in pixels')}
          <input
            type="number"
            min={8}
            max={512}
            value={cellPx}
            onChange={(event) => {
              setCellPx(number(event.target.value, cellPx));
            }}
          />
        </label>
        <label className="account-field">
          {t('First cell from the left, in pixels')}
          <input
            type="number"
            min={0}
            max={Math.max(0, cellPx - 1)}
            value={originX}
            onChange={(event) => {
              setOriginX(number(event.target.value, originX));
            }}
          />
        </label>
        <label className="account-field">
          {t('First cell from the top, in pixels')}
          <input
            type="number"
            min={0}
            max={Math.max(0, cellPx - 1)}
            value={originY}
            onChange={(event) => {
              setOriginY(number(event.target.value, originY));
            }}
          />
        </label>
      </div>
      <p className={fits ? 'muted' : 'field-error'} role="status">
        {cells && fits
          ? t('The fight here takes {columns} × {rows} squares.', cells)
          : t('The first cell begins within one cell, at least 8 px wide.')}
      </p>
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          disabled={!fits || images.busy}
          onClick={() => {
            if (!cells || !fits) return;
            images.run({
              place,
              target: asset.assetId,
              subject: t('Save the grid: {subject}', { subject }),
              command: {
                type: 'AlignBattleMap',
                assetId: asset.assetId,
                grid: { cellPx, originX, originY, ...cells },
              },
              success: () => t('The grid is lined up.'),
            });
            onDone();
          }}
        >
          {t('Save the grid')}
        </button>
        <button type="button" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
    </section>
  );
}

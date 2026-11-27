/** Align the light and the figure to the painted pedestal of an approved transparent cut-out. */
export function alignMiniature(image: HTMLImageElement) {
  const holder = image.parentElement;
  if (!holder?.closest("[data-campaign-theme='lighthouse']")) return;
  delete holder.dataset['plinth'];
  const scale = Math.min(1, 320 / image.naturalHeight, 320 / image.naturalWidth);
  const height = Math.round(image.naturalHeight * scale);
  const width = Math.round(image.naturalWidth * scale);
  if (width < 4 || height < 8) return;
  const top = Math.floor(height * 0.88);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height - top;
  const context = canvas.getContext('2d');
  if (!context) return;
  // Only the lowest rows are needed. A staff or coat beside the base is a separate opaque run.
  context.drawImage(image, 0, -top, width, height);
  const pixels = context.getImageData(0, 0, width, canvas.height).data;
  const rows: { left: number; span: number; y: number }[] = [];
  for (let y = 0; y < canvas.height; y++) {
    let start = 0,
      left = 0,
      span = 0;
    for (let x = 0; x <= width; x++) {
      if (x < width && (pixels[(y * width + x) * 4 + 3] ?? 0) >= 135) continue;
      if (x - start > span) {
        span = x - start;
        left = start;
      }
      start = x + 1;
    }
    if (span > width * 0.08) rows.push({ left, span, y: top + y });
  }
  const bottom = rows.at(-1);
  const widest = Math.max(0, ...rows.map((row) => row.span));
  const rim = rows.findLast((row) => row.span >= widest - 1);
  if (!rim || !bottom) return;
  const depth = bottom.y + 1 - rim.y;
  if (depth < 2 || depth > height * 0.12) return;
  const percent = (fraction: number) => String(fraction * 100) + '%';
  holder.style.setProperty('--plinth-x', percent((rim.left + rim.span / 2) / width));
  holder.style.setProperty('--plinth-y', percent(rim.y / height));
  holder.style.setProperty('--plinth-width', String(widest / height + 0.06));
  holder.style.setProperty('--plinth-height', String((depth * 2) / height + 0.03));
  holder.dataset['plinth'] = '';
}

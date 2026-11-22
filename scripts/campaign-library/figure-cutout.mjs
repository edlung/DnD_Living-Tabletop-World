/** Remove the pale studio backdrop connected to a sprite's edge. Enclosed paint on the figure
 * stays intact. Some generated RGBA sheets have a white matte even with an alpha channel. */
export function clearStudioBackdrop(pixels, width, height) {
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let end = 0;
  function visit(index) {
    if (visited[index]) return;
    visited[index] = 1;
    const pos = index * 4;
    const lo = Math.min(pixels[pos], pixels[pos + 1], pixels[pos + 2]);
    const hi = Math.max(pixels[pos], pixels[pos + 1], pixels[pos + 2]);
    if (pixels[pos + 3] > 16 && (lo < 220 || hi - lo > 23)) return;
    pixels[pos + 3] = 0;
    queue[end++] = index;
  }
  for (let x = 0; x < width; x++) {
    visit(x);
    visit(count - width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  for (let i = 0; i < end; i++) {
    const index = queue[i],
      x = index % width;
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index + width < count) visit(index + width);
  }
}

import lapis from '../art/item-d20-face.webp?inline';
import emerald from '../art/item-d6-face.webp?inline';

const size = 256;
const images = new Map();
const spots = ['5', '19', '159', '1379', '13579', '134679'];

function stone(kind) {
  if (!images.has(kind)) {
    const image = new Image();
    image.src = kind === 'd20' ? lapis : emerald;
    images.set(
      kind,
      image
        .decode()
        .then(() => image)
        .catch(() => null),
    );
  }
  return images.get(kind);
}

function star(ctx, x, y, radius) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      r = i % 2 ? radius * 0.22 : radius;
    const xx = x + Math.cos(a) * r,
      yy = y + Math.sin(a) * r;
    if (!i) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.closePath();
  ctx.fill();
}

function pip(ctx, x, y) {
  const fill = ctx.createRadialGradient(x - 4, y - 6, 1, x, y, 14);
  fill.addColorStop(0, '#fff7bd');
  fill.addColorStop(0.42, '#f1be58');
  fill.addColorStop(0.85, '#b17b2c');
  fill.addColorStop(1, '#6a431a');
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#f6d488';
  ctx.stroke();
}

export async function faceCanvases(solid, cornerUvs) {
  const image = await stone(solid.kind),
    d20 = solid.kind === 'd20';
  return solid.labels.map((value, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = d20 ? '#0b365f' : '#0b533e';
    ctx.fillRect(0, 0, size, size);
    if (image) {
      // Only the enamel of the blank front face, in its source bitmap.
      const crop = d20 ? [0.423, 0.387, 0.15, 0.14] : [0.15, 0.37, 0.43, 0.42];
      ctx.drawImage(
        image,
        crop[0] * image.width,
        crop[1] * image.height,
        crop[2] * image.width,
        crop[3] * image.height,
        0,
        0,
        size,
        size,
      );
    }
    const glaze = ctx.createLinearGradient(0, 0, size, size);
    glaze.addColorStop(0, d20 ? '#5197c45e' : '#61bca154');
    glaze.addColorStop(0.5, '#0c223614');
    glaze.addColorStop(1, '#03151b5c');
    ctx.fillStyle = glaze;
    ctx.fillRect(0, 0, size, size);
    const corners = cornerUvs[index].map(([u, v]) => [(u - 0.5) * size, (0.5 - v) * size]);
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = '#d6ad60';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    corners.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x * 0.91, y * 0.91);
      else ctx.moveTo(x * 0.91, y * 0.91);
    });
    ctx.closePath();
    ctx.stroke();
    if (d20) {
      ctx.save();
      ctx.strokeStyle = '#c5964aaf';
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.moveTo(-52, -65);
      ctx.bezierCurveTo(-2, -52, 40, -34, 66, 8);
      ctx.moveTo(-52, 63);
      ctx.bezierCurveTo(5, 49, 50, 25, 65, -9);
      ctx.stroke();
      ctx.fillStyle = '#eed690';
      for (const [x, y, r] of [
        [-40, -60, 3],
        [46, -20, 3],
        [-34, 55, 2],
        [48, 23, 3],
      ])
        star(ctx, x, y, r);
      ctx.restore();
    }
    ctx.fillStyle = '#f1d38e';
    for (const [x, y] of corners) star(ctx, x * 0.76, y * 0.76, d20 ? 6 : 5);
    if (d20) {
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 78px Georgia, serif';
      const gold = ctx.createLinearGradient(0, -31, 0, 29);
      gold.addColorStop(0, '#fff7d5');
      gold.addColorStop(0.62, '#ffe3a0');
      gold.addColorStop(1, '#d8a343');
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#261c1b';
      ctx.fillStyle = gold;
      ctx.strokeText(String(value), 0, 3);
      ctx.fillText(String(value), 0, 3);
      if (value === 6 || value === 9) ctx.fillRect(-15, 34, 30, 3);
    } else {
      ctx.rotate(Math.atan2(corners[1][1] - corners[0][1], corners[1][0] - corners[0][0]));
      for (const spot of spots[value - 1]) {
        const cell = Number(spot) - 1;
        pip(ctx, ((cell % 3) - 1) * 42, (Math.floor(cell / 3) - 1) * 42);
      }
    }
    return canvas;
  });
}

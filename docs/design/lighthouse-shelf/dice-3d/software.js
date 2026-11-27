import { Vector3 } from 'three';

// Orthographic projection keeps the UV-to-screen map affine. This renderer uses
// the same Three mesh and Cannon poses if the browser cannot create WebGL 2.
export function softwareView(canvas, faces) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const key = new Vector3(-0.5, 1, 0.55).normalize(),
    normal = new Vector3();
  const verts = [new Vector3(), new Vector3(), new Vector3()];
  let w = 1,
    h = 1,
    ratio = 1;
  function resize(width, height, pixelRatio) {
    w = width;
    h = height;
    ratio = pixelRatio;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  function draw(mesh, camera) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const geo = mesh.geometry,
      pos = geo.getAttribute('position'),
      norm = geo.getAttribute('normal'),
      uv = geo.getAttribute('uv');
    for (const { start, count, materialIndex } of geo.groups) {
      const texture = faces[materialIndex];
      for (let i = start; i < start + count; i += 3) {
        for (let k = 0; k < 3; k++) {
          const p = verts[k]
            .fromBufferAttribute(pos, i + k)
            .applyMatrix4(mesh.matrixWorld)
            .project(camera);
          p.x = ((p.x + 1) * w) / 2;
          p.y = ((1 - p.y) * h) / 2;
        }
        const [a, b, c] = verts,
          dx1 = b.x - a.x,
          dx2 = c.x - a.x,
          dy1 = b.y - a.y,
          dy2 = c.y - a.y;
        if (dx1 * dy2 - dx2 * dy1 >= 0) continue;
        normal.fromBufferAttribute(norm, i).applyQuaternion(mesh.quaternion);
        const light = Math.max(0, normal.dot(key));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        if (texture) {
          const side = texture.width;
          const sx = uv.getX(i) * side,
            sy = (1 - uv.getY(i)) * side;
          const ux = uv.getX(i + 1) * side - sx,
            uy = (1 - uv.getY(i + 1)) * side - sy;
          const vx = uv.getX(i + 2) * side - sx,
            vy = (1 - uv.getY(i + 2)) * side - sy;
          const det = ux * vy - uy * vx;
          const m0 = (dx1 * vy - dx2 * uy) / det,
            m2 = (dx2 * ux - dx1 * vx) / det;
          const m1 = (dy1 * vy - dy2 * uy) / det,
            m3 = (dy2 * ux - dy1 * vx) / det;
          ctx.clip();
          ctx.transform(m0, m1, m2, m3, a.x - m0 * sx - m2 * sy, a.y - m1 * sx - m3 * sy);
          ctx.drawImage(texture, 0, 0);
          ctx.fillStyle = 'rgba(6,14,25,' + 0.37 * (1 - light) + ')';
          ctx.fillRect(0, 0, side, side);
          ctx.fillStyle = 'rgba(255,227,162,' + 0.09 * light ** 4 + ')';
          ctx.fillRect(0, 0, side, side);
        } else {
          const k = 0.52 + 0.55 * light;
          ctx.fillStyle =
            'rgb(' +
            Math.min(255, Math.round(233 * k)) +
            ' ' +
            Math.round(183 * k) +
            ' ' +
            Math.round(95 * k) +
            ')';
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 0.65;
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  return { resize, draw, dispose() {} };
}

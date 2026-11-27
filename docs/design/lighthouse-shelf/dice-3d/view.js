import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshPhongMaterial,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { softwareView } from './software.js';

function webglView(canvas, gl, faces, mesh) {
  const renderer = new WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  const textures = faces.map((face) => {
    const map = new CanvasTexture(face);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  });
  const materials = textures.map(
    (map) => new MeshPhongMaterial({ map, shininess: 35, specular: new Color('#698c97') }),
  );
  materials.push(new MeshPhongMaterial({ color: '#ae7835', specular: '#fff0bc', shininess: 55 }));
  mesh.material = materials;
  const scene = new Scene();
  scene.add(
    mesh,
    new AmbientLight('#fff2d9', 0.44),
    new HemisphereLight('#cce4fa', '#76512b', 1.25),
  );
  const key = new DirectionalLight('#ffdfad', 2);
  key.position.set(-6, 13, 7);
  scene.add(key);
  const fill = new DirectionalLight('#9bc8ec', 1.15);
  fill.position.set(9, 7, -6);
  scene.add(fill);
  return {
    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
    },
    draw(_mesh, camera) {
      renderer.render(scene, camera);
    },
    dispose() {
      for (const t of textures) t.dispose();
      for (const m of materials) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

export function createView(surface, geometry, faces, bounds) {
  const mesh = new Mesh(geometry, []);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 21, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const shadow = surface.querySelector('.ground-shadow');
  let canvas = surface.querySelector('canvas'),
    backend,
    width = 1,
    height = 1,
    closed = false;
  const point = new Vector3(),
    pitchCos = camera.position.y / camera.position.length();
  function useSoftware() {
    const next = canvas.cloneNode(false);
    canvas.replaceWith(next);
    canvas = next;
    backend = softwareView(canvas, faces);
    surface.dataset.renderer = 'canvas3d';
  }
  try {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true });
    if (!gl) useSoftware();
    else {
      backend = webglView(canvas, gl, faces, mesh);
      surface.dataset.renderer = 'webgl';
    }
  } catch {
    useSoftware();
  }
  function draw() {
    mesh.updateMatrixWorld();
    backend.draw(mesh, camera);
    const lift = Math.max(0, mesh.position.y - bounds.radius * 0.72);
    point.set(mesh.position.x + lift * 0.26, 0, mesh.position.z - lift * 0.16).project(camera);
    const size = (2 * bounds.radius * width) / (camera.right - camera.left);
    shadow.style.left = (point.x + 1) * 50 + '%';
    shadow.style.top = (1 - point.y) * 50 + '%';
    shadow.style.width = size * (1.18 + lift * 0.09) + 'px';
    shadow.style.height = size * (0.64 + lift * 0.045) + 'px';
    shadow.style.opacity = String(0.28 + 0.54 / (1 + lift));
    shadow.style.filter = 'blur(' + (1.5 + lift * 1.8) + 'px)';
  }
  function resize() {
    width = Math.max(1, surface.clientWidth);
    height = Math.max(1, surface.clientHeight);
    const aspect = width / height;
    const span = Math.max(bounds.depth * pitchCos + 1.08, (bounds.width + 1.15) / aspect);
    camera.left = (-span * aspect) / 2;
    camera.right = -camera.left;
    camera.top = span / 2;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    backend.resize(width, height, Math.min(devicePixelRatio || 1, 2));
    draw();
  }
  function lost(event) {
    event.preventDefault();
    if (closed) return;
    canvas.removeEventListener('webglcontextlost', lost);
    backend.dispose();
    useSoftware();
    resize();
  }
  if (surface.dataset.renderer === 'webgl') canvas.addEventListener('webglcontextlost', lost);
  const observer = new ResizeObserver(resize);
  observer.observe(surface);
  resize();
  // Intersect the same orthographic camera ray with the horizontal playing surface.
  function onTable(u, v) {
    return {
      x: (u - 0.5) * (camera.right - camera.left),
      z: ((v - 0.5) * (camera.top - camera.bottom)) / pitchCos,
    };
  }
  function dispose() {
    closed = true;
    observer.disconnect();
    canvas.removeEventListener('webglcontextlost', lost);
    backend.dispose();
    geometry.dispose();
  }
  return { mesh, draw, onTable, dispose };
}

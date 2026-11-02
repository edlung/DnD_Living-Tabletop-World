import * as THREE from 'three';

import type { DieKind } from './solids.ts';

/**
 * The dice's faces (Stage 510): the GPT obsidian surface (`textures/dice-obsidian.webp`) under the
 * number, drawn here as game markup in gold — the GPT d20 ornament's look. A d4 shows a number at
 * each corner, turned toward it; 6 and 9 are underlined where both exist.
 */
const SIZE = 256;

/** Font size per die, as a share of the texture: two-digit faces need the room. */
const FONT: Readonly<Record<DieKind, number>> = {
  d4: 0.2,
  d6: 0.46,
  d8: 0.34,
  d10: 0.32,
  d12: 0.3,
  d20: 0.28,
};

/** Where a number sits within its face, from the texture's centre (kites read toward their wide end). */
const OFFSET: Readonly<Partial<Record<DieKind, number>>> = { d10: 0.05, d8: 0.04, d20: 0.04 };

export interface FaceArt {
  /** The GPT surface (obsidian or ivory), once loaded; until then a plain ground. */
  readonly surface: HTMLImageElement | null;
  /** Gold numerals on the players' obsidian, dark ink on the DM's ivory. */
  readonly ink: 'gold' | 'dark';
}

function ground(context: CanvasRenderingContext2D, art: FaceArt): void {
  context.fillStyle = art.ink === 'gold' ? '#0b1118' : '#e8dcc3';
  context.fillRect(0, 0, SIZE, SIZE);
  if (art.surface) context.drawImage(art.surface, 0, 0, SIZE, SIZE);
  const shade = context.createRadialGradient(
    SIZE / 2,
    SIZE / 2,
    SIZE * 0.1,
    SIZE / 2,
    SIZE / 2,
    SIZE * 0.7,
  );
  shade.addColorStop(
    0,
    art.ink === 'gold' ? 'rgba(70, 192, 220, 0.06)' : 'rgba(255, 248, 230, 0.1)',
  );
  shade.addColorStop(1, art.ink === 'gold' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(90, 60, 30, 0.22)');
  context.fillStyle = shade;
  context.fillRect(0, 0, SIZE, SIZE);
}

function numeral(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  angle: number,
  glow: boolean,
  ink: FaceArt['ink'],
): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.font = `700 ${String(Math.round(size))}px "Cormorant Garamond", Georgia, serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const fill = context.createLinearGradient(0, -size / 2, 0, size / 2);
  if (ink === 'gold') {
    fill.addColorStop(0, '#f6dfa0');
    fill.addColorStop(0.55, '#d8b062');
    fill.addColorStop(1, '#8a6a33');
  } else {
    fill.addColorStop(0, '#4a2f17');
    fill.addColorStop(1, '#1e130a');
  }
  if (glow && ink === 'gold') {
    context.shadowColor = 'rgba(230, 199, 132, 0.55)';
    context.shadowBlur = size * 0.18;
  }
  context.lineWidth = Math.max(2, size * 0.07);
  context.strokeStyle = ink === 'gold' ? 'rgba(5, 9, 14, 0.85)' : 'rgba(255, 246, 225, 0.75)';
  context.strokeText(text, 0, 0);
  context.fillStyle = fill;
  context.fillText(text, 0, 0);
  if (text === '6' || text === '9') {
    context.fillRect(-size * 0.2, size * 0.42, size * 0.4, Math.max(2, size * 0.06));
  }
  context.restore();
}

const textureOf = (canvas: HTMLCanvasElement) => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = SIZE;
  element.height = SIZE;
  const context = element.getContext('2d');
  if (!context) throw new Error('no 2D canvas');
  return [element, context];
}

/** The texture and glow of a face showing one number. */
export function faceTextures(kind: DieKind, text: string, art: FaceArt) {
  const size = SIZE * FONT[kind];
  const y = SIZE / 2 + SIZE * (OFFSET[kind] ?? 0);
  const [color, paint] = canvas();
  ground(paint, art);
  numeral(paint, text, SIZE / 2, y, size, 0, true, art.ink);
  const [glow, light] = canvas();
  light.fillStyle = '#000';
  light.fillRect(0, 0, SIZE, SIZE);
  // Only gold numerals glow.
  if (art.ink === 'gold') numeral(light, text, SIZE / 2, y, size, 0, false, art.ink);
  return { map: textureOf(color), emissiveMap: textureOf(glow) };
}

/**
 * A d4 face: the number of each corner near that corner, turned so it reads upright when that
 * corner points up. `corners` are the face's corners in texture space (u, v) with their numbers.
 */
export function d4FaceTextures(
  corners: readonly (readonly [number, number, number])[],
  art: FaceArt,
) {
  const size = SIZE * FONT.d4;
  const draw = (context: CanvasRenderingContext2D, glow: boolean) => {
    for (const [u, v, label] of corners) {
      // Canvas y runs down; texture v runs up.
      const cx = u * SIZE;
      const cy = (1 - v) * SIZE;
      const x = SIZE / 2 + (cx - SIZE / 2) * 0.58;
      const y = SIZE / 2 + (cy - SIZE / 2) * 0.58;
      numeral(
        context,
        String(label),
        x,
        y,
        size,
        Math.atan2(cx - SIZE / 2, SIZE / 2 - cy),
        glow,
        art.ink,
      );
    }
  };
  const [color, paint] = canvas();
  ground(paint, art);
  draw(paint, true);
  const [glow, light] = canvas();
  light.fillStyle = '#000';
  light.fillRect(0, 0, SIZE, SIZE);
  if (art.ink === 'gold') draw(light, false);
  return { map: textureOf(color), emissiveMap: textureOf(glow) };
}

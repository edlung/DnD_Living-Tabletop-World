import { textureUrl } from '../../visual/ui-kit.ts';
import { DiceEngine } from './engine.ts';
import type { FaceArt } from './labels.ts';

export type { DiceSet, DieRequest, Landing, Throw } from './engine.ts';
export type { DiceEngine };

/** A GPT surface picture, or null when it cannot be read (the faces fall back to a plain ground). */
async function picture(url: string): Promise<HTMLImageElement | null> {
  if (url === '') return null;
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/**
 * The 3D dice, loaded on demand (Stage 510): three.js and cannon-es stay out of the first bundle.
 * The numerals need the display face: it is loaded before any face is drawn.
 */
export async function createDiceEngine(canvas: HTMLCanvasElement): Promise<DiceEngine> {
  const [obsidian, ivory] = await Promise.all([
    picture(textureUrl('dice-obsidian')),
    picture(textureUrl('dice-ivory')),
    document.fonts.load('700 64px "Cormorant Garamond"').catch(() => []),
  ]);
  const arts: Record<'obsidian' | 'ivory', FaceArt> = {
    obsidian: { surface: obsidian, ink: 'gold' },
    ivory: { surface: ivory, ink: 'dark' },
  };
  return new DiceEngine(canvas, arts);
}

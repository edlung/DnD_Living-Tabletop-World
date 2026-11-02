import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

/**
 * Usage: node scripts/native-art/cli.ts <originals-dir> <prompts.json>
 * The native apps' pictures (docs/adr/0070-native-apps.md, Stage 700e), all GPT art: the two app
 * icons (originals kept outside the repository, `~/Documents/living-tabletop-world-art/
 * app-icons-2026-11-02/`) and the UI kit's key art, emblem and die glyph, sized for iOS and
 * Android. Code only scales, centres and fills with the client's ink. Every step is deterministic,
 * so the files rebuild byte for byte; provenance goes to `apps/native-shim/art.manifest.json`.
 */
const [originals, promptsPath] = process.argv.slice(2);
if (!originals || !promptsPath) {
  console.error('usage: cli.ts <originals-dir> <prompts.json>');
  process.exit(2);
}

const KIT = 'apps/web/src/assets/ui-kit';
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const PNG = { compressionLevel: 9, adaptiveFiltering: false } as const;

type Build = (input: Buffer) => Promise<Buffer>;
interface Output {
  readonly path: string;
  readonly source: string;
  readonly gpt: boolean;
  readonly recipe: string;
  readonly build: Build | null;
}

/** An iOS app icon: the whole GPT painting at 1024 px; iOS rounds its corners. */
const iosIcon: Build = (input) =>
  sharp(input).resize(1024, 1024, { kernel: 'lanczos3' }).removeAlpha().png(PNG).toBuffer();

/** An Android adaptive icon's foreground: the painting at 344 of 432 px, so its middle shows. */
const adaptive: Build = async (input) => {
  const icon = await sharp(input).resize(344, 344, { kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: 432, height: 432, channels: 4, background: CLEAR } })
    .composite([{ input: icon, left: 44, top: 44 }])
    .png(PNG)
    .toBuffer();
};

/** The launch screen's emblem. */
const launchEmblem: Build = (input) =>
  sharp(input).resize(240, 252, { kernel: 'lanczos3' }).png(PNG).toBuffer();

/** A notification's small icon: the die glyph's alpha in white, 80 px inside a 96 px square. */
const notification: Build = async (input) => {
  const alpha = await sharp(input)
    .ensureAlpha()
    .extractChannel('alpha')
    .resize(80, 80)
    .raw()
    .toBuffer();
  const white = await sharp({
    create: { width: 80, height: 80, channels: 3, background: '#ffffff' },
  })
    .joinChannel(alpha, { raw: { width: 80, height: 80, channels: 1 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 96, height: 96, channels: 4, background: CLEAR } })
    .composite([{ input: white, left: 8, top: 8 }])
    .png(PNG)
    .toBuffer();
};

const ANDROID = 'apps/android/app/src/main/res';
const OUTPUTS: readonly Output[] = [
  {
    path: 'apps/ios/Player/Assets.xcassets/AppIcon.appiconset/AppIcon.png',
    source: 'app-icon-player.png',
    gpt: true,
    recipe: 'resize 1024x1024 lanczos3, no alpha',
    build: iosIcon,
  },
  {
    path: 'apps/ios/DM/Assets.xcassets/AppIcon.appiconset/AppIcon.png',
    source: 'app-icon-dm.png',
    gpt: true,
    recipe: 'resize 1024x1024 lanczos3, no alpha',
    build: iosIcon,
  },
  {
    path: `${ANDROID}/drawable-xxxhdpi/ic_launcher_foreground.png`,
    source: 'app-icon-player.png',
    gpt: true,
    recipe: 'resize 344x344 lanczos3, centred on a clear 432x432 square (adaptive foreground)',
    build: adaptive,
  },
  ...['Player', 'DM'].map((app) => ({
    path: `apps/ios/${app}/Assets.xcassets/LaunchEmblem.imageset/LaunchEmblem.png`,
    source: `${KIT}/ornaments/emblem.webp`,
    gpt: false,
    recipe: 'resize 240x252 lanczos3',
    build: launchEmblem,
  })),
  {
    path: `${ANDROID}/drawable-xxxhdpi/ic_notification.png`,
    source: `${KIT}/glyphs/roll.png`,
    gpt: false,
    recipe: "the glyph's alpha in white, 80x80 inside 96x96",
    build: notification,
  },
  ...[
    [`${ANDROID}/drawable-nodpi/brand_keyart.webp`, 'textures/brand-keyart.webp'],
    [`${ANDROID}/drawable-nodpi/emblem.webp`, 'ornaments/emblem.webp'],
    [
      'apps/ios/LTWShell/Sources/LTWShell/Resources/brand-keyart.webp',
      'textures/brand-keyart.webp',
    ],
    ['apps/ios/LTWShell/Sources/LTWShell/Resources/emblem.webp', 'ornaments/emblem.webp'],
  ].map(([path = '', from = '']) => ({
    path,
    source: `${KIT}/${from}`,
    gpt: false,
    recipe: 'byte copy',
    build: null,
  })),
];

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const prompts = JSON.parse(await readFile(promptsPath, 'utf8')) as Record<
  string,
  { readonly prompt: string }
>;
const manifest: Record<string, Record<string, string>> = {};
for (const output of OUTPUTS) {
  const from = output.gpt ? join(originals, output.source) : output.source;
  const input = await readFile(from);
  await mkdir(dirname(output.path), { recursive: true });
  if (output.build === null) await copyFile(from, output.path);
  else await writeFile(output.path, await output.build(input));
  const name = output.source.replace(/\.png$/, '');
  manifest[output.path] = {
    source: output.gpt ? `art archive app-icons-2026-11-02/out/${output.source}` : output.source,
    sourceSha256: sha256(input),
    recipe: output.recipe,
    sha256: sha256(await readFile(output.path)),
    ...(output.gpt
      ? {
          channel: 'Codex CLI image generation, owner ChatGPT subscription (2026-11-02)',
          prompt: prompts[name]?.prompt ?? '',
        }
      : {}),
  };
}
await writeFile(
  'apps/native-shim/art.manifest.json',
  `${JSON.stringify({ note: 'All art by GPT (owner rule); see scripts/native-art/cli.ts.', assets: manifest }, null, 2)}\n`,
);
console.error(`native-art: ${String(OUTPUTS.length)} files written`);

// AI attribution: user specified the three target files (192, 512, maskable-512),
// the maskable safe-zone approach (icon scaled to ~80% on the icon's own background
// color), and that this must run via `sharp` as a devDependency. Claude wrote the
// script: sharp composition calls, output paths, and the CLI entry point.
//
// Rasterizes public/icon.svg into the PNG sizes required by public/manifest.json
// for PWA installability (Lighthouse wants 192x192 + 512x512, plus a maskable
// icon so Android can safely crop/mask it without clipping the glyph).
//
// Usage: node scripts/generate-icons.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const svgPath = path.join(publicDir, 'icon.svg');

// Matches the <rect fill="..."/> canvas color in public/icon.svg — used as the
// maskable icon's background so the safe-zone padding blends with the glyph tile.
const ICON_BACKGROUND = '#6366f1';

// Maskable icons must keep all essential content inside a centered ~80% "safe
// zone" circle (Android/iOS may crop up to the outer ~10% on each edge).
const MASKABLE_SCALE = 0.8;

async function generateStandardIcon(svgBuffer, size, outPath) {
  await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
  console.log(`wrote ${path.relative(publicDir, outPath)} (${size}x${size})`);
}

async function generateMaskableIcon(svgBuffer, size, outPath) {
  const innerSize = Math.round(size * MASKABLE_SCALE);
  const inner = await sharp(svgBuffer).resize(innerSize, innerSize).png().toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ICON_BACKGROUND,
    },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toFile(outPath);
  console.log(`wrote ${path.relative(publicDir, outPath)} (${size}x${size}, maskable)`);
}

async function main() {
  const svgBuffer = readFileSync(svgPath);

  await generateStandardIcon(svgBuffer, 192, path.join(publicDir, 'icon-192.png'));
  await generateStandardIcon(svgBuffer, 512, path.join(publicDir, 'icon-512.png'));
  await generateMaskableIcon(svgBuffer, 512, path.join(publicDir, 'icon-maskable-512.png'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Generate responsive image variants.
 *
 * Source photos are 1900–3900px; serving those raw would cost visitors several
 * megabytes for images displayed at 320px. Each source produces AVIF and WebP
 * at 1x and 2x of its display size, plus a JPEG fallback, all written to
 * public/img/ with explicit dimensions recorded so the templates can reserve
 * space and avoid layout shift.
 *
 * Run: node tools/build-images.mjs   (requires sharp; not needed at runtime)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp is not installed. Run: npm install --no-save sharp');
  process.exit(1);
}

const SRC = 'images';
const OUT = 'public/img';

/** displayed width in CSS px -> variants at 1x and 2x */
const TARGETS = [
  { file: 'anmol_blazer.jpg', name: 'hero', display: 320, square: true },
  { file: 'anmol_shirt.jpg', name: 'about', display: 360, square: true },
  { file: 'anmol_candid.jpg', name: 'candid', display: 220, square: false },
];

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};

for (const t of TARGETS) {
  const src = path.join(SRC, t.file);
  if (!fs.existsSync(src)) {
    console.warn(`skip ${t.file} — not found`);
    continue;
  }
  const meta = await sharp(src).metadata();
  const entry = { sources: {}, width: 0, height: 0 };

  for (const scale of [1, 2]) {
    const w = t.display * scale;
    const base = sharp(src).resize(
      t.square
        ? { width: w, height: w, fit: 'cover', position: 'top' }
        : { width: w, withoutEnlargement: true },
    );

    for (const [fmt, opts] of [
      ['avif', { quality: 55 }],
      ['webp', { quality: 80 }],
      ['jpg', { quality: 82, mozjpeg: true }],
    ]) {
      const out = path.join(OUT, `${t.name}-${w}.${fmt}`);
      const info = await base
        .clone()[fmt === 'jpg' ? 'jpeg' : fmt](opts)
        .toFile(out);
      (entry.sources[fmt] ??= []).push({ w, file: `/img/${t.name}-${w}.${fmt}`, bytes: info.size });
      if (scale === 1 && fmt === 'jpg') { entry.width = info.width; entry.height = info.height; }
    }
  }

  entry.fallback = `/img/${t.name}-${t.display}.jpg`;
  manifest[t.name] = entry;

  const orig = fs.statSync(src).size;
  const now = entry.sources.avif[0].bytes;
  console.log(
    `${t.name.padEnd(8)} ${meta.width}x${meta.height} → ${entry.width}x${entry.height}  ` +
    `${(orig / 1024).toFixed(0)}KB → ${(now / 1024).toFixed(0)}KB avif (${(100 - (now / orig) * 100).toFixed(0)}% smaller)`,
  );
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nwrote ${OUT}/manifest.json`);

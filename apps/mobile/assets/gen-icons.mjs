/**
 * Icon generation script — converts SVG source files to PNG assets for Expo.
 * Uses sharp if available, falls back to ImageMagick `convert`, then rsvg-convert.
 *
 * Run from repo root:
 *   node apps/mobile/assets/gen-icons.mjs
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../../..');

const ASSETS = [
  { svg: 'icon.svg',   out: 'images/icon.png',          w: 1024, h: 1024 },
  { svg: 'icon.svg',   out: 'images/adaptive-icon.png',  w: 1024, h: 1024 },
  { svg: 'icon.svg',   out: 'images/favicon.png',        w: 48,   h: 48  },
  { svg: 'splash.svg', out: 'images/splash.png',         w: 2048, h: 2048 },
];

function hasCmd(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

async function convertWithSharp(svgPath, outPath, w, h) {
  const require = createRequire(import.meta.url);
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    return false;
  }
  await sharp(readFileSync(svgPath)).resize(w, h).png().toFile(outPath);
  return true;
}

function convertWithImageMagick(svgPath, outPath, w, h) {
  try {
    execSync(`convert -background none -resize ${w}x${h} "${svgPath}" "${outPath}"`, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function convertWithRsvg(svgPath, outPath, w, h) {
  try {
    execSync(`rsvg-convert -w ${w} -h ${h} "${svgPath}" -o "${outPath}"`, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function convertWithInkscape(svgPath, outPath, w, h) {
  try {
    execSync(`inkscape --export-type=png --export-width=${w} --export-height=${h} --export-filename="${outPath}" "${svgPath}"`, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

const hasIM      = hasCmd('convert');
const hasRsvg    = hasCmd('rsvg-convert');
const hasInkscape = hasCmd('inkscape');

console.log(`Tools: ImageMagick=${hasIM}, rsvg-convert=${hasRsvg}, inkscape=${hasInkscape}`);

let anyFailed = false;
for (const { svg, out, w, h } of ASSETS) {
  const svgPath = join(__dir, svg);
  const outPath = join(__dir, out);

  if (!existsSync(svgPath)) {
    console.error(`MISSING SVG: ${svgPath}`);
    anyFailed = true;
    continue;
  }

  console.log(`\n→ ${svg} → ${out} (${w}×${h})`);

  const ok =
    (await convertWithSharp(svgPath, outPath, w, h)) ||
    (hasIM && convertWithImageMagick(svgPath, outPath, w, h)) ||
    (hasRsvg && convertWithRsvg(svgPath, outPath, w, h)) ||
    (hasInkscape && convertWithInkscape(svgPath, outPath, w, h));

  if (ok) {
    console.log(`  ✓ ${outPath}`);
  } else {
    console.error(`  ✗ Failed — no suitable tool found. Install ImageMagick: brew install imagemagick`);
    anyFailed = true;
  }
}

if (anyFailed) {
  console.error('\nSome assets failed. Run: brew install imagemagick && node apps/mobile/assets/gen-icons.mjs');
  process.exit(1);
} else {
  console.log('\nAll assets generated successfully.');
}

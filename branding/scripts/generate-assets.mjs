// One-time asset-generation tool for the ApexLens brand package. Not wired into
// the app build — run manually: `node branding/scripts/generate-assets.mjs`.
//
// Reads the hand-authored master SVGs in branding/ApexLens/SVG/, rasterizes them
// to every required PNG size via sharp, packs a multi-resolution favicon.ico by
// hand (no dependency needed — the ICO container format is simple enough to
// write directly), and organizes copies into the deliverable folder structure.

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BR = path.join(ROOT, 'branding', 'ApexLens');
const SVG = path.join(BR, 'SVG');

const ICON_SIZES = [16, 18, 19, 20, 24, 32, 48, 64, 128, 256, 512, 1024];

// Fonts referenced by the wordmark/promo/screenshot SVGs are embedded at
// rasterization time (base64 data-URI @font-face) so the master files stay
// small/editable but still render with the real Inter typeface, not a
// system-default fallback.
const FONT_PATH = path.join(
  ROOT,
  'node_modules',
  '@fontsource-variable',
  'inter',
  'files',
  'inter-latin-wght-normal.woff2',
);
let fontDataUri;
async function getFontDataUri() {
  if (!fontDataUri) {
    const buf = await readFile(FONT_PATH);
    fontDataUri = `data:font/woff2;base64,${buf.toString('base64')}`;
  }
  return fontDataUri;
}

async function loadSvg(name) {
  let svg = await readFile(path.join(SVG, name), 'utf8');
  if (svg.includes('<text')) {
    const uri = await getFontDataUri();
    const style = `<defs><style>@font-face{font-family:'Inter';src:url(${uri}) format('woff2');font-weight:100 900;}</style></defs>`;
    const tagEnd = svg.indexOf('>') + 1;
    svg = svg.slice(0, tagEnd) + style + svg.slice(tagEnd);
  }
  return svg;
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function rasterize(svgString, size, outFile) {
  await sharp(Buffer.from(svgString), { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png()
    .toFile(outFile);
}

async function rasterizeWH(svgString, width, height, outFile) {
  await sharp(Buffer.from(svgString), { density: 384 })
    .resize(width, height, { fit: 'contain' })
    .png()
    .toFile(outFile);
}

/** Pack PNG buffers into a multi-resolution .ico (PNG-compressed ICO entries — supported since Windows Vista, and by Chrome). */
function pngsToIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const dirEntries = [];
  for (const png of pngBuffers) {
    // Read width/height from the IHDR chunk (bytes 16-23 of a PNG).
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(w >= 256 ? 0 : w, 0); // 0 means 256
    entry.writeUInt8(h >= 256 ? 0 : h, 1);
    entry.writeUInt8(0, 2); // no palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    dirEntries.push(entry);
    offset += png.length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4);
  return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

async function main() {
  // --- Icon-only mark, every required size -------------------------------
  const markSvg = await loadSvg('mark.svg');
  for (const size of ICON_SIZES) {
    const dir = path.join(BR, 'Icons', String(size));
    await ensureDir(dir);
    const outFile = path.join(dir, 'icon.png');
    await rasterize(markSvg, size, outFile);
    await copyFile(outFile, path.join(BR, 'PNG', `icon-${size}.png`));
  }
  console.log(`Icons: rasterized ${ICON_SIZES.length} sizes.`);

  // --- Favicons ------------------------------------------------------------
  await ensureDir(path.join(BR, 'Favicons'));
  const favSizes = [16, 32, 48];
  const favBuffers = [];
  for (const size of favSizes) {
    const outFile = path.join(BR, 'Favicons', `favicon-${size}.png`);
    await rasterize(markSvg, size, outFile);
    favBuffers.push(await readFile(outFile));
  }
  const ico = pngsToIco(favBuffers);
  await writeFile(path.join(BR, 'Favicons', 'favicon.ico'), ico);
  await copyFile(path.join(SVG, 'mark.svg'), path.join(BR, 'Favicons', 'favicon.svg'));
  await copyFile(path.join(BR, 'Favicons', 'favicon.ico'), path.join(BR, 'ICO', 'favicon.ico'));
  console.log('Favicons: favicon-{16,32,48}.png + favicon.ico + favicon.svg written.');

  // --- Mono / container variants (512 + 1024) -------------------------------
  await ensureDir(path.join(BR, 'Logo', 'Monochrome'));
  await ensureDir(path.join(BR, 'Logo', 'Dark'));
  await ensureDir(path.join(BR, 'Logo', 'Light'));
  for (const [name, sizes] of [
    ['mark-mono-black', [512, 1024]],
    ['mark-mono-white', [512, 1024]],
    ['mark-square', [512, 1024]],
    ['mark-circle', [512, 1024]],
    ['mark-transparent', [512, 1024]],
  ]) {
    const svg = await loadSvg(`${name}.svg`);
    for (const size of sizes) {
      const outFile = path.join(BR, 'PNG', `${name}-${size}.png`);
      await rasterize(svg, size, outFile);
    }
  }
  await copyFile(path.join(BR, 'PNG', 'mark-mono-black-1024.png'), path.join(BR, 'Logo', 'Monochrome', 'apexlens-mono-black.png'));
  await copyFile(path.join(BR, 'PNG', 'mark-mono-white-1024.png'), path.join(BR, 'Logo', 'Monochrome', 'apexlens-mono-white.png'));
  await copyFile(path.join(SVG, 'mark-mono-black.svg'), path.join(BR, 'Logo', 'Monochrome', 'apexlens-mono-black.svg'));
  await copyFile(path.join(SVG, 'mark-mono-white.svg'), path.join(BR, 'Logo', 'Monochrome', 'apexlens-mono-white.svg'));
  await copyFile(path.join(BR, 'PNG', 'mark-mono-white-1024.png'), path.join(BR, 'Logo', 'Dark', 'apexlens-mark-for-dark-bg.png'));
  await copyFile(path.join(SVG, 'mark-mono-white.svg'), path.join(BR, 'Logo', 'Dark', 'apexlens-mark-for-dark-bg.svg'));
  await copyFile(path.join(BR, 'PNG', 'mark-transparent-1024.png'), path.join(BR, 'Logo', 'Light', 'apexlens-mark-for-light-bg.png'));
  await copyFile(path.join(SVG, 'mark-transparent.svg'), path.join(BR, 'Logo', 'Light', 'apexlens-mark-for-light-bg.svg'));
  console.log('Mono/container variants rasterized.');

  // --- App-icon square / circle (for store listing + desktop-style icons) --
  const squareSvg = await readFile(path.join(SVG, 'mark-square.svg'), 'utf8');
  const circleSvg = await readFile(path.join(SVG, 'mark-circle.svg'), 'utf8');
  await rasterize(squareSvg, 512, path.join(BR, 'ChromeStore', 'app-icon-square-512.png'));
  await rasterize(squareSvg, 128, path.join(BR, 'ChromeStore', 'app-icon-square-128.png'));
  await rasterize(circleSvg, 512, path.join(BR, 'ChromeStore', 'app-icon-circle-512.png'));

  // --- Logo lockups (horizontal / vertical) --------------------------------
  for (const [name, dir] of [
    ['logo-horizontal-light', 'Horizontal'],
    ['logo-horizontal-dark', 'Horizontal'],
    ['logo-vertical', 'Vertical'],
  ]) {
    const svg = await loadSvg(`${name}.svg`);
    const targetDir = path.join(BR, 'Logo', dir);
    await ensureDir(targetDir);
    // Horizontal viewBox is 1040x240 (4.333:1), vertical is 420x480 (0.875:1) —
    // match output pixel aspect exactly so `contain` doesn't add letterbox padding.
    await rasterizeWH(
      svg,
      name === 'logo-vertical' ? 875 : 1840,
      name === 'logo-vertical' ? 1000 : 424,
      path.join(targetDir, `apexlens-${name.replace('logo-', '')}.png`),
    );
    await copyFile(path.join(SVG, `${name}.svg`), path.join(targetDir, `apexlens-${name.replace('logo-', '')}.svg`));
  }
  await copyFile(path.join(BR, 'Logo', 'Horizontal', 'apexlens-horizontal-light.png'), path.join(BR, 'Logo', 'Light', 'apexlens-horizontal-light.png'));
  await copyFile(path.join(BR, 'Logo', 'Horizontal', 'apexlens-horizontal-dark.png'), path.join(BR, 'Logo', 'Dark', 'apexlens-horizontal-dark.png'));
  console.log('Logo lockups rasterized.');

  // --- Chrome Web Store promo tiles ----------------------------------------
  await ensureDir(path.join(BR, 'ChromeStore'));
  for (const [name, w, h] of [
    ['promo-small', 440, 280],
    ['promo-large', 920, 680],
    ['promo-marquee', 1400, 560],
  ]) {
    const svg = await loadSvg(`${name}.svg`);
    await rasterizeWH(svg, w, h, path.join(BR, 'ChromeStore', `${name}.png`));
  }
  console.log('Chrome Store promo tiles rasterized.');

  // --- Store screenshot placeholders ----------------------------------------
  await ensureDir(path.join(BR, 'ChromeStore', 'screenshots'));
  for (const n of [1, 2]) {
    const svg = await loadSvg(`screenshot-placeholder-${n}.svg`);
    await rasterizeWH(svg, 1280, 800, path.join(BR, 'ChromeStore', 'screenshots', `screenshot-${n}.png`));
  }
  console.log('Screenshot placeholders rasterized.');

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

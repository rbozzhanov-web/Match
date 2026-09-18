/**
 * Renders the icon set from apps/web/public/icon.svg.
 *
 * The artwork is two overlapping circles, which is the app in one picture: two schedules, and the
 * part where they cross. Three platforms want three different things from it:
 *
 *  - **Manifest "any"** takes the icon as drawn, rounded corners and all.
 *  - **Manifest "maskable"** is cropped by the platform to a shape it chooses, so it needs a
 *    full-bleed background and the artwork pulled inside the centred 80% safe circle. Declaring
 *    one icon as both means whichever shape Android applies eats the corners of art drawn to sit
 *    against them.
 *  - **apple-touch-icon** is what iOS actually uses: it ignores manifest icons and SVG entirely,
 *    so a PNG has to exist at a real URL. iOS rounds it itself, so this one is full-bleed.
 *
 * Rasterised by shelling out to headless Chromium rather than adding an image toolchain — the
 * icons change about as often as the brand does, so the renderer is borrowed for the run rather
 * than carried in every install. Point CHROMIUM_PATH at a binary, or let it find a common one.
 * Not part of the build: run it with `npm run generate:icons` after changing the artwork.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chrome = CANDIDATES.find((path) => {
  try {
    execFileSync(path, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});

if (!chrome) {
  console.error(`No Chromium found. Set CHROMIUM_PATH to a Chrome or Chromium binary. Tried:\n  ${CANDIDATES.join('\n  ')}`);
  process.exit(1);
}

const publicDir = new URL('../apps/web/public/', import.meta.url);
const source = await readFile(new URL('icon.svg', publicDir), 'utf8');

const BACKGROUND = '#2b1a2f';
/** The artwork without its background plate, for the variants that draw their own. */
const artwork = [...source.matchAll(/<path[^>]*\/>/g)].map((match) => match[0]).join('\n  ');
if (!artwork) throw new Error('No <path> artwork found in icon.svg.');

/**
 * The source is drawn in a 192 box. `scale` is applied about the centre, so a value below the
 * full-bleed ratio insets the artwork — which is how the maskable safe zone is met.
 */
function compose(size, scale, { rounded = false } = {}) {
  const drawn = 192 * scale;
  const offset = (size - drawn) / 2;
  const radius = rounded ? ` rx="${Math.round(size * 0.22)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}"${radius} fill="${BACKGROUND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
  ${artwork}
  </g>
</svg>`;
}

const variants = [
  { file: 'icon-192.png', size: 192, svg: compose(192, 1, { rounded: true }) },
  { file: 'icon-512.png', size: 512, svg: compose(512, 512 / 192, { rounded: true }) },
  // Maskable: full bleed, artwork inside the 80% safe circle (192 * 2 = 384 of 512).
  { file: 'icon-maskable-512.png', size: 512, svg: compose(512, 2, {}) },
  // 180 is the size current iPhones ask for.
  { file: 'apple-touch-icon.png', size: 180, svg: compose(180, 180 / 192, {}) },
];

const workDir = mkdtempSync(join(tmpdir(), 'match-icons-'));

for (const variant of variants) {
  const page = join(workDir, `${variant.file}.html`);
  const shot = join(workDir, variant.file);
  writeFileSync(page, `<body style="margin:0">${variant.svg}</body>`);
  execFileSync(chrome, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--screenshot=${shot}`,
    `--window-size=${variant.size},${variant.size}`,
    page,
  ], { stdio: 'ignore' });
  await rename(shot, fileURLToPath(new URL(variant.file, publicDir)));
  console.log(`${variant.file}: ${variant.size}x${variant.size}`);
}

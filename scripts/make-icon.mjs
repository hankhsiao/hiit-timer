import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'public');

// ── Shared geometry (512 canvas, inside maskable safe zone) ─────────────────
const S = 512;
const cx = 256, cy = 256;
const r = 150;
const sw = 36;
const circ = 2 * Math.PI * r;
const gapFrac = 0.18;
const dash = circ * (1 - gapFrac);
const gap = circ * gapFrac;
const tri = 72;
const tx = cx + 8;
const playPath = `M ${tx - tri * 0.62} ${cy - tri} L ${tx + tri * 0.95} ${cy} L ${tx - tri * 0.62} ${cy + tri} Z`;

// The white subject (ring + play), reused by every variant.
const subject = (fill = '#FFFFFF') => `
  <g transform="rotate(-90 ${cx} ${cy})">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${fill}"
      stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash} ${gap}"/>
  </g>
  <path d="${playPath}" fill="${fill}" stroke="${fill}" stroke-width="20" stroke-linejoin="round"/>`;

// A solid silhouette of the subject in one colour, used to cast shadows.
const silhouette = (fill) => subject(fill);

// Diagonal lit background (light top-left → deep bottom-right).
const gradientDefs = `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8B5CF6"/>
    <stop offset="1" stop-color="#6D28D9"/>
  </linearGradient>`;
const flatBg = `<rect width="${S}" height="${S}" fill="#7C3AED"/>`;
const gradBg = `<rect width="${S}" height="${S}" fill="url(#bg)"/>`;

// ── Variants ────────────────────────────────────────────────────────────────

// 0: current flat version (baseline, for comparison)
const vFlat = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${flatBg}
  ${subject()}
</svg>`;

// 1: 45° long shadow + gradient background (most like the badminton icon)
function longShadowLayers() {
  const steps = 64, d = 4; // offset per step
  let layers = '';
  for (let i = steps; i >= 1; i--) {
    layers += `<g transform="translate(${i * d} ${i * d})">${silhouette('#4C1D95')}</g>`;
  }
  return layers;
}
const vLong = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>${gradientDefs}
    <clipPath id="frame"><rect width="${S}" height="${S}"/></clipPath>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="0.9" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="fadeMask"><rect width="${S}" height="${S}" fill="url(#fade)"/></mask>
  </defs>
  ${gradBg}
  <g clip-path="url(#frame)"><g mask="url(#fadeMask)">${longShadowLayers()}</g></g>
  ${subject()}
</svg>`;

// 2: soft drop shadow + gradient background (floating, like the yin-yang icon)
const vDrop = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>${gradientDefs}
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#3B0A75" flood-opacity="0.45"/>
    </filter>
  </defs>
  ${gradBg}
  <g filter="url(#soft)">${subject()}</g>
</svg>`;

// 3: bevelled ring (top-lit) + gradient background + soft shadow
const vBevel = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>${gradientDefs}
    <linearGradient id="metal" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D9CCF5"/>
    </linearGradient>
    <filter id="soft2" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#3B0A75" flood-opacity="0.4"/>
    </filter>
  </defs>
  ${gradBg}
  <g filter="url(#soft2)">
    <g transform="rotate(-90 ${cx} ${cy})">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#metal)"
        stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash} ${gap}"/>
    </g>
    <path d="${playPath}" fill="url(#metal)" stroke="url(#metal)" stroke-width="20" stroke-linejoin="round"/>
  </g>
</svg>`;

const variants = {
  'preview-0-flat': vFlat,
  'preview-1-longshadow': vLong,
  'preview-2-drop': vDrop,
  'preview-3-bevel': vBevel,
};

// In preview mode just render comparison PNGs. In apply mode, render the chosen
// variant to the real icon files.
const apply = process.argv[2]; // e.g. "1-longshadow"

if (!apply) {
  for (const [name, svg] of Object.entries(variants)) {
    await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(join(out, `${name}.png`));
    console.log('preview', name);
  }
  console.log('done previews');
} else {
  const svg = variants[`preview-${apply}`];
  if (!svg) { console.error('unknown variant', apply); process.exit(1); }
  writeFileSync(join(out, 'icon.svg'), svg);
  for (const [file, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(out, file));
    console.log('wrote', file, size);
  }
  console.log('applied', apply);
}

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'public');

// ── Design ────────────────────────────────────────────────────────────────
// Direction B: full-bleed bright-purple background (maskable safe), a thick
// white progress ring with a gap, and a centred play triangle. Single subject,
// flat, high contrast — matches the clean style of the neighbouring apps.
const BG = '#7C3AED';
const FG = '#FFFFFF';

// Geometry on a 512 canvas, kept inside the maskable safe zone (~center 80%).
const S = 512;
const cx = 256, cy = 256;
const r = 150;          // ring radius
const sw = 36;          // ring stroke width
const circ = 2 * Math.PI * r;
const gapFrac = 0.18;   // size of the gap at the top
const dash = circ * (1 - gapFrac);
const gap = circ * gapFrac;

// Play triangle (equilateral-ish), centred, nudged right for optical balance.
const tri = 72; // half-height
const tx = cx + 8;
const playPath = `M ${tx - tri * 0.62} ${cy - tri} L ${tx + tri * 0.95} ${cy} L ${tx - tri * 0.62} ${cy + tri} Z`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${BG}"/>
  <g transform="rotate(-90 ${cx} ${cy})">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${FG}"
      stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${dash} ${gap}"/>
  </g>
  <path d="${playPath}" fill="${FG}" stroke="${FG}" stroke-width="20" stroke-linejoin="round"/>
</svg>`;

writeFileSync(join(out, 'icon.svg'), svg);

const targets = [
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-192.png', size: 192 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const t of targets) {
  await sharp(Buffer.from(svg)).resize(t.size, t.size).png().toFile(join(out, t.file));
  console.log('wrote', t.file, t.size);
}
console.log('done');

/**
 * Generates the PWA icons into public/icons/ with no image dependencies:
 * a pixel buffer, 4x supersampling for smooth edges, and node's own zlib to
 * write the PNG. Runs as part of `npm run build`.
 *
 * The mark is the app's idea in one glyph — a gold ring (the visit cycle) with
 * a marker sitting on it (the customer coming round again).
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BG = [0x0e, 0x0f, 0x11];
const GOLD = [0x9f, 0xb3, 0xd1];
const GOLD_DEEP = [0x74, 0x89, 0xa8];
const SS = 4; // supersampling factor

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Signed distance helpers — negative is inside the shape. */
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

function sdRoundedRect(x, y, w, h, r) {
  const dx = Math.abs(x - w / 2) - (w / 2 - r);
  const dy = Math.abs(y - h / 2) - (h / 2 - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r;
}

/**
 * Paints one icon at `size`, returning raw RGBA bytes.
 * `rounded` gives the Android "any" icons their squircle; maskable and Apple
 * icons stay full-bleed because the platform applies its own mask.
 */
function render(size, { rounded, contentScale = 1 }) {
  const S = size * SS;
  const acc = new Float64Array(size * size * 4);

  const cornerR = rounded ? S * 0.22 : 0;
  const cx = S / 2;
  const cy = S / 2;
  const ringR = S * 0.30 * contentScale;
  const ringW = S * 0.085 * contentScale;
  const markerR = S * 0.093 * contentScale;
  // The marker sits on the ring at 1 o'clock — a return trip about to close.
  const markerAngle = -Math.PI / 4;
  const mx = cx + Math.cos(markerAngle) * ringR;
  const my = cy + Math.sin(markerAngle) * ringR;

  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      const x = sx + 0.5;
      const y = sy + 0.5;

      let rgba;
      if (rounded && sdRoundedRect(x, y, S, S, cornerR) > 0) {
        rgba = [0, 0, 0, 0]; // transparent outside the squircle
      } else {
        rgba = [...BG, 255];
        // Ring: an annulus, lit from the top so it reads as metal, not flat paint.
        const ring = Math.abs(sdCircle(x, y, cx, cy, ringR)) - ringW / 2;
        if (ring < 0) {
          const t = Math.min(1, Math.max(0, (y - (cy - ringR)) / (2 * ringR)));
          rgba = [...mix(GOLD, GOLD_DEEP, t), 255];
        }
        if (sdCircle(x, y, mx, my, markerR + S * 0.022) < 0) rgba = [...BG, 255]; // gap around the marker
        if (sdCircle(x, y, mx, my, markerR) < 0) rgba = [...GOLD, 255];
      }

      // Box-downsample into the destination pixel.
      const dx = (sx / SS) | 0;
      const dy = (sy / SS) | 0;
      const di = (dy * size + dx) * 4;
      acc[di] += rgba[0] * rgba[3];
      acc[di + 1] += rgba[1] * rgba[3];
      acc[di + 2] += rgba[2] * rgba[3];
      acc[di + 3] += rgba[3];
    }
  }

  const samples = SS * SS;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3];
    out[i * 4] = a ? Math.round(acc[i * 4] / a) : 0;
    out[i * 4 + 1] = a ? Math.round(acc[i * 4 + 1] / a) : 0;
    out[i * 4 + 2] = a ? Math.round(acc[i * 4 + 2] / a) : 0;
    out[i * 4 + 3] = Math.round(a / samples);
  }
  return out;
}

/* ---- Minimal PNG writer (8-bit RGBA, no interlacing) ---- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12: compression, filter, interlace — all 0.

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ICONS = [
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  // Maskable icons must keep their content inside the inner 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, rounded: false, contentScale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, rounded: false },
  { file: "favicon.png", size: 64, rounded: true },
];

mkdirSync(outDir, { recursive: true });
for (const { file, size, rounded, contentScale } of ICONS) {
  writeFileSync(resolve(outDir, file), encodePng(render(size, { rounded, contentScale }), size));
}
console.log(`Wrote ${ICONS.length} icons to ${outDir}`);

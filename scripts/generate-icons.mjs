/**
 * PWA icon generator (Mobile Phase 1) — plain node, zero dependencies.
 *
 * Rasterises the Z-clean app icon (a blocky white "Z" on brand teal
 * #22786d, matching public/icons/icon.svg) into the PNG sizes the
 * platforms ask for:
 *
 *   public/icons/icon-192.png          192×192  (manifest)
 *   public/icons/icon-512.png          512×512  (manifest)
 *   public/icons/icon-maskable-512.png 512×512  (maskable: Z kept
 *                                                inside the safe zone,
 *                                                teal bleeds to edges)
 *   public/icons/apple-touch-icon.png  180×180  (iOS home screen)
 *
 * PNGs are binary, so they are generated — not hand-maintained. Run:
 *   node scripts/generate-icons.mjs
 * The PNG encoder is hand-rolled (zlib deflate + CRC32) so no image
 * library is needed.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(projectRoot, "public", "icons");

const TEAL = [0x22, 0x78, 0x6d]; // brand-600
const WHITE = [0xff, 0xff, 0xff];

/* ---------------- CRC32 (PNG chunk checksums) ---------------- */
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/* ---------------- Icon raster ---------------- */
/**
 * Is pixel (x,y) part of the "Z"? Drawn in a unit square: a top bar, a
 * bottom bar and a diagonal band running top-right → bottom-left.
 * `inset` shrinks the glyph (maskable safe-zone); corners are square —
 * launchers apply their own masks.
 */
function isZ(u, v, inset) {
  const lo = inset;
  const hi = 1 - inset;
  const barH = 0.17 * (hi - lo);
  if (u >= lo && u <= hi && v >= lo && v <= lo + barH) return true; // top bar
  if (u >= lo && u <= hi && v >= hi - barH && v <= hi) return true; // bottom bar
  // Diagonal: centre line from (hi, lo+barH) to (lo, hi-barH).
  const t = (v - (lo + barH)) / (hi - barH - (lo + barH));
  if (t >= 0 && t <= 1) {
    const cx = hi - t * (hi - lo);
    if (Math.abs(u - cx) <= 0.085) return true;
  }
  return false;
}

function renderPng(size, inset) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const [r, g, b] = isZ(u, v, inset) ? WHITE : TEAL;
      const o = rowStart + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

/* ---------------- Emit ---------------- */
mkdirSync(outDir, { recursive: true });
const files = [
  ["icon-192.png", 192, 0.16],
  ["icon-512.png", 512, 0.16],
  ["icon-maskable-512.png", 512, 0.26],
  ["apple-touch-icon.png", 180, 0.16],
];
for (const [name, size, inset] of files) {
  const png = renderPng(size, inset);
  writeFileSync(join(outDir, name), png);
  console.log(`wrote public/icons/${name} (${size}×${size}, ${png.length} bytes)`);
}

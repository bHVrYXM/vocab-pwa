// Draws the app icon (two stacked cards on an indigo background) as PNGs, with no image dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG_TOP = [99, 91, 255];
const BG_BOTTOM = [67, 56, 202];

/** Signed distance from point to a rotated rounded rectangle (negative = inside). */
function roundedRectSdf(px, py, cx, cy, w, h, r, angle) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const dx = px - cx;
  const dy = py - cy;
  const x = Math.abs(dx * cos - dy * sin) - (w / 2 - r);
  const y = Math.abs(dx * sin + dy * cos) - (h / 2 - r);
  const ox = Math.max(x, 0);
  const oy = Math.max(y, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(x, y), 0) - r;
}

function draw(size, scale) {
  const px = new Uint8Array(size * size * 4);
  const s = size * scale; // drawing scale; maskable icons keep content in the safe zone
  const c = size / 2;
  const shapes = [
    // back card
    { cx: c - 0.05 * s, cy: c + 0.02 * s, w: 0.5 * s, h: 0.62 * s, r: 0.07 * s, a: -0.2, color: [255, 255, 255], alpha: 0.45 },
    // front card
    { cx: c + 0.05 * s, cy: c - 0.01 * s, w: 0.5 * s, h: 0.62 * s, r: 0.07 * s, a: 0.12, color: [255, 255, 255], alpha: 1 },
  ];
  // text lines on the front card
  const front = shapes[1];
  const lines = [
    { dy: -0.12, w: 0.28, h: 0.07, color: BG_BOTTOM },
    { dy: 0.04, w: 0.2, h: 0.045, color: [165, 160, 230] },
    { dy: 0.14, w: 0.24, h: 0.045, color: [165, 160, 230] },
  ].map((l) => {
    const ox = -Math.sin(front.a) * l.dy * s;
    const oy = Math.cos(front.a) * l.dy * s;
    return { cx: front.cx + ox, cy: front.cy + oy, w: l.w * s, h: l.h * s, r: (l.h * s) / 2, a: front.a, color: l.color, alpha: 1 };
  });
  const all = [...shapes, ...lines];

  const SS = 4; // supersampling per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          const t = fy / size;
          let col = BG_TOP.map((v, i) => v + (BG_BOTTOM[i] - v) * t);
          for (const sh of all) {
            if (roundedRectSdf(fx, fy, sh.cx, sh.cy, sh.w, sh.h, sh.r, sh.a) <= 0) {
              col = col.map((v, i) => v + (sh.color[i] - v) * sh.alpha);
            }
          }
          acc = acc.map((v, i) => v + col[i]);
        }
      }
      const o = (y * size + x) * 4;
      px[o] = Math.round(acc[0] / (SS * SS));
      px[o + 1] = Math.round(acc[1] / (SS * SS));
      px[o + 2] = Math.round(acc[2] / (SS * SS));
      px[o + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

function crc32(buf) {
  let c;
  const table = (crc32.table ??= Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const icons = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['apple-touch-icon.png', 180, 1],
  ['maskable-512.png', 512, 0.8],
];
for (const [name, size, scale] of icons) {
  writeFileSync(new URL(name, OUT), draw(size, scale));
  console.log('wrote', name);
}

writeFileSync(
  new URL('favicon.svg', OUT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#635bff"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <rect x="13" y="13" width="32" height="40" rx="4.5" fill="#fff" fill-opacity=".45" transform="rotate(-11.5 29 33)"/>
  <rect x="19" y="12" width="32" height="40" rx="4.5" fill="#fff" transform="rotate(7 35 32)"/>
  <rect x="26" y="22" width="18" height="4.5" rx="2.2" fill="#4338ca" transform="rotate(7 35 32)"/>
</svg>
`,
);
console.log('wrote favicon.svg');

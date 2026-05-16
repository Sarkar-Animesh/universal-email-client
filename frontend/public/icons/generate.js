#!/usr/bin/env node
// Generates icon-192.png, icon-512.png, icon-maskable-512.png
// Pure Node.js — no extra packages needed.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, c]);
}

function hex2rgb(h) {
  h = h.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function makePNG(size) {
  const bg  = hex2rgb("#0b1220");
  const mid = hex2rgb("#1e3a5f");
  const fg  = hex2rgb("#60a5fa"); // blue-400 letter
  const acc = hex2rgb("#38bdf8"); // sky-400 accent

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8]=8; ihdr[9]=2; // 8-bit RGB

  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(size * rowSize, 0);

  const cx = size / 2, cy = size / 2;

  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const px = y * rowSize + 1 + x * 3;
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx*dx + dy*dy);
      const norm = d / (size * 0.5);

      // Background gradient (dark navy → slightly lighter towards edge)
      let r = lerp(bg[0], mid[0], Math.min(norm * 1.4, 1));
      let g = lerp(bg[1], mid[1], Math.min(norm * 1.4, 1));
      let b = lerp(bg[2], mid[2], Math.min(norm * 1.4, 1));

      // Draw envelope icon in the centre (60% of size)
      const s = size * 0.3; // half-width of envelope
      const eh = s * 0.65;  // half-height
      const inEnv = Math.abs(dx) <= s && Math.abs(dy) <= eh;

      if (inEnv) {
        // Envelope body background
        r = lerp(bg[0], mid[0], 0.3);
        g = lerp(bg[1], mid[1], 0.3);
        b = lerp(bg[2], mid[2], 0.3);

        // Envelope border (2px relative)
        const bw = size * 0.007;
        const onBorder = Math.abs(Math.abs(dx) - s) < bw || Math.abs(Math.abs(dy) - eh) < bw;

        // Flap fold: V from top-left/top-right corners down to ~40% of height
        const flapApexY = cy - eh + eh * 0.6;
        const flapSlope = eh * 0.6 / s;
        const flapLineY = (cy - eh) + flapSlope * Math.abs(dx);
        const onFlap = Math.abs(y - flapLineY) < bw * 1.5 && dy < 0;

        // Bottom fold lines: from bottom corners to centre
        const bottomFoldY = cy + eh - (eh * 0.7 / s) * (s - Math.abs(dx));
        const onBottomFold = Math.abs(y - bottomFoldY) < bw && dy > 0;

        if (onBorder || onFlap || onBottomFold) {
          r = fg[0]; g = fg[1]; b = fg[2];
        }

        // Subtle accent dot (AI spark) — top-right
        const adx = dx - s * 0.55, ady = dy + eh * 0.6;
        if (Math.sqrt(adx*adx + ady*ady) < size * 0.04) {
          r = acc[0]; g = acc[1]; b = acc[2];
        }
      }

      raw[px] = r; raw[px+1] = g; raw[px+2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), // PNG sig
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = __dirname;
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), makePNG(size));
  process.stdout.write(`  icon-${size}.png\n`);
}
fs.writeFileSync(path.join(outDir, "icon-maskable-512.png"), makePNG(512));
process.stdout.write("  icon-maskable-512.png\n  done.\n");

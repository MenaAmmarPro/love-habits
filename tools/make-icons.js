"use strict";

/*
 * love-habits — generate the PWA icons with no dependencies.
 * Run once:  node tools/make-icons.js
 * Writes a pink heart on a transparent background at the sizes we need.
 */

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const ty = Buffer.from(type, "ascii");
  const cr = Buffer.alloc(4);
  cr.writeUInt32BE(crc32(Buffer.concat([ty, data])), 0);
  return Buffer.concat([len, ty, data, cr]);
}

function png(size, fn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y += 1) {
    raw[o++] = 0;
    for (let x = 0; x < size; x += 1) {
      const p = fn(x, y, size);
      raw[o++] = p[0];
      raw[o++] = p[1];
      raw[o++] = p[2];
      raw[o++] = p[3];
    }
  }
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(size, 0);
  ih.writeUInt32BE(size, 4);
  ih[8] = 8;   // bit depth
  ih[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ih),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* A soft heart, anti-aliased with a 2x2 sub-sample. */
function heartAt(x, y, size) {
  let hits = 0;
  for (const dx of [0.25, 0.75]) {
    for (const dy of [0.25, 0.75]) {
      const nx = ((x + dx) / size) * 2 - 1;
      const ny = 1 - ((y + dy) / size) * 2;
      const X = nx * 1.3;
      const Y = ny * 1.3 + 0.1;
      if (Math.pow(X * X + Y * Y - 1, 3) - X * X * Math.pow(Y, 3) <= 0) hits += 1;
    }
  }
  return hits / 4;
}

function heartRGB(x, y, size) {
  const a = heartAt(x, y, size);
  // Pink #ff72b8 blending toward white at the top-left for a soft shine.
  const shine = Math.max(0, 1 - ((x / size) + (y / size)));
  const r = Math.round(255);
  const g = Math.round(114 + shine * 70);
  const b = Math.round(184 + shine * 50);
  return [r, g, b, Math.round(a * 255)];
}

fs.mkdirSync(path.join("assets", "icons"), { recursive: true });

const targets = [
  ["assets/apple-touch-icon.png", 180],
  ["assets/og-image.png", 512],
  ["assets/icons/icon-192.png", 192],
  ["assets/icons/icon-512.png", 512]
];

for (const [file, size] of targets) {
  fs.writeFileSync(file, png(size, heartRGB));
  console.log("wrote " + file + " (" + size + "px)");
}

fs.writeFileSync(
  path.join("assets", "favicon.svg"),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path fill="#ff72b8" d="M12 21s-7.5-4.6-10-9.2C.4 8.6 2.2 5 5.7 5c2 0 3.4 1 4.3 2.3L12 9.5l2-2.2C14.9 6 16.3 5 18.3 5 21.8 5 23.6 8.6 22 11.8 19.5 16.4 12 21 12 21z"/>' +
    "</svg>"
);
console.log("wrote assets/favicon.svg");

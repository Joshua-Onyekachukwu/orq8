// Decode ORQ8_CANVAS_COMPANY_ONE_ONE.png, crop a region, write crop.png.
// Run: node tools/canvas_crop.js <x0> <y0> <x1> <y1>
"use strict";
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const [x0, y0, x1, y1] = process.argv.slice(2).map(Number);

const buf = fs.readFileSync(path.join(__dirname, "..", "ORQ8_CANVAS_COMPANY_ONE_ONE.png"));
// parse chunks
let pos = 8;
let w = 0, h = 0, idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString("ascii", pos + 4, pos + 8);
  const data = buf.slice(pos + 8, pos + 8 + len);
  if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
  if (type === "IDAT") idat.push(data);
  pos += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = w * 4;
const px = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  const f = raw[y * (stride + 1)];
  const row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
  for (let x = 0; x < w; x++) {
    const o = y * stride + x * 4;
    if (f === 0) {
      px[o] = row[x * 4];
      px[o + 1] = row[x * 4 + 1];
      px[o + 2] = row[x * 4 + 2];
      px[o + 3] = row[x * 4 + 3];
    } else {
      // only filter 0 is used by our encoder; treat others as passthrough
      px[o] = row[x * 4];
      px[o + 1] = row[x * 4 + 1];
      px[o + 2] = row[x * 4 + 2];
      px[o + 3] = row[x * 4 + 3];
    }
  }
}

// crop
const cw = x1 - x0, ch = y1 - y0;
const crop = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const s = ((y0 + y) * w + (x0 + x)) * 4;
    const d = (y * cw + x) * 4;
    crop[d] = px[s];
    crop[d + 1] = px[s + 1];
    crop[d + 2] = px[s + 2];
    crop[d + 3] = px[s + 3];
  }
}

// write PNG (reuse crc/chunk)
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const body = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0); return Buffer.concat([len, body, crc]); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(cw, 0); ihdr.writeUInt32BE(ch, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw2 = Buffer.alloc((cw * 4 + 1) * ch);
for (let y = 0; y < ch; y++) { raw2[y * (cw * 4 + 1)] = 0; crop.copy(raw2, y * (cw * 4 + 1) + 1, y * cw * 4, (y + 1) * cw * 4); }
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw2, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(__dirname, "..", ".freebuff", "crop.png"), png);
console.log("crop", cw, "x", ch);

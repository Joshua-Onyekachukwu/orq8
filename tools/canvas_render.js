// ORQ8 canvas renderer — dependency-free (Node >= 14).
// Parses TrueType fonts, converts outlines to polygons, rasterizes via scanline
// fill at 2x supersampling, writes a PNG. No external libs.
// Run: node tools/canvas_render.js  ->  ORQ8_CANVAS_COMPANY_ONE_ONE.png
"use strict";

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

/* ================================================================ PNG writer */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function writePNG(file, w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

/* ================================================================ TTF parse */

function parseTTF(file) {
  const buf = fs.readFileSync(file);
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables[buf.toString("ascii", o, o + 4)] = {
      buf,
      off: buf.readUInt32BE(o + 8),
      len: buf.readUInt32BE(o + 12),
    };
  }
  const T = (tag) => tables[tag] || null;
  const head = T("head");
  const maxp = T("maxp");
  const hhea = T("hhea");
  const cmapT = T("cmap");
  const loca = T("loca");
  const glyf = T("glyf");
  const hmtx = T("hmtx");
  const os2 = T("OS/2");

  const unitsPerEm = head ? head.buf.readUInt16BE(head.off + 18) : 1000;
  const indexToLocFormat = head ? head.buf.readInt16BE(head.off + 50) : 0;
  const numGlyphs = maxp ? maxp.buf.readUInt16BE(maxp.off + 4) : 0;
  const ascent = hhea ? hhea.buf.readInt16BE(hhea.off + 4) : unitsPerEm * 0.8;
  const numHMetrics = hhea ? hhea.buf.readUInt16BE(hhea.off + 34) : numGlyphs;
  let capHeight = unitsPerEm * 0.7;
  if (os2 && os2.len >= 90) {
    const ch = os2.buf.readInt16BE(os2.off + 88);
    if (ch > 0) capHeight = ch;
  }

  // cmap format 4
  let cmap = null;
  if (cmapT) {
    const n = cmapT.buf.readUInt16BE(cmapT.off + 2);
    let best = null;
    for (let i = 0; i < n; i++) {
      const e = cmapT.off + 4 + i * 8;
      const plat = cmapT.buf.readUInt16BE(e);
      const enc = cmapT.buf.readUInt16BE(e + 2);
      const off = cmapT.buf.readUInt32BE(e + 4);
      if (cmapT.buf.readUInt16BE(cmapT.off + off) !== 4) continue;
      if (plat === 3 && enc === 1) { best = { off: cmapT.off + off, p: 99 }; break; }
      if (!best && (plat === 0 || (plat === 3 && enc === 0))) best = { off: cmapT.off + off, p: 1 };
    }
    if (best) {
      const o = best.off;
      const segCount = cmapT.buf.readUInt16BE(o + 6) >> 1;
      const endBase = o + 14;
      const startBase = endBase + segCount * 2 + 2;
      const deltaBase = startBase + segCount * 2;
      const rangeBase = deltaBase + segCount * 2;
      cmap = { segCount, endBase, startBase, deltaBase, rangeBase, buf: cmapT.buf };
    }
  }
  function glyphId(c) {
    if (!cmap) return 0;
    for (let i = 0; i < cmap.segCount; i++) {
      const s = cmap.buf.readUInt16BE(cmap.startBase + i * 2);
      const e = cmap.buf.readUInt16BE(cmap.endBase + i * 2);
      if (c >= s && c <= e) {
        const ro = cmap.buf.readUInt16BE(cmap.rangeBase + i * 2);
        const d = cmap.buf.readUInt16BE(cmap.deltaBase + i * 2);
        if (ro === 0) return (c + d) & 0xffff;
        const addr = cmap.rangeBase + ro + 2 * (c - s);
        if (addr + 2 > cmap.buf.length) return 0;
        const g = cmap.buf.readUInt16BE(addr);
        return g === 0 ? 0 : (g + d) & 0xffff;
      }
    }
    return 0;
  }
  function locaOffset(gid) {
    if (!loca) return 0;
    if (indexToLocFormat === 0) return loca.buf.readUInt16BE(loca.off + gid * 2) * 2;
    return loca.buf.readUInt32BE(loca.off + gid * 4);
  }
  function advanceOf(gid) {
    if (!hmtx) return 0;
    if (gid < numHMetrics) return hmtx.buf.readUInt16BE(hmtx.off + gid * 4);
    return hmtx.buf.readUInt16BE(hmtx.off + (numHMetrics - 1) * 4);
  }
  // Contours of {x,y,on} in font units.
  function glyphContours(gid) {
    if (!glyf || gid >= numGlyphs) return [];
    const start = locaOffset(gid);
    const end = locaOffset(gid + 1);
    if (end - start < 10) return [];
    const b = glyf.buf;
    const o = glyf.off + start;
    const numContours = b.readInt16BE(o);
    if (numContours <= 0) return [];
    let p = o + 10;
    const endPts = [];
    for (let i = 0; i < numContours; i++) { endPts.push(b.readUInt16BE(p)); p += 2; }
    p += 2 + b.readUInt16BE(p); // skip instructions
    const total = endPts[numContours - 1] + 1;
    const flags = new Uint8Array(total);
    const xs = new Int32Array(total);
    const ys = new Int32Array(total);
    for (let i = 0; i < total; ) {
      const f = b.readUInt8(p++);
      flags[i++] = f;
      if (f & 0x08) {
        let rep = b.readUInt8(p++);
        while (rep-- > 0 && i < total) flags[i++] = f;
      }
    }
    let prev = 0;
    for (let i = 0; i < total; i++) {
      const f = flags[i];
      if (f & 0x02) xs[i] = prev + (f & 0x10 ? b.readUInt8(p++) : -b.readUInt8(p++));
      else if (f & 0x10) xs[i] = prev;
      else { xs[i] = prev + b.readInt16BE(p); p += 2; }
      prev = xs[i];
    }
    prev = 0;
    for (let i = 0; i < total; i++) {
      const f = flags[i];
      if (f & 0x04) ys[i] = prev + (f & 0x20 ? b.readUInt8(p++) : -b.readUInt8(p++));
      else if (f & 0x20) ys[i] = prev;
      else { ys[i] = prev + b.readInt16BE(p); p += 2; }
      prev = ys[i];
    }
    const contours = [];
    let ci = 0;
    const cur = [];
    for (let i = 0; i < total; i++) {
      cur.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) !== 0 });
      if (i === endPts[ci]) {
        contours.push(cur.splice(0));
        ci++;
      }
    }
    return contours;
  }
  return { unitsPerEm, ascent, capHeight, glyphId, advanceOf, glyphContours };
}

/* ================================================================ raster */

function quadToSegments(out, p0, c, p1) {
  const K = Math.max(
    2,
    Math.ceil((Math.abs(c.x - p0.x) + Math.abs(c.y - p0.y) + Math.abs(p1.x - c.x) + Math.abs(p1.y - c.y)) / 6)
  );
  for (let s = 1; s <= K; s++) {
    const t = s / K;
    const mt = 1 - t;
    out.push({
      x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
      y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
    });
  }
}

function contourToPoly(pts) {
  const n = pts.length;
  if (n < 2) return [{ x: pts[0].x, y: pts[0].y }];
  let startIdx = -1;
  for (let i = 0; i < n; i++) if (pts[i].on) { startIdx = i; break; }
  if (startIdx === -1) {
    // all off-curve: implied midpoints
    const np = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      np.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
    }
    return contourToPoly(np);
  }
  const out = [{ x: pts[startIdx].x, y: pts[startIdx].y }];
  let cur = pts[startIdx];
  let pending = null;
  for (let k = 1; k <= n; k++) {
    const p = pts[(startIdx + k) % n];
    if (p.on) {
      if (pending) {
        quadToSegments(out, cur, pending, p);
        cur = p;
        pending = null;
      } else {
        out.push({ x: p.x, y: p.y });
        cur = p;
      }
    } else {
      if (pending) {
        const mid = { x: (pending.x + p.x) / 2, y: (pending.y + p.y) / 2 };
        quadToSegments(out, cur, pending, mid);
        cur = mid;
        pending = p;
      } else pending = p;
    }
  }
  if (pending) quadToSegments(out, cur, pending, pts[startIdx]);
  return out;
}

function makeBuffer(W, H) {
  return Buffer.alloc(W * H * 4);
}

function setPx(buf, W, H, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  const da = buf[o + 3] / 255;
  const sa = a / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  buf[o] = Math.round((r * sa + buf[o] * da * (1 - sa)) / oa);
  buf[o + 1] = Math.round((g * sa + buf[o + 1] * da * (1 - sa)) / oa);
  buf[o + 2] = Math.round((b * sa + buf[o + 2] * da * (1 - sa)) / oa);
  buf[o + 3] = Math.round(oa * 255);
}

function addPx(buf, W, H, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  const sa = a / 255;
  buf[o] = Math.min(255, buf[o] + r * sa);
  buf[o + 1] = Math.min(255, buf[o + 1] + g * sa);
  buf[o + 2] = Math.min(255, buf[o + 2] + b * sa);
  buf[o + 3] = Math.min(255, buf[o + 3] + a);
}

function fillPoly(buf, W, H, pts, color) {
  const rows = new Array(H);
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % N];
    if (Math.abs(a.y - b.y) < 0.5) continue;
    const top = a.y < b.y ? a : b;
    const bot = a.y < b.y ? b : a;
    // sample intersections at pixel centers (y + 0.5): correct even-odd
    // pairing at vertices, no holes or glitch striping.
    const y0 = Math.ceil(top.y - 0.5);
    const y1 = Math.floor(bot.y - 0.5);
    if (y0 > y1) continue;
    const dx = (bot.x - top.x) / (bot.y - top.y);
    let x = top.x + (y0 + 0.5 - top.y) * dx;
    for (let yy = y0; yy <= y1; yy++) {
      if (!rows[yy]) rows[yy] = [];
      rows[yy].push(x);
      x += dx;
    }
  }
  const [r, g, b, a] = color;
  for (let y = 0; y < H; y++) {
    const xs = rows[y];
    if (!xs) continue;
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i]));
      const x1 = Math.min(W - 1, Math.floor(xs[i + 1]));
      for (let x = x0; x <= x1; x++) setPx(buf, W, H, x, y, r, g, b, a);
    }
  }
}

function fillRect(buf, W, H, x0, y0, x1, y1, color) {
  const [r, g, b, a] = color;
  const X0 = Math.max(0, Math.round(x0));
  const Y0 = Math.max(0, Math.round(y0));
  const X1 = Math.min(W - 1, Math.round(x1));
  const Y1 = Math.min(H - 1, Math.round(y1));
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) setPx(buf, W, H, x, y, r, g, b, a);
}

function polyCircle(cx, cy, r, seg = 48) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function fillCircle(buf, W, H, cx, cy, r, color) {
  fillPoly(buf, W, H, polyCircle(cx, cy, r), color);
}

function strokeCircle(buf, W, H, cx, cy, r, w, color) {
  const pts = polyCircle(cx, cy, r, 96);
  for (let i = 0; i < pts.length; i++) {
    line(buf, W, H, pts[i].x, pts[i].y, pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y, w, color);
  }
}

function line(buf, W, H, x0, y0, x1, y1, w, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  fillPoly(buf, W, H, [
    { x: x0 + nx, y: y0 + ny },
    { x: x1 + nx, y: y1 + ny },
    { x: x1 - nx, y: y1 - ny },
    { x: x0 - nx, y: y0 - ny },
  ], color);
}

function dashedLine(buf, W, H, x0, y0, x1, y1, w, dash, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let t = 0;
  let on = true;
  while (t < len) {
    const e = Math.min(t + (on ? dash : dash * 0.55), len);
    if (on) line(buf, W, H, x0 + ux * t, y0 + uy * t, x0 + ux * e, y0 + uy * e, w, color);
    on = !on;
    t = e;
  }
}

function glow(buf, W, H, cx, cy, rInner, rOuter, color, strength) {
  const [r, g, b] = color;
  const R = Math.ceil(rOuter);
  for (let y = Math.max(0, Math.round(cy - R)); y <= Math.min(H - 1, Math.round(cy + R)); y++) {
    for (let x = Math.max(0, Math.round(cx - R)); x <= Math.min(W - 1, Math.round(cx + R)); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > rOuter) continue;
      let t;
      if (d <= rInner) t = 1;
      else {
        const f = 1 - (d - rInner) / (rOuter - rInner);
        t = f * f;
      }
      const a = t * strength * 255;
      if (a > 0.5) addPx(buf, W, H, x, y, r, g, b, a);
    }
  }
}

/* ================================================================ text */

class TextPainter {
  constructor(font) {
    this.font = font;
  }
  scaleForCap(capPx, SS) {
    return (capPx / this.font.capHeight) * SS;
  }
  measure(text, scale, lsSS) {
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      w += this.font.advanceOf(this.font.glyphId(text.charCodeAt(i))) * scale;
      if (i < text.length - 1) w += lsSS;
    }
    return w;
  }
  // x,y = top-left anchor in canvas px; capPx in canvas px.
  // opts: centerX (number) or rightX (number) override x.
  draw(buf, W, H, SS, text, x, y, capPx, ls, color, opts = {}) {
    const scale = this.scaleForCap(capPx, SS);
    const lsSS = ls * SS;
    const w = this.measure(text, scale, lsSS);
    let cx = x * SS;
    if (opts.centerX !== undefined) cx = opts.centerX * SS - w / 2;
    else if (opts.rightX !== undefined) cx = opts.rightX * SS - w;
    const baseline = (y + capPx) * SS;
    for (let i = 0; i < text.length; i++) {
      const gid = this.font.glyphId(text.charCodeAt(i));
      if (gid > 0) {
        const contours = this.font.glyphContours(gid);
        for (const c of contours) {
          const poly = contourToPoly(c).map((p) => ({ x: p.x * scale + cx, y: baseline - p.y * scale }));
          fillPoly(buf, W, H, poly, color);
        }
      }
      cx += this.font.advanceOf(gid) * scale;
      if (i < text.length - 1) cx += lsSS;
    }
  }
}

/* ================================================================ canvas */

const SS = 2; // supersample
const CW = 1500;
const CH = 2100;
const W = CW * SS;
const H = CH * SS;
const S = (v) => v * SS;

const buf = makeBuffer(W, H);

// palette
const BG = [10, 10, 15, 255];
const INK = [242, 239, 233, 255];
const MUT = [140, 145, 155, 255];
const AMB = [245, 158, 11, 255];
const WH = [255, 255, 255, 255];

fillRectAll();
function fillRectAll() {
  for (let y = 0; y < H; y++) {
    const o = y * W * 4;
    for (let x = 0; x < W; x++) {
      buf[o + x * 4] = BG[0];
      buf[o + x * 4 + 1] = BG[1];
      buf[o + x * 4 + 2] = BG[2];
      buf[o + x * 4 + 3] = 255;
    }
  }
}

// subtle top light
glow(buf, W, H, S(750), S(140), 40, 700, [24, 24, 32], 0.05);

// faint grid
const gridColor = [255, 255, 255, 0.022 * 255];
for (let x = 0; x <= CW; x += 75) line(buf, W, H, S(x), 0, S(x), S(CH), S(1), gridColor);
for (let y = 0; y <= CH; y += 75) line(buf, W, H, 0, S(y), S(CW), S(y), S(1), gridColor);

// concentric rings around the sovereign node
const ringColor = [255, 255, 255, 0.05 * 255];
for (const r of [240, 380, 520]) strokeCircle(buf, W, H, S(750), S(600), S(r), S(1), ringColor);

// central axis
line(buf, W, H, S(750), S(500), S(750), S(1560), S(1), [255, 255, 255, 0.045 * 255]);

// rulers — top
for (let x = 100; x <= 1400; x += 75) {
  line(buf, W, H, S(x), S(58), S(x), S(70), S(1), [255, 255, 255, 0.32 * 255]);
}
// rulers — left
for (let y = 100; y <= 2000; y += 100) {
  line(buf, W, H, S(72), S(y), S(82), S(y), S(1), [255, 255, 255, 0.22 * 255]);
}

const serif = new TextPainter(parseTTF("C:/Windows/Fonts/georgia.ttf"));
const mono = new TextPainter(parseTTF("C:/Windows/Fonts/consola.ttf"));

function warnMissing(text) {
  for (const ch of text) {
    if (mono.font.glyphId(ch.charCodeAt(0)) === 0 && serif.font.glyphId(ch.charCodeAt(0)) === 0) {
      console.warn(`missing glyph: ${JSON.stringify(ch)} (${ch.charCodeAt(0).toString(16)})`);
    }
  }
}

// header
mono.draw(buf, W, H, SS, "ORQ8 — THE AI ORGANIZATION OPERATING SYSTEM", 100, 96, 10, 2, [MUT[0], MUT[1], MUT[2], 200]);
mono.draw(buf, W, H, SS, "FIG. 01 — MONADIC ARCHITECTURE", 0, 96, 10, 2, [MUT[0], MUT[1], MUT[2], 200], { rightX: 1400 });
// ruler labels
for (const [x, t] of [[100, "000"], [400, "300"], [700, "600"], [1000, "900"], [1300, "1200"]]) {
  mono.draw(buf, W, H, SS, t, 0, 38, 8, 1, [255, 255, 255, 90], { centerX: x });
}
for (const [y, t] of [[100, "000"], [500, "500"], [1000, "1000"], [1500, "1500"], [2000, "2000"]]) {
  mono.draw(buf, W, H, SS, t, 14, y - 4, 8, 1, [255, 255, 255, 80]);
}

// hero
mono.draw(buf, W, H, SS, "COMPANY ONE ONE", 0, 176, 10, 4, [MUT[0], MUT[1], MUT[2], 210], { centerX: 750 });
serif.draw(buf, W, H, SS, "ONE PERSON.", 0, 215, 96, 6, [INK[0], INK[1], INK[2], 255], { centerX: 750 });
serif.draw(buf, W, H, SS, "ONE COMPANY.", 0, 340, 96, 6, AMB, { centerX: 750 });
mono.draw(buf, W, H, SS, "AN ENTIRE AI WORKFORCE — HIRED, GOVERNED, REPORTING TO YOU.", 0, 452, 11, 3, [MUT[0], MUT[1], MUT[2], 235], { centerX: 750 });

// ---- the tree ----
// the thread: from the closing line of the hero statement down to the sovereign node
line(buf, W, H, S(750), S(472), S(750), S(574), S(1.2), [245, 158, 11, 90]);

const CEO = { x: 750, y: 600 };
glow(buf, W, H, S(CEO.x), S(CEO.y), S(26), S(330), [245, 158, 11], 0.10);
glow(buf, W, H, S(CEO.x), S(CEO.y), S(26), S(175), [245, 158, 11], 0.30);
fillCircle(buf, W, H, S(CEO.x), S(CEO.y), S(24), AMB);
strokeCircle(buf, W, H, S(CEO.x), S(CEO.y), S(32), S(1), [255, 255, 255, 70]);
mono.draw(buf, W, H, SS, "YOU — CEO · NODE 001", 792, 591, 11, 1, AMB);

const EXEC = { x: 750, y: 764 };
line(buf, W, H, S(CEO.x), S(626), S(EXEC.x), S(742), S(1.2), [255, 255, 255, 130]);
fillCircle(buf, W, H, S(EXEC.x), S(EXEC.y), S(15), [INK[0], INK[1], INK[2], 230]);
strokeCircle(buf, W, H, S(EXEC.x), S(EXEC.y), S(23), S(1), [255, 255, 255, 50]);
mono.draw(buf, W, H, SS, "EXECUTIVE AGENT · NODE 002", 778, 755, 11, 1, [INK[0], INK[1], INK[2], 220]);

const DEPTS = [
  { x: 380, y: 926, name: "ENGINEERING · NODE 003", labelX: 400 },
  { x: 750, y: 926, name: "MARKETING · NODE 004", labelX: 770 },
  { x: 1120, y: 926, name: "RESEARCH · NODE 005", labelX: 1140 },
];
line(buf, W, H, S(750), S(786), S(750), S(882), S(1.2), [255, 255, 255, 130]);
line(buf, W, H, S(380), S(882), S(1120), S(882), S(1.2), [255, 255, 255, 130]);
for (const d of DEPTS) {
  line(buf, W, H, S(d.x), S(882), S(d.x), S(904), S(1.2), [255, 255, 255, 130]);
  fillCircle(buf, W, H, S(d.x), S(d.y), S(12), [INK[0], INK[1], INK[2], 200]);
  strokeCircle(buf, W, H, S(d.x), S(d.y), S(19), S(1), [255, 255, 255, 40]);
  mono.draw(buf, W, H, SS, d.name, d.labelX, d.y - 9, 11, 1, [INK[0], INK[1], INK[2], 200]);
}

// staff chains
const staffPlan = [
  { x: 380, n: 2 },
  { x: 750, n: 2 },
  { x: 1120, n: 3 },
];
let staffIdx = 6;
for (const sp of staffPlan) {
  const d = DEPTS.find((dd) => dd.x === sp.x);
  let prevY = d.y + 12;
  for (let i = 0; i < sp.n; i++) {
    const y = 1050 + i * 50;
    line(buf, W, H, S(sp.x), S(prevY), S(sp.x), S(y - 7), S(1), [255, 255, 255, 90]);
    fillCircle(buf, W, H, S(sp.x), S(y), S(7), [255, 255, 255, 140]);
    mono.draw(buf, W, H, SS, String(staffIdx).padStart(3, "0"), sp.x + 14, y - 5, 8, 1, [255, 255, 255, 80]);
    staffIdx++;
    prevY = y + 7;
  }
}
// growth note below research staff
dashedLine(buf, W, H, S(1120), S(1148), S(1120), S(1202), S(1), S(7), [255, 255, 255, 70]);
mono.draw(buf, W, H, SS, "NODE COUNT EXTENDS AS WORK REQUIRES", 1136, 1194, 9, 1, [255, 255, 255, 110]);

// crosshair ticks at every node
function cross(x, y) {
  for (const dx of [-1, 1]) line(buf, W, H, S(x + dx * 6), S(y), S(x + dx * 9), S(y), S(1), [255, 255, 255, 120]);
  for (const dy of [-1, 1]) line(buf, W, H, S(x), S(y + dy * 6), S(x), S(y + dy * 9), S(1), [255, 255, 255, 120]);
}
cross(CEO.x, CEO.y);
cross(EXEC.x, EXEC.y);
for (const d of DEPTS) cross(d.x, d.y);

// ---- growth states ----
mono.draw(buf, W, H, SS, "STATE TRANSITIONS — THE STRUCTURE ADAPTS", 0, 1600, 10, 3, [MUT[0], MUT[1], MUT[2], 220], { centerX: 750 });

function miniDot(x, y, r, a) {
  fillCircle(buf, W, H, S(x), S(y), S(r), [255, 255, 255, a]);
}
function miniLine(x0, y0, x1, y1, a) {
  line(buf, W, H, S(x0), S(y0), S(x1), S(y1), S(1), [255, 255, 255, a]);
}

// α — 3 agents
{
  const cx = 330;
  miniDot(cx, 1660, 8, 200);
  miniLine(cx, 1668, cx, 1698, 120);
  miniDot(cx, 1700, 5, 150);
  miniLine(cx, 1704, cx, 1730, 90);
  miniDot(cx, 1732, 5, 130);
  mono.draw(buf, W, H, SS, "STATE α — 3 AGENTS", 0, 1760, 9, 2, [MUT[0], MUT[1], MUT[2], 200], { centerX: cx });
}
// β — 7 agents
{
  const cx = 750;
  miniDot(cx, 1660, 8, 200);
  miniLine(cx, 1668, cx, 1690, 120);
  for (const dx of [-50, 0, 50]) {
    miniDot(cx + dx, 1702, 5, 160);
    miniLine(cx + dx, 1707, cx + dx, 1726, 100);
    miniDot(cx + dx, 1734, 5, 140);
  }
  mono.draw(buf, W, H, SS, "STATE β — 7 AGENTS", 0, 1760, 9, 2, [MUT[0], MUT[1], MUT[2], 200], { centerX: cx });
}
// γ — 12 agents
{
  const cx = 1170;
  miniDot(cx, 1660, 8, 200);
  miniLine(cx, 1668, cx, 1690, 120);
  const children = [-70, 0, 70];
  const grand = [
    [-88, -70, -52],
    [-18, 0, 18],
    [52, 70, 88],
  ];
  for (let i = 0; i < 3; i++) {
    const dx = children[i];
    miniDot(cx + dx, 1702, 5, 160);
    miniLine(cx + dx, 1707, cx + dx, 1726, 100);
    for (const gx of grand[i]) miniDot(cx + gx, 1734, 4, 130);
  }
  mono.draw(buf, W, H, SS, "STATE γ — 12 AGENTS", 0, 1760, 9, 2, [MUT[0], MUT[1], MUT[2], 200], { centerX: cx });
}
// connectors between states
for (const [x1, x2] of [[460, 600], [900, 1040]]) {
  line(buf, W, H, S(x1), S(1660), S(x2), S(1660), S(1), [255, 255, 255, 60]);
  fillPoly(buf, W, H, [
    { x: S(x2), y: S(1654) },
    { x: S(x2 + 9), y: S(1660) },
    { x: S(x2), y: S(1666) },
  ], [255, 255, 255, 60]);
}

// legend + built-by
mono.draw(buf, W, H, SS, "* SOVEREIGN NODE   + EMPLOYEE   — STRUCTURAL LINK", 0, 1822, 9, 2, [MUT[0], MUT[1], MUT[2], 150], { centerX: 750 });
mono.draw(buf, W, H, SS, "BUILT BY A COMPANY OF ONE, RUNNING ON ORQ8.", 0, 1848, 9, 2, [MUT[0], MUT[1], MUT[2], 160], { centerX: 750 });

// ---- footer ----
fillRect(buf, W, H, S(100), S(1930), S(1400), S(1933), [AMB[0], AMB[1], AMB[2], 190]);
mono.draw(buf, W, H, SS, "ONE PERSON. ONE COMPANY. AN ENTIRE AI WORKFORCE.", 0, 1974, 11, 3, [INK[0], INK[1], INK[2], 255], { centerX: 750 });
mono.draw(buf, W, H, SS, "THE CEO REMAINS THE FIRST NODE.", 0, 1996, 9, 2, [MUT[0], MUT[1], MUT[2], 200], { centerX: 750 });
mono.draw(buf, W, H, SS, "ORQ8 — COMPANY ONE ONE", 100, 2034, 9, 2, [MUT[0], MUT[1], MUT[2], 220]);
mono.draw(buf, W, H, SS, "FIG. 01 · MMXXVI", 0, 2034, 9, 2, [MUT[0], MUT[1], MUT[2], 220], { rightX: 1400 });

// corner coordinates
mono.draw(buf, W, H, SS, "000, 000", 20, 24, 8, 1, [255, 255, 255, 80]);
mono.draw(buf, W, H, SS, "1500, 000", 0, 24, 8, 1, [255, 255, 255, 80], { rightX: 1480 });
mono.draw(buf, W, H, SS, "000, 2100", 20, 2074, 8, 1, [255, 255, 255, 80]);
mono.draw(buf, W, H, SS, "1500, 2100", 0, 2074, 8, 1, [255, 255, 255, 80], { rightX: 1480 });

warnMissing("ONE PERSON. ONE COMPANY. AN ENTIRE AI WORKFORCE — HIRED, GOVERNED, REPORTING TO YOU.αβγ·—");

const OUT = path.join(__dirname, "..", "ORQ8_CANVAS_COMPANY_ONE_ONE.png");
writePNG(OUT, W, H, buf);
console.log("wrote", OUT, `${W}x${H}`);

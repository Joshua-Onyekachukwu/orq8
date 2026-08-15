// ORQ8 PDF layout engine — dependency-free (Node >= 14).
// Shared by tools/pdf_build.js (executive overview) and tools/pdf_build_design_partner.js (design partners).
// Produces US Letter PDFs; content must be WinAnsi-safe.

const fs = require('fs');

const W = 612, H = 792;            // US Letter points
const ML = 54, MR = 54, MT = 62, MB = 50;
const CW = W - ML - MR;            // content width

// Helvetica AFM widths (1/1000 em) for chars 32..126
const WIDTHS = "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584".split(' ').map(Number);

function textWidth(s, size) {
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) w += WIDTHS[c - 32];
    else if (c === 0x2013 || c === 0x2014) w += 500;   // en/em dash
    else if (c === 0x2022) w += 350;                    // bullet
    else if (c >= 0x2018 && c <= 0x201d) w += 300;      // quotes
    else w += 556;
  }
  return (w * size) / 1000;
}

// encode to WinAnsi (latin1-ish) bytes for the PDF stream
function enc(s) {
  const out = [];
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 0x2013) out.push(0x96); else if (c === 0x2014) out.push(0x97);
    else if (c === 0x2022) out.push(0x95); else if (c === 0x2018) out.push(0x91);
    else if (c === 0x2019) out.push(0x92); else if (c === 0x201c) out.push(0x93);
    else if (c === 0x201d) out.push(0x94); else if (c <= 255) out.push(c);
    else out.push(0x3f); // '?'
  }
  return Buffer.from(out);
}

function esc(s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

// ---------- layout engine ----------
const F = { reg: '/F1', bold: '/F2', ital: '/F3' };
let pages = [];        // array of page content strings
let cur = [];          // current page commands
let y = H - MT;

function newPage() {
  pages.push(cur.join('\n'));
  cur = [];
  y = H - MT;
}

function line(font, size, color, x, text) {
  if (y - size < MB) newPage();
  y -= size + 1.5;
  cur.push(`BT ${font} ${size} Tf ${color} ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(text)}) Tj ET`);
}

function wrap(text, size, maxW) {
  const words = text.split(' ');
  const lines = [];
  let curLine = '';
  for (const w of words) {
    const t = curLine ? curLine + ' ' + w : w;
    if (textWidth(t, size) <= maxW || !curLine) curLine = t;
    else { lines.push(curLine); curLine = w; }
  }
  if (curLine) lines.push(curLine);
  return lines;
}

function rule(yPos) {
  cur.push(`0.7 w 0.82 0.84 0.88 RG ${ML} ${yPos} m ${W - MR} ${yPos} l S`);
}

// ---------- blocks ----------
const blocks = [];
function title(t) { blocks.push({ t: 'title', s: t }); }
function subtitle(s) { blocks.push({ t: 'subtitle', s }); }
function h1(s) { blocks.push({ t: 'h1', s }); }
function h2(s) { blocks.push({ t: 'h2', s }); }
function p(s) { blocks.push({ t: 'p', s }); }
function bullet(s) { blocks.push({ t: 'bullet', s }); }
function table(cols, rows) { blocks.push({ t: 'table', cols, rows }); }
function spacer(n) { blocks.push({ t: 'spacer', n }); }

function render() {
  for (const b of blocks) {
    switch (b.t) {
      case 'title': {
        if (y - 26 < MB) newPage();
        y -= 26;
        cur.push(`BT ${F.bold} 22 Tf 0.10 0.18 0.35 rg ${ML} ${y} Td (${esc(b.s)}) Tj ET`);
        y -= 8;
        rule(y); y -= 14;
        break;
      }
      case 'subtitle': {
        for (const l of wrap(b.s, 10.5, CW)) line(F.ital, 10.5, '0.35 0.38 0.42 rg', ML, l);
        y -= 4;
        break;
      }
      case 'h1': {
        y -= 6;
        for (const l of wrap(b.s, 13, CW)) line(F.bold, 13, '0.10 0.18 0.35 rg', ML, l);
        y -= 2;
        break;
      }
      case 'h2': {
        y -= 4;
        for (const l of wrap(b.s, 11, CW)) line(F.bold, 11, '0.15 0.22 0.40 rg', ML, l);
        y -= 2;
        break;
      }
      case 'p': {
        for (const l of wrap(b.s, 10, CW)) line(F.reg, 10, '0 0 0 rg', ML, l);
        y -= 4;
        break;
      }
      case 'bullet': {
        const indent = 16;
        const ls = wrap(b.s, 10, CW - indent);
        ls.forEach((l, i) => {
          const txt = i === 0 ? '\u2022 ' + l : l;
          line(F.reg, 10, '0 0 0 rg', ML + (i === 0 ? 0 : indent), txt);
        });
        y -= 2;
        break;
      }
      case 'spacer': y -= b.n; break;
      case 'table': {
        const colW = b.cols.map((c, i) => (i === 0 ? 0.3 : 0.7 / (b.cols.length - 1)) * CW);
        const size = 9, lh = 11.5;
        const cellLines = (text, i) => wrap(text, size, colW[i] - 8);
        for (const row of b.rows) {
          const maxLines = Math.max(...row.map((c, i) => cellLines(c, i).length));
          if (y - maxLines * lh < MB) newPage();
          const x0 = ML;
          let x = x0;
          row.forEach((c, i) => {
            const ls = cellLines(c, i);
            for (let k = 0; k < maxLines; k++) {
              const txt = ls[k] || '';
              const yy = y - (k + 1) * lh;
              cur.push(`BT ${i === 0 ? F.bold : F.reg} ${size} Tf ${i === 0 ? '0.10 0.18 0.35 rg' : '0 0 0 rg'} ${(x + 4).toFixed(1)} ${yy.toFixed(1)} Td (${esc(txt)}) Tj ET`);
            }
            x += colW[i];
          });
          y -= maxLines * lh + 3;
        }
        y -= 4;
        break;
      }
    }
  }
  pages.push(cur.join('\n'));
}

// ---------- PDF assembly ----------
function build(OUT, footerText) {
  render();
  const n = pages.length;
  const total = 6 + 2 * n; // 1 catalog, 2 pages, 3-5 fonts, pages, streams

  const bodies = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: `<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${6 + i} 0 R`).join(' ')}] /Count ${n} >>`,
    3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>',
  };
  pages.forEach((p, i) => {
    bodies[6 + i] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${6 + n + i} 0 R >>`;
  });
  pages.forEach((p, i) => {
    bodies[6 + n + i] =
      `BT /F2 9 Tf 0.5 0.5 0.5 rg 54 22 Td (${esc(footerText)}) Tj ET\n` + p;
  });

  const offsets = new Array(total).fill(0);
  const chunks = [];
  let pos = 0;

  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  chunks.push(header);
  pos = header.length;

  for (let num = 1; num < total; num++) {
    offsets[num] = pos;
    const hdr = Buffer.from(`${num} 0 obj\n`);
    const bdy = enc(bodies[num]);
    if (num >= 6 + n) {
      // content stream: header, length dict + stream, body, endstream
      const pre = Buffer.from(`<< /Length ${bdy.length} >>\nstream\n`);
      const post = Buffer.from('\nendstream\nendobj\n');
      chunks.push(hdr, pre, bdy, post);
      pos += hdr.length + pre.length + bdy.length + post.length;
    } else {
      const end = Buffer.from('\nendobj\n');
      chunks.push(hdr, bdy, end);
      pos += hdr.length + bdy.length + end.length;
    }
  }

  const xrefStart = pos;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  xref += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const buf = Buffer.concat([...chunks, enc(xref)]);
  fs.writeFileSync(OUT, buf);
  console.log(`Wrote ${OUT} (${n} page${n > 1 ? 's' : ''}, ${buf.length} bytes, ${total - 1} objects)`);
}

module.exports = {
  title, subtitle, h1, h2, p, bullet, table, spacer, rule,
  yPos: () => y,
  build,
};

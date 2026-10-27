// Minimal, dependency-free PDF writer for tabular reports: A4 portrait, the
// standard Helvetica fonts (no embedding needed), multi-page with the table
// header repeated on every page and "Page x of y" footers. Text is written in
// WinAnsi; characters outside it become "?" rather than corrupting the file.

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

// Helvetica advance widths (1/1000 em) for ASCII 32..126, from the standard AFM.
// prettier-ignore
const HELVETICA = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD_FACTOR = 1.1; // Helvetica-Bold is slightly wider; a safe over-estimate.

const charWidth = (ch) => {
  const code = ch.charCodeAt(0);
  return code >= 32 && code <= 126 ? HELVETICA[code - 32] : 1000;
};

export function textWidth(text, size, bold = false) {
  let w = 0;
  for (const ch of String(text)) w += charWidth(ch);
  return (w / 1000) * size * (bold ? BOLD_FACTOR : 1);
}

/** Shortens `text` with "..." so it fits `maxWidth`. */
export function fitText(text, size, maxWidth, bold = false) {
  const s = String(text ?? '');
  if (textWidth(s, size, bold) <= maxWidth) return s;
  let out = s;
  while (out.length && textWidth(`${out}...`, size, bold) > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

// PDF string literal in WinAnsi: escape \ ( ), em dash → 0x97, other non-ASCII → '?'.
function pdfString(text) {
  let out = '';
  for (const ch of String(text)) {
    if (ch === '\\' || ch === '(' || ch === ')') out += `\\${ch}`;
    else if (ch === '—') out += '\\227';
    else if (ch === '·') out += '\\267';
    else {
      const code = ch.charCodeAt(0);
      out += code >= 32 && code <= 126 ? ch : '?';
    }
  }
  return `(${out})`;
}

const rgb = ([r, g, b]) => `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;
const BRAND = [31, 81, 56]; // brand-800
const PISTA = [200, 230, 192]; // brand-200
const ZEBRA = [242, 248, 242]; // brand-50
const TEXT = [30, 41, 59];
const MUTED = [100, 116, 139];

/**
 * Builds a PDF table report and returns it as a Buffer.
 * @param {{ brand: string, title: string, meta: string[], columns: {label: string, width: number}[], rows: string[][], footer: string }} spec
 *   Column widths are in points and should add up to the usable width (515pt).
 */
export function buildTablePdf({ brand, title, meta = [], columns, rows, footer = '' }) {
  const ROW_H = 18;
  const HEAD_H = 22;
  const FONT = 9;
  const pages = [];
  let ops = [];
  let y = 0;

  const text = (x, yy, s, { size = FONT, bold = false, color = TEXT } = {}) =>
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(s)} Tj ET`);
  const rect = (x, yy, w, h, color) => ops.push(`${rgb(color)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);

  const tableHeader = () => {
    rect(MARGIN, y - HEAD_H, PAGE_W - 2 * MARGIN, HEAD_H, PISTA);
    let x = MARGIN;
    for (const c of columns) {
      text(x + 6, y - 15, fitText(c.label, FONT, c.width - 12, true), { bold: true, color: BRAND });
      x += c.width;
    }
    y -= HEAD_H;
  };

  const startPage = (first) => {
    ops = [];
    y = PAGE_H - MARGIN;
    text(MARGIN, y - 14, brand, { size: 16, bold: true, color: BRAND });
    text(MARGIN + textWidth(brand, 16, true) + 10, y - 14, title, { size: 13, bold: true });
    y -= 24;
    if (first) {
      for (const line of meta) {
        text(MARGIN, y - 10, fitText(line, 10, PAGE_W - 2 * MARGIN), { size: 10, color: MUTED });
        y -= 15;
      }
    }
    ops.push(`${rgb(BRAND)} RG 1 w ${MARGIN} ${(y - 4).toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${(y - 4).toFixed(2)} l S`);
    y -= 14;
    tableHeader();
  };

  startPage(true);
  rows.forEach((row, i) => {
    if (y - ROW_H < MARGIN + 24) {
      pages.push(ops);
      startPage(false);
    }
    if (i % 2 === 1) rect(MARGIN, y - ROW_H, PAGE_W - 2 * MARGIN, ROW_H, ZEBRA);
    let x = MARGIN;
    columns.forEach((c, ci) => {
      text(x + 6, y - 12.5, fitText(row[ci], FONT, c.width - 12));
      x += c.width;
    });
    y -= ROW_H;
  });
  pages.push(ops);

  // Footers once the page count is known.
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${MARGIN} ${MARGIN - 14} Td ${pdfString(footer)} Tj ET`);
    p.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${(PAGE_W - MARGIN - textWidth(label, 8)).toFixed(2)} ${MARGIN - 14} Td ${pdfString(label)} Tj ET`);
  });

  // Objects: 1 catalog, 2 pages, 3/4 fonts, then (page, content) pairs.
  const objects = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const content = p.join('\n');
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  });

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

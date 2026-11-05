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

  return assemblePdf(pages, PAGE_W, PAGE_H);
}

/** Turns per-page content streams into a PDF file (Helvetica + Helvetica-Bold, WinAnsi). */
function assemblePdf(pages, pageW, pageH) {
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
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
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

// ---- Monthly calendar (A4 landscape, one page per employee) ----

const A4_LANDSCAPE = { w: 841.89, h: 595.28 }; // 297 × 210 mm
const GRID = [203, 213, 225];
const SUNDAY = [246, 247, 249];
const OUTSIDE = [250, 250, 251];
const HOLIDAY = [237, 233, 254];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * One A4-landscape page per calendar (salaryReportService.buildCalendarMonth),
 * always one page per month: rows shrink to fit 5 or 6 weeks.
 * @param {{ brand: string, title: string, calendars: object[], lines: (cal) => string[], footer: string }} spec
 */
export function buildCalendarPdf({ brand, title, calendars, lines = () => [], footer = '' }) {
  const { w: W, h: H } = A4_LANDSCAPE;
  const M = 28;
  const pages = calendars.map((cal) => {
    const ops = [];
    const text = (x, y, str, { size = 8.5, bold = false, color = TEXT } = {}) =>
      ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(str)} Tj ET`);
    const rect = (x, y, rw, rh, color) => ops.push(`${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${rw.toFixed(2)} ${rh.toFixed(2)} re f`);
    const stroke = (x, y, rw, rh) => ops.push(`${rgb(GRID)} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${rw.toFixed(2)} ${rh.toFixed(2)} re S`);

    // Header: brand + title, month on the right, employee, summary line.
    let y = H - M - 14;
    text(M, y, brand, { size: 16, bold: true, color: BRAND });
    text(M + textWidth(brand, 16, true) + 10, y, title, { size: 13, bold: true });
    const month = cal.monthLabel;
    text(W - M - textWidth(month, 14, true), y, month, { size: 14, bold: true, color: BRAND });
    y -= 19;
    text(M, y, fitText(`${cal.employeeName}${cal.employeeCode ? `  (${cal.employeeCode})` : ''}`, 12, W - 2 * M, true), { size: 12, bold: true });
    for (const line of lines(cal)) {
      y -= 13;
      text(M, y, fitText(line, 8.5, W - 2 * M), { size: 8.5, color: MUTED });
    }
    y -= 10;

    // Weekday header row.
    const colW = (W - 2 * M) / 7;
    const headH = 17;
    rect(M, y - headH, W - 2 * M, headH, PISTA);
    WEEKDAYS.forEach((d, i) => text(M + i * colW + 6, y - 12, d, { size: 9, bold: true, color: BRAND }));
    stroke(M, y - headH, W - 2 * M, headH);
    y -= headH;

    // Weeks: rows share the remaining height above the footer.
    const bottom = M + 14;
    const rowH = (y - bottom) / cal.weeks.length;
    cal.weeks.forEach((week, wi) => {
      const top = y - wi * rowH;
      week.forEach((cell, ci) => {
        const x = M + ci * colW;
        if (!cell) rect(x, top - rowH, colW, rowH, OUTSIDE);
        else if (cell.holiday) rect(x, top - rowH, colW, rowH, HOLIDAY);
        else if (cell.isSunday) rect(x, top - rowH, colW, rowH, SUNDAY);
        stroke(x, top - rowH, colW, rowH);
        if (!cell) return;
        const inner = colW - 12;
        text(x + 6, top - 15, String(cell.day), { size: 12, bold: true });
        const tagText = cell.holiday || (cell.onsite ? 'Onsite Work' : null);
        if (tagText) {
          const tag = fitText(tagText, 7.5, inner - 22, true);
          text(x + colW - 6 - textWidth(tag, 7.5, true), top - 14, tag, { size: 7.5, bold: true, color: cell.holiday ? [91, 33, 182] : [3, 105, 161] });
        }
        let ly = top - 30;
        const line = (str, opts) => {
          if (ly < top - rowH + 4) return;
          text(x + 6, ly, fitText(str, opts?.size || 8.5, inner, opts?.bold), opts);
          ly -= 11.5;
        };
        if (cell.kind === 'record') {
          line(`In: ${cell.checkIn}`);
          line(`Out: ${cell.checkOut || '— (no check-out)'}`, cell.checkOut ? undefined : { color: [180, 83, 9] });
          line(`OT: ${cell.overtime}`, cell.overtimeMinutes > 0 ? { bold: true, color: BRAND } : { color: MUTED });
          if (cell.onsite && cell.holiday) line('Onsite Work', { bold: true, color: [3, 105, 161] });
        } else if (cell.kind === 'status') {
          line(cell.statusLabel, { bold: true });
          line('No check-in', { color: MUTED });
        } else if (cell.kind === 'no-record') {
          line('No record', { color: MUTED });
        }
      });
    });
    return ops;
  });

  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${M} ${M} Td ${pdfString(footer)} Tj ET`);
    p.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${(W - M - textWidth(label, 8)).toFixed(2)} ${M} Td ${pdfString(label)} Tj ET`);
  });
  return assemblePdf(pages, W, H);
}

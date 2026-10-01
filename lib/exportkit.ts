// Turning tables into files in the browser: CSV, Excel (.xlsx) and JSON, and a ZIP of several.
// The .xlsx writer is a small hand-rolled SpreadsheetML package (zipped with fflate), so the page
// does not need a 400 KB spreadsheet library just to save a file.
import { strToU8, zip, type Zippable } from "fflate";

export type Kind = "text" | "int" | "usd" | "price" | "pct" | "date" | "url" | "bool";
export type Cell = string | number | boolean | null | undefined;
export interface Sheet {
  name: string;
  cols: { label: string; kind: Kind }[];
  rows: Cell[][];
}

// ---------------------------------------------------------------- CSV

const csvCell = (v: Cell) => {
  if (v == null) return "";
  const s = typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 CSV with a UTF-8 byte-order mark, so Excel opens Chinese text correctly. */
export function toCsv(sheet: Sheet): string {
  const lines = [sheet.cols.map((c) => csvCell(c.label)).join(",")];
  for (const r of sheet.rows) lines.push(r.map(csvCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- JSON

export function toJson(keys: string[], rows: Cell[][]): string {
  return JSON.stringify(rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? null]))), null, 1);
}

// ---------------------------------------------------------------- XLSX

const xmlEsc = (s: string) =>
  s
    // characters XML 1.0 cannot carry at all
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colName(i: number): string {
  let s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

// style ids in styles.xml below
const STYLE: Record<Kind, number> = { text: 0, url: 0, date: 0, bool: 0, int: 2, usd: 2, price: 3, pct: 4 };

function sheetXml(sh: Sheet): string {
  const out: string[] = [];
  const widths = sh.cols.map((c) => Math.min(48, Math.max(8, [...c.label].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0) + 2)));
  // widen columns to their content (sampled, so huge sheets stay fast)
  const step = Math.max(1, Math.floor(sh.rows.length / 400));
  for (let r = 0; r < sh.rows.length; r += step) {
    sh.rows[r].forEach((v, i) => {
      if (v == null) return;
      const s = typeof v === "number" ? v.toLocaleString("en-US") : String(v);
      const w = [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0) + 2;
      if (w > widths[i]) widths[i] = Math.min(sh.cols[i].kind === "url" ? 30 : 60, w);
    });
  }
  const last = colName(sh.cols.length - 1);
  out.push(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<dimension ref="A1:${last}${sh.rows.length + 1}"/>`,
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
    "<cols>",
    ...widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`),
    "</cols><sheetData>",
  );
  const cell = (ref: string, v: Cell, kind: Kind, header = false): string => {
    if (v == null || v === "") return "";
    if (header) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${xmlEsc(String(v))}</t></is></c>`;
    if (typeof v === "boolean") return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}" s="${STYLE[kind]}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
  };
  out.push(`<row r="1">${sh.cols.map((c, i) => cell(`${colName(i)}1`, c.label, "text", true)).join("")}</row>`);
  const refs = sh.cols.map((_, i) => colName(i));
  for (let r = 0; r < sh.rows.length; r++) {
    const n = r + 2;
    const row = sh.rows[r];
    let s = `<row r="${n}">`;
    for (let i = 0; i < refs.length; i++) s += cell(refs[i] + n, row[i], sh.cols[i].kind);
    out.push(s + "</row>");
  }
  out.push("</sheetData>", `<autoFilter ref="A1:${last}${sh.rows.length + 1}"/>`, "</worksheet>");
  return out.join("");
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00%"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const zipAsync = (files: Zippable, level: 0 | 6 = 6) =>
  new Promise<Uint8Array>((res, rej) => zip(files, { level }, (err, data) => (err ? rej(err) : res(data))));

/** Sheet names: at most 31 characters, none of []:*?/\ and unique within the workbook. */
function sheetName(s: string, used: Set<string>): string {
  let n = s.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${n.slice(0, 28)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

export async function toXlsx(sheets: Sheet[]): Promise<Uint8Array> {
  const used = new Set<string>();
  const names = sheets.map((s) => sheetName(s.name, used));
  const files: Zippable = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets>" +
        // autofilter ranges, so the filter buttons show on the header row
        "<definedNames>" +
        sheets.map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(names[i].replace(/'/g, "''"))}'!$A$1:$${colName(s.cols.length - 1)}$${s.rows.length + 1}</definedName>`).join("") +
        "</definedNames></workbook>",
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  return zipAsync(files);
}

export async function toZip(entries: { name: string; data: string | Uint8Array }[]): Promise<Uint8Array> {
  const files: Zippable = {};
  for (const e of entries) files[e.name] = [typeof e.data === "string" ? strToU8(e.data) : e.data, { level: e.name.endsWith(".xlsx") ? 0 : 6 }];
  return zipAsync(files);
}

// ---------------------------------------------------------------- saving

export function save(data: string | Uint8Array, filename: string, mime: string): void {
  const part: BlobPart = typeof data === "string" ? data : (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  const url = URL.createObjectURL(new Blob([part], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const MIME = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

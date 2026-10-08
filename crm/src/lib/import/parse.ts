// Reads a HubSpot export (CSV, or Excel .xlsx) into a header row and text rows. Runs in the browser
// (so big files never go to the server whole) and in tests. No libraries: CSV by hand, and .xlsx is
// a zip of XML files, opened with the browser's own decompression.

export type Sheet = { headers: string[]; rows: string[][] };

export async function readSpreadsheet(name: string, bytes: Uint8Array): Promise<Sheet> {
  if (/\.xlsx$/i.test(name)) return parseXlsx(bytes);
  if (/\.(csv|txt)$/i.test(name)) return parseCsv(new TextDecoder("utf-8").decode(bytes));
  throw new Error("Use the .xlsx or .csv file HubSpot exports.");
}

function tidy(table: string[][]): Sheet {
  const rows = table.filter((r) => r.some((c) => c.trim() !== ""));
  const [head = [], ...rest] = rows;
  const headers = head.map((h) => h.trim());
  const width = headers.length;
  return { headers, rows: rest.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim())) };
}

// RFC 4180 CSV: quoted fields with commas, quotes ("") and line breaks; comma or semicolon (Excel in
// some regions saves with ";").
export function parseCsv(text: string): Sheet {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); out.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return tidy(out);
}

// ---------- .xlsx ----------

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The files inside a zip, by name (only the ones asked for are unpacked).
async function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That file isn't a readable Excel file. Save it again as .xlsx or .csv.");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const files = new Map<string, string>();
  const decoder = new TextDecoder("utf-8");
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    files.set(name, decoder.decode(method === 0 ? raw : await inflate(raw)));
  }
  return files;
}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (_, e, dec, hex) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" } as Record<string, string>)[e.toLowerCase()]);
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// Excel stores dates as day numbers; a cell is a date when its number format is one.
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
function dateStyles(stylesXml: string | undefined): Set<number> {
  const dates = new Set<number>();
  if (!stylesXml) return dates;
  const custom = new Map([...stylesXml.matchAll(/<numFmt\s[^>]*>/g)].map((m) => [Number(attr(m[0], "numFmtId")), attr(m[0], "formatCode") ?? ""]));
  const xfs = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  [...xfs.matchAll(/<xf\s[^>]*?\/?>/g)].forEach((m, i) => {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    const code = (custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
    if (DATE_FORMAT_IDS.has(id) || /[dy]/i.test(code)) dates.add(i);
  });
  return dates;
}

function excelDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000); // days since 1899-12-30 → Unix time
  const iso = new Date(ms).toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
}

const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function parseXlsx(bytes: Uint8Array): Promise<Sheet> {
  const files = await unzip(bytes, (n) => /^xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(n));
  // The first sheet in the workbook's order.
  const firstId = attr(files.get("xl/workbook.xml")?.match(/<sheet\s[^>]*>/)?.[0] ?? "", "r:id");
  const target = [...(files.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\s[^>]*>/g)]
    .map((m) => m[0]).find((r) => attr(r, "Id") === firstId);
  const sheetPath = target ? `xl/${attr(target, "Target")!.replace(/^\/?xl\//, "")}` : "xl/worksheets/sheet1.xml";
  const sheet = files.get(sheetPath) ?? files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("That Excel file has no sheet KRM can read.");
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const dates = dateStyles(files.get("xl/styles.xml"));
  const table: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = `<c${cell[1]}>`;
      const body = cell[2] ?? "";
      const ref = attr(head, "r");
      const i = ref ? colIndex(ref) : row.length;
      const type = attr(head, "t");
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) {
        const raw = unescapeXml(v);
        value = type !== "str" && dates.has(Number(attr(head, "s") ?? -1)) && raw !== "" ? excelDate(Number(raw)) : raw;
      }
      row[i] = value;
    }
    table.push(Array.from(row, (c) => c ?? ""));
  }
  return tidy(table);
}

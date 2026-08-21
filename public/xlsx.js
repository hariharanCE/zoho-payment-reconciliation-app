// Minimal .xlsx writer — enough of the OOXML spec to emit a real Excel
// workbook with typed cells, no dependency and no build step.
//
// Amounts are written as numbers with a currency format and dates as Excel
// date serials, so totals, sorting and filtering work in Excel. A CSV can't
// do that: everything arrives as text and ₹ figures don't sum.
//
// ZIP entries are STORED (uncompressed). Excel accepts that, and it keeps the
// writer to a CRC32 and a few header records.
//
// Loaded as a plain <script> in the browser and as a module in Node, so the
// same code that ships is the code the tests exercise.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.XlsxWriter = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  const encoder = new TextEncoder();

  // ===============================
  // CRC32 (the ZIP checksum)
  // ===============================
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  // ===============================
  // XML helpers
  // ===============================
  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // Control characters are illegal in XML 1.0 and make Excel refuse the
      // file outright; CRM free-text fields can carry them.
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  }

  function colName(index) {
    let name = "";
    let n = index;
    while (n >= 0) {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    }
    return name;
  }

  // Excel's epoch is 1899-12-30 (the offset absorbs its 1900 leap-year bug).
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  function dateSerial(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return null;
    const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Math.round((utc - EXCEL_EPOCH) / 86400000);
  }

  // ===============================
  // Styles: 0 default, 1 bold header, 2 currency, 3 date
  // ===============================
  const STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##0"/></numFmts>' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    "</fonts>" +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEDE6"/><bgColor indexed="64"/></patternFill></fill>' +
    "</fills>" +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";

  const STYLE = { HEADER: 1, MONEY: 2, DATE: 3 };

  function cellXml(ref, column, value) {
    if (value === null || value === undefined || value === "") {
      return `<c r="${ref}"/>`;
    }
    if (column.type === "number" || column.type === "money") {
      const n = Number(value);
      if (!Number.isFinite(n)) return `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
      const style = column.type === "money" ? ` s="${STYLE.MONEY}"` : "";
      return `<c r="${ref}"${style}><v>${n}</v></c>`;
    }
    if (column.type === "date") {
      const serial = dateSerial(value);
      // Fall through to text when the value isn't a real date — a CRM field
      // holding junk should still be visible in the export, not blanked.
      if (serial !== null) return `<c r="${ref}" s="${STYLE.DATE}"><v>${serial}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  }

  function sheetXml(sheet) {
    const columns = sheet.columns;
    const rows = sheet.rows || [];
    const lastCol = colName(columns.length - 1);
    const lastRow = rows.length + 1;

    const cols =
      "<cols>" +
      columns
        .map(
          (c, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`
        )
        .join("") +
      "</cols>";

    const header =
      '<row r="1">' +
      columns
        .map(
          (c, i) =>
            `<c r="${colName(i)}1" s="${STYLE.HEADER}" t="inlineStr"><is><t>${esc(
              c.header
            )}</t></is></c>`
        )
        .join("") +
      "</row>";

    const body = rows
      .map((row, r) => {
        const cells = columns
          .map((c, i) => cellXml(`${colName(i)}${r + 2}`, c, row[c.key]))
          .join("");
        return `<row r="${r + 2}">${cells}</row>`;
      })
      .join("");

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<dimension ref="A1:${lastCol}${lastRow}"/>` +
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      "</sheetView></sheetViews>" +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      cols +
      `<sheetData>${header}${body}</sheetData>` +
      `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
      "</worksheet>"
    );
  }

  // Excel rejects sheet names with these characters, or over 31 chars.
  function safeSheetName(name, index) {
    const cleaned = String(name || `Sheet${index + 1}`)
      .replace(/[\\\/\?\*\[\]:]/g, " ")
      .trim()
      .slice(0, 31);
    return cleaned || `Sheet${index + 1}`;
  }

  // ===============================
  // ZIP container (stored entries)
  // ===============================
  function zip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;

    const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);

      // A fixed timestamp keeps byte-identical output for identical input.
      const time = 0;
      const date = ((2020 - 1980) << 9) | (1 << 5) | 1;

      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(time), u16(date),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, data);

      central.push({ nameBytes, crc, size: data.length, offset, time, date });
      offset += local.length + nameBytes.length + data.length;
    }

    const centralChunks = [];
    let centralSize = 0;
    for (const entry of central) {
      const header = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(entry.time), u16(entry.date),
        u32(entry.crc), u32(entry.size), u32(entry.size),
        u16(entry.nameBytes.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(entry.offset)
      );
      centralChunks.push(new Uint8Array(header), entry.nameBytes);
      centralSize += header.length + entry.nameBytes.length;
    }

    const end = new Uint8Array(
      [].concat(
        u32(0x06054b50), u16(0), u16(0),
        u16(central.length), u16(central.length),
        u32(centralSize), u32(offset), u16(0)
      )
    );

    const all = chunks.concat(centralChunks, [end]);
    const total = all.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const part of all) {
      out.set(part, pos);
      pos += part.length;
    }
    return out;
  }

  // ===============================
  // Public API
  // ===============================
  function buildXlsx(sheets) {
    if (!sheets || sheets.length === 0) throw new Error("buildXlsx needs at least one sheet");
    const named = sheets.map((s, i) => ({ ...s, name: safeSheetName(s.name, i) }));

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      named
        .map(
          (s, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join("") +
      "</Types>";

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>";

    const workbook =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      named
        .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("") +
      "</sheets></workbook>";

    const workbookRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      named
        .map(
          (s, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join("") +
      `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      "</Relationships>";

    const files = [
      { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
      { name: "_rels/.rels", data: encoder.encode(rootRels) },
      { name: "xl/workbook.xml", data: encoder.encode(workbook) },
      { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
      { name: "xl/styles.xml", data: encoder.encode(STYLES_XML) },
      ...named.map((s, i) => ({
        name: `xl/worksheets/sheet${i + 1}.xml`,
        data: encoder.encode(sheetXml(s)),
      })),
    ];

    return zip(files);
  }

  return { buildXlsx, crc32, dateSerial, colName, safeSheetName };
});

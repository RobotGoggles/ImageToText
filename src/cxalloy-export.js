// CxAlloy export: turning editor text into import rows and writing the .xlsx file.

// SheetJS stopped publishing to npm after 0.18.5 (which has known CVEs); the
// maintained builds are served from the SheetJS CDN.
const sheetJsUrl = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

export const cxAlloyColumns = ["Line Type", "Description"];
export const cxAlloyLineType = "Information";

let sheetJsModulePromise = null;

/**
 * Splits text into one preview row per non-empty line.
 * Offsets (start/end) point into the text with \r\n normalized to \n.
 */
export function buildCxAlloyPreviewRows(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const rows = [];
  let cursor = 0;

  while (cursor <= normalized.length) {
    const lineBreakIndex = normalized.indexOf("\n", cursor);
    const lineEnd = lineBreakIndex === -1 ? normalized.length : lineBreakIndex;
    const line = normalized.slice(cursor, lineEnd);

    if (line.trim()) {
      const start = cursor + (line.length - line.trimStart().length);
      const end = lineEnd - (line.length - line.trimEnd().length);
      rows.push({
        key: `cx-row-${rows.length}`,
        text: normalized.slice(start, end),
        start,
        end,
      });
    }

    if (lineBreakIndex === -1) {
      break;
    }

    cursor = lineBreakIndex + 1;
  }

  return rows;
}

/**
 * @param {string} text
 * @param {Set<string>} [removedKeys] preview rows the user removed from the export
 */
export function buildCxAlloyRows(text, removedKeys = new Set()) {
  return buildCxAlloyPreviewRows(text)
    .filter((row) => !removedKeys.has(row.key))
    .map((row) => ({
      [cxAlloyColumns[0]]: cxAlloyLineType,
      [cxAlloyColumns[1]]: row.text,
    }));
}

export function getDefaultCxAlloyExportName(sourceFileName) {
  const baseName = String(sourceFileName || "").replace(/\.[^.]+$/, "") || "extracted-text";
  return `${baseName}-cxalloy.xlsx`;
}

export function normalizeExportFileName(fileName, fallbackFileName) {
  const candidate = String(fileName || "").trim() || fallbackFileName;
  const sanitized = candidate.replace(/[\\/:*?"<>|]+/g, "-");
  return /\.xlsx$/i.test(sanitized) ? sanitized : `${sanitized}.xlsx`;
}

export async function writeCxAlloyWorkbook(rows, fileName) {
  const XLSX = await loadSheetJs();
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: cxAlloyColumns });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "CxAlloy Import");
  XLSX.writeFile(workbook, fileName);
}

async function loadSheetJs() {
  if (!sheetJsModulePromise) {
    sheetJsModulePromise = import(sheetJsUrl).catch((error) => {
      sheetJsModulePromise = null;
      throw error;
    });
  }

  const module = await sheetJsModulePromise;
  return module?.utils ? module : module.default;
}

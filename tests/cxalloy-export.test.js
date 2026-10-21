import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCxAlloyPreviewRows,
  buildCxAlloyRows,
  getDefaultCxAlloyExportName,
  normalizeExportFileName,
} from "../src/cxalloy-export.js";

test("one row per non-empty line, with offsets into the text", () => {
  const text = "  First  \n\nSecond\n   \nThird";
  const rows = buildCxAlloyPreviewRows(text);
  assert.deepEqual(
    rows.map((row) => row.text),
    ["First", "Second", "Third"],
  );
  for (const row of rows) {
    assert.equal(text.slice(row.start, row.end), row.text);
  }
  assert.deepEqual(
    rows.map((row) => row.key),
    ["cx-row-0", "cx-row-1", "cx-row-2"],
  );
});

test("export rows skip rows the user removed", () => {
  const rows = buildCxAlloyRows("A\nB\nC", new Set(["cx-row-1"]));
  assert.deepEqual(rows, [
    { "Line Type": "Information", Description: "A" },
    { "Line Type": "Information", Description: "C" },
  ]);
});

test("empty text produces no rows", () => {
  assert.deepEqual(buildCxAlloyRows("  \n \n"), []);
});

test("default export name is based on the source file", () => {
  assert.equal(getDefaultCxAlloyExportName("Level 2 FPT.pdf"), "Level 2 FPT-cxalloy.xlsx");
  assert.equal(getDefaultCxAlloyExportName(undefined), "extracted-text-cxalloy.xlsx");
});

test("export file names are sanitized and get .xlsx", () => {
  assert.equal(normalizeExportFileName("AHU/1: test", "x.xlsx"), "AHU-1- test.xlsx");
  assert.equal(normalizeExportFileName("report.XLSX", "x.xlsx"), "report.XLSX");
  assert.equal(normalizeExportFileName("   ", "fallback.xlsx"), "fallback.xlsx");
});

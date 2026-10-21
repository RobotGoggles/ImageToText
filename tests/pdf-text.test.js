import { test } from "node:test";
import assert from "node:assert/strict";
import { joinPdfTextItems } from "../src/pdf-text.js";

const item = (str, y, { hasEOL = false, height = 10 } = {}) => ({
  str,
  hasEOL,
  height,
  transform: [height, 0, 0, height, 72, y],
});

test("keeps line breaks from hasEOL", () => {
  const items = [item("Line one", 700, { hasEOL: true }), item("Line two", 688, { hasEOL: true }), item("Line three", 676)];
  assert.equal(joinPdfTextItems(items), "Line one\nLine two\nLine three");
});

test("joins items on the same line without adding spaces", () => {
  const items = [item("Supply ", 700), item("air", 700, { hasEOL: true }), item("Return air", 688)];
  assert.equal(joinPdfTextItems(items), "Supply air\nReturn air");
});

test("a large vertical gap becomes a paragraph break", () => {
  const items = [
    item("Heading", 700, { hasEOL: true }),
    item("Body line one", 660, { hasEOL: true }),
    item("Body line two", 648),
  ];
  assert.equal(joinPdfTextItems(items), "Heading\n\nBody line one\nBody line two");
});

test("moving back up the page (a new column) is a paragraph break", () => {
  const items = [item("Column one end", 100, { hasEOL: true }), item("Column two top", 700)];
  assert.equal(joinPdfTextItems(items), "Column one end\n\nColumn two top");
});

test("empty line items are skipped", () => {
  const items = [item("A", 700, { hasEOL: true }), { str: "", hasEOL: true }, item("B", 688)];
  assert.equal(joinPdfTextItems(items), "A\nB");
});

test("handles missing or empty input", () => {
  assert.equal(joinPdfTextItems([]), "");
  assert.equal(joinPdfTextItems(undefined), "");
});

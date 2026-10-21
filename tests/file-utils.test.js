import { test } from "node:test";
import assert from "node:assert/strict";
import { isSupportedFile, isPdfFile, getFileExtension, formatBytes, isMacPlatform } from "../src/file-utils.js";

test("recognizes PDFs and images by type or extension", () => {
  assert.equal(isPdfFile({ type: "application/pdf", name: "x" }), true);
  assert.equal(isPdfFile({ type: "", name: "Report.PDF" }), true);
  assert.equal(isSupportedFile({ type: "image/png", name: "shot" }), true);
  assert.equal(isSupportedFile({ type: "", name: "scan.tiff" }), true);
  assert.equal(isSupportedFile({ type: "text/plain", name: "notes.txt" }), false);
});

test("file extension handles names without a dot", () => {
  assert.equal(getFileExtension("archive.tar.GZ"), "gz");
  assert.equal(getFileExtension("README"), "");
});

test("formatBytes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(25 * 1024 * 1024), "25 MB");
});

test("isMacPlatform", () => {
  assert.equal(isMacPlatform("MacIntel"), true);
  assert.equal(isMacPlatform("Win32"), false);
});

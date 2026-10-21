import { test } from "node:test";
import assert from "node:assert/strict";
import {
  utf8ByteLength,
  splitTextForProofreading,
  groupProofreadMatches,
  collectProofreadHighlights,
  applyReplacementToMatches,
  rebuildGroupAfterEdits,
  runLanguageToolChecks,
  languageToolLanguageFor,
  getProofreadingErrorMessage,
} from "../src/proofreading.js";

const match = (text, offset, length, extra = {}) => ({
  offset,
  length,
  originalText: text.slice(offset, offset + length),
  message: "Possible typo",
  rule: { id: "SPELL" },
  replacements: [{ value: "the" }],
  ...extra,
});

test("utf8ByteLength counts multi-byte characters", () => {
  assert.equal(utf8ByteLength("abc"), 3);
  assert.equal(utf8ByteLength("é"), 2);
  assert.equal(utf8ByteLength("°F"), 3);
  assert.equal(utf8ByteLength("😀"), 4);
});

test("chunks stay under the byte limit and cover the text exactly", () => {
  const paragraph = "Température de l'air soufflé vérifiée. ".repeat(40);
  const text = [paragraph, paragraph, paragraph].join("\n\n");
  const chunks = splitTextForProofreading(text, 1000);

  assert.ok(chunks.length > 3);
  for (const chunk of chunks) {
    assert.ok(utf8ByteLength(chunk.text) <= 1000, "chunk over byte limit");
    assert.equal(text.slice(chunk.offset, chunk.offset + chunk.text.length), chunk.text);
  }
  assert.equal(chunks.map((chunk) => chunk.text).join(""), text);
});

test("long chunks split on whitespace rather than mid-word", () => {
  const text = "word ".repeat(100);
  const chunks = splitTextForProofreading(text, 64);
  for (const chunk of chunks.slice(0, -1)) {
    assert.ok(chunk.text.endsWith(" "), `chunk ends mid-word: ${JSON.stringify(chunk.text)}`);
  }
});

test("small text is a single chunk", () => {
  assert.deepEqual(splitTextForProofreading("Hello\n\nWorld", 1000), [{ text: "Hello\n\nWorld", offset: 0 }]);
});

test("highlights come from match offsets, not every occurrence of the word", () => {
  // "teh" appears three times, but LanguageTool only flagged the first and last.
  const text = "teh fan, tehran office, teh damper";
  const groups = groupProofreadMatches([match(text, 0, 3), match(text, 24, 3)]);
  assert.equal(groups.length, 1);

  const highlights = collectProofreadHighlights(groups, text.length);
  assert.deepEqual(
    highlights.map((highlight) => [highlight.start, highlight.end]),
    [
      [0, 3],
      [24, 27],
    ],
  );
});

test("applying a fix changes exactly the highlighted ranges", () => {
  const text = "teh fan, tehran office, teh damper";
  const [group] = groupProofreadMatches([match(text, 0, 3), match(text, 24, 3)]);
  const { text: fixed } = applyReplacementToMatches(text, group.matches, "the");
  assert.equal(fixed, "the fan, tehran office, the damper");
});

test("other matches shift correctly after a fix changes length", () => {
  const text = "recieve teh valve and teh damper";
  const groups = groupProofreadMatches([
    match(text, 0, 7, { replacements: [{ value: "receive" }] }),
    match(text, 8, 3),
    match(text, 22, 3),
  ]);
  const recieve = groups.find((group) => group.key === "recieve");
  const teh = groups.find((group) => group.key === "teh");

  const { text: afterFirst, edits } = applyReplacementToMatches(text, recieve.matches, "receive");
  const shifted = rebuildGroupAfterEdits(teh, edits, afterFirst);
  const { text: afterSecond } = applyReplacementToMatches(afterFirst, shifted.matches, "the");
  assert.equal(afterSecond, "receive the valve and the damper");
});

test("deleting via an empty replacement works", () => {
  const text = "the the valve";
  const { text: fixed } = applyReplacementToMatches(text, [match(text, 3, 4)], "");
  assert.equal(fixed, "the valve");
});

test("runLanguageToolChecks sends the chosen language and maps offsets across chunks", async () => {
  const text = `${"a ".repeat(10000)}\n\nteh end`;
  const requests = [];
  const fakeFetch = async (url, { body }) => {
    const chunkText = body.get("text");
    requests.push({ language: body.get("language"), length: chunkText.length });
    const index = chunkText.indexOf("teh");
    const matches = index === -1 ? [] : [{ offset: index, length: 3, message: "Typo", replacements: [{ value: "the" }] }];
    return { ok: true, json: async () => ({ matches }) };
  };

  const matches = await runLanguageToolChecks(text, { language: "en-US", fetchImpl: fakeFetch });
  assert.ok(requests.length >= 2, "expected the text to be split into chunks");
  assert.ok(requests.every((request) => request.language === "en-US"));
  assert.equal(matches.length, 1);
  assert.equal(text.slice(matches[0].offset, matches[0].offset + 3), "teh");
});

test("language mapping and error messages", () => {
  assert.equal(languageToolLanguageFor("eng"), "en-US");
  assert.equal(languageToolLanguageFor("deu"), "de-DE");
  assert.equal(languageToolLanguageFor("xyz"), "auto");
  assert.match(getProofreadingErrorMessage(new Error("LanguageTool request failed with status 429.")), /limit/);
  assert.match(getProofreadingErrorMessage(new Error("LanguageTool request failed with status 413.")), /too long/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatExtractedText,
  preserveParagraphs,
  cleanCopyText,
  sentenceCaseParagraph,
  shouldAutoFixCapsParagraph,
} from "../src/text-cleanup.js";

test("preserveParagraphs joins wrapped lines and keeps paragraph breaks", () => {
  const input = "First line\nsecond line\n\n\n\nNew paragraph  here";
  assert.equal(preserveParagraphs(input), "First line second line\n\nNew paragraph here");
});

test("preserveParagraphs re-joins words hyphenated across lines", () => {
  assert.equal(preserveParagraphs("commis-\nsioning report"), "commissioning report");
});

test("raw format only trims", () => {
  assert.equal(formatExtractedText("  a\nb  ", "raw"), "a\nb");
});

test("clean format collapses extra spacing", () => {
  assert.equal(cleanCopyText("a   b\n\n\n\nc"), "a b\n\nc");
});

test("caps fix only applies to mostly-uppercase paragraphs", () => {
  assert.equal(shouldAutoFixCapsParagraph("VERIFY THE DAMPER OPENS"), true);
  assert.equal(shouldAutoFixCapsParagraph("Verify the damper opens"), false);
  assert.equal(shouldAutoFixCapsParagraph("OK"), false);
});

test("sentence case keeps commissioning acronyms uppercase", () => {
  assert.equal(
    sentenceCaseParagraph("VERIFY THE HVAC SYSTEM AND AHU PROVIDE DESIGN CFM."),
    "Verify the HVAC system and AHU provide design CFM.",
  );
});

test("sentence case leaves equipment tags and ratings untouched", () => {
  assert.equal(
    sentenceCaseParagraph("CONFIRM AHU-1 AND VAV-2-14 ARE ON THE 480V/3PH PANEL."),
    "Confirm AHU-1 and VAV-2-14 are on the 480V/3PH panel.",
  );
});

test("sentence case keeps acronyms joined by slashes", () => {
  assert.equal(sentenceCaseParagraph("CHECK RTU/DOAS SEQUENCE"), "Check RTU/DOAS sequence");
});

test("ordinary two-letter and common words are lowercased", () => {
  assert.equal(
    sentenceCaseParagraph("IF THE FAN IS UP, WHO IS RESPONSIBLE? PUT IT ON THE LIST."),
    "If the fan is up, who is responsible? Put it on the list.",
  );
});

test("sentence starts after quotes or brackets are capitalized", () => {
  assert.equal(sentenceCaseParagraph("DONE. (NEXT STEP) FOLLOWS."), "Done. (Next step) follows.");
});

test("formatExtractedText applies caps fix when enabled", () => {
  const raw = "TEST THE OA DAMPER\nAT MINIMUM POSITION.\n\nNormal paragraph stays.";
  assert.equal(
    formatExtractedText(raw, "paragraphs", { autoFixCaps: true }),
    "Test the OA damper at minimum position.\n\nNormal paragraph stays.",
  );
  assert.equal(
    formatExtractedText(raw, "paragraphs", { autoFixCaps: false }),
    "TEST THE OA DAMPER AT MINIMUM POSITION.\n\nNormal paragraph stays.",
  );
});

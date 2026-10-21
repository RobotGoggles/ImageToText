// Spell and grammar checking through the public LanguageTool API.
// Everything except checkTextChunk / runLanguageToolChecks is pure and unit tested.

export const languageToolEndpoint = "https://api.languagetool.org/v2/check";

// The free API accepts up to 20 KB of text per request. Stay under that in UTF-8 bytes,
// not characters, so accented or symbol-heavy text doesn't get rejected.
export const proofreadChunkByteLimit = 15000;

const languageToolLanguages = {
  eng: "en-US",
  spa: "es",
  fra: "fr",
  deu: "de-DE",
  ita: "it",
  por: "pt-BR",
};

const contextRadius = 42;

/** Maps the app's document-language setting (Tesseract codes) to a LanguageTool code. */
export function languageToolLanguageFor(documentLanguage) {
  return languageToolLanguages[documentLanguage] || "auto";
}

export function utf8ByteLength(text) {
  let bytes = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }

  return bytes;
}

/**
 * Splits text into chunks of at most maxBytes UTF-8 bytes, preferring paragraph
 * boundaries, then whitespace. Each chunk records its character offset in the text.
 */
export function splitTextForProofreading(text, maxBytes = proofreadChunkByteLimit) {
  const parts = String(text || "").split(/(\n{2,})/);
  const chunks = [];
  let current = "";
  let currentBytes = 0;
  let currentOffset = 0;
  let position = 0;

  const flush = () => {
    if (current) {
      chunks.push({ text: current, offset: currentOffset });
    }

    current = "";
    currentBytes = 0;
  };

  for (const part of parts) {
    if (!part) {
      continue;
    }

    const partBytes = utf8ByteLength(part);

    if (partBytes > maxBytes) {
      flush();
      for (const piece of splitLongText(part, maxBytes)) {
        chunks.push({ text: piece.text, offset: position + piece.offset });
      }

      position += part.length;
      continue;
    }

    if (current && currentBytes + partBytes > maxBytes) {
      flush();
    }

    if (!current) {
      currentOffset = position;
    }

    current += part;
    currentBytes += partBytes;
    position += part.length;
  }

  flush();
  return chunks;
}

function splitLongText(text, maxBytes) {
  const pieces = [];
  let start = 0;

  while (start < text.length) {
    let end = findByteLimitIndex(text, start, maxBytes);
    if (end < text.length) {
      const lastWhitespace = findLastWhitespace(text, start, end);
      if (lastWhitespace > start + (end - start) / 2) {
        end = lastWhitespace + 1;
      }
    }

    pieces.push({ text: text.slice(start, end), offset: start });
    start = end;
  }

  return pieces;
}

function findByteLimitIndex(text, start, maxBytes) {
  let bytes = 0;
  let index = start;

  while (index < text.length) {
    const codePoint = text.codePointAt(index);
    const width = codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
    if (bytes + width > maxBytes) {
      break;
    }

    bytes += width;
    index += codePoint > 0xffff ? 2 : 1;
  }

  return Math.max(index, start + 1);
}

function findLastWhitespace(text, start, end) {
  for (let index = end - 1; index > start; index -= 1) {
    if (/\s/.test(text[index])) {
      return index;
    }
  }

  return -1;
}

export function buildContextText(text, offset, length) {
  return {
    before: text.slice(Math.max(0, offset - contextRadius), offset),
    matched: text.slice(offset, offset + length),
    after: text.slice(offset + length, offset + length + contextRadius),
  };
}

export function dedupeProofreadMatches(matches) {
  const seen = new Set();
  return matches.filter((match) => {
    const replacementValues = (match.replacements || []).slice(0, 3).map((item) => item.value || "").join("|");
    const key = [match.rule?.id || "rule", match.offset, match.length, match.message || "", replacementValues].join(":");
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function proofreadGroupKey(match) {
  const text = (match.originalText || "").trim();
  if (text) {
    return text;
  }

  return `whitespace:${match.rule?.id || "rule"}:${match.message || ""}`;
}

/** Groups matches that flag the same text so one fix can apply to every occurrence. */
export function groupProofreadMatches(matches) {
  const groups = new Map();

  for (const match of matches) {
    const key = proofreadGroupKey(match);
    const entry = { ...match, replacements: (match.replacements || []).slice(0, 3) };
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        originalText: entry.originalText,
        message: entry.message,
        rule: entry.rule,
        replacements: entry.replacements.slice(),
        matches: [entry],
      });
      continue;
    }

    existing.matches.push(entry);
    existing.message ||= entry.message;
    existing.rule ||= entry.rule;
    for (const replacement of entry.replacements) {
      if (!existing.replacements.some((item) => item.value === replacement.value)) {
        existing.replacements.push(replacement);
      }
    }
  }

  return Array.from(groups.values()).sort((left, right) => left.matches[0].offset - right.matches[0].offset);
}

/**
 * Highlight ranges for the given groups, taken from LanguageTool's own match offsets
 * so that what is highlighted is exactly what "Apply" will change.
 */
export function collectProofreadHighlights(groups, textLength = Infinity) {
  const highlights = [];

  for (const group of groups) {
    for (const match of group.matches) {
      const start = match.offset;
      const end = match.offset + match.length;
      if (match.length > 0 && start >= 0 && end <= textLength) {
        highlights.push({ start, end, key: group.key });
      }
    }
  }

  highlights.sort((left, right) => left.start - right.start || right.end - left.end);

  const merged = [];
  let lastEnd = -1;
  for (const highlight of highlights) {
    if (highlight.start >= lastEnd) {
      merged.push(highlight);
      lastEnd = highlight.end;
    }
  }

  return merged;
}

/**
 * Replaces every match in the text with `replacement`.
 * Returns the new text plus the edits (in original offsets) for shifting other matches.
 */
export function applyReplacementToMatches(text, matches, replacement) {
  const descending = [...matches].sort((left, right) => right.offset - left.offset);
  let nextText = text;
  const edits = [];

  for (const match of descending) {
    edits.push({
      start: match.offset,
      end: match.offset + match.length,
      delta: replacement.length - match.length,
    });
    nextText = nextText.slice(0, match.offset) + replacement + nextText.slice(match.offset + match.length);
  }

  edits.sort((left, right) => left.start - right.start);
  return { text: nextText, edits };
}

export function shiftOffsetByEdits(offset, edits) {
  let shifted = offset;
  for (const edit of edits) {
    if (offset >= edit.end) {
      shifted += edit.delta;
    }
  }

  return shifted;
}

export function rebuildGroupAfterEdits(group, edits, currentText) {
  const matches = group.matches.map((match) => {
    const offset = shiftOffsetByEdits(match.offset, edits);
    return { ...match, offset, contextText: buildContextText(currentText, offset, match.length) };
  });

  return {
    ...group,
    matches,
    originalText: matches[0] ? currentText.slice(matches[0].offset, matches[0].offset + matches[0].length) : group.originalText,
  };
}

export async function checkTextChunk(text, language, fetchImpl = fetch) {
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("language", language);
  body.set("enabledOnly", "false");

  const response = await fetchImpl(languageToolEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });

  if (!response.ok) {
    throw new Error(`LanguageTool request failed with status ${response.status}.`);
  }

  const data = await response.json();
  return Array.isArray(data?.matches) ? data.matches : [];
}

/**
 * Checks the whole text chunk by chunk and returns matches with absolute offsets.
 * @param {{ language: string, isCancelled?: () => boolean, fetchImpl?: typeof fetch }} options
 */
export async function runLanguageToolChecks(text, { language, isCancelled = () => false, fetchImpl = fetch }) {
  const matches = [];

  for (const chunk of splitTextForProofreading(text)) {
    if (isCancelled()) {
      return [];
    }

    const chunkMatches = await checkTextChunk(chunk.text, language, fetchImpl);
    for (const match of chunkMatches) {
      const offset = match.offset + chunk.offset;
      matches.push({
        ...match,
        offset,
        originalText: text.slice(offset, offset + match.length),
        contextText: buildContextText(text, offset, match.length),
      });
    }
  }

  matches.sort((left, right) => left.offset - right.offset || left.length - right.length);
  return dedupeProofreadMatches(matches);
}

export function getProofreadingErrorMessage(error) {
  const message = error?.message || "";
  if (/status 429/.test(message)) {
    return "LanguageTool's free limit was reached. Wait a minute, then turn export preview off and on again.";
  }

  if (/status 413|too large|payload/i.test(message)) {
    return "The text is too long for LanguageTool. Try checking a smaller section.";
  }

  if (/fetch|network|load/i.test(message)) {
    return "LanguageTool could not be reached. Check your connection and try again.";
  }

  return "Spell check failed. Please try again.";
}

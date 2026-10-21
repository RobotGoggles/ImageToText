// Turns PDF.js text-content items into plain text that keeps the PDF's line breaks.
// Pure function, so it can be unit tested without PDF.js.

// A vertical gap bigger than this many line heights is treated as a paragraph break.
const paragraphGapFactor = 1.75;

/**
 * @param {Array<{ str: string, hasEOL?: boolean, height?: number, transform?: number[] }>} items
 * @returns {string} lines separated by "\n", paragraphs separated by "\n\n"
 */
export function joinPdfTextItems(items) {
  const lines = collectLines(items);
  let text = "";

  lines.forEach((line, index) => {
    if (index > 0) {
      text += isParagraphBreak(lines[index - 1], line) ? "\n\n" : "\n";
    }

    text += line.text;
  });

  return text;
}

function collectLines(items) {
  const lines = [];
  let current = createLine();

  const pushCurrent = () => {
    const trimmed = current.text.replace(/\s+$/u, "");
    if (trimmed.trim()) {
      lines.push({ ...current, text: trimmed });
    }

    current = createLine();
  };

  for (const item of items || []) {
    const str = typeof item?.str === "string" ? item.str : "";

    if (current.y === null && str.trim()) {
      current.y = getItemY(item);
      current.height = getItemHeight(item);
    } else if (str.trim()) {
      current.height = Math.max(current.height, getItemHeight(item));
    }

    current.text += str;

    if (item?.hasEOL) {
      pushCurrent();
    }
  }

  pushCurrent();
  return lines;
}

function createLine() {
  return { text: "", y: null, height: 0 };
}

function isParagraphBreak(previous, current) {
  if (previous.y === null || current.y === null) {
    return false;
  }

  // PDF coordinates grow upward, so the next line down has a smaller y.
  const gap = previous.y - current.y;
  if (gap < 0) {
    // Moving back up the page means a new column or region.
    return true;
  }

  const lineHeight = Math.max(previous.height, current.height);
  return lineHeight > 0 && gap > lineHeight * paragraphGapFactor;
}

function getItemY(item) {
  return Array.isArray(item?.transform) && Number.isFinite(item.transform[5]) ? item.transform[5] : null;
}

function getItemHeight(item) {
  if (Number.isFinite(item?.height) && item.height > 0) {
    return item.height;
  }

  return Array.isArray(item?.transform) && Number.isFinite(item.transform[3]) ? Math.abs(item.transform[3]) : 0;
}

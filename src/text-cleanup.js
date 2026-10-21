// Pure text cleanup helpers. No DOM access, so these can be unit tested in Node.

// Acronyms that stay uppercase when an ALL CAPS paragraph is converted to sentence case.
// Words that are also ordinary English words (WHO, PUT, POST, REST, ...) are deliberately
// left out so "WHO IS RESPONSIBLE" becomes "Who is responsible", not "WHO is responsible".
export const acronymWhitelist = new Set([
  // General / technical
  "AI", "API", "ASAP", "CLI", "CPU", "CSS", "CSV", "DNS", "ETA", "EU", "FAQ", "FYI",
  "GPU", "GUI", "HTML", "HTTP", "HTTPS", "ID", "IP", "ISBN", "JPEG", "JSON", "LED",
  "LLM", "ML", "MPEG", "OCR", "PDF", "PHP", "PVC", "RAM", "RGB", "ROM", "SKU", "SMTP",
  "SQL", "SSH", "SFTP", "SVG", "TBD", "TCP", "TLS", "UDP", "UI", "UK", "URL", "URI",
  "USA", "USB", "UUID", "UX", "VPN", "XML",

  // Commissioning / MEP equipment and systems
  "HVAC", "MEP", "AHU", "RTU", "VAV", "VFD", "FCU", "DOAS", "ERV", "HRV", "MAU",
  "CRAC", "CRAH", "BAS", "BMS", "EMS", "DDC", "PLC", "MCC", "ATS", "UPS", "GFCI",
  "AFD", "EF", "SF", "RF", "DX",

  // Air and water streams
  "OA", "SA", "RA", "EA", "MA", "CHW", "CHWS", "CHWR", "HW", "HWS", "HWR", "CW",
  "CWS", "CWR", "DHW",

  // Commissioning process documents
  "CX", "OPR", "BOD", "FPT", "PFC", "TAB", "RFI", "ASI", "CCD",

  // Units and ratings
  "CFM", "GPM", "PSI", "PSIG", "BTU", "MBH", "KW", "KWH", "HP", "FLA", "MCA", "MOCP",
  "VAC", "VDC", "RPM",

  // Codes and standards bodies
  "ASHRAE", "NFPA", "NEC", "NEMA", "IBC", "IMC", "UL", "OSHA", "LEED",
]);

const allCapsRatioThreshold = 0.72;
const minimumLettersForCapsFix = 8;

/**
 * Formats raw extracted text for the editor.
 * @param {string} rawText
 * @param {"raw" | "paragraphs" | "clean"} format
 * @param {{ autoFixCaps?: boolean }} options
 */
export function formatExtractedText(rawText, format, options = {}) {
  const text = String(rawText || "").trim();
  if (format === "raw") {
    return text;
  }

  if (format === "clean") {
    return cleanCopyText(text, options);
  }

  return preserveParagraphs(text, options);
}

export function cleanCopyText(text, options = {}) {
  return preserveParagraphs(text, options)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function preserveParagraphs(text, options = {}) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/-\n(?=\p{L})/gu, "")
    .replace(/\n{3,}/g, "\n\n");

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const cleanedParagraph = paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/[ \t]{2,}/g, " ");

      return options.autoFixCaps ? maybeSentenceCaseParagraph(cleanedParagraph) : cleanedParagraph;
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function maybeSentenceCaseParagraph(paragraph) {
  return shouldAutoFixCapsParagraph(paragraph) ? sentenceCaseParagraph(paragraph) : paragraph;
}

export function shouldAutoFixCapsParagraph(paragraph) {
  const letters = paragraph.match(/\p{L}/gu) || [];
  if (letters.length < minimumLettersForCapsFix) {
    return false;
  }

  const uppercaseLetters = letters.filter((letter) => letter === letter.toUpperCase()).length;
  return uppercaseLetters / letters.length >= allCapsRatioThreshold;
}

/**
 * Converts an ALL CAPS paragraph to sentence case while keeping:
 * - known acronyms (HVAC, AHU, CFM, ...) uppercase, including inside "AHU/RTU"
 * - any token that contains a digit exactly as written, so equipment tags and
 *   ratings like "AHU-1", "VAV-2-14", "480V" and "3PH" are untouched.
 */
export function sentenceCaseParagraph(paragraph) {
  const tokens = paragraph.split(/(\s+)/);
  const converted = tokens.map((token) => {
    if (!token || /^\s+$/.test(token) || /\d/.test(token)) {
      return token;
    }

    return token.replace(/\p{L}+/gu, (word) => (isLikelyAcronymToken(word) ? word : word.toLowerCase()));
  });

  return capitalizeSentenceStarts(converted.join(""));
}

function capitalizeSentenceStarts(text) {
  return text.replace(/(^|[.!?]\s+)([^\s\p{L}]*)(\p{Ll})/gu, (match, prefix, punctuation, letter) => {
    return `${prefix}${punctuation}${letter.toUpperCase()}`;
  });
}

export function isLikelyAcronymToken(token) {
  return token === token.toUpperCase() && acronymWhitelist.has(token);
}

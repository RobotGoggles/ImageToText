import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const fileInput = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const dropzoneShell = document.querySelector("#dropzoneShell");
const clearUploadButton = document.querySelector("#clearUploadButton");
const themeToggle = document.querySelector("#themeToggle");
const bugReportButton = document.querySelector("#bugReportButton");
const copyButton = document.querySelector("#copyButton");
const exportCxAlloyButton = document.querySelector("#exportCxAlloyButton");
const downloadButton = document.querySelector("#downloadButton");
const proofreadButton = document.querySelector("#proofreadButton");
const proofreadStatus = document.querySelector("#proofreadStatus");
const proofreadList = document.querySelector("#proofreadList");
const languageSelect = document.querySelector("#languageSelect");
const formatSelect = document.querySelector("#formatSelect");
const embeddedTextToggle = document.querySelector("#embeddedTextToggle");
const autoFixCapsToggle = document.querySelector("#autoFixCapsToggle");
const showParagraphSeparatorsToggle = document.querySelector("#showParagraphSeparatorsToggle");
const dropzonePreview = document.querySelector("#dropzonePreview");
const outputEditor = document.querySelector(".output-editor");
const outputMirror = document.querySelector("#outputMirror");
const outputText = document.querySelector("#outputText");
const proofreadPanel = document.querySelector(".proofread-panel");
const fileStatus = document.querySelector("#fileStatus");
const pageCount = document.querySelector("#pageCount");
const textStats = document.querySelector("#textStats");
const proofreadModeIndicator = document.querySelector("#proofreadModeIndicator");
const buttonLabel = document.querySelector("#buttonLabel");
const buttonProgress = document.querySelector("#buttonProgress");
const extractStatus = document.querySelector("#extractStatus");
const clipboardShortcutText = document.querySelector("#clipboardShortcutText");

const state = {
  file: null,
  renderedPages: [],
  extractedPages: [],
  isProcessing: false,
  exportPreview: {
    dismissedKeys: new Set(),
  },
  proofread: {
    requestId: 0,
    sourceText: "",
    matches: [],
    groups: [],
    dismissedKeys: new Set(),
    isChecking: false,
    isApplyingReplacement: false,
    isStale: false,
    activeKey: "",
    lastStatus: "",
    isEnabled: false,
  },
};

let isSyncingOutputScroll = false;
let outputScrollTop = 0;
let outputScrollLeft = 0;
let outputScrollRestoreFrame = 0;

let tesseractModulePromise = null;

const tesseractOptions = {
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js",
  langPath: "https://tessdata.projectnaptha.com/4.0.0",
};

const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/x-png",
]);

const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"]);
const languageToolEndpoint = "https://api.languagetool.org/v2/check";
const proofreadChunkLimit = 16000;
const acronymWhitelist = new Set([
  "AI",
  "API",
  "ASAP",
  "CIA",
  "CLI",
  "CPU",
  "CSS",
  "CSV",
  "DNS",
  "ETA",
  "EU",
  "FAQ",
  "FBI",
  "FYI",
  "GPU",
  "GUI",
  "HTML",
  "HTTP",
  "HTTPS",
  "ID",
  "IP",
  "ISBN",
  "JPEG",
  "JSON",
  "LLM",
  "ML",
  "MPEG",
  "NASA",
  "NATO",
  "OCR",
  "PDF",
  "PHP",
  "POST",
  "PUT",
  "RAM",
  "REST",
  "RGB",
  "ROM",
  "SKU",
  "SMTP",
  "SEO",
  "SSH",
  "SFTP",
  "SVG",
  "SQL",
  "TCP",
  "TLS",
  "TBD",
  "UUID",
  "UDP",
  "UI",
  "UK",
  "UN",
  "UNESCO",
  "URL",
  "URI",
  "USB",
  "USA",
  "UX",
  "VPN",
  "WHO",
  "XML",
]);

const acronymStopwords = new Set([
  "A",
  "AN",
  "AND",
  "ARE",
  "AS",
  "AT",
  "BE",
  "BUT",
  "BY",
  "DO",
  "FOR",
  "FROM",
  "HAS",
  "HAVE",
  "HE",
  "HER",
  "HIS",
  "I",
  "IN",
  "IS",
  "IT",
  "ITS",
  "ME",
  "MORE",
  "MY",
  "NO",
  "NOT",
  "OF",
  "ON",
  "OR",
  "OUR",
  "SO",
  "SHE",
  "THE",
  "THEIR",
  "THEM",
  "THEN",
  "THERE",
  "THIS",
  "TO",
  "VERY",
  "WAS",
  "WE",
  "WELL",
  "WERE",
  "WHAT",
  "WHEN",
  "WHERE",
  "WHICH",
  "WHO",
  "WHY",
  "WITH",
  "YOU",
  "YOUR",
]);

initializeTheme();
initializeClipboardShortcutLabel();
initializeAutoFixCapsSetting();
initializeParagraphSeparatorsSetting();

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) {
    loadFile(file);
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragover");

  const [file] = event.dataTransfer.files;
  if (file) {
    loadFile(file);
  }
});

themeToggle.addEventListener("click", toggleTheme);
bugReportButton.addEventListener("click", reportBug);
clearUploadButton.addEventListener("click", resetApp);
copyButton.addEventListener("click", copyText);
exportCxAlloyButton.addEventListener("click", exportCxAlloyWorkbook);
downloadButton.addEventListener("click", downloadText);
proofreadButton.addEventListener("click", toggleProofreadingMode);
outputText.addEventListener("input", updateTextStats);
outputText.addEventListener("input", handleOutputTextInput);
outputText.addEventListener("scroll", handleOutputScroll);
outputMirror.addEventListener("scroll", handleOutputScroll);
formatSelect.addEventListener("change", renderExtractedText);
document.addEventListener("paste", handlePaste);
autoFixCapsToggle.addEventListener("change", handleAutoFixCapsChange);
showParagraphSeparatorsToggle.addEventListener("change", handleParagraphSeparatorsChange);
document.addEventListener("click", handleDocumentClick);
outputMirror.addEventListener("click", handleOutputMirrorClick);

function initializeTheme() {
  const savedTheme = getStoredValue("imageToTextTheme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setStoredValue("imageToTextTheme", nextTheme);
  applyTheme(nextTheme);
}

async function exportCxAlloyWorkbook() {
  const description = outputText.value.trim();
  if (!description) {
    return;
  }

  try {
    const XLSX = await getSheetJsModule();
    const rows = buildCxAlloyRowsFromText(description, {
      dismissedKeys: state.exportPreview.dismissedKeys,
    });
    if (rows.length === 0) {
      showToast("No text lines were available to export.", true);
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ["Line Type", "Description"],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CxAlloy Import");

    const defaultFileName = getDefaultCxAlloyExportName();
    const chosenFileName = window.prompt("Save CxAlloy export as:", defaultFileName);
    if (chosenFileName === null) {
      return;
    }

    const finalFileName = normalizeExportFileName(chosenFileName, defaultFileName);
    XLSX.writeFile(workbook, finalFileName);
    showToast("CxAlloy workbook exported.");
  } catch (error) {
    console.error(error);
    showToast("Could not export the CxAlloy workbook.", true);
  }
}

function getDefaultCxAlloyExportName() {
  const sourceName = state.file?.name?.replace(/\.[^.]+$/, "") || "extracted-text";
  return `${sourceName}-cxalloy.xlsx`;
}

function normalizeExportFileName(fileName, fallbackFileName) {
  const trimmed = String(fileName || "").trim();
  const candidate = trimmed || fallbackFileName;
  const sanitized = candidate.replace(/[\\/:*?"<>|]+/g, "-");
  return /\.xlsx$/i.test(sanitized) ? sanitized : `${sanitized}.xlsx`;
}

function buildCxAlloyRowsFromText(text, options = {}) {
  return buildCxAlloyPreviewRows(text)
    .filter((row) => !getCxAlloyDismissedKeys(options).has(row.key))
    .map((row) => ({
      "Line Type": "Information",
      Description: row.text,
    }));
}

function getCxAlloyDismissedKeys(options = {}) {
  return options.dismissedKeys instanceof Set ? options.dismissedKeys : new Set();
}

function buildCxAlloyPreviewRows(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const rows = [];
  let cursor = 0;
  let rowIndex = 0;

  while (cursor <= normalized.length) {
    const lineBreakIndex = normalized.indexOf("\n", cursor);
    const lineEnd = lineBreakIndex === -1 ? normalized.length : lineBreakIndex;
    const line = normalized.slice(cursor, lineEnd);
    const trimmed = line.trim();

    if (trimmed) {
      const leadingWhitespace = line.length - line.trimStart().length;
      const trailingWhitespace = line.length - line.trimEnd().length;
      const start = cursor + leadingWhitespace;
      const end = lineEnd - trailingWhitespace;

      rows.push({
        key: createCxAlloyRowKey(rowIndex),
        text: normalized.slice(start, end),
        start,
        end,
      });
      rowIndex += 1;
    }

    if (lineBreakIndex === -1) {
      break;
    }

    cursor = lineBreakIndex + 1;
  }

  return rows;
}

function createCxAlloyRowKey(index) {
  return `cx-row-${index}`;
}

function toggleCxAlloyPreviewRow(key) {
  if (!key) {
    return;
  }

  if (state.exportPreview.dismissedKeys.has(key)) {
    state.exportPreview.dismissedKeys.delete(key);
  } else {
    state.exportPreview.dismissedKeys.add(key);
  }

  renderOutputMirror();
  updateTextStats();
}

function clearCxAlloyPreviewRemovals() {
  state.exportPreview.dismissedKeys = new Set();
}

function reportBug() {
  const issueUrl = buildBugReportUrl();
  const popup = window.open(issueUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(issueUrl);
  }
}

function buildBugReportUrl() {
  const repoUrl = "https://github.com/RobotGoggles/ImageToText/issues/new";
  const subject = encodeURIComponent(`Bug: ${state.file?.name ? state.file.name : "Image to Text"}`);
  const currentUrl = `${window.location.href}`;
  const browser = navigator.userAgent || "Unknown browser";
  const body = encodeURIComponent(
    [
      "## What happened",
      "",
      "## What I expected",
      "",
      "## Steps to reproduce",
      "1.",
      "2.",
      "3.",
      "",
      "## Environment",
      `- Page: ${currentUrl}`,
      `- Browser: ${browser}`,
      `- Theme: ${document.documentElement.dataset.theme || "light"}`,
      `- File name: ${state.file?.name || "No file loaded"}`,
      "",
      "## Additional notes",
      "",
    ].join("\n"),
  );

  return `${repoUrl}?title=${subject}&body=${body}`;
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute("aria-checked", String(isDark));
  themeToggle.setAttribute("aria-label", "Dark mode");
  themeToggle.title = "Dark mode";
}

function initializeClipboardShortcutLabel() {
  if (!clipboardShortcutText) {
    return;
  }

  const platform = getPlatformName();
  clipboardShortcutText.textContent = isMacPlatform(platform) ? "Cmd" : "Ctrl";
}

function initializeAutoFixCapsSetting() {
  const savedValue = getStoredValue("imageToTextAutoFixCaps");
  autoFixCapsToggle.checked = savedValue === null ? true : savedValue === "true";
}

function handleAutoFixCapsChange() {
  setStoredValue("imageToTextAutoFixCaps", String(autoFixCapsToggle.checked));
  renderExtractedText();
}

function initializeParagraphSeparatorsSetting() {
  const savedValue = getStoredValue("imageToTextShowParagraphSeparators");
  showParagraphSeparatorsToggle.checked = savedValue === null ? true : savedValue === "true";
}

function handleParagraphSeparatorsChange() {
  setStoredValue("imageToTextShowParagraphSeparators", String(showParagraphSeparatorsToggle.checked));
  renderOutputMirror();
}

function getStoredValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

async function getSheetJsModule() {
  if (!window.__sheetJsModulePromise) {
    window.__sheetJsModulePromise = import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
  }

  const module = await window.__sheetJsModulePromise;
  return module?.default || module;
}

function handleDocumentClick(event) {
  const advancedSettings = document.querySelector(".advanced-settings");
  const clickedHighlight = event.target.closest?.("[data-proofread-key]");
  const clickedProofreadPanel = proofreadPanel?.contains(event.target);

  if (state.proofread.activeKey && !clickedHighlight && !clickedProofreadPanel) {
    clearProofreadFocus();
  }

  if (!advancedSettings?.open) {
    return;
  }

  if (advancedSettings.contains(event.target)) {
    return;
  }

  advancedSettings.open = false;
}

async function loadFile(file) {
  if (!isSupportedFile(file)) {
    showToast("Choose a PDF or supported image file.", true);
    return;
  }

  state.file = file;
  clearCxAlloyPreviewRemovals();
  setProofreadingMode(false);
  state.renderedPages = [];
  state.extractedPages = [];
  outputText.value = "";
  setProgress("Preparing preview", 0);
  fileStatus.textContent = `${file.name} (${formatBytes(file.size)})`;
  dropzonePreview.className = "dropzone-preview";
  dropzone.classList.add("has-file");
  dropzoneShell.classList.add("has-file");

  try {
    if (isPdfFile(file)) {
      await renderPdfPreview(file);
    } else {
      await renderImagePreview(file);
    }

    updateTextStats();
    await extractText();
  } catch (error) {
    console.error(error);
    showToast("Could not load that file. Try a different PDF or image.", true);
    dropzone.classList.remove("has-file");
    dropzoneShell.classList.remove("has-file");
    resetPreview();
  }
}

async function handlePaste(event) {
  if (state.isProcessing) {
    return;
  }

  const clipboardFile = getClipboardImageFile(event);
  if (!clipboardFile) {
    return;
  }

  event.preventDefault();
  await loadFile(clipboardFile);
  showToast("Pasted image loaded.");
}

async function toggleProofreadingMode() {
  if (state.isProcessing) {
    return;
  }

  if (state.proofread.isEnabled) {
    clearProofreadingResults({ keepMessage: false });
    setProofreadingMode(false);
    return;
  }

  setProofreadingMode(true);
  await checkProofreading();
}

async function enableProofreadingAfterExtraction() {
  if (!outputText.value.trim()) {
    return;
  }

  setProofreadingMode(true);
  await checkProofreading();
}

async function extractText() {
  if (!state.file || state.isProcessing) {
    return;
  }

  setProcessing(true);
  state.extractedPages = [];
  outputText.value = "";
  clearCxAlloyPreviewRemovals();
  updateTextStats();
  let shouldEnterProofreadMode = false;

  try {
    if (isPdfFile(state.file) && embeddedTextToggle.checked) {
      const embeddedPages = await extractEmbeddedPdfText(state.file);
      const usefulText = embeddedPages.join("\n").trim();
      if (usefulText.length > 20) {
        state.extractedPages = embeddedPages;
        renderExtractedText();
        setProgress("Embedded PDF text extracted", 100);
        showToast("Text extracted from the PDF.");
        shouldEnterProofreadMode = true;
        return;
      }
    }

    if (state.renderedPages.length === 0) {
      throw new Error("No rendered pages are available for OCR.");
    }

    await extractWithOcr();
    renderExtractedText();
    setProgress("OCR complete", 100);
    showToast("Text is ready to copy.");
    shouldEnterProofreadMode = true;
  } catch (error) {
    console.error(error);
    setProgress(getExtractionErrorMessage(error), 0);
    showToast(getExtractionErrorMessage(error), true);
  } finally {
    setProcessing(false);
  }

  if (shouldEnterProofreadMode) {
    await enableProofreadingAfterExtraction();
  }
}

async function renderPdfPreview(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const wrapper = document.createElement("div");
  wrapper.className = "preview-pages";
  dropzonePreview.append(wrapper);

  pageCount.textContent = `${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"}`;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.55 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;
    addPreviewPage(wrapper, canvas, `Page ${pageNumber}`);
    state.renderedPages.push(canvas);
    setProgress(`Rendered page ${pageNumber} of ${pdf.numPages}`, (pageNumber / pdf.numPages) * 35);
  }
}

async function renderImagePreview(file) {
  const imageUrl = URL.createObjectURL(file);
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  const maxSide = 2200;
  const minReadableWidth = 1200;
  const upscale = Math.min(2.5, minReadableWidth / image.naturalWidth);
  const scale = Math.min(Math.max(1, upscale), maxSide / Math.max(image.naturalWidth, image.naturalHeight));

  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  URL.revokeObjectURL(imageUrl);

  const wrapper = document.createElement("div");
  wrapper.className = "preview-pages";
  dropzonePreview.append(wrapper);
  addPreviewPage(wrapper, canvas, "Image 1");
  state.renderedPages.push(canvas);
  pageCount.textContent = "1 page";
}

async function extractEmbeddedPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = content.items.map((item) => item.str).filter(Boolean);
    pages.push(lines.join(" "));
    setProgress(
      `Reading embedded text ${pageNumber} of ${pdf.numPages}`,
      (pageNumber / pdf.numPages) * 45,
    );
  }

  return pages;
}

async function extractWithOcr() {
  const tesseract = await getTesseractModule();
  const { createWorker } = tesseract;
  const language = languageSelect.value;
  const totalPages = state.renderedPages.length;
  const worker = await createWorker(language, 1, {
    ...tesseractOptions,
    logger: (message) => {
      if (!message.status) {
        return;
      }

      const activePage = Math.min(state.extractedPages.length + 1, totalPages);
      if (message.status === "recognizing text") {
        const pageBase = (state.extractedPages.length / totalPages) * 100;
        const pageShare = message.progress * (100 / totalPages);
        setProgress(`OCR page ${activePage} of ${totalPages}`, pageBase + pageShare);
      } else {
        setProgress(`${message.status} (${activePage} of ${totalPages})`, (state.extractedPages.length / totalPages) * 100);
      }
    },
  });

  try {
    for (let index = 0; index < totalPages; index += 1) {
      const result = await worker.recognize(state.renderedPages[index]);
      state.extractedPages.push(result.data.text || "");
    }
  } finally {
    await worker.terminate();
  }
}

async function getTesseractModule() {
  if (!tesseractModulePromise) {
    tesseractModulePromise = loadTesseractModule();
  }

  return tesseractModulePromise;
}

async function loadTesseractModule() {
  try {
    const module = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js");
    return normalizeTesseractModule(module);
  } catch (moduleError) {
    console.warn("Tesseract ESM import failed, trying browser bundle.", moduleError);
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    if (!window.Tesseract?.createWorker) {
      throw moduleError;
    }

    return window.Tesseract;
  }
}

function normalizeTesseractModule(module) {
  if (module?.createWorker) {
    return module;
  }

  if (module?.default?.createWorker) {
    return module.default;
  }

  throw new Error("Tesseract OCR module loaded without createWorker.");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

function getExtractionErrorMessage(error) {
  const message = error?.message || "";
  if (/fetch|network|import|load/i.test(message)) {
    return "OCR assets could not load. Check your internet connection, then try again.";
  }

  if (/language|traineddata|lang/i.test(message)) {
    return "OCR language data could not load. Try English or check your connection.";
  }

  return "Extraction failed. Try a clearer image or a different file.";
}

function renderExtractedText() {
  const rawText = state.extractedPages.join("\n\n").trim();
  const format = formatSelect.value;
  const shouldFixCaps = autoFixCapsToggle.checked;
  clearCxAlloyPreviewRemovals();

  if (format === "raw") {
    outputText.value = rawText;
  } else if (format === "paragraphs") {
    outputText.value = preserveParagraphs(rawText, { autoFixCaps: shouldFixCaps });
  } else {
    outputText.value = cleanCopyText(rawText, { autoFixCaps: shouldFixCaps });
  }

  clearProofreadingResults({ keepMessage: false });
  renderOutputMirror();
  updateTextStats();

  if (state.proofread.isEnabled && !state.isProcessing && outputText.value.trim()) {
    void checkProofreading();
  }
}

function cleanCopyText(text, options = {}) {
  return preserveParagraphs(text, options)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function preserveParagraphs(text, options = {}) {
  const normalized = text
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

function maybeSentenceCaseParagraph(paragraph) {
  if (!shouldAutoFixCapsParagraph(paragraph)) {
    return paragraph;
  }

  return sentenceCaseParagraph(paragraph);
}

function shouldAutoFixCapsParagraph(paragraph) {
  const letters = paragraph.match(/\p{L}/gu) || [];
  if (letters.length < 8) {
    return false;
  }

  const uppercaseLetters = letters.filter((letter) => letter === letter.toUpperCase()).length;
  const uppercaseRatio = uppercaseLetters / letters.length;
  return uppercaseRatio >= 0.72;
}

function sentenceCaseParagraph(paragraph) {
  const acronymMap = new Map();
  const acronymPattern = /\b[A-Z]{2,6}\b/g;
  let match;

  while ((match = acronymPattern.exec(paragraph)) !== null) {
    if (isLikelyAcronymToken(match[0])) {
      acronymMap.set(match[0].toLowerCase(), match[0]);
    }
  }

  let normalized = paragraph.toLowerCase();
  normalized = normalized.replace(/(^|[.!?]\s+)([a-z\p{Ll}])/gu, (fullMatch, prefix, letter) => {
    return `${prefix}${letter.toUpperCase()}`;
  });

  normalized = normalized.replace(/\b([a-z][a-z0-9'-]*)\b/gi, (word) => {
    const original = acronymMap.get(word.toLowerCase());
    return original || word;
  });

  return normalized;
}

function isLikelyAcronymToken(token) {
  const upperToken = token.toUpperCase();
  if (acronymWhitelist.has(upperToken)) {
    return true;
  }

  if (acronymStopwords.has(upperToken)) {
    return false;
  }

  return upperToken.length <= 2;
}

function handleOutputTextInput() {
  const currentText = outputText.value;
  clearCxAlloyPreviewRemovals();
  updateTextStats();
  renderOutputMirror();

  if (state.proofread.isApplyingReplacement || !state.proofread.sourceText || currentText === state.proofread.sourceText) {
    return;
  }

  markProofreadingStale("Text changed. Run export preview again to refresh suggestions.");
}

async function checkProofreading() {
  const text = outputText.value;
  if (!text.trim() || state.isProcessing || state.proofread.isChecking) {
    return;
  }

  const requestId = state.proofread.requestId + 1;
  state.proofread.requestId = requestId;
  state.proofread.isChecking = true;
  state.proofread.sourceText = text;
  state.proofread.matches = [];
  state.proofread.groups = [];
  state.proofread.dismissedKeys = new Set();
  state.proofread.isStale = false;
  renderProofreadingState({
    status: "Checking spelling...",
    groups: [],
    isChecking: true,
  });

  try {
    const matches = await runLanguageToolChecks(text, requestId);
    if (requestId !== state.proofread.requestId) {
      return;
    }

    state.proofread.matches = matches;
    state.proofread.groups = groupProofreadMatches(matches);
    state.proofread.isChecking = false;
    renderProofreadingState({
      status: state.proofread.groups.length ? "Review the suggestions below." : "No issues found.",
      groups: state.proofread.groups,
      isChecking: false,
    });
  } catch (error) {
    if (requestId !== state.proofread.requestId) {
      return;
    }

    console.error(error);
    state.proofread.isChecking = false;
    renderProofreadingState({
      status: getProofreadingErrorMessage(error),
      groups: [],
      isChecking: false,
      isError: true,
    });
    showToast(getProofreadingErrorMessage(error), true);
  }
}

function setProofreadingMode(isEnabled) {
  captureOutputScrollPosition();
  state.proofread.isEnabled = isEnabled;
  proofreadButton.classList.toggle("is-active", isEnabled);
  proofreadButton.setAttribute("aria-checked", String(isEnabled));
  proofreadButton.setAttribute("aria-pressed", String(isEnabled));
  proofreadButton.title = isEnabled ? "Switch to edit mode" : "Switch to export preview";
  outputText.readOnly = isEnabled;
  if (proofreadModeIndicator) {
    proofreadModeIndicator.classList.toggle("is-active", isEnabled);
    proofreadModeIndicator.setAttribute("aria-hidden", String(!isEnabled));
  }
  if (outputEditor) {
    outputEditor.classList.toggle("is-proofreading", isEnabled);
  }
  if (!isEnabled) {
    clearProofreadFocus();
    proofreadPanel.hidden = true;
  }

  scheduleOutputScrollRestore();
}

async function runLanguageToolChecks(text, requestId) {
  const chunks = splitTextForProofreading(text, proofreadChunkLimit);
  if (chunks.length === 0) {
    return [];
  }

  const matches = [];
  for (const chunk of chunks) {
    if (requestId !== state.proofread.requestId) {
      return [];
    }

    const chunkMatches = await checkTextChunk(chunk.text);
    for (const match of chunkMatches) {
      matches.push({
        ...match,
        offset: match.offset + chunk.offset,
        originalText: text.slice(match.offset + chunk.offset, match.offset + chunk.offset + match.length),
        contextText: buildContextText(text, match.offset + chunk.offset, match.length),
      });
    }
  }

  matches.sort((left, right) => left.offset - right.offset || left.length - right.length);
  return dedupeProofreadMatches(matches);
}

async function checkTextChunk(text) {
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("language", "auto");
  body.set("enabledOnly", "false");

  const response = await fetch(languageToolEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`LanguageTool request failed with status ${response.status}.`);
  }

  const data = await response.json();
  return Array.isArray(data?.matches) ? data.matches : [];
}

function splitTextForProofreading(text, maxChunkLength) {
  const normalized = text.replace(/\r\n/g, "\n");
  const parts = normalized.split(/(\n{2,})/);
  const chunks = [];
  let current = "";
  let currentOffset = 0;
  let position = 0;

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (!current) {
      currentOffset = position;
    }

    if (part.length > maxChunkLength) {
      if (current) {
        chunks.push({ text: current, offset: currentOffset });
        current = "";
      }

      let start = 0;
      while (start < part.length) {
        chunks.push({ text: part.slice(start, start + maxChunkLength), offset: position + start });
        start += maxChunkLength;
      }
      position += part.length;
      continue;
    }

    if (current && current.length + part.length > maxChunkLength) {
      chunks.push({ text: current, offset: currentOffset });
      current = "";
      currentOffset = position;
    }

    current += part;
    position += part.length;
  }

  if (current) {
    chunks.push({ text: current, offset: currentOffset });
  }

  return chunks;
}

function dedupeProofreadMatches(matches) {
  const seen = new Set();
  return matches.filter((match) => {
    const key = fingerprintProofreadMatch(match);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function fingerprintProofreadMatch(match) {
  const replacementValues = (match.replacements || []).slice(0, 3).map((item) => item.value || "").join("|");
  return [match.rule?.id || "rule", match.offset, match.length, match.message || "", replacementValues].join(":");
}

function groupProofreadMatches(matches) {
  const groups = new Map();

  for (const match of matches) {
    const key = fingerprintProofreadGroup(match.originalText);
    const existing = groups.get(key);
    const entry = normalizeProofreadMatch(match);

    if (!existing) {
      groups.set(key, {
        key,
        originalText: entry.originalText,
        normalizedText: normalizeProofreadGroupText(entry.originalText),
        matches: [entry],
        replacements: entry.replacements.slice(),
        message: entry.message,
        rule: entry.rule,
      });
      continue;
    }

    existing.matches.push(entry);
    existing.message ||= entry.message;
    existing.rule ||= entry.rule;
    existing.replacements = mergeProofreadReplacements(existing.replacements, entry.replacements);
  }

  return Array.from(groups.values()).sort((left, right) => left.matches[0].offset - right.matches[0].offset);
}

function normalizeProofreadMatch(match) {
  return {
    ...match,
    replacements: (match.replacements || []).slice(0, 3),
  };
}

function mergeProofreadReplacements(leftReplacements, rightReplacements) {
  const merged = [...leftReplacements];
  const seen = new Set(leftReplacements.map((item) => item.value));

  for (const replacement of rightReplacements) {
    if (seen.has(replacement.value)) {
      continue;
    }

    seen.add(replacement.value);
    merged.push(replacement);
  }

  return merged;
}

function fingerprintProofreadGroup(originalText) {
  return normalizeProofreadGroupText(originalText);
}

function normalizeProofreadGroupText(text) {
  return (text || "").trim();
}

function createProofreadGroupKey(group) {
  return fingerprintProofreadGroup(group.originalText);
}

function normalizeProofreadGroups(groups) {
  return groups.map((group) => ({
    ...group,
    matches: group.matches.map((match) => ({ ...match })),
    replacements: (group.replacements || []).slice(),
  }));
}

function getVisibleProofreadGroups(groups = state.proofread.groups) {
  return normalizeProofreadGroups(groups).filter(
    (group) => !state.proofread.dismissedKeys.has(createProofreadGroupKey(group)),
  );
}

function shiftOffsetByEdits(offset, edits) {
  let shiftedOffset = offset;

  for (const edit of edits) {
    if (shiftedOffset >= edit.end) {
      shiftedOffset += edit.delta;
    }
  }

  return shiftedOffset;
}

function rebuildProofreadGroupAfterEdits(group, edits, currentText) {
  const matches = group.matches.map((match) => {
    const shiftedOffset = shiftOffsetByEdits(match.offset, edits);
    return {
      ...match,
      offset: shiftedOffset,
      contextText: buildContextText(currentText, shiftedOffset, match.length),
    };
  });

  return {
    ...group,
    matches,
    originalText: matches[0] ? currentText.slice(matches[0].offset, matches[0].offset + matches[0].length) : group.originalText,
  };
}

function buildContextText(text, offset, length) {
  const before = text.slice(Math.max(0, offset - 42), offset);
  const matched = text.slice(offset, offset + length);
  const after = text.slice(offset + length, offset + length + 42);
  return { before, matched, after };
}

function renderProofreadingState({ status, groups, isChecking, isError = false }) {
  state.proofread.lastStatus = status;
  const visibleGroups = getVisibleProofreadGroups(groups);
  const activeGroup = visibleGroups.find((group) => createProofreadGroupKey(group) === state.proofread.activeKey) || null;
  const displayStatus =
    state.proofread.isStale && !isChecking
      ? "Text changed. Run export preview again to refresh suggestions."
      : status;

  proofreadStatus.textContent = isChecking ? status : activeGroup ? displayStatus : status;
  proofreadStatus.dataset.error = isError ? "true" : "false";
  proofreadButton.disabled = !outputText.value.trim();
  proofreadList.replaceChildren();
  renderOutputMirror();

  if (isChecking) {
    proofreadList.append(createProofreadEmptyState("Checking suggestions..."));
    updateProofreadPanelVisibility();
    return;
  }

  if (!activeGroup) {
    proofreadList.append(
      createProofreadEmptyState(
        state.proofread.isStale
          ? "Suggestions are out of date. Click a highlighted word to refresh."
          : "Click a highlighted word to review the suggestion.",
      ),
    );
    updateProofreadPanelVisibility();
    return;
  }

  proofreadList.append(createProofreadCard(activeGroup, state.proofread.isStale));
  syncActiveProofreadCard();
  updateProofreadPanelVisibility();
}

function refreshProofreadingPanel() {
  if (!state.proofread.groups.length) {
    proofreadList.replaceChildren(
      createProofreadEmptyState("Click a highlighted word to review the suggestion."),
    );
    proofreadStatus.textContent = state.proofread.lastStatus || "Click a highlighted word to review the suggestion.";
    proofreadStatus.dataset.error = "false";
    proofreadPanel.hidden = true;
    return;
  }

  renderProofreadingState({
    status: state.proofread.lastStatus || "Review the suggestion below.",
    groups: state.proofread.groups,
    isChecking: false,
  });
  updateProofreadPanelVisibility();
}

function createProofreadEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "proofread-empty";
  empty.textContent = message;
  return empty;
}

function createProofreadCard(group, isStale = false) {
  const card = document.createElement("article");
  card.className = "proofread-card";
  if (isStale) {
    card.classList.add("is-stale");
  }
  card.dataset.proofreadKey = createProofreadGroupKey(group);

  const header = document.createElement("div");
  header.className = "proofread-card-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "proofread-card-titlewrap";

  const title = document.createElement("h4");
  title.textContent = group.message || "Suggestion";

  const category = document.createElement("span");
  category.className = "proofread-category";
  category.textContent = group.matches.length > 1 ? `${group.matches.length} occurrences` : "1 occurrence";

  titleWrap.append(title, category);

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "ghost-button proofread-dismiss";
  dismissButton.textContent = "Ignore";
  dismissButton.addEventListener("click", () => dismissProofreadGroup(group));
  dismissButton.disabled = isStale;

  header.append(titleWrap, dismissButton);

  const context = document.createElement("p");
  context.className = "proofread-context";
  context.append(
    document.createTextNode(group.matches[0].contextText.before),
    createHighlightedSpan(group.matches[0].contextText.matched),
    document.createTextNode(group.matches[0].contextText.after),
  );

  const replacementRow = document.createElement("div");
  replacementRow.className = "proofread-replacements";
  const replacements = (group.replacements || []).slice(0, 3);

  if (replacements.length === 0) {
    const noReplacement = document.createElement("span");
    noReplacement.className = "proofread-note";
    noReplacement.textContent = "No automatic replacement available.";
    replacementRow.append(noReplacement);
  } else {
    for (const replacement of replacements) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button proofread-replacement";
      button.textContent = replacement.value;
      button.addEventListener("click", () => applyProofreadReplacement(group, replacement.value));
      button.disabled = isStale;
      replacementRow.append(button);
    }
  }

  const customRow = document.createElement("div");
  customRow.className = "proofread-custom-replacement";

  const customLabel = document.createElement("span");
  customLabel.className = "proofread-custom-label";
  customLabel.textContent = "Custom replacement";

  const customControls = document.createElement("div");
  customControls.className = "proofread-custom-controls";

  const customInput = document.createElement("input");
  customInput.type = "text";
  customInput.className = "proofread-custom-input";
  customInput.placeholder = "Type your own replacement";
  customInput.disabled = isStale;
  customInput.setAttribute("aria-label", "Custom replacement");
  customInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    applyCustomProofreadReplacement(group, customInput);
  });

  const customButton = document.createElement("button");
  customButton.type = "button";
  customButton.className = "secondary-button proofread-custom-apply";
  customButton.textContent = "Apply";
  customButton.disabled = isStale;
  customButton.addEventListener("click", () => applyCustomProofreadReplacement(group, customInput));

  customControls.append(customInput, customButton);
  customRow.append(customLabel, customControls);

  const occurrenceSummary = document.createElement("span");
  occurrenceSummary.className = "proofread-note";
  occurrenceSummary.textContent =
    group.matches.length > 1
      ? `Applies to ${group.matches.length} matching occurrences.`
      : "Applies to 1 occurrence.";

  card.append(header, context, occurrenceSummary, replacementRow, customRow);
  return card;
}

function createHighlightedSpan(text) {
  const highlight = document.createElement("mark");
  highlight.textContent = text || "";
  return highlight;
}

function updateProofreadPanelVisibility() {
  if (!proofreadPanel) {
    return;
  }

  const shouldShow = state.proofread.isEnabled && Boolean(state.proofread.activeKey);
  proofreadPanel.hidden = !shouldShow;
}

function applyCustomProofreadReplacement(group, input) {
  const replacement = input.value.trim();
  if (!replacement) {
    return;
  }

  applyProofreadReplacement(group, replacement);
}

function renderOutputMirror() {
  if (!outputMirror) {
    return;
  }

  const text = outputText.value;
  outputMirror.dataset.placeholder = outputText.placeholder || "";
  const visibleGroups = getVisibleProofreadGroups();
  const isProofreadingMode = state.proofread.isEnabled;
  if (outputEditor) {
    outputEditor.classList.toggle("is-proofreading", isProofreadingMode);
    outputEditor.classList.toggle("has-paragraph-separators", Boolean(showParagraphSeparatorsToggle?.checked));
  }
  outputText.readOnly = isProofreadingMode;
  const highlights = collectProofreadHighlights(text, visibleGroups);

  outputMirror.replaceChildren();
  outputMirror.append(
    buildMirrorFragment(
      text,
      highlights,
      showParagraphSeparatorsToggle?.checked,
      isProofreadingMode,
    ),
  );
  restoreOutputScrollPosition();
  updateProofreadPanelVisibility();
}

function collectProofreadHighlights(text, groups) {
  const highlights = [];

  for (const group of groups) {
    const needle = group.originalText;
    if (!needle) {
      continue;
    }

    let searchIndex = 0;
    while (searchIndex < text.length) {
      const foundIndex = text.indexOf(needle, searchIndex);
      if (foundIndex === -1) {
        break;
      }

      highlights.push({
        start: foundIndex,
        end: foundIndex + needle.length,
        key: createProofreadGroupKey(group),
      });
      searchIndex = foundIndex + Math.max(1, needle.length);
    }
  }

  return mergeProofreadHighlights(highlights);
}

function mergeProofreadHighlights(highlights) {
  const sorted = [...highlights].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }

    return right.end - left.end;
  });

  const merged = [];
  let lastEnd = -1;

  for (const highlight of sorted) {
    if (highlight.start < lastEnd) {
      continue;
    }

    merged.push(highlight);
    lastEnd = highlight.end;
  }

  return merged;
}

function buildMirrorFragment(text, highlights, showParagraphSeparators = false, isProofreadingMode = false) {
  const fragment = document.createDocumentFragment();

  if (!text) {
    return fragment;
  }

  const proofreadRows = isProofreadingMode ? buildCxAlloyPreviewRows(text) : [];

  if (isProofreadingMode) {
    proofreadRows.forEach((row, index) => {
      const rowHidden = state.exportPreview.dismissedKeys.has(row.key);
      const rowElement = document.createElement("div");
      rowElement.className = "mirror-export-row";
      if (showParagraphSeparators && index > 0) {
        rowElement.classList.add("has-separator");
      }
      if (rowHidden) {
        rowElement.classList.add("is-removed");
      }

      const lineType = document.createElement("span");
      lineType.className = "mirror-line-type";
      lineType.textContent = "Information";

      const description = document.createElement("span");
      description.className = "mirror-line-description";
      appendHighlightedParagraphText(description, row.text, row.start, highlights);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "mirror-row-toggle";
      toggle.dataset.cxRowKey = row.key;
      toggle.setAttribute("aria-label", rowHidden ? "Restore row to export" : "Remove row from export");
      toggle.title = rowHidden ? "Restore row to export" : "Remove row from export";
      toggle.textContent = rowHidden ? "↺" : "×";
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCxAlloyPreviewRow(row.key);
      });

      rowElement.append(lineType, description, toggle);
      fragment.append(rowElement);
    });
    return fragment;
  }

  const normalized = text.replace(/\r\n/g, "\n");
  const parts = normalized.split(/(\n{2,})/);
  const paragraphs = [];
  let paragraphText = "";
  let paragraphStart = 0;
  let position = 0;

  const flushParagraph = () => {
    if (!paragraphText) {
      return;
    }

    paragraphs.push({
      text: paragraphText,
      start: paragraphStart,
      end: paragraphStart + paragraphText.length,
    });
    paragraphText = "";
  };

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (/\n{2,}/.test(part)) {
      flushParagraph();
      position += part.length;
      continue;
    }

    if (!paragraphText) {
      paragraphStart = position;
    }

    paragraphText += part;
    position += part.length;
  }

  flushParagraph();

  if (paragraphs.length === 0) {
    paragraphs.push({ text: normalized, start: 0, end: normalized.length });
  }

  paragraphs.forEach((paragraph, index) => {
    const paragraphNode = document.createElement("div");
    paragraphNode.className = "mirror-paragraph";
    if (showParagraphSeparators && index > 0) {
      paragraphNode.classList.add("has-separator");
    }

    appendHighlightedParagraphText(paragraphNode, paragraph.text, paragraph.start, highlights);
    fragment.append(paragraphNode);
  });

  return fragment;
}

function appendHighlightedParagraphText(container, text, paragraphStart, highlights) {
  let cursor = 0;
  const paragraphEnd = paragraphStart + text.length;
  const relevantHighlights = highlights.filter((highlight) => highlight.start < paragraphEnd && highlight.end > paragraphStart);

  for (const highlight of relevantHighlights) {
    const localStart = Math.max(highlight.start, paragraphStart) - paragraphStart;
    const localEnd = Math.min(highlight.end, paragraphEnd) - paragraphStart;

    if (localStart > cursor) {
      container.append(document.createTextNode(text.slice(cursor, localStart)));
    }

    const span = document.createElement("span");
    span.className = "output-highlight";
    span.dataset.proofreadKey = highlight.key;
    span.textContent = text.slice(localStart, localEnd);
    container.append(span);
    cursor = localEnd;
  }

  if (cursor < text.length) {
    container.append(document.createTextNode(text.slice(cursor)));
  }
}

function handleOutputScroll(event) {
  if (!outputText || !outputMirror || isSyncingOutputScroll) {
    return;
  }

  const source = event.currentTarget;
  const target = source === outputText ? outputMirror : outputText;
  if (!target) {
    return;
  }

  outputScrollTop = source.scrollTop;
  outputScrollLeft = source.scrollLeft;

  isSyncingOutputScroll = true;
  target.scrollTop = outputScrollTop;
  target.scrollLeft = outputScrollLeft;
  isSyncingOutputScroll = false;
}

function captureOutputScrollPosition() {
  const source = state.proofread.isEnabled ? outputMirror : outputText;
  if (!source) {
    return;
  }

  outputScrollTop = source.scrollTop;
  outputScrollLeft = source.scrollLeft;
}

function scheduleOutputScrollRestore() {
  if (outputScrollRestoreFrame) {
    cancelAnimationFrame(outputScrollRestoreFrame);
    outputScrollRestoreFrame = 0;
  }

  outputScrollRestoreFrame = requestAnimationFrame(() => {
    outputScrollRestoreFrame = requestAnimationFrame(() => {
      outputScrollRestoreFrame = 0;
      restoreOutputScrollPosition();
    });
  });
}

function restoreOutputScrollPosition() {
  if (!outputText || !outputMirror || isSyncingOutputScroll) {
    return;
  }

  isSyncingOutputScroll = true;
  outputText.scrollTop = outputScrollTop;
  outputText.scrollLeft = outputScrollLeft;
  outputMirror.scrollTop = outputScrollTop;
  outputMirror.scrollLeft = outputScrollLeft;
  isSyncingOutputScroll = false;
}

function handleOutputMirrorClick(event) {
  const target = event.target.closest?.("[data-proofread-key]");
  if (!target) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  activateProofreadGroup(target.dataset.proofreadKey);
}

function activateProofreadGroup(key) {
  if (!key || state.proofread.activeKey === key) {
    return;
  }

  state.proofread.activeKey = key;
  refreshProofreadingPanel();
}

function clearProofreadFocus() {
  state.proofread.activeKey = "";
  refreshProofreadingPanel();
}

function syncActiveProofreadCard() {
  const cards = proofreadList.querySelectorAll(".proofread-card");
  cards.forEach((card) => {
    const isActive = card.dataset.proofreadKey === state.proofread.activeKey;
    card.classList.toggle("is-active", isActive);
  });
}

function dismissProofreadGroup(group) {
  const key = createProofreadGroupKey(group);
  state.proofread.dismissedKeys.add(key);
  if (state.proofread.activeKey === key) {
    state.proofread.activeKey = "";
  }
  refreshProofreadingPanel();
}

async function applyProofreadReplacement(group, replacement) {
  const currentText = outputText.value;
  const sortedMatches = [...group.matches].sort((left, right) => right.offset - left.offset);
  let nextText = currentText;
  const edits = [];

  for (const match of sortedMatches) {
    edits.push({
      start: match.offset,
      end: match.offset + match.length,
      delta: replacement.length - match.length,
    });
    nextText =
      nextText.slice(0, match.offset) + replacement + nextText.slice(match.offset + match.length);
  }

  edits.sort((left, right) => left.start - right.start);

  state.proofread.isApplyingReplacement = true;
  outputText.value = nextText;
  state.proofread.isApplyingReplacement = false;
  updateTextStats();
  state.proofread.sourceText = nextText;
  state.proofread.isStale = false;

  const remainingGroups = state.proofread.groups
    .filter((entry) => createProofreadGroupKey(entry) !== createProofreadGroupKey(group))
    .map((entry) => rebuildProofreadGroupAfterEdits(entry, edits, nextText));

  state.proofread.groups = remainingGroups;
  state.proofread.matches = remainingGroups.flatMap((entry) => entry.matches);
  state.proofread.activeKey = "";

  renderProofreadingState({
    status:
      remainingGroups.length > 0
        ? `Applied to ${group.matches.length} occurrences. ${remainingGroups.length} groups remain.`
        : "Applied to all matching occurrences.",
    groups: remainingGroups,
    isChecking: false,
  });
}

function clearProofreadingResults(options = {}) {
  state.proofread.requestId += 1;
  state.proofread.sourceText = "";
  state.proofread.matches = [];
  state.proofread.groups = [];
  state.proofread.dismissedKeys = new Set();
  state.proofread.isChecking = false;
  state.proofread.isApplyingReplacement = false;
  state.proofread.isStale = false;
  state.proofread.activeKey = "";

  if (options.keepMessage) {
    proofreadStatus.textContent = options.message || "Run export preview to review suggestions";
  } else {
    proofreadStatus.textContent = options.message || "Run export preview to review suggestions";
  }

  proofreadStatus.dataset.error = "false";
  proofreadButton.disabled = !outputText.value.trim();
  updateProofreadPanelVisibility();
  proofreadList.replaceChildren(createProofreadEmptyState("Run export preview to review suggestions."));
  renderOutputMirror();
}

function markProofreadingStale(message) {
  state.proofread.isStale = true;
  proofreadStatus.textContent = message;
  proofreadStatus.dataset.error = "false";
  proofreadButton.disabled = !outputText.value.trim();
  if (state.proofread.groups.length > 0) {
    proofreadList.replaceChildren(
      ...state.proofread.groups.map((group) => createProofreadCard(group, true)),
    );
  } else {
    proofreadList.replaceChildren(createProofreadEmptyState("Run export preview to review suggestions."));
  }
  updateProofreadPanelVisibility();
  renderOutputMirror();
}

function getProofreadingErrorMessage(error) {
  const message = error?.message || "";
  if (/failed with status 413|too large|payload/i.test(message)) {
    return "The text is too long for LanguageTool. Try checking a smaller section.";
  }

  if (/fetch|network|load/i.test(message)) {
    return "LanguageTool could not be reached. Check your connection and try again.";
  }

  return "Export preview failed. Please try again.";
}

async function copyText() {
  const text = outputText.value.trim();
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard.");
  } catch {
    outputText.select();
    document.execCommand("copy");
    showToast("Copied to clipboard.");
  }
}

function downloadText() {
  const text = outputText.value.trim();
  if (!text) {
    return;
  }

  const sourceName = state.file?.name?.replace(/\.[^.]+$/, "") || "extracted-text";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `${sourceName}.txt`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function resetApp() {
  state.file = null;
  state.renderedPages = [];
  state.extractedPages = [];
  state.isProcessing = false;
  clearCxAlloyPreviewRemovals();
  fileInput.value = "";
  outputText.value = "";
  fileStatus.textContent = "No file selected";
  pageCount.textContent = "0 pages";
  copyButton.disabled = true;
  exportCxAlloyButton.disabled = true;
  downloadButton.disabled = true;
  dropzone.classList.remove("has-file");
  dropzoneShell.classList.remove("has-file");
  resetPreview();
  setProofreadingMode(false);
  clearProofreadingResults({ keepMessage: false });
  setProgress("Upload a document to read the text.", 0);
  updateTextStats();
}

function resetPreview() {
  dropzonePreview.className = "dropzone-preview";
  dropzonePreview.innerHTML = "";
}

function addPreviewPage(wrapper, media, label) {
  const page = document.createElement("figure");
  const caption = document.createElement("figcaption");
  page.className = "preview-page";
  caption.className = "page-label";
  caption.textContent = label;
  page.append(media, caption);
  wrapper.append(page);
}

function setProcessing(isProcessing) {
  state.isProcessing = isProcessing;
  dropzoneShell.classList.toggle("is-processing", isProcessing);
  fileInput.disabled = isProcessing;
  languageSelect.disabled = isProcessing;
  formatSelect.disabled = isProcessing;
  embeddedTextToggle.disabled = isProcessing;
  autoFixCapsToggle.disabled = isProcessing;
  proofreadButton.disabled = isProcessing || !outputText.value.trim();
  exportCxAlloyButton.disabled = isProcessing || !outputText.value.trim();
}

function setProgress(label, value) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  let statusText = "Upload a document to read the text.";

  if (/failed|could not/i.test(label)) {
    statusText = label;
  } else if (state.isProcessing) {
    statusText = percent > 0 && percent < 100 ? `${label} ${percent}%` : label;
  } else if (state.file) {
    statusText = label;
  }

  buttonLabel.textContent = statusText;
  buttonProgress.style.setProperty("--button-progress", `${percent}%`);
  if (extractStatus) {
    extractStatus.hidden = !state.isProcessing;
  }
}

function updateTextStats() {
  const length = outputText.value.length;
  const rowCount = buildCxAlloyRowsFromText(outputText.value, {
    dismissedKeys: state.exportPreview.dismissedKeys,
  }).length;
  const characterLabel = length === 1 ? "character" : "characters";
  const rowLabel = rowCount === 1 ? "row" : "rows";
  textStats.textContent = `${length.toLocaleString()} ${characterLabel} · ${rowCount.toLocaleString()} CxAlloy ${rowLabel}`;
  copyButton.disabled = length === 0;
  exportCxAlloyButton.disabled = length === 0 || rowCount === 0 || state.isProcessing;
  downloadButton.disabled = length === 0;
  if (!state.isProcessing && !state.proofread.isChecking) {
    proofreadButton.disabled = length === 0;
  }
}

function isSupportedFile(file) {
  return isPdfFile(file) || isImageFile(file);
}

function isPdfFile(file) {
  return file.type === "application/pdf" || getFileExtension(file.name) === "pdf";
}

function isImageFile(file) {
  return imageTypes.has(file.type) || imageExtensions.has(getFileExtension(file.name));
}

function getFileExtension(fileName) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function getClipboardImageFile(event) {
  const items = Array.from(event.clipboardData?.items || []);
  return getClipboardImageFileFromItems(items);
}

function getPlatformName() {
  return (
    navigator.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    ""
  ).toLowerCase();
}

function isMacPlatform(platformName) {
  return /mac|iphone|ipad|ipod/.test(platformName);
}

function getClipboardImageFileFromItems(items) {
  const imageItem = items.find((item) => item.type?.startsWith("image/") && item.kind === "file");
  const file = imageItem?.getAsFile?.();
  if (file) {
    const extension = file.type?.split("/")[1] || "png";
    return new File([file], `clipboard-image.${extension === "jpeg" ? "jpg" : extension}`, {
      type: file.type || "image/png",
    });
  }

  return null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function showToast(message, isError = false) {
  const existingToast = document.querySelector(".toast");
  existingToast?.remove();

  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  document.body.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

resetApp();

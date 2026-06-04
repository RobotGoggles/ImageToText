import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const fileInput = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const dropzoneShell = document.querySelector("#dropzoneShell");
const clearUploadButton = document.querySelector("#clearUploadButton");
const extractButton = document.querySelector("#extractButton");
const themeToggle = document.querySelector("#themeToggle");
const themeIcon = document.querySelector("#themeIcon");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const languageSelect = document.querySelector("#languageSelect");
const formatSelect = document.querySelector("#formatSelect");
const embeddedTextToggle = document.querySelector("#embeddedTextToggle");
const autoFixCapsToggle = document.querySelector("#autoFixCapsToggle");
const dropzonePreview = document.querySelector("#dropzonePreview");
const outputText = document.querySelector("#outputText");
const fileStatus = document.querySelector("#fileStatus");
const pageCount = document.querySelector("#pageCount");
const textStats = document.querySelector("#textStats");
const buttonLabel = document.querySelector("#buttonLabel");
const buttonProgress = document.querySelector("#buttonProgress");
const clipboardShortcutText = document.querySelector("#clipboardShortcutText");

const state = {
  file: null,
  renderedPages: [],
  extractedPages: [],
  isProcessing: false,
};

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

extractButton.addEventListener("click", extractText);
themeToggle.addEventListener("click", toggleTheme);
clearUploadButton.addEventListener("click", resetApp);
copyButton.addEventListener("click", copyText);
downloadButton.addEventListener("click", downloadText);
outputText.addEventListener("input", updateTextStats);
formatSelect.addEventListener("change", renderExtractedText);
document.addEventListener("paste", handlePaste);
autoFixCapsToggle.addEventListener("change", handleAutoFixCapsChange);
document.addEventListener("click", handleDocumentClick);

function initializeTheme() {
  const savedTheme = localStorage.getItem("imageToTextTheme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("imageToTextTheme", nextTheme);
  applyTheme(nextTheme);
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeIcon.textContent = isDark ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}

function initializeClipboardShortcutLabel() {
  if (!clipboardShortcutText) {
    return;
  }

  const platform = getPlatformName();
  clipboardShortcutText.textContent = isMacPlatform(platform) ? "Cmd" : "Ctrl";
}

function initializeAutoFixCapsSetting() {
  const savedValue = localStorage.getItem("imageToTextAutoFixCaps");
  autoFixCapsToggle.checked = savedValue === null ? true : savedValue === "true";
}

function handleAutoFixCapsChange() {
  localStorage.setItem("imageToTextAutoFixCaps", String(autoFixCapsToggle.checked));
  renderExtractedText();
}

function handleDocumentClick(event) {
  const advancedSettings = document.querySelector(".advanced-settings");
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
  state.renderedPages = [];
  state.extractedPages = [];
  outputText.value = "";
  setProgress("Preparing preview", 0);
  setProcessing(false);
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

    extractButton.disabled = false;
    updateTextStats();
    setProgress("Ready", 0);
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

async function extractText() {
  if (!state.file || state.isProcessing) {
    return;
  }

  setProcessing(true);
  state.extractedPages = [];
  outputText.value = "";
  updateTextStats();

  try {
    if (isPdfFile(state.file) && embeddedTextToggle.checked) {
      const embeddedPages = await extractEmbeddedPdfText(state.file);
      const usefulText = embeddedPages.join("\n").trim();
      if (usefulText.length > 20) {
        state.extractedPages = embeddedPages;
        renderExtractedText();
        setProgress("Embedded PDF text extracted", 100);
        showToast("Text extracted from the PDF.");
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
  } catch (error) {
    console.error(error);
    setProgress(getExtractionErrorMessage(error), 0);
    showToast(getExtractionErrorMessage(error), true);
  } finally {
    setProcessing(false);
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

  if (format === "raw") {
    outputText.value = rawText;
  } else if (format === "paragraphs") {
    outputText.value = preserveParagraphs(rawText, { autoFixCaps: shouldFixCaps });
  } else {
    outputText.value = cleanCopyText(rawText, { autoFixCaps: shouldFixCaps });
  }

  updateTextStats();
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
  fileInput.value = "";
  outputText.value = "";
  fileStatus.textContent = "No file selected";
  pageCount.textContent = "0 pages";
  extractButton.disabled = true;
  copyButton.disabled = true;
  downloadButton.disabled = true;
  dropzone.classList.remove("has-file");
  dropzoneShell.classList.remove("has-file");
  resetPreview();
  setProgress("Ready", 0);
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
  extractButton.disabled = isProcessing || !state.file;
  fileInput.disabled = isProcessing;
  languageSelect.disabled = isProcessing;
  formatSelect.disabled = isProcessing;
  embeddedTextToggle.disabled = isProcessing;
  autoFixCapsToggle.disabled = isProcessing;
}

function setProgress(label, value) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  let buttonText = "Extract Text";

  if (/failed|could not/i.test(label)) {
    buttonText = "Try Again";
  } else if (state.isProcessing) {
    buttonText = percent > 0 && percent < 100 ? `${label} ${percent}%` : label;
  }

  buttonLabel.textContent = buttonText;
  extractButton.title = label;
  buttonProgress.style.setProperty("--button-progress", `${percent}%`);
}

function updateTextStats() {
  const length = outputText.value.length;
  textStats.textContent = `${length.toLocaleString()} ${length === 1 ? "character" : "characters"}`;
  copyButton.disabled = length === 0;
  downloadButton.disabled = length === 0;
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

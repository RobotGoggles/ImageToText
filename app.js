import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const fileInput = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const extractButton = document.querySelector("#extractButton");
const themeToggle = document.querySelector("#themeToggle");
const themeIcon = document.querySelector("#themeIcon");
const clearButton = document.querySelector("#clearButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const languageSelect = document.querySelector("#languageSelect");
const formatSelect = document.querySelector("#formatSelect");
const embeddedTextToggle = document.querySelector("#embeddedTextToggle");
const preview = document.querySelector("#preview");
const outputText = document.querySelector("#outputText");
const fileStatus = document.querySelector("#fileStatus");
const pageCount = document.querySelector("#pageCount");
const textStats = document.querySelector("#textStats");
const buttonLabel = document.querySelector("#buttonLabel");
const buttonProgress = document.querySelector("#buttonProgress");

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

initializeTheme();

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
clearButton.addEventListener("click", resetApp);
copyButton.addEventListener("click", copyText);
downloadButton.addEventListener("click", downloadText);
outputText.addEventListener("input", updateTextStats);
formatSelect.addEventListener("change", renderExtractedText);
document.addEventListener("paste", handlePaste);

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
  preview.className = "";
  preview.innerHTML = "";

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
  preview.append(wrapper);

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
  preview.append(wrapper);
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

  if (format === "raw") {
    outputText.value = rawText;
  } else if (format === "paragraphs") {
    outputText.value = preserveParagraphs(rawText);
  } else {
    outputText.value = cleanCopyText(rawText);
  }

  updateTextStats();
}

function cleanCopyText(text) {
  return preserveParagraphs(text)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function preserveParagraphs(text) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/-\n(?=\p{L})/gu, "")
    .replace(/\n{3,}/g, "\n\n");

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/[ \t]{2,}/g, " "),
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
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
  resetPreview();
  setProgress("Ready", 0);
  updateTextStats();
}

function resetPreview() {
  preview.className = "preview-empty";
  preview.innerHTML = "<span>Preview appears after upload</span>";
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
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  const file = imageItem?.getAsFile();
  if (file) {
    const extension = file.type.split("/")[1] || "png";
    return new File([file], `clipboard-image.${extension}`, { type: file.type || "image/png" });
  }

  const fileFromList = Array.from(event.clipboardData?.files || []).find((item) =>
    item.type.startsWith("image/"),
  );
  if (fileFromList) {
    const extension = fileFromList.type.split("/")[1] || "png";
    return new File([fileFromList], `clipboard-image.${extension}`, {
      type: fileFromList.type || "image/png",
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

// Reading text out of PDFs and images: embedded PDF text via PDF.js, OCR via Tesseract.js.

import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
import { joinPdfTextItems } from "./pdf-text.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

// Exact versions, so a new release can't change OCR behaviour without a code change.
const tesseractVersion = "5.1.1";
const tesseractBase = `https://cdn.jsdelivr.net/npm/tesseract.js@${tesseractVersion}/dist`;
const tesseractOptions = {
  workerPath: `${tesseractBase}/worker.min.js`,
  corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${tesseractVersion}/tesseract-core-simd.wasm.js`,
  langPath: "https://tessdata.projectnaptha.com/4.0.0",
};

// Preview pages only need to look sharp on screen.
const previewScale = 1.55;

// Tesseract is most accurate around 300 DPI. PDF user space is 72 units per inch.
const ocrTargetScale = 300 / 72;
const ocrMaxSide = 4200;
const ocrMaxPixels = 16_000_000; // Stay under mobile Safari's canvas limit.

// Embedded text shorter than this is treated as "no text layer" (e.g. a scanned PDF).
const minimumEmbeddedTextLength = 20;

let tesseractModulePromise = null;

export async function openPdf(file) {
  const data = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data }).promise;
}

/** Renders every page at preview size, calling onPage(canvas, pageNumber, pageCount). */
export async function renderPdfPreview(pdf, onPage) {
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const canvas = await renderPage(page, page.getViewport({ scale: previewScale }));
    page.cleanup();
    onPage(canvas, pageNumber, pdf.numPages);
  }
}

/**
 * Reads the PDF's text layer. Returns null when there isn't enough embedded text,
 * meaning the caller should fall back to OCR.
 */
export async function extractEmbeddedPdfText(pdf, onProgress) {
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(joinPdfTextItems(content.items));
    page.cleanup();
    onProgress?.(pageNumber, pdf.numPages);
  }

  return pages.join("\n").trim().length > minimumEmbeddedTextLength ? pages : null;
}

/** Renders one PDF page at OCR resolution. The caller should release the canvas afterwards. */
export async function renderPdfPageForOcr(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = Math.min(
    ocrTargetScale,
    ocrMaxSide / Math.max(unscaled.width, unscaled.height),
    Math.sqrt(ocrMaxPixels / (unscaled.width * unscaled.height)),
  );
  const canvas = await renderPage(page, page.getViewport({ scale }));
  page.cleanup();
  return canvas;
}

async function renderPage(page, viewport) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const canvasContext = canvas.getContext("2d", { alpha: false });
  await page.render({ canvasContext, viewport }).promise;
  return canvas;
}

/** Draws an image file onto a white canvas, upscaling small screenshots for better OCR. */
export async function renderImageCanvas(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const maxSide = 2200;
    const minReadableWidth = 1200;
    const upscale = Math.min(2.5, minReadableWidth / image.naturalWidth);
    const scale = Math.min(Math.max(1, upscale), maxSide / Math.max(image.naturalWidth, image.naturalHeight));

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Runs OCR over pageCount pages. getPageCanvas(index) returns { canvas, release } for
 * each page, so PDF pages can be rendered one at a time and freed straight after.
 * onProgress(label, percent) reports progress from 0 to 100.
 */
export async function runOcr({ pageCount, getPageCanvas, language, onProgress }) {
  const { createWorker } = await getTesseractModule();
  let completedPages = 0;

  const worker = await createWorker(language, 1, {
    ...tesseractOptions,
    logger: (message) => {
      if (!message.status) {
        return;
      }

      const activePage = Math.min(completedPages + 1, pageCount);
      const pageBase = (completedPages / pageCount) * 100;
      if (message.status === "recognizing text") {
        onProgress(`OCR page ${activePage} of ${pageCount}`, pageBase + message.progress * (100 / pageCount));
      } else {
        onProgress(`${message.status} (${activePage} of ${pageCount})`, pageBase);
      }
    },
  });

  const pages = [];
  try {
    for (let index = 0; index < pageCount; index += 1) {
      const { canvas, release } = await getPageCanvas(index);
      try {
        const result = await worker.recognize(canvas);
        pages.push(result.data.text || "");
      } finally {
        release?.();
      }

      completedPages += 1;
    }
  } finally {
    await worker.terminate();
  }

  return pages;
}

function getTesseractModule() {
  if (!tesseractModulePromise) {
    tesseractModulePromise = loadTesseractModule().catch((error) => {
      tesseractModulePromise = null;
      throw error;
    });
  }

  return tesseractModulePromise;
}

async function loadTesseractModule() {
  try {
    const module = await import(`${tesseractBase}/tesseract.esm.min.js`);
    if (module?.createWorker) {
      return module;
    }

    if (module?.default?.createWorker) {
      return module.default;
    }

    throw new Error("Tesseract OCR module loaded without createWorker.");
  } catch (moduleError) {
    console.warn("Tesseract ESM import failed, trying browser bundle.", moduleError);
    await loadScript(`${tesseractBase}/tesseract.min.js`);
    if (!window.Tesseract?.createWorker) {
      throw moduleError;
    }

    return window.Tesseract;
  }
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function getExtractionErrorMessage(error) {
  const message = error?.message || "";
  if (/language|traineddata|lang/i.test(message)) {
    return "OCR language data could not load. Try English or check your connection.";
  }

  if (/fetch|network|import|load/i.test(message)) {
    return "OCR assets could not load. Check your internet connection, then try again.";
  }

  return "Extraction failed. Try a clearer image or a different file.";
}

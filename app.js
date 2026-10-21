import {
  openPdf,
  renderPdfPreview,
  extractEmbeddedPdfText,
  renderPdfPageForOcr,
  renderImageCanvas,
  releaseCanvas,
  runOcr,
  getExtractionErrorMessage,
} from "./src/extraction.js";
import { formatExtractedText } from "./src/text-cleanup.js";
import {
  buildCxAlloyPreviewRows,
  buildCxAlloyRows,
  getDefaultCxAlloyExportName,
  normalizeExportFileName,
  writeCxAlloyWorkbook,
} from "./src/cxalloy-export.js";
import {
  runLanguageToolChecks,
  groupProofreadMatches,
  collectProofreadHighlights,
  applyReplacementToMatches,
  rebuildGroupAfterEdits,
  languageToolLanguageFor,
  getProofreadingErrorMessage,
} from "./src/proofreading.js";
import { isSupportedFile, isPdfFile, formatBytes, getClipboardImageFile, isMacPlatform } from "./src/file-utils.js";
import { showToast, askForFileName } from "./src/ui.js";

const $ = (selector) => document.querySelector(selector);

const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const dropzoneShell = $("#dropzoneShell");
const dropzonePreview = $("#dropzonePreview");
const clearUploadButton = $("#clearUploadButton");
const bugReportButton = $("#bugReportButton");
const copyButton = $("#copyButton");
const exportCxAlloyButton = $("#exportCxAlloyButton");
const exportPreviewButton = $("#proofreadButton");
const languageSelect = $("#languageSelect");
const formatSelect = $("#formatSelect");
const embeddedTextToggle = $("#embeddedTextToggle");
const autoFixCapsToggle = $("#autoFixCapsToggle");
const spellcheckToggle = $("#spellcheckToggle");
const outputEditor = $(".output-editor");
const outputMirror = $("#outputMirror");
const outputText = $("#outputText");
const proofreadPanel = $(".proofread-panel");
const proofreadStatus = $("#proofreadStatus");
const proofreadList = $("#proofreadList");
const fileStatus = $("#fileStatus");
const pageCountLabel = $("#pageCount");
const textStats = $("#textStats");
const buttonLabel = $("#buttonLabel");
const buttonProgress = $("#buttonProgress");
const extractStatus = $("#extractStatus");
const clipboardShortcutText = $("#clipboardShortcutText");
const advancedSettings = $(".advanced-settings");

const storageKeys = {
  autoFixCaps: "imageToTextAutoFixCaps",
  spellcheck: "imageToTextSpellcheck",
};

const state = {
  file: null,
  pdf: null,
  imageCanvas: null,
  pageCount: 0,
  extractedPages: [],
  isProcessing: false,
  isExportPreview: false,
  removedRowKeys: new Set(),
  proofread: {
    requestId: 0,
    groups: [],
    dismissedKeys: new Set(),
    isChecking: false,
    activeKey: "",
  },
};

const scroll = { top: 0, left: 0, isSyncing: false, restoreFrame: 0 };
let proofreadActionFitFrame = 0;

initializeClipboardShortcutLabel();
initializeStoredToggle(autoFixCapsToggle, storageKeys.autoFixCaps, true);
initializeStoredToggle(spellcheckToggle, storageKeys.spellcheck, false);

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) {
    void loadFile(file);
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
    void loadFile(file);
  }
});

document.addEventListener("paste", (event) => {
  const file = getClipboardImageFile(event.clipboardData?.items);
  if (file) {
    event.preventDefault();
    void loadFile(file);
  }
});

bugReportButton.addEventListener("click", reportBug);
clearUploadButton.addEventListener("click", resetApp);
copyButton.addEventListener("click", copyText);
exportCxAlloyButton.addEventListener("click", exportCxAlloyWorkbook);
exportPreviewButton.addEventListener("click", toggleExportPreview);
formatSelect.addEventListener("change", renderExtractedText);
outputText.addEventListener("input", handleOutputTextInput);
outputText.addEventListener("scroll", handleOutputScroll);
outputMirror.addEventListener("scroll", handleOutputScroll);
outputMirror.addEventListener("click", handleOutputMirrorClick);
outputMirror.addEventListener("keydown", handleOutputMirrorKeydown);
document.addEventListener("click", handleDocumentClick);
window.addEventListener("resize", scheduleProofreadActionButtonFit);

autoFixCapsToggle.addEventListener("change", () => {
  storeValue(storageKeys.autoFixCaps, String(autoFixCapsToggle.checked));
  renderExtractedText();
});

spellcheckToggle.addEventListener("change", () => {
  storeValue(storageKeys.spellcheck, String(spellcheckToggle.checked));
  if (!state.isExportPreview) {
    return;
  }

  if (spellcheckToggle.checked) {
    void checkProofreading();
  } else {
    clearProofreadingResults();
  }
});

// ---------------------------------------------------------------------------
// Loading and extraction
// ---------------------------------------------------------------------------

async function loadFile(file) {
  if (state.isProcessing) {
    showToast("Wait for the current file to finish before adding another.", true);
    return;
  }

  if (!isSupportedFile(file)) {
    showToast("Choose a PDF or supported image file.", true);
    return;
  }

  releaseSource();
  state.file = file;
  state.extractedPages = [];
  state.removedRowKeys = new Set();
  setExportPreviewMode(false);
  clearProofreadingResults();
  outputText.value = "";
  resetPreview();
  fileStatus.textContent = `${file.name} (${formatBytes(file.size)})`;
  dropzone.classList.add("has-file");
  dropzoneShell.classList.add("has-file");

  // Processing covers preview rendering too, so a second file can't start mid-load.
  setProcessing(true);
  setProgress("Preparing preview", 0);
  let extracted = false;

  try {
    await renderSourcePreview(file);
    updateTextStats();
  } catch (error) {
    console.error(error);
    showToast("Could not load that file. Try a different PDF or image.", true);
    releaseSource();
    setProcessing(false);
    resetApp();
    return;
  }

  try {
    extracted = await extractText();
  } finally {
    // The PDF's preview canvases are already drawn; the document itself can go.
    destroyPdf();
    setProcessing(false);
  }

  if (extracted && outputText.value.trim()) {
    setExportPreviewMode(true);
    if (spellcheckToggle.checked) {
      await checkProofreading();
    }
  }
}

async function renderSourcePreview(file) {
  const wrapper = document.createElement("div");
  wrapper.className = "preview-pages";
  dropzonePreview.append(wrapper);

  if (isPdfFile(file)) {
    state.pdf = await openPdf(file);
    state.pageCount = state.pdf.numPages;
    pageCountLabel.textContent = String(state.pageCount);
    await renderPdfPreview(state.pdf, (canvas, pageNumber, total) => {
      addPreviewPage(wrapper, canvas, `Page ${pageNumber}`);
      setProgress(`Rendered page ${pageNumber} of ${total}`, (pageNumber / total) * 35);
    });
    return;
  }

  state.imageCanvas = await renderImageCanvas(file);
  state.pageCount = 1;
  pageCountLabel.textContent = "1";
  addPreviewPage(wrapper, state.imageCanvas, "Image 1");
}

/** Returns true when text was extracted. */
async function extractText() {
  try {
    let pages = null;

    if (state.pdf && embeddedTextToggle.checked) {
      pages = await extractEmbeddedPdfText(state.pdf, (pageNumber, total) => {
        setProgress(`Reading embedded text ${pageNumber} of ${total}`, 35 + (pageNumber / total) * 10);
      });
    }

    const usedEmbeddedText = Boolean(pages);
    if (!pages) {
      pages = await runOcr({
        pageCount: state.pageCount,
        getPageCanvas: getOcrCanvas,
        language: languageSelect.value,
        onProgress: setProgress,
      });
    }

    state.extractedPages = pages;
    renderExtractedText();
    setProgress(usedEmbeddedText ? "Embedded PDF text extracted" : "OCR complete", 100);
    showToast(usedEmbeddedText ? "Text extracted from the PDF." : "Text is ready to copy.");
    return true;
  } catch (error) {
    console.error(error);
    const message = getExtractionErrorMessage(error);
    setProgress(message, 0);
    showToast(message, true);
    return false;
  }
}

/** PDF pages are rendered at OCR resolution one at a time and freed after recognition. */
async function getOcrCanvas(index) {
  if (state.pdf) {
    const canvas = await renderPdfPageForOcr(state.pdf, index + 1);
    return { canvas, release: () => releaseCanvas(canvas) };
  }

  return { canvas: state.imageCanvas };
}

function destroyPdf() {
  const pdf = state.pdf;
  state.pdf = null;
  if (!pdf) {
    return;
  }

  // Destroying the loading task frees the document and its worker-side data.
  Promise.resolve()
    .then(() => pdf.loadingTask?.destroy?.() ?? pdf.destroy?.())
    .catch((error) => console.warn("Could not release the PDF.", error));
}

function releaseSource() {
  destroyPdf();
  state.imageCanvas = null;
  state.pageCount = 0;
}

function renderExtractedText() {
  const rawText = state.extractedPages.join("\n\n");
  outputText.value = formatExtractedText(rawText, formatSelect.value, { autoFixCaps: autoFixCapsToggle.checked });
  state.removedRowKeys = new Set();
  clearProofreadingResults();
  updateTextStats();

  if (state.isExportPreview && spellcheckToggle.checked && !state.isProcessing && outputText.value.trim()) {
    void checkProofreading();
  }
}

// ---------------------------------------------------------------------------
// Export preview (CxAlloy rows) and spell check
// ---------------------------------------------------------------------------

async function toggleExportPreview() {
  if (state.isProcessing) {
    return;
  }

  if (state.isExportPreview) {
    clearProofreadingResults();
    setExportPreviewMode(false);
    return;
  }

  setExportPreviewMode(true);
  if (spellcheckToggle.checked) {
    await checkProofreading();
  }
}

function setExportPreviewMode(isEnabled) {
  captureOutputScrollPosition();
  state.isExportPreview = isEnabled;
  exportPreviewButton.classList.toggle("is-active", isEnabled);
  exportPreviewButton.setAttribute("aria-checked", String(isEnabled));
  exportPreviewButton.title = isEnabled ? "Switch to edit mode" : "Switch to export preview";
  if (!isEnabled) {
    state.proofread.activeKey = "";
  }

  renderOutputMirror();
  scheduleOutputScrollRestore();
}

async function checkProofreading() {
  const text = outputText.value;
  if (!text.trim() || state.isProcessing) {
    return;
  }

  const requestId = state.proofread.requestId + 1;
  Object.assign(state.proofread, {
    requestId,
    groups: [],
    dismissedKeys: new Set(),
    isChecking: true,
    activeKey: "",
  });
  outputEditor.classList.add("is-checking");
  renderOutputMirror();

  try {
    const matches = await runLanguageToolChecks(text, {
      language: languageToolLanguageFor(languageSelect.value),
      isCancelled: () => requestId !== state.proofread.requestId,
    });
    if (requestId !== state.proofread.requestId) {
      return;
    }

    state.proofread.groups = groupProofreadMatches(matches);
    const count = state.proofread.groups.length;
    showToast(
      count === 0
        ? "Spell check found no issues."
        : `Spell check found ${count} item${count === 1 ? "" : "s"}. Click a highlighted word to review.`,
    );
  } catch (error) {
    if (requestId !== state.proofread.requestId) {
      return;
    }

    console.error(error);
    showToast(getProofreadingErrorMessage(error), true);
  } finally {
    if (requestId === state.proofread.requestId) {
      state.proofread.isChecking = false;
      outputEditor.classList.remove("is-checking");
      renderOutputMirror();
    }
  }
}

function clearProofreadingResults() {
  Object.assign(state.proofread, {
    requestId: state.proofread.requestId + 1,
    groups: [],
    dismissedKeys: new Set(),
    isChecking: false,
    activeKey: "",
  });
  outputEditor.classList.remove("is-checking");
  renderOutputMirror();
}

function getVisibleProofreadGroups() {
  return state.proofread.groups.filter((group) => !state.proofread.dismissedKeys.has(group.key));
}

function renderOutputMirror() {
  const isPreview = state.isExportPreview;
  outputEditor.classList.toggle("is-proofreading", isPreview);
  outputMirror.hidden = !isPreview;
  outputText.hidden = isPreview;
  outputText.readOnly = isPreview;

  if (!isPreview) {
    outputMirror.replaceChildren();
    renderProofreadPanel();
    return;
  }

  const text = outputText.value;
  const highlights = collectProofreadHighlights(getVisibleProofreadGroups(), text.length);
  const fragment = document.createDocumentFragment();

  for (const row of buildCxAlloyPreviewRows(text)) {
    const isRemoved = state.removedRowKeys.has(row.key);
    const rowElement = document.createElement("div");
    rowElement.className = "mirror-export-row";
    rowElement.classList.toggle("is-removed", isRemoved);

    const lineType = document.createElement("span");
    lineType.className = "mirror-line-type";
    lineType.textContent = "Information";

    const description = document.createElement("span");
    description.className = "mirror-line-description";
    appendHighlightedText(description, row.text, row.start, highlights);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "mirror-row-toggle";
    toggle.dataset.cxRowKey = row.key;
    const label = isRemoved ? "Restore row to export" : "Remove row from export";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.textContent = isRemoved ? "↺" : "×";

    rowElement.append(lineType, description, toggle);
    fragment.append(rowElement);
  }

  outputMirror.replaceChildren(fragment);
  restoreOutputScrollPosition();
  renderProofreadPanel();
}

function appendHighlightedText(container, text, rowStart, highlights) {
  const rowEnd = rowStart + text.length;
  let cursor = 0;

  for (const highlight of highlights) {
    if (highlight.end <= rowStart || highlight.start >= rowEnd) {
      continue;
    }

    const localStart = Math.max(highlight.start, rowStart) - rowStart;
    const localEnd = Math.min(highlight.end, rowEnd) - rowStart;
    if (localStart > cursor) {
      container.append(document.createTextNode(text.slice(cursor, localStart)));
    }

    const span = document.createElement("span");
    span.className = "output-highlight";
    span.dataset.proofreadKey = highlight.key;
    span.setAttribute("role", "button");
    span.setAttribute("tabindex", "0");
    const highlightText = text.slice(localStart, localEnd);
    if (/^\s+$/.test(highlightText)) {
      span.classList.add("is-whitespace");
      span.title = "Whitespace issue";
      span.textContent = highlightText.replace(/ /g, "·").replace(/\t/g, "⇥");
    } else {
      span.textContent = highlightText;
    }

    container.append(span);
    cursor = localEnd;
  }

  if (cursor < text.length) {
    container.append(document.createTextNode(text.slice(cursor)));
  }
}

function handleOutputMirrorClick(event) {
  const rowToggle = event.target.closest?.("[data-cx-row-key]");
  if (rowToggle) {
    event.preventDefault();
    event.stopPropagation();
    toggleExportRow(rowToggle.dataset.cxRowKey);
    return;
  }

  const highlight = event.target.closest?.("[data-proofread-key]");
  if (highlight) {
    event.preventDefault();
    event.stopPropagation();
    activateProofreadGroup(highlight.dataset.proofreadKey);
  }
}

function handleOutputMirrorKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const highlight = event.target.closest?.("[data-proofread-key]");
  if (highlight) {
    event.preventDefault();
    activateProofreadGroup(highlight.dataset.proofreadKey);
  }
}

function toggleExportRow(key) {
  if (state.removedRowKeys.has(key)) {
    state.removedRowKeys.delete(key);
  } else {
    state.removedRowKeys.add(key);
  }

  renderOutputMirror();
  updateTextStats();
}

function activateProofreadGroup(key) {
  if (!key || state.proofread.activeKey === key) {
    return;
  }

  state.proofread.activeKey = key;
  renderProofreadPanel();
}

function clearProofreadFocus() {
  if (state.proofread.activeKey) {
    state.proofread.activeKey = "";
    renderProofreadPanel();
  }
}

function renderProofreadPanel() {
  const visibleGroups = getVisibleProofreadGroups();
  const activeGroup = state.isExportPreview
    ? visibleGroups.find((group) => group.key === state.proofread.activeKey)
    : null;

  proofreadPanel.hidden = !activeGroup;
  if (!activeGroup) {
    proofreadList.replaceChildren();
    return;
  }

  proofreadStatus.textContent = `${visibleGroups.length} suggestion${visibleGroups.length === 1 ? "" : "s"} to review`;
  proofreadList.replaceChildren(createProofreadCard(activeGroup));
  scheduleProofreadActionButtonFit();
}

function createProofreadCard(group) {
  const card = document.createElement("article");
  card.className = "proofread-card is-active";
  card.dataset.proofreadKey = group.key;

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
  dismissButton.className = "btn btn-text proofread-dismiss";
  dismissButton.textContent = "Ignore";
  dismissButton.addEventListener("click", () => dismissProofreadGroup(group));
  header.append(titleWrap, dismissButton);

  const { before, matched, after } = group.matches[0].contextText;
  const context = document.createElement("p");
  context.className = "proofread-context";
  const mark = document.createElement("mark");
  mark.textContent = matched;
  context.append(document.createTextNode(before), mark, document.createTextNode(after));

  const replacementShell = document.createElement("div");
  replacementShell.className = "proofread-replacement-shell";

  const replacementRow = document.createElement("div");
  replacementRow.className = "proofread-replacements";
  const visibleReplacements = (group.replacements || []).slice(0, 2);
  replacementRow.classList.toggle("is-single", visibleReplacements.length === 1);
  replacementRow.classList.toggle("is-empty", visibleReplacements.length === 0);

  if (visibleReplacements.length === 0) {
    const noReplacement = document.createElement("span");
    noReplacement.className = "proofread-note";
    noReplacement.textContent = "No automatic replacement available.";
    noReplacement.style.gridColumn = "1 / -1";
    replacementRow.append(noReplacement);
  }

  visibleReplacements.forEach((replacement, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-soft proofread-replacement";
    button.textContent = replacement.value;
    button.style.gridColumn = String(index + 1);
    button.style.width = "100%";
    button.addEventListener("click", () => applyProofreadReplacement(group, replacement.value));
    replacementRow.append(button);
  });

  const customRow = document.createElement("div");
  customRow.className = "proofread-custom-dock";
  customRow.id = `proofread-custom-${group.matches[0].offset}`;

  const customInput = document.createElement("input");
  customInput.type = "text";
  customInput.className = "proofread-custom-input";
  customInput.placeholder = "Type your own";
  customInput.setAttribute("aria-label", "Custom replacement");

  const applyCustom = () => {
    const replacement = customInput.value.trim();
    if (replacement) {
      applyProofreadReplacement(group, replacement);
    }
  };

  customInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCustom();
    }
  });

  const customButton = document.createElement("button");
  customButton.type = "button";
  customButton.className = "btn btn-soft proofread-custom-apply";
  customButton.textContent = "Apply";
  customButton.addEventListener("click", applyCustom);

  const customControls = document.createElement("div");
  customControls.className = "proofread-custom-controls";
  customControls.append(customInput, customButton);
  customRow.append(customControls);

  const customToggle = document.createElement("button");
  customToggle.type = "button";
  customToggle.className = "btn btn-text proofread-custom-toggle";
  customToggle.textContent = "Custom";
  customToggle.setAttribute("aria-expanded", "false");
  customToggle.setAttribute("aria-controls", customRow.id);
  customToggle.style.gridColumn = visibleReplacements.length === 1 ? "3" : String(Math.max(2, visibleReplacements.length + 1));
  customToggle.style.width = "100%";
  customToggle.addEventListener("click", () => {
    const shouldExpand = !replacementShell.classList.contains("is-custom-open");
    replacementShell.classList.toggle("is-custom-open", shouldExpand);
    customToggle.classList.toggle("is-active", shouldExpand);
    customToggle.setAttribute("aria-expanded", String(shouldExpand));
    if (shouldExpand) {
      window.requestAnimationFrame(() => customInput.focus());
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn btn-text proofread-delete";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => applyProofreadReplacement(group, ""));

  replacementRow.append(customToggle);
  replacementShell.append(replacementRow, customRow, deleteButton);
  card.append(header, context, replacementShell);
  return card;
}

function dismissProofreadGroup(group) {
  state.proofread.dismissedKeys.add(group.key);
  state.proofread.activeKey = "";
  renderOutputMirror();
}

function applyProofreadReplacement(group, replacement) {
  const previousRowCount = buildCxAlloyPreviewRows(outputText.value).length;
  const { text, edits } = applyReplacementToMatches(outputText.value, group.matches, replacement);

  outputText.value = text;
  state.proofread.groups = state.proofread.groups
    .filter((entry) => entry.key !== group.key)
    .map((entry) => rebuildGroupAfterEdits(entry, edits, text));
  state.proofread.activeKey = "";

  // Removed-row keys are positional; if a fix removed a whole line they no longer line up.
  if (buildCxAlloyPreviewRows(text).length !== previousRowCount) {
    state.removedRowKeys = new Set();
  }

  updateTextStats();
  renderOutputMirror();
}

function scheduleProofreadActionButtonFit() {
  window.cancelAnimationFrame(proofreadActionFitFrame);
  proofreadActionFitFrame = window.requestAnimationFrame(fitProofreadActionButtons);
}

function fitProofreadActionButtons() {
  for (const button of proofreadList.querySelectorAll(".proofread-replacement, .proofread-custom-toggle")) {
    if (button.clientWidth === 0) {
      continue;
    }

    button.style.fontSize = "";
    const baseSize = Number.parseFloat(window.getComputedStyle(button).fontSize) || 16;
    const minSize = Math.max(11, baseSize * 0.72);
    let size = baseSize;

    while (size > minSize && (button.scrollWidth > button.clientWidth || button.scrollHeight > button.clientHeight)) {
      size = Math.max(minSize, size - 0.5);
      button.style.fontSize = `${size}px`;
    }
  }
}

// ---------------------------------------------------------------------------
// Editor scroll sync between the textarea and the export preview
// ---------------------------------------------------------------------------

function handleOutputScroll(event) {
  if (scroll.isSyncing) {
    return;
  }

  const source = event.currentTarget;
  const target = source === outputText ? outputMirror : outputText;
  scroll.top = source.scrollTop;
  scroll.left = source.scrollLeft;
  scroll.isSyncing = true;
  target.scrollTop = scroll.top;
  target.scrollLeft = scroll.left;
  scroll.isSyncing = false;
}

function captureOutputScrollPosition() {
  const source = state.isExportPreview ? outputMirror : outputText;
  scroll.top = source.scrollTop;
  scroll.left = source.scrollLeft;
}

function scheduleOutputScrollRestore() {
  cancelAnimationFrame(scroll.restoreFrame);
  scroll.restoreFrame = requestAnimationFrame(() => {
    scroll.restoreFrame = requestAnimationFrame(() => {
      scroll.restoreFrame = 0;
      restoreOutputScrollPosition();
    });
  });
}

function restoreOutputScrollPosition() {
  if (scroll.isSyncing) {
    return;
  }

  scroll.isSyncing = true;
  for (const element of [outputText, outputMirror]) {
    element.scrollTop = scroll.top;
    element.scrollLeft = scroll.left;
  }
  scroll.isSyncing = false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function exportCxAlloyWorkbook() {
  const rows = buildCxAlloyRows(outputText.value, state.removedRowKeys);
  if (rows.length === 0) {
    showToast("No text lines were available to export.", true);
    return;
  }

  const defaultFileName = getDefaultCxAlloyExportName(state.file?.name);
  const chosenFileName = await askForFileName(defaultFileName);
  if (chosenFileName === null) {
    return;
  }

  try {
    await writeCxAlloyWorkbook(rows, normalizeExportFileName(chosenFileName, defaultFileName));
    showToast("CxAlloy workbook exported.");
  } catch (error) {
    console.error(error);
    showToast("Could not export the CxAlloy workbook.", true);
  }
}

async function copyText() {
  const text = outputText.value.trim();
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    outputText.hidden = false;
    outputText.select();
    document.execCommand("copy");
    outputText.hidden = state.isExportPreview;
  }

  showToast("Copied to clipboard.");
}

function handleOutputTextInput() {
  state.removedRowKeys = new Set();
  updateTextStats();
}

function handleDocumentClick(event) {
  const clickedHighlight = event.target.closest?.("[data-proofread-key]");
  if (!clickedHighlight && !proofreadPanel.contains(event.target)) {
    clearProofreadFocus();
  }

  if (advancedSettings.open && !advancedSettings.contains(event.target)) {
    advancedSettings.open = false;
  }
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
  const fileName = state.file?.name;
  const title = encodeURIComponent(`Bug: ${fileName || "Image to Text"}`);
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
      `- Page: ${window.location.href}`,
      `- Browser: ${navigator.userAgent || "Unknown browser"}`,
      `- File name: ${fileName || "No file loaded"}`,
      "",
      "## Additional notes",
      "",
    ].join("\n"),
  );

  return `${repoUrl}?title=${title}&body=${body}`;
}

function resetApp() {
  if (state.isProcessing) {
    return;
  }

  releaseSource();
  state.file = null;
  state.extractedPages = [];
  state.removedRowKeys = new Set();
  fileInput.value = "";
  outputText.value = "";
  fileStatus.textContent = "No file selected";
  pageCountLabel.textContent = "0";
  dropzone.classList.remove("has-file");
  dropzoneShell.classList.remove("has-file");
  resetPreview();
  setExportPreviewMode(false);
  clearProofreadingResults();
  setProgress("Upload a document to read the text.", 0);
  updateTextStats();
}

// ---------------------------------------------------------------------------
// UI state helpers
// ---------------------------------------------------------------------------

function resetPreview() {
  dropzonePreview.className = "dropzone-preview";
  dropzonePreview.replaceChildren();
}

function addPreviewPage(wrapper, media, label) {
  const page = document.createElement("figure");
  page.className = "preview-page";
  const caption = document.createElement("figcaption");
  caption.className = "page-label";
  caption.textContent = label;
  page.append(media, caption);
  wrapper.append(page);
}

function setProcessing(isProcessing) {
  state.isProcessing = isProcessing;
  dropzoneShell.classList.toggle("is-processing", isProcessing);
  for (const control of [fileInput, clearUploadButton, languageSelect, formatSelect, embeddedTextToggle, autoFixCapsToggle]) {
    control.disabled = isProcessing;
  }
  updateTextStats();
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
  extractStatus.hidden = !state.isProcessing;
}

function updateTextStats() {
  const length = outputText.value.length;
  const rowCount = buildCxAlloyRows(outputText.value, state.removedRowKeys).length;
  textStats.textContent = length.toLocaleString();
  copyButton.disabled = length === 0;
  exportCxAlloyButton.disabled = rowCount === 0 || state.isProcessing;
  exportPreviewButton.disabled = length === 0 || state.isProcessing;
}

function initializeClipboardShortcutLabel() {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  clipboardShortcutText.textContent = isMacPlatform(platform) ? "Cmd" : "Ctrl";
}

function initializeStoredToggle(toggle, key, defaultValue) {
  const savedValue = readStoredValue(key);
  toggle.checked = savedValue === null ? defaultValue : savedValue === "true";
}

function readStoredValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

resetApp();

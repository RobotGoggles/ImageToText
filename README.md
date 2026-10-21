# Image to Text

A lightweight browser app that turns PDFs and screenshots into editable text and
CxAlloy import spreadsheets. Everything runs in the browser; there is no server.

## Features

- Drag and drop, browse for, or paste (Cmd/Ctrl+V) a PDF or image
- Page previews for PDFs and screenshots
- Uses a PDF's embedded text when it has one, keeping its line and paragraph breaks
- OCR fallback with Tesseract.js, rendering PDF pages at about 300 DPI for accuracy
- Formatting modes: preserve paragraphs, clean copy text, or raw output
- ALL CAPS fixer that keeps commissioning acronyms (HVAC, AHU, VAV, CFM, ...) and
  equipment tags (AHU-1, VAV-2-14, 480V) intact
- Export preview showing each CxAlloy row, with any row removable before export
- Optional spell check through LanguageTool (off by default, see Privacy)
- Export to a CxAlloy-formatted `.xlsx` (Line Type / Description columns)
- Copy to clipboard

## Run locally

Start a static file server from this folder:

```sh
python3 -m http.server 5173
```

Then open <http://localhost:5173>.

The app loads PDF.js, Tesseract.js and SheetJS from CDNs, so the browser needs
internet access the first time those libraries and the OCR language data load.

## Privacy

Files are processed in your browser and are not uploaded anywhere. The one
exception is spell check: when **Settings → Spell check in export preview** is on,
the extracted text is sent to the public [LanguageTool](https://languagetool.org)
API. It is off by default; leave it off for confidential documents. The free
LanguageTool API also limits how much text can be checked per minute.

## Project layout

| Path | What it does |
| --- | --- |
| `index.html`, `styles.css` | Page markup and styling |
| `app.js` | App state and UI wiring |
| `src/extraction.js` | PDF rendering, embedded text and OCR (PDF.js, Tesseract.js) |
| `src/pdf-text.js` | Rebuilds lines and paragraphs from PDF text items |
| `src/text-cleanup.js` | Formatting modes and the ALL CAPS fixer |
| `src/cxalloy-export.js` | CxAlloy rows and `.xlsx` export (SheetJS) |
| `src/proofreading.js` | LanguageTool requests, grouping and applying fixes |
| `src/file-utils.js`, `src/ui.js` | File checks, toasts and the save dialog |
| `tests/` | Unit tests for the pure modules |

To add an acronym the ALL CAPS fixer should keep, add it to `acronymWhitelist` in
`src/text-cleanup.js`.

## Tests

The tests use Node's built-in test runner (Node 20 or newer), so there is nothing
to install:

```sh
npm test
```

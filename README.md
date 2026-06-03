# Image to Text

A lightweight browser app for turning PDFs and screenshots into editable, copyable text.

## Features

- Drag-and-drop PDF or image upload
- PDF and screenshot preview
- Embedded PDF text extraction when available
- OCR fallback with Tesseract.js
- Basic cleanup modes for copy-ready text
- Copy to clipboard
- Download as `.txt`

## Run Locally

Start a static file server from this folder:

```sh
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

The app uses CDN-hosted PDF.js and Tesseract.js, so the browser needs internet access the first time those libraries load.

# TESSERACT.JS FILE DOWNLOAD INSTRUCTIONS

## ⚠️ CRITICAL: Missing tesseract.min.js

Your extension currently has `tesseract.esm.min.js` but needs `tesseract.min.js` (UMD build).

## Download Required File

**Option 1: Direct Download (Recommended)**

Download from jsDelivr:
```
https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js
```

Save as: `e:\eGP Document Helper\tesseract\tesseract.min.js`

**Option 2: npm**

```powershell
cd "e:\eGP Document Helper"
npm install tesseract.js@5.1.1
copy node_modules\tesseract.js\dist\tesseract.min.js tesseract\tesseract.min.js
```

## Verify Files

After downloading, your `tesseract/` folder should contain:

```
tesseract/
├── tesseract.min.js           ← NEW FILE (UMD build for <script> tag)
├── tesseract.esm.min.js       ← You can delete this (ESM not used)
├── worker.min.js              ✓
├── tesseract-core.wasm.js     ✓
└── lang-data/
    └── eng.traineddata.gz     ✓
```

## Why tesseract.min.js?

- `tesseract.min.js` = UMD build, exposes global `Tesseract` object
- `tesseract.esm.min.js` = ES Module, requires `import` (doesn't work in `<script>` tags)

The offscreen document loads via `<script src="tesseract/tesseract.min.js">` which requires UMD.

## Test After Download

1. Reload extension in `chrome://extensions`
2. Open DevTools → Application → Service Workers
3. Check Console for: `"Offscreen OCR processor ready"`
4. Test OCR - should see: `"createWorker: function"`

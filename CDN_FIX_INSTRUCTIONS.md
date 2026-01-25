# CDN Access Fix for Tesseract OCR

## Problem
The `tesseract/worker.min.js` file contains hardcoded CDN URLs for loading language data and core files. Even with explicit local path configuration, Chrome blocks these CDN requests due to Content Security Policy in Manifest V3.

## Root Cause
Line in worker.min.js contains:
```javascript
f=o||"https://cdn.jsdelivr.net/npm/tesseract.js-core@v"
```

And:
```javascript
"https://cdn.jsdelivr.net/npm/@tesseract.js-data/"
```

These are fallback URLs that trigger when Tesseract tries to load resources.

## Solution: Download Tesseract Bundle WITHOUT CDN

The issue is we downloaded the wrong build. We need the **offline/local-only** build.

### Step 1: Delete Current Files
Delete the current `tesseract/` folder completely:
```powershell
Remove-Item "e:\eGP Document Helper\tesseract" -Recurse -Force
```

### Step 2: Download Correct Build

**Option A: Use tesseract.js-offline build (if available)**
Check if there's a `-offline` or `-local` variant on npm/jsDelivr

**Option B: Manual Fix (Recommended)**

1. **Keep current files** but modify worker.min.js to use local paths

2. **Open** `tesseract/worker.min.js` in a text editor

3. **Find** (Ctrl+F):
   ```
   "https://cdn.jsdelivr.net/npm/tesseract.js-core@v"
   ```

4. **Replace with**:
   ```
   chrome.runtime.getURL("tesseract/tesseract-core")+"@v"
   ```

5. **Find**:
   ```
   "https://cdn.jsdelivr.net/npm/@tesseract.js-data/"
   ```

6. **Replace with**:
   ```
   chrome.runtime.getURL("tesseract/lang-data")+"/"
   ```

### Step 3: Alternative - Use Tesseract.js Worker Blob

Create a custom worker that doesn't use network at all:

```javascript
// In offscreen.js
async function runOCR(imageDataUrl) {
  // Create inline worker without network access
  const workerBlob = new Blob([`
    // Inline worker code that uses only local resources
    importScripts('${chrome.runtime.getURL("tesseract/tesseract.min.js")}');
    // ... custom worker logic
  `], { type: 'application/javascript' });
  
  const workerURL = URL.createObjectURL(workerBlob);
  
  // Use this custom worker URL
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: workerURL,
    // ... rest of config
  });
}
```

## Step 4: Pre-Load Language Data

Instead of letting Tesseract load traineddata, load it manually:

```javascript
// Fetch traineddata manually
const traindataPath = chrome.runtime.getURL('tesseract/lang-data/eng.traineddata.gz');
const response = await fetch(traindataPath);
const traindataBlob = await response.blob();

// Pass directly to Tesseract
const worker = await Tesseract.createWorker({
  lang: 'eng',
  langPath: traindataBlob, // Pass blob directly
  // ...
});
```

## Recommended Fix

**Use Tesseract.js v4 instead of v5**

V4 has better offline support:

1. Download from: https://github.com/naptha/tesseract.js/releases/tag/v4.1.4
2. Extract:
   - `tesseract.min.js`
   - `worker.min.js` 
   - `tesseract-core.wasm.js`
   - `eng.traineddata.gz`

3. v4 doesn't have hardcoded CDN fallbacks like v5

## Testing

After applying any fix, test in Service Worker console:
```javascript
// Should see NO network errors
// Check Network tab in DevTools
```

---

**Current Status**: Need to either patch worker.min.js manually or download Tesseract v4

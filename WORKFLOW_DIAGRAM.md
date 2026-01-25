# 📊 OCR Workflow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                         (popup.html)                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📷 Scan Tender IDs from Document (OCR) [Button]        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [Input Box] - Tender IDs will appear here              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ User clicks OCR button
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      POPUP SCRIPT                               │
│                      (popup.js)                                 │
│                                                                 │
│  • Disable button, show "Scanning document..."                 │
│  • Send message: { action: 'captureScreenshot' }               │
│  • Wait for response from background                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKGROUND SERVICE WORKER                     │
│                      (background.js)                            │
│                                                                 │
│  1. Receive 'captureScreenshot' message                        │
│  2. Get current active tab                                     │
│  3. Call chrome.tabs.captureVisibleTab()                       │
│  4. Capture PNG screenshot (100% quality)                      │
│  5. Convert to base64 data URL                                 │
│  6. Send back to popup                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Returns: { success: true, imageDataUrl: "data:image/png;base64,..." }
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      POPUP SCRIPT                               │
│                      (popup.js)                                 │
│                                                                 │
│  • Receive screenshot                                          │
│  • Show "Processing OCR... 0%"                                 │
│  • Create Web Worker                                           │
│  • Send image to worker: { action: 'processOCR', imageDataUrl }│
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WEB WORKER                                 │
│                    (ocr-worker.js)                              │
│                                                                 │
│  Step 1: Load Tesseract.js from CDN                            │
│          importScripts('tesseract.min.js')                     │
│                                                                 │
│  Step 2: Initialize Tesseract worker                           │
│          const worker = await Tesseract.createWorker('eng')    │
│                                                                 │
│  Step 3: Run OCR recognition                                   │
│          const { data } = await worker.recognize(image)        │
│                                                                 │
│  Step 4: Send progress updates                                 │
│          postMessage({ type: 'progress', progress: 25 })       │
│          postMessage({ type: 'progress', progress: 50 })       │
│          postMessage({ type: 'progress', progress: 75 })       │
│                                                                 │
│  Step 5: Extract Tender IDs                                    │
│          const regex = /\b\d{6,8}\b/g                          │
│          const matches = data.text.match(regex)                │
│                                                                 │
│  Step 6: Remove duplicates                                     │
│          const unique = [...new Set(matches)]                  │
│                                                                 │
│  Step 7: Join with commas                                      │
│          const idsString = unique.join(', ')                   │
│                                                                 │
│  Step 8: Send result back                                      │
│          postMessage({                                         │
│            type: 'result',                                     │
│            success: true,                                      │
│            tenderIds: ['1211960', '1205553', ...],             │
│            idsString: '1211960, 1205553, 1214558',            │
│            count: 3                                            │
│          })                                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Processing complete
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      POPUP SCRIPT                               │
│                      (popup.js)                                 │
│                                                                 │
│  • Receive extracted IDs                                       │
│  • Fill input box: tenderIdInput.value = idsString             │
│  • Copy to clipboard: navigator.clipboard.writeText()          │
│  • Show success: "✅ 3 Tender ID(s) extracted and copied!"     │
│  • Re-enable button                                            │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         USER CAN NOW:                           │
│                                                                 │
│  • See IDs in input box                                        │
│  • IDs already in clipboard (Ctrl+V to paste)                  │
│  • Click "Download PDF(s)" to download                         │
│  • Click "Open Tender(s)" to open in tabs                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Flow

```
┌─────────────────┐
│   Initial       │  Button: "📷 Scan Tender IDs from Document (OCR)"
│   State         │  Status: (none)
└────────┬────────┘
         │ User clicks button
         ▼
┌─────────────────┐
│  Capturing      │  Button: "⏳ Scanning document..."
│  Screenshot     │  Status: "Capturing document..."
└────────┬────────┘
         │ Screenshot captured
         ▼
┌─────────────────┐
│   Starting      │  Button: "🔍 Processing OCR..."
│   OCR           │  Status: "Running OCR on document..."
└────────┬────────┘
         │ Worker started
         ▼
┌─────────────────┐
│  Processing     │  Button: "🔍 Processing OCR..."
│  OCR            │  Status: "Processing OCR... 25%"
│  (0-100%)       │         "Processing OCR... 50%"
└────────┬────────┘         "Processing OCR... 75%"
         │ OCR complete
         ▼
┌─────────────────┐
│   Success       │  Button: "📷 Scan Tender IDs from Document (OCR)"
│   State         │  Status: "✅ 3 Tender ID(s) extracted and copied!"
│                 │  Input: "1211960, 1205553, 1214558"
└─────────────────┘  Clipboard: "1211960, 1205553, 1214558"

         OR

┌─────────────────┐
│   Error         │  Button: "📷 Scan Tender IDs from Document (OCR)"
│   State         │  Status: "No Tender IDs detected in document"
└─────────────────┘         OR "Failed to capture screenshot"
                            OR "OCR processing timed out"
```

---

## Data Flow

```
USER DOCUMENT
    │
    │ (Visual content visible on screen)
    │
    ▼
CHROME TAB
    │
    │ chrome.tabs.captureVisibleTab()
    │
    ▼
PNG SCREENSHOT
    │
    │ base64 data URL
    │ (e.g., "data:image/png;base64,iVBORw0KG...")
    │
    ▼
TESSERACT.JS
    │
    │ OCR recognition
    │
    ▼
RAW TEXT
    │
    │ Example: "Tender ID: 1211960\nProject: 1205553\n..."
    │
    ▼
REGEX EXTRACTION
    │
    │ /\b\d{6,8}\b/g
    │
    ▼
MATCHES ARRAY
    │
    │ ['1211960', '1205553', '1214558', '1205553']
    │
    ▼
UNIQUE ARRAY
    │
    │ [...new Set(matches)]
    │ ['1211960', '1205553', '1214558']
    │
    ▼
COMMA-SEPARATED STRING
    │
    │ unique.join(', ')
    │ "1211960, 1205553, 1214558"
    │
    ▼
USER INTERFACE
    │
    ├─→ Input box filled
    └─→ Clipboard copied
```

---

## Component Interaction

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   popup.js   │◄────────┤ background.js│         │ ocr-worker.js│
│              │         │              │         │              │
│ • UI Logic   │ Message │ • Screenshot │         │ • OCR Engine │
│ • OCR Coord. │────────►│   Capture    │         │ • Tesseract  │
│ • Worker Mgmt│         │ • Tab Access │         │ • ID Extract │
└──────┬───────┘         └──────────────┘         └──────▲───────┘
       │                                                  │
       │ Create Worker                                   │
       └──────────────────────────────────────────────────┘
                         postMessage()
```

---

## Message Flow

### 1. Capture Screenshot
```javascript
popup.js → background.js
{
  action: 'captureScreenshot'
}

background.js → popup.js
{
  success: true,
  imageDataUrl: 'data:image/png;base64,...'
}
```

### 2. Process OCR
```javascript
popup.js → ocr-worker.js
{
  action: 'processOCR',
  imageDataUrl: 'data:image/png;base64,...'
}

ocr-worker.js → popup.js (progress updates)
{
  type: 'progress',
  progress: 25
}
{
  type: 'progress',
  progress: 50
}

ocr-worker.js → popup.js (final result)
{
  type: 'result',
  success: true,
  tenderIds: ['1211960', '1205553', '1214558'],
  idsString: '1211960, 1205553, 1214558',
  count: 3
}
```

---

## Timeline Example

```
Time  Event
──────────────────────────────────────────────────────────
0s    User clicks "📷 Scan Tender IDs"
0s    Button disabled, status: "Capturing document..."
0.1s  Message sent to background.js
0.2s  chrome.tabs.captureVisibleTab() called
0.5s  Screenshot captured (PNG, ~500KB)
0.6s  Screenshot sent back to popup.js
0.7s  Status: "Running OCR on document..."
0.8s  Web Worker created, Tesseract loaded from CDN
2s    Tesseract initialized
3s    OCR started, status: "Processing OCR... 10%"
8s    Status: "Processing OCR... 50%"
15s   Status: "Processing OCR... 90%"
18s   OCR complete, text extracted
18.1s Regex applied, IDs found
18.2s Result sent to popup.js
18.3s Input filled, clipboard updated
18.4s Status: "✅ 3 Tender ID(s) extracted!"
18.5s Button re-enabled
```

**Total Time**: ~18 seconds (varies by document complexity)

---

## Error Handling Flow

```
┌─────────────────┐
│  User Action    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Try Capture     │
│ Screenshot      │
└────┬───────┬────┘
     │       │
     │       └──► Chrome internal page? ──► ERROR: "Cannot capture"
     │
     ▼
┌─────────────────┐
│  Try OCR        │
│  Processing     │
└────┬───────┬────┘
     │       │
     │       ├──► Timeout (60s)? ──► ERROR: "Processing timed out"
     │       │
     │       └──► Worker crash? ──► ERROR: "OCR worker error"
     │
     ▼
┌─────────────────┐
│  Try Extract    │
│  IDs            │
└────┬───────┬────┘
     │       │
     │       └──► No matches? ──► ERROR: "No Tender IDs detected"
     │
     ▼
┌─────────────────┐
│    SUCCESS      │
└─────────────────┘
```

---

## Performance Characteristics

| Stage | Time | CPU | Memory |
|-------|------|-----|--------|
| Screenshot | 0.5s | Low | 0.5MB |
| Load Tesseract | 2s | Low | 5MB |
| OCR Processing | 10-25s | **High** | 50MB |
| Regex Extract | 0.1s | Low | 1MB |
| Total | **15-30s** | High | 56MB |

**Bottleneck**: OCR recognition phase (CPU-intensive)  
**Optimization**: Web Worker keeps UI responsive

---

**Version**: 1.3.0  
**Last Updated**: January 21, 2026  
**Developer**: MD SIAMUL ISLAM

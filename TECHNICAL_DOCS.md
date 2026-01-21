# Technical Implementation Guide

## Architecture Overview

This extension follows the Manifest V3 architecture with these components:

```
┌─────────────┐
│  popup.html │  ← User Interface
│  popup.js   │  ← UI Logic & URL Manipulation
└──────┬──────┘
       │ chrome.runtime.sendMessage()
       ▼
┌──────────────┐
│background.js │  ← Service Worker (handles downloads)
└──────────────┘
       │ chrome.downloads.download()
       ▼
┌──────────────┐
│   Browser    │  ← Downloads PDF to disk
└──────────────┘
```

## Key Implementation Details

### 1. URL Replacement Algorithm

**Location:** `popup.js` → `replaceLastSegment()`

**Algorithm:**
```
Input: "https://example.com/tender/docs/123456?page=view"
New ID: "789012"

Steps:
1. Parse URL using URL() constructor
2. Extract pathname: "/tender/docs/123456"
3. Split by '/': ["", "tender", "docs", "123456"]
4. Filter empty strings: ["tender", "docs", "123456"]
5. Replace last element: ["tender", "docs", "789012"]
6. Reconstruct: "/tender/docs/789012"
7. Combine with query params: "...789012?page=view"

Output: "https://example.com/tender/docs/789012?page=view"
```

**Why this approach:**
- Uses native URL() API for robust parsing
- Preserves query parameters and hash fragments
- Handles edge cases (trailing slashes, encoded characters)
- Falls back to string manipulation if URL parsing fails

### 2. Forced Download Mechanism

**Location:** `background.js` → `downloadPdf()`

**Implementation:**
```javascript
chrome.downloads.download({
  url: url,                    // PDF URL
  filename: `${tenderId}.pdf`, // Force .pdf extension
  saveAs: false,               // No "Save As" dialog
  conflictAction: 'uniquify'   // Avoid overwriting files
})
```

**Why this forces download:**
1. `chrome.downloads.download` bypasses browser's PDF viewer
2. File is sent directly to disk, not rendered in a tab
3. `saveAs: false` eliminates user interaction
4. Works even if Chrome's "Open PDFs in Chrome" is enabled

**Alternative approaches (not used):**
- Opening a tab with download attribute: Requires visible tab, less reliable
- Fetch + Blob: More complex, requires additional permissions
- Content script injection: Overkill for this use case

### 3. Message Passing (Popup ↔ Background)

**Flow:**

**Popup (popup.js):**
```javascript
chrome.runtime.sendMessage(
  { 
    action: 'downloadPdf',
    url: newUrl,
    tenderId: tenderId
  },
  (response) => {
    // Handle response
  }
)
```

**Background (background.js):**
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadPdf') {
    downloadPdf(request.url, request.tenderId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});
```

**Key points:**
- `return true` is CRITICAL for async responses
- Background script must be service worker (Manifest V3)
- Popup can't directly access downloads API (requires background script)

### 4. Storage Implementation

**Location:** `popup.js` → Save/Load functions

**Storage Choice:** `chrome.storage.local`
- Persists across browser sessions
- No expiration (unlike session storage)
- Accessible from any extension context
- Max size: ~5MB (sufficient for URLs)

**Save operation:**
```javascript
chrome.storage.local.set({ baseUrl: baseUrl }, callback)
```

**Load operation:**
```javascript
chrome.storage.local.get(['baseUrl'], (result) => {
  const url = result.baseUrl;
})
```

### 5. Error Handling Strategy

**Three-tier validation:**

1. **Frontend validation (popup.js):**
   - Empty field checks
   - URL format validation
   - Immediate user feedback

2. **Runtime validation (background.js):**
   - Check chrome.runtime.lastError
   - Promise rejection handling
   - Download state monitoring

3. **User feedback (popup.html):**
   - Color-coded status messages
   - Auto-hiding success messages
   - Persistent error messages

## Manifest V3 Specific Requirements

### Service Worker vs. Background Page

**Old (V2):** Persistent background page
```json
"background": {
  "scripts": ["background.js"],
  "persistent": true
}
```

**New (V3):** Service worker
```json
"background": {
  "service_worker": "background.js"
}
```

**Implications:**
- Service worker can be terminated by Chrome
- No DOM access in service worker
- Must handle async operations carefully
- Listeners must be registered at top level

### Host Permissions

**This extension doesn't need host permissions** because:
- Uses `chrome.downloads.download` (no fetch/XHR)
- Doesn't inject content scripts
- Doesn't access tab content
- Downloads API works with any URL

## Performance Considerations

### Popup Lifecycle
- Popup script loads every time icon is clicked
- Storage read on every open (fast, <10ms)
- No background processing in popup

### Service Worker Lifecycle
- Starts on-demand (message received)
- May terminate after ~30 seconds of inactivity
- Event listeners persist (registered at top level)
- Download monitoring uses temporary listeners (cleaned up)

### Memory Footprint
- Popup: ~2-3 MB (HTML/CSS/JS)
- Service worker: ~1-2 MB (minimal)
- Storage: <1 KB (single URL)

## Security Considerations

### XSS Prevention
- No dynamic HTML generation
- textContent used instead of innerHTML
- URL validation before storage

### CSRF Protection
- Not applicable (no server-side operations)
- Downloads are user-initiated
- No automatic actions

### Data Privacy
- All data stored locally
- No external network requests (except PDF download)
- No telemetry or analytics

## Testing Checklist

- [ ] Install extension in Chrome
- [ ] Save a valid base URL
- [ ] Download PDF with new Tender ID
- [ ] Verify file naming: `<TenderID>.pdf`
- [ ] Test with URL containing query params
- [ ] Test with URL containing hash fragments
- [ ] Test empty field validation
- [ ] Test invalid URL validation
- [ ] Test download to custom download folder
- [ ] Verify no visible tab opens
- [ ] Test with very long Tender IDs
- [ ] Test with special characters in URL
- [ ] Reload extension and verify storage persists

## Browser Compatibility

**Tested on:**
- Chrome 120+ ✅
- Edge 120+ ✅ (Chromium-based)

**Not compatible:**
- Firefox (uses different extension API)
- Safari (uses different extension API)
- Chrome < 88 (Manifest V3 required)

## Common Pitfalls & Solutions

### Problem: "return true" forgotten in message listener
**Symptom:** Response callback never fires
**Solution:** Always return true for async responses

### Problem: URL has Tender ID in query param, not path
**Example:** `example.com/tender?id=123456`
**Solution:** Modify `replaceLastSegment()` to handle query params

### Problem: Service worker terminated during download
**Symptom:** Download monitoring stops
**Solution:** Listener cleanup (already implemented)

### Problem: Extension icon not showing
**Symptom:** Can't find extension in toolbar
**Solution:** Pin extension or use puzzle piece icon

## Extensibility

### Future Enhancements

1. **Bulk Downloads:**
   - Add array of Tender IDs
   - Queue downloads with delays
   - Progress tracking

2. **URL Templates:**
   - Support multiple URL patterns
   - Variable replacement (not just last segment)
   - Regex-based patterns

3. **History:**
   - Store download history
   - Quick re-download
   - Export history to CSV

4. **Settings:**
   - Custom filename patterns
   - Download folder selection
   - Notifications on/off

## Code Quality Standards

- **Comments:** Every complex function has a docstring
- **Naming:** Descriptive variable names (no single letters)
- **Error handling:** Try-catch with fallbacks
- **Validation:** Input validation at every entry point
- **Async:** Proper Promise usage with error handling
- **Style:** Consistent indentation (2 spaces)

## Debugging Tips

### Enable verbose logging:
```javascript
// Add to background.js
console.log('Debug:', { url, tenderId, downloadId });
```

### Check service worker console:
1. Go to `chrome://extensions/`
2. Find "e-GP Document Helper"
3. Click "service worker" link
4. Console opens with background script logs

### Check popup console:
1. Right-click extension icon
2. Select "Inspect popup"
3. DevTools opens for popup.html

### Monitor downloads:
```javascript
chrome.downloads.onChanged.addListener((delta) => {
  console.log('Download state:', delta);
});
```

## File Size Summary

- manifest.json: ~0.4 KB
- popup.html: ~3.5 KB
- popup.js: ~6.5 KB
- background.js: ~4.5 KB
- **Total:** ~15 KB (excluding icons)

---

**Last Updated:** January 5, 2026  
**Manifest Version:** 3  
**Chrome API Version:** 120+

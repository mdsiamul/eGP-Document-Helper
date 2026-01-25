# e-GP Document Helper - Chrome Extension

A Manifest V3 Chrome extension that helps download e-GP tender PDFs and extract Tender IDs from documents using OCR.

## Features

### Core Features
- ✅ Store a base URL with Tender ID
- ✅ Replace only the last path segment (Tender ID) with user input
- ✅ Force PDF download using Chrome's downloads API
- ✅ No visible tabs opened during download
- ✅ Clean and intuitive popup UI
- ✅ Input validation and error handling

### 🆕 OCR Features (v1.3.0)
- ✅ **Scan scanned PDFs** - Extract IDs from non-selectable PDFs
- ✅ **Image document support** - Works with image-based tender notices
- ✅ **Client-side OCR** - Uses Tesseract.js, no server upload
- ✅ **Automatic extraction** - Detects 6-8 digit Tender Proposal IDs
- ✅ **Duplicate removal** - Preserves order, removes duplicates
- ✅ **Auto-fill & clipboard copy** - IDs automatically filled and copied
- ✅ **Progress indicators** - Real-time feedback during OCR

### DOM Selection Features
- ✅ **Screen area selection** - Draw a box to extract Tender IDs from HTML text
- ✅ **Visual selection tool** - Interactive overlay for precise selection

## Installation

### Method 1: Load Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `e:\eGP Document Helper` folder
5. The extension icon should appear in your Chrome toolbar

### Method 2: Manual Installation

1. Ensure all files are in the same folder:
   - `manifest.json`
   - `popup.html`
   - `popup.js`
   - `background.js`

2. (Optional) Add extension icons:
   - Create or add `icon16.png`, `icon48.png`, `icon128.png`
   - If icons are not available, Chrome will use a default icon

3. Follow Method 1 steps to load the extension

## Usage

### Method 1: 🆕 OCR Scan (For Scanned PDFs/Images)

**Best for:** Scanned documents, image-based PDFs, non-selectable text

1. Open a PDF or image document containing Tender IDs
2. Make sure the Tender IDs are **visible** in the current viewport
3. Click the extension icon in Chrome toolbar
4. Click: **"📷 Scan Tender IDs from Document (OCR)"**
5. Wait 10-30 seconds while OCR processes
6. Extracted IDs will be:
   - Auto-filled in the input box
   - Copied to clipboard
   - Displayed in success message

**Example:** IDs like `1211960, 1205553, 1214558` will be automatically detected and extracted.

📖 **See [OCR_FEATURE_GUIDE.md](OCR_FEATURE_GUIDE.md) for detailed OCR documentation**

### Method 2: Select Area (For HTML Pages)

**Best for:** Web pages with selectable text

1. Navigate to a page with Tender IDs in HTML text
2. Click the extension icon
3. Click: **"🎯 Select Area to Extract Tender IDs"**
4. Draw a box around the area containing Tender IDs
5. IDs are extracted from selected DOM text

### Method 3: Manual Entry

**Best for:** When you already know the Tender IDs

1. Click the extension icon in Chrome toolbar
2. In the **Tender ID(s)** field, enter IDs:
   - Separate multiple IDs with commas: `601568, 601569, 601570`
   - Or one per line
3. Click **"Download PDF(s)"** to download tender documents
4. Or click **"Open Tender(s)"** to open them in browser tabs

---

## Testing OCR Feature

We've included a test page to verify OCR functionality:

1. Open `test-ocr.html` in Chrome (located in extension folder)
2. Click the extension icon
3. Click "📷 Scan Tender IDs from Document (OCR)"
4. Expected result: `1211960, 1205553, 1214558, 1198745, 1187632`

### Testing with Real PDFs

1. Print `test-ocr.html` to PDF (Ctrl+P → Save as PDF)
2. Open the generated PDF in Chrome
3. Test OCR scan on the PDF
4. Verify IDs are still extracted correctly

---

## Step 1: Save Base URL (Optional - For Auto-Download)

1. Click the extension icon in Chrome toolbar
2. In the **Base URL** field, paste your complete e-GP portal URL that includes a Tender ID
   - Example: `https://eprocure.gov.in/eprocure/app?page=FrontEndTendersByOrganisation&service=page&TENDER_ID=123456`
3. Click **Save Base URL**
4. You should see a success message and the saved URL displayed

### Step 2: Download PDF with Different Tender ID

1. In the **New Tender ID** field, enter the Tender ID you want to download
   - Example: `789012`
2. Click **Download PDF**
3. The extension will:
   - Replace the last segment of your base URL with the new Tender ID
   - Force download the PDF (no browser preview)
   - Save the file as `<TenderID>.pdf` in your default downloads folder

## How It Works

### URL Replacement Logic

The extension uses smart URL parsing to replace only the last path segment:

**Example:**
- **Base URL:** `https://example.com/tender/documents/123456?page=view`
- **New Tender ID:** `789012`
- **Result:** `https://example.com/tender/documents/789012?page=view`

Key points:
- Query parameters (`?page=view`) are preserved
- Only the last path segment is replaced
- Domain and other path segments remain unchanged

### Automated Download Logic

The extension automates the manual click process:
1. Opens the e-GP page URL in a background tab
2. Waits for the page to fully load
3. Finds the "Save As PDF" button on the page
4. Clicks the button automatically
5. Closes the tab after 2 seconds

**Why this approach:**
- Mimics exactly what a user would do manually
- Works with e-GP portal's built-in download mechanism
- Respects the portal's PDF generation process
- Tab is minimized/background and closes automatically

## File Structure

```
e:\eGP Document Helper\
├── manifest.json              # Extension configuration (Manifest V3)
├── popup.html                 # User interface
├── popup.js                   # UI logic and URL manipulation
├── background.js              # Service worker for downloads & screenshots
├── content.js                 # DOM selection overlay
├── ocr-worker.js             # 🆕 OCR processing with Tesseract.js
├── test-ocr.html             # 🆕 OCR testing page
├── OCR_FEATURE_GUIDE.md      # 🆕 Detailed OCR documentation
├── IMPLEMENTATION_SUMMARY.md  # 🆕 OCR implementation details
├── icon16.png                 # Extension icon (16x16) - Optional
├── icon48.png                 # Extension icon (48x48) - Optional
└── icon128.png                # Extension icon (128x128) - Optional
```

## How It Works

### OCR Processing Flow (NEW in v1.3.0)

1. **Screenshot Capture**
   - User clicks "Scan Tender IDs from Document (OCR)"
   - Extension captures visible tab using `chrome.tabs.captureVisibleTab()`
   - Screenshot is in PNG format (base64 encoded)

2. **OCR Processing**
   - Image sent to Web Worker (`ocr-worker.js`)
   - Tesseract.js recognizes text from image
   - Progress updates shown (0-100%)
   - Processing takes 10-30 seconds depending on image complexity

3. **ID Extraction**
   - Regex pattern `/\b\d{6,8}\b/g` finds 6-8 digit numbers
   - Duplicates removed while preserving order
   - IDs joined with commas: `1211960, 1205553, 1214558`

4. **Auto-fill**
   - Extracted IDs auto-filled in input box
   - IDs copied to clipboard automatically
   - User can immediately download or open tenders

### URL Replacement Logic

- **downloads**: Required to detect and handle PDF downloads
- **storage**: Required to save and retrieve the base URL
- **activeTab**: Required to access the e-GP page content
## Permissions Explained

- **downloads**: Required to detect and handle PDF downloads
- **storage**: Required to save and retrieve the base URL
- **activeTab**: Required to access the current tab content
- **scripting**: Required to inject content scripts
- **tabs**: 🆕 Required for screenshot capture (OCR feature)
- **clipboardWrite**: Required to copy extracted IDs to clipboard

## Limitations

### General
- ❌ No bulk downloads or automation
- ❌ No login/authentication handling
- ❌ No CAPTCHA bypass
- ❌ One download at a time
- ❌ Cannot bypass access restrictions

### OCR Specific
- ⏱️ OCR takes 10-30 seconds (client-side processing)
- 📏 Only captures visible viewport (scroll to see more IDs)
- 🎯 Works best with clear, high-contrast text
- 📋 Extracts 6-8 digit numbers only (configurable in code)
- 🌐 Requires internet for Tesseract.js CDN (first load)

## Troubleshooting

### Extension doesn't appear after installation
- Ensure all required files exist in the folder
- Check Chrome DevTools for any errors in the extension
- Reload the extension from `chrome://extensions/`

### OCR: "Failed to capture screenshot"
- **Cause**: Can't capture Chrome internal pages
- **Solution**: Don't use on `chrome://`, `chrome-extension://` pages
- Works on: HTTP, HTTPS, file:// URLs

### OCR: "No Tender IDs detected"
- **Cause**: OCR found no 6-8 digit numbers
- **Solutions**:
  - Ensure IDs are visible in viewport
  - Zoom in if IDs are too small
  - Check if IDs match format (6-8 digits)
  - Try on clearer document or use "Select Area" feature

### OCR: "Processing timed out"
- **Cause**: OCR took longer than 60 seconds
- **Solutions**:
  - Refresh page and try again
  - Close other heavy tabs to free memory
  - Try on smaller/clearer region

### OCR: Low accuracy
- **Tips for better results**:
  - Use high-resolution documents
  - Ensure good contrast (dark text on light background)
  - Avoid skewed or rotated text
  - Zoom to 100-150% for small text
  - Try "Select Area" feature for HTML pages instead

### Download fails
- Verify the base URL opens a page with a "Save As PDF" button
- Check that the page loads completely before timeout (30 seconds)
- The extension looks for buttons with text: "Save As PDF", "Save PDF", "Download PDF", or "Print"
- A background tab will briefly open and close - this is normal
- Check browser console (F12 → Extensions → Service Worker) for errors

### URL replacement not working correctly
- Ensure the base URL ends with a Tender ID segment
- The extension replaces the last path segment - verify your URL structure
- Check browser console (F12) for any JavaScript errors

## Technical Details

- **Manifest Version:** 3
- **Permissions:** downloads, storage, activeTab, scripting, tabs, clipboardWrite
- **Background:** Service Worker (required for Manifest V3)
- **Content Script:** Injected dynamically for selection overlay
- **OCR Engine:** 🆕 Tesseract.js v5 (client-side, via CDN)
- **OCR Processing:** Web Worker (non-blocking)
- **Screenshot:** chrome.tabs.captureVisibleTab() API
- **Storage:** chrome.storage.local for persistent data
- **Downloads:** Triggered by automated button click on e-GP page

## Security & Privacy

### General
- All data is stored locally using Chrome's storage API
- No tracking or analytics
- No login credentials stored or accessed

### OCR Specific
- ✅ **Client-side processing only** - No server upload
- ✅ **No data leaves your computer** - All OCR runs locally
- ✅ **No authentication bypass** - Doesn't interact with login systems
- ✅ **No automated scraping** - Only captures when user clicks
- ✅ **Temporary screenshots** - Images discarded after OCR
- ⚠️ **Tesseract.js via CDN** - First load downloads library from CDN (jsdelivr.net)

## Development

To modify the extension:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the reload icon on the extension card
4. Test your changes

### Customizing OCR Settings

**Change Tender ID format** - Edit `ocr-worker.js` line 33:
```javascript
// Current: 6-8 digits
const tenderIdRegex = /\b\d{6,8}\b/g;

// Example: 5-10 digits
const tenderIdRegex = /\b\d{5,10}\b/g;
```

**Adjust OCR timeout** - Edit `popup.js` line 171:
```javascript
// Current: 60 seconds
const timeout = setTimeout(() => { ... }, 60000);

// Example: 2 minutes
const timeout = setTimeout(() => { ... }, 120000);
```

**Change OCR language** - Edit `ocr-worker.js` line 22:
```javascript
// Current: English
const worker = await Tesseract.createWorker('eng', 1, { ... });

// Example: Bengali
const worker = await Tesseract.createWorker('ben', 1, { ... });

// Example: Multiple languages
const worker = await Tesseract.createWorker('eng+ben', 1, { ... });
```

## Documentation

- **[OCR_FEATURE_GUIDE.md](OCR_FEATURE_GUIDE.md)** - Comprehensive OCR documentation
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Technical implementation details
- **[QUICK_START.md](QUICK_START.md)** - Quick start guide
- **[TECHNICAL_DOCS.md](TECHNICAL_DOCS.md)** - Technical architecture

## Future Enhancements

### Planned
- 📸 Region selection before OCR (draw box to scan specific area)
- 📄 Multi-page PDF OCR support
- 💾 Export extracted IDs to CSV/Excel
- 📊 OCR accuracy confidence scores
- 🌐 Offline mode (bundle Tesseract locally)

### Out of Scope
- Bulk automation
- Server-side integration
- Login/CAPTCHA bypass
- Chrome Web Store publishing

## Changelog

### v1.3.0 (January 21, 2026)
- ✨ **NEW**: OCR support for scanned PDFs and images
- ✨ **NEW**: Automatic Tender ID extraction from screenshots
- ✨ **NEW**: Client-side OCR using Tesseract.js
- ✨ **NEW**: Real-time progress indicators during OCR
- ✨ **NEW**: Auto-fill and clipboard copy for extracted IDs
- 🔧 Added `tabs` permission for screenshot capture
- 📝 Added comprehensive OCR documentation

### v1.2.0
- Screen area selection for DOM text extraction
- Visual selection overlay

### v1.0.0
- Initial release
- Basic URL replacement and PDF download

## License

This is a custom-built extension. Use at your own discretion.

## Support

For issues or questions:
- Check the **Troubleshooting** section above
- Review [OCR_FEATURE_GUIDE.md](OCR_FEATURE_GUIDE.md) for OCR-specific help
- Inspect browser console (F12) for error messages
- Refer to inline code comments for technical details

---

**Version**: 1.3.0  
**Last Updated**: January 21, 2026  
**Developer**: MD SIAMUL ISLAM

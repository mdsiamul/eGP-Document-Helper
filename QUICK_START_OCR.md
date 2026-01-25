# 🚀 Quick Start Guide - OCR Feature

## Installation (30 seconds)

1. **Open Chrome Extensions Page**
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode**
   - Toggle switch in top-right corner

3. **Load Extension**
   - Click "Load unpacked"
   - Select folder: `eGP Document Helper`
   - Extension icon appears in toolbar

---

## Testing OCR (2 minutes)

### Step 1: Open Test Page
```
File → Open File → test-ocr.html
```
Or drag `test-ocr.html` into Chrome

### Step 2: Run OCR
1. Click extension icon in toolbar
2. Click: **"📷 Scan Tender IDs from Document (OCR)"**
3. Wait 10-30 seconds

### Step 3: Verify Results
Expected output:
```
1211960, 1205553, 1214558, 1198745, 1187632
```

✅ Success! IDs are auto-filled and copied to clipboard.

---

## Real-World Usage

### Scenario A: Scanned PDF Document

```
1. Open scanned PDF in Chrome
2. Scroll to show Tender IDs
3. Click extension icon
4. Click "📷 Scan Tender IDs from Document (OCR)"
5. Wait for OCR processing
6. IDs auto-filled → Use "Download PDF(s)" or "Open Tender(s)"
```

### Scenario B: HTML Page with Text

```
1. Navigate to tender listing page
2. Click extension icon
3. Click "🎯 Select Area to Extract Tender IDs"
4. Draw box around ID list
5. IDs auto-filled instantly
```

### Scenario C: Manual Entry

```
1. Click extension icon
2. Type/paste IDs: 601568, 601569, 601570
3. Click "Download PDF(s)" or "Open Tender(s)"
```

---

## Common Use Cases

| Document Type | Best Method | Time |
|--------------|-------------|------|
| Scanned PDF | 📷 OCR Scan | 15-30s |
| Image (PNG/JPG) | 📷 OCR Scan | 10-20s |
| HTML page | 🎯 Select Area | 1-2s |
| Known IDs | ⌨️ Manual Entry | 5s |
| PDF viewer (not selectable) | 📷 OCR Scan | 20-30s |

---

## Troubleshooting

### "Failed to capture screenshot"
❌ You're on a Chrome internal page (`chrome://`, `chrome-extension://`)  
✅ Navigate to HTTP/HTTPS page first

### "No Tender IDs detected"
❌ IDs not visible or wrong format  
✅ Ensure 6-8 digit numbers are visible on screen

### OCR too slow
❌ Low memory or too many tabs  
✅ Close unused tabs, try smaller region

### Low OCR accuracy
❌ Poor image quality or small text  
✅ Zoom to 125%, ensure good contrast

---

## Tips for Best Results

### 📸 OCR Scan Tips
- ✅ Make sure IDs are **clearly visible** in viewport
- ✅ Zoom to **100-150%** for small text
- ✅ Use documents with **good contrast** (dark on light)
- ✅ Keep text **horizontal** (not rotated)
- ✅ **Scroll** to show more IDs if needed

### 🎯 Select Area Tips
- ✅ Draw box **tightly around** ID text
- ✅ Works best on **HTML text** (not images)
- ✅ Handles **tables and lists** well

---

## Keyboard Shortcuts (Suggested)

You can set custom shortcuts in Chrome:

1. Go to `chrome://extensions/shortcuts`
2. Find "e-GP Document Helper"
3. Set shortcut, e.g., `Ctrl+Shift+O` for popup

---

## What the Extension Does

### ✅ Allowed
- Extract visible Tender IDs from current tab
- Capture screenshot when you click OCR button
- Copy IDs to clipboard
- Download/open tender pages

### ❌ NOT Allowed
- No login bypass
- No CAPTCHA solving
- No bulk automation
- No background scraping
- No private data access

---

## Architecture (Simplified)

```
User clicks OCR button
        ↓
Screenshot taken (PNG)
        ↓
Tesseract.js analyzes image
        ↓
Finds all 6-8 digit numbers
        ↓
Removes duplicates
        ↓
Auto-fills input box
        ↓
Copied to clipboard
```

**Processing Time**: 10-30 seconds  
**Privacy**: All client-side, no upload

---

## Next Steps

✅ **Tested extension?** → Start using on real documents!

📖 **Want more details?** → Read [OCR_FEATURE_GUIDE.md](OCR_FEATURE_GUIDE.md)

🔧 **Want to customize?** → See [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

🐛 **Found issues?** → Check **Troubleshooting** section in [README.md](README.md)

---

## Quick Reference Card

| Button | Purpose | Time |
|--------|---------|------|
| 📷 Scan Tender IDs | OCR extraction from images/PDFs | 10-30s |
| 🎯 Select Area | DOM text extraction from HTML | 1-2s |
| Download PDF(s) | Auto-download tender documents | 5-10s |
| Open Tender(s) | Open tenders in new tabs | 1s |

---

**Version**: 1.3.0  
**Developer**: MD SIAMUL ISLAM  
**Last Updated**: January 21, 2026

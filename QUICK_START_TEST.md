# 🚀 Quick Start - Test Your OCR Extension

## ✅ Setup Complete

Your extension is now configured with:
- ✓ Offscreen document architecture
- ✓ Tesseract.js v5.1.1 (UMD build)
- ✓ Proper MV3 implementation
- ✓ DOM-first, OCR-fallback strategy

## 🔧 Reload Extension

```
1. Go to: chrome://extensions
2. Find: "e-GP Document Helper"
3. Click: 🔄 Reload button
4. Status should be: "Active"
```

## 🧪 Quick Test

### Test 1: Check Console (2 minutes)

1. Click "Service worker" in extension details
2. Should see:
   ```
   ✓ e-GP Document Helper background script loaded (v2.0.1)
   ```

3. Click extension icon (popup opens)
4. Console should show:
   ```
   ✓ Offscreen document loaded
   ✓ Tesseract: object
   ✓ createWorker: function
   ✓ Offscreen OCR processor ready
   ```

**If you see these 4 messages → OCR is ready! ✅**

### Test 2: Run OCR (5 minutes)

1. Open any webpage with numbers (e.g., e-GP portal)
2. Click "📋 Scan Tender IDs" button
3. Blue overlay appears
4. Draw rectangle around area with 6-8 digit numbers
5. Wait 2-5 seconds
6. Should see: "✅ Found X Tender ID(s)"
7. Numbers appear in popup
8. Try Ctrl+V in notepad → numbers should paste

**If OCR completes → Success! 🎉**

## ❌ Troubleshooting

### Problem: "createWorker is not a function"
**Solution:**
1. Check `tesseract/tesseract.min.js` exists (66KB file)
2. Reload extension
3. Check offscreen console logs

### Problem: OCR doesn't start
**Solution:**
1. Check Service Worker console for errors
2. Verify screenshot permission granted
3. Try selecting a larger area

### Problem: No results found
**Solution:**
1. Make sure area contains 6-8 digit numbers
2. Try clearer/larger text
3. Check console for error messages

## 📊 Expected Behavior

| Scenario | Expected Result | Time |
|----------|----------------|------|
| DOM text extraction | Instant results | <100ms |
| First OCR scan | WASM loads + OCR | 3-5s |
| Second OCR scan | Cached + OCR | 1-2s |
| Cancel selection | Clean exit | Instant |

## 📝 Console Log Reference

### Normal Flow
```
✓ background.js: Capturing screenshot...
✓ background.js: Screenshot captured successfully
✓ offscreen.js: Starting Tesseract OCR...
✓ offscreen.js: OCR Progress: 100%
✓ offscreen.js: OCR extracted IDs: [12345678]
```

### Error Flow
```
❌ Tesseract is not defined → Reload extension
❌ Failed to load language → Check lang-data folder
❌ Worker failed → Check WASM file path
```

## 📦 Files Checklist

Verify these files exist:

```
e:\eGP Document Helper\
├── ✓ manifest.json (v2.0.1, has "offscreen" permission)
├── ✓ background.js (v2.0.1, creates offscreen document)
├── ✓ content.js (v2.0.1, crops images)
├── ✓ offscreen.html (NEW, loads Tesseract)
├── ✓ offscreen.js (NEW, runs OCR)
├── ✓ popup.html
├── ✓ popup.js
└── ✓ tesseract/
    ├── ✓ tesseract.min.js (66KB) ← CRITICAL
    ├── ✓ worker.min.js (123KB)
    ├── ✓ tesseract-core.wasm.js (4.7MB)
    └── ✓ lang-data/eng.traineddata.gz (~4.8MB)
```

## 🎯 Success Indicators

✅ No console errors
✅ "createWorker: function" logs correctly  
✅ OCR completes in 1-5 seconds
✅ Results appear in popup
✅ Clipboard copy works
✅ Can perform multiple scans

## 📚 Documentation

For detailed information, see:
- `OCR_FIX_SUMMARY.md` - Technical details
- `ARCHITECTURE.md` - System design
- `TESSERACT_SETUP.md` - File download instructions

## 🆘 Get Help

If OCR still doesn't work:

1. **Check** Service Worker console for exact error
2. **Verify** `tesseract.min.js` is 66KB (not 67KB ESM version)
3. **Ensure** all 4 offscreen log messages appear
4. **Try** restarting Chrome completely
5. **Review** `OCR_FIX_SUMMARY.md` for details

---

**Ready to test?** Follow "Quick Test" steps above! 🚀

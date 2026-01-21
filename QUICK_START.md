# Quick Start Guide

## Installation Steps (5 minutes)

### 1. Open Chrome Extensions Page
- Open Chrome browser
- Type `chrome://extensions/` in the address bar and press Enter
- OR: Click the three-dot menu → Extensions → Manage Extensions

### 2. Enable Developer Mode
- Look for "Developer mode" toggle in the top-right corner
- Click to enable it (it should turn blue/on)

### 3. Load the Extension
- Click the **"Load unpacked"** button that appears
- Navigate to and select the folder: `e:\eGP Document Helper`
- Click "Select Folder"

### 4. Verify Installation
- You should see "e-GP Document Helper" in your extensions list
- The extension icon should appear in your Chrome toolbar (top-right)
  - If you don't see it, click the puzzle piece icon and pin the extension

## First Use

### Save Your Base URL (One Time Setup)

1. **Get your base e-GP URL**
   - Navigate to your e-GP portal
   - Open any tender PDF page (but don't download)
   - Copy the complete URL from the address bar
   - Example: `https://eprocure.gov.in/eprocure/app?page=FrontEndTendersByOrganisation&TENDER_ID=123456`

2. **Save it in the extension**
   - Click the extension icon
   - Paste the URL in the "Base URL" field
   - Click "Save Base URL"
   - You should see "Base URL saved successfully!"

### Download a PDF

1. Click the extension icon
2. Enter a new Tender ID in the "New Tender ID" field
   - Example: `789012`
3. Click "Download PDF"
4. The PDF will download automatically to your Downloads folder
5. The file will be named: `789012.pdf`

## Troubleshooting

### Extension doesn't load
- Make sure all 4 files exist: manifest.json, popup.html, popup.js, background.js
- Check for typos in file names
- Try reloading the extension

### "Please save a base URL first" error
- You need to save a base URL before downloading
- Follow the "Save Your Base URL" steps above

### Download doesn't start
- Check if the base URL is correct
- Verify the Tender ID is valid
- Check Chrome's download permissions
- Try disabling any download managers or blockers

## Notes

- The extension works WITHOUT icons (Chrome shows a default icon)
- Add custom icons (16x16, 48x48, 128x128 PNG) if desired
- All data is stored locally in Chrome
- Base URL only needs to be saved once

## Need Help?

Check the README.md file for detailed documentation and technical information.

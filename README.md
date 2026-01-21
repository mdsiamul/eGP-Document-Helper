# e-GP Document Helper - Chrome Extension

A Manifest V3 Chrome extension that helps download e-GP tender PDFs by replacing Tender IDs in URLs.

## Features

- ✅ Store a base URL with Tender ID
- ✅ Replace only the last path segment (Tender ID) with user input
- ✅ Force PDF download using Chrome's downloads API
- ✅ No visible tabs opened during download
- ✅ Clean and intuitive popup UI
- ✅ Input validation and error handling

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

### Step 1: Save Base URL

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
├── manifest.json       # Extension configuration (Manifest V3)
├── popup.html          # User interface
├── popup.js            # UI logic and URL manipulation
├── background.js       # Service worker for download handling
├── icon16.png          # Extension icon (16x16) - Optional
├── icon48.png          # Extension icon (48x48) - Optional
└── icon128.png         # Extension icon (128x128) - Optional
```

## Permissions Explained

- **downloads**: Required to detect and handle PDF downloads
- **storage**: Required to save and retrieve the base URL
- **activeTab**: Required to access the e-GP page content
- **scripting**: Required to inject script that clicks the "Save As PDF" button

## Limitations

- ❌ No bulk downloads or automation
- ❌ No login/authentication handling
- ❌ No CAPTCHA bypass
- ❌ One download at a time
- ❌ Cannot bypass access restrictions
- ❌ Requires manual Tender ID input for each download

## Troubleshooting

### Extension doesn't appear after installation
- Ensure all required files exist in the folder
- Check Chrome DevTools for any errors in the extension
- Reload the extension from `chrome://extensions/`

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
- **Permissions:** downloads, storage, activeTab, scripting
- **Background:** Service Worker (required for Manifest V3)
- **Content Script:** Injected dynamically to click the "Save As PDF" button
- **Storage:** chrome.storage.local for persistent data
- **Downloads:** Triggered by automated button click on e-GP page

## Security & Privacy

- All data is stored locally using Chrome's storage API
- No data is sent to external servers
- No tracking or analytics
- No network requests except for the PDF download itself

## Development

To modify the extension:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the reload icon on the extension card
4. Test your changes

## Future Enhancements (Out of Scope)

- Bulk download functionality
- URL history/favorites
- Automatic Tender ID detection
- Server-side integration
- Chrome Web Store publishing

## License

This is a custom-built extension. Use at your own discretion.

## Support

For issues or questions, refer to the inline code comments in each file for detailed explanations of the logic.

/**
 * e-GP Document Helper - Background Service Worker (v2.0.1)
 * Handles screenshot capture, offscreen document management, and messaging
 * 
 * NOTE: Service Workers cannot use DOM APIs (Image, Canvas, document)
 * All OCR processing happens in offscreen document
 */

// Store extracted IDs temporarily
let lastExtractedIds = null;

// Track offscreen document state
let offscreenCreating = null;

// ============================================================
// MESSAGE LISTENER
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Start unified scan (activate selection in content script)
  if (request.action === 'startUnifiedScan') {
    handleStartUnifiedScan(sendResponse);
    return true;
  }
  
  // Process OCR via offscreen document
  if (request.action === 'processOCR') {
    handleProcessOCR(request, sender, sendResponse);
    return true;
  }
  
  // Store extracted IDs from content script
  if (request.action === 'tenderIdsExtracted') {
    lastExtractedIds = {
      tenderIds: request.tenderIds,
      idsString: request.idsString,
      mode: request.mode,
      timestamp: Date.now()
    };
    
    // Try to notify popup
    chrome.runtime.sendMessage({
      action: 'fillTenderIds',
      tenderIds: request.tenderIds,
      idsString: request.idsString,
      mode: request.mode
    }).catch(() => {
      // Popup not open
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  // Get last extracted IDs
  if (request.action === 'getLastExtractedIds') {
    sendResponse(lastExtractedIds || { tenderIds: null });
    lastExtractedIds = null;
    return true;
  }
  
  // Download PDF - wrap async function to keep message channel open
  if (request.action === 'downloadPdf') {
    console.log('[Background] Received downloadPdf request for tender:', request.tenderId);
    (async () => {
      try {
        console.log('[Background] Starting async handleDownloadPdf for tender:', request.tenderId);
        const result = await handleDownloadPdf(request.url, request.tenderId);
        console.log('[Background] handleDownloadPdf completed for tender:', request.tenderId, 'Result:', result);
        sendResponse(result);
      } catch (error) {
        console.error('[Background] Exception in handleDownloadPdf for tender:', request.tenderId, error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});

// ============================================================
// UNIFIED SCAN HANDLER
// ============================================================

async function handleStartUnifiedScan(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tabs.length === 0) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }
    
    const tab = tabs[0];
    
    // Check if tab is accessible
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      sendResponse({ success: false, error: 'Cannot scan on browser internal pages' });
      return;
    }
    
    // Inject content script if needed
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      // Script may already be injected
    }
    
    // Activate selection mode
    chrome.tabs.sendMessage(tab.id, { action: 'activateUnifiedSelection' }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================================
// SCREENSHOT CAPTURE (Service Worker Safe)
// ============================================================

async function captureVisibleTabDataUrl(windowId) {
  return chrome.tabs.captureVisibleTab(windowId ?? null, {
    format: 'png',
    quality: 100
  });
}

// ============================================================
// OFFSCREEN DOCUMENT MANAGEMENT
// ============================================================

async function setupOffscreenDocument() {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  if (existingContexts.length > 0) {
    console.log('[Background] Offscreen document already exists');
    return;
  }

  // Create offscreen document
  if (offscreenCreating) {
    await offscreenCreating;
  } else {
    console.log('[Background] Creating offscreen document...');
    offscreenCreating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING'],
      justification: 'OCR processing requires DOM APIs (Image, Canvas) not available in service worker'
    });

    await offscreenCreating;
    offscreenCreating = null;
    console.log('[Background] Offscreen document created');
  }
}

// ============================================================
// OCR REQUEST HANDLER
// ============================================================

async function handleProcessOCR(request, sender, sendResponse) {
  try {
    console.log('[Background] Processing OCR request...');
    
    const rect = request?.rect;
    const dpr = request?.dpr || 1;

    if (!rect || typeof rect.x !== 'number') {
      sendResponse({
        success: false,
        error: 'Invalid selection rectangle',
        tenderIds: []
      });
      return;
    }

    // Ensure offscreen document exists
    await setupOffscreenDocument();
    
    // Capture screenshot (service worker can do this)
    const windowId = sender?.tab?.windowId;
    console.log('[Background] Capturing screenshot...');
    
    let imageDataUrl;
    try {
      imageDataUrl = await captureVisibleTabDataUrl(windowId);
      console.log('[Background] Screenshot captured');
    } catch (captureError) {
      console.error('[Background] Screenshot capture failed:', captureError);
      sendResponse({
        success: false,
        error: 'Screenshot capture failed: ' + captureError.message,
        tenderIds: []
      });
      return;
    }

    // Forward to offscreen document for OCR processing
    console.log('[Background] Sending to offscreen for OCR...');
    
    chrome.runtime.sendMessage({
      action: 'runOCR',
      imageDataUrl: imageDataUrl,
      rect: rect,
      dpr: dpr
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] Offscreen communication error:', chrome.runtime.lastError);
        sendResponse({
          success: false,
          error: 'OCR communication failed: ' + chrome.runtime.lastError.message,
          tenderIds: []
        });
      } else {
        console.log('[Background] OCR complete:', response);
        sendResponse(response);
      }
    });
    
  } catch (error) {
    console.error('[Background] OCR setup error:', error);
    sendResponse({
      success: false,
      error: 'OCR setup failed: ' + error.message,
      tenderIds: []
    });
  }
}

// ============================================================
// PDF DOWNLOAD HANDLER
// ============================================================

/**
 * Opens tender page, waits for load, clicks "Save As PDF" button
 * 
 * Flow:
 * 1. Create a new tab with the tender URL
 * 2. Wait for the page to load
 * 3. Inject a content script to find and click the "Save As PDF" button
 * 4. Close the tab after a delay
 * 
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handleDownloadPdf(url, tenderId) {
  console.log('[Background] Opening PDF page for tender:', tenderId);
  
  try {
    // Step 1: Create a new tab with the URL (in background to keep popup open)
    const tab = await chrome.tabs.create({ url: url, active: false });
    console.log(`[Background] Tab opened for Tender: ${tenderId}, Tab ID: ${tab.id}`);
    
    // Step 2: Wait for the tab to finish loading
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Page load timeout'));
      }, 30000);
      
      function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve();
        }
      }
      
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    // Wait additional 2 seconds for page to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if page redirected to session timeout
    const currentTab = await chrome.tabs.get(tab.id);
    if (currentTab.url.includes('SessionTimedOut')) {
      console.error('[Background] Session timeout detected');
      return { success: false, error: 'Session timeout - please login to the website first' };
    }
    
    console.log('[Background] Page loaded, clicking Save As PDF button...');
    
    // Step 3: Inject content script to click the "Save As PDF" button
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clickSaveAsPdfButton
    });
    
    if (results && results[0] && results[0].result) {
      console.log(`[Background] Save As PDF button clicked for Tender: ${tenderId}`);
      
      // Step 4: Wait for download dialog to appear, then close the tab
      // Wait 3 seconds before closing tab and responding
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        await chrome.tabs.remove(tab.id);
        console.log(`[Background] Tab closed for Tender: ${tenderId}`);
      } catch (e) {
        console.log('[Background] Tab already closed');
      }
      
      return { success: true };
    } else {
      console.error('[Background] Save As PDF button not found');
      return { success: false, error: 'Save As PDF button not found. Tab kept open - you can click manually.' };
    }
    
  } catch (error) {
    console.error('[Background] Download error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Content script function that runs in the page context
 * Scrolls to bottom, waits, then finds and clicks the "Save As PDF" button
 * 
 * @returns {Promise<boolean>} - True if button found and clicked, false otherwise
 */
async function clickSaveAsPdfButton() {
  console.log('[ClickPDF] Starting button search...');
  
  // Step 1: Scroll to bottom to ensure all content is loaded
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 2: Find all INPUT buttons
  const allInputs = document.querySelectorAll('input[type="button"], input[type="submit"], input[type="image"]');
  console.log(`[ClickPDF] Found ${allInputs.length} input buttons`);
  
  // Try each input button - look for "Save As PDF" or similar
  for (const input of allInputs) {
    const value = (input.value || input.alt || input.title || '').toLowerCase().trim();
    console.log(`[ClickPDF] Input: "${value}"`);
    
    if (value.includes('save') || value.includes('pdf')) {
      console.log('[ClickPDF] FOUND! Clicking input:', input);
      input.click();
      return true;
    }
  }
  
  // Step 3: Try regular buttons and links
  const allButtons = document.querySelectorAll('button, a');
  console.log(`[ClickPDF] Found ${allButtons.length} buttons/links`);
  
  for (const btn of allButtons) {
    const text = (btn.textContent || btn.title || '').toLowerCase().trim();
    if (text.includes('save') && text.includes('pdf')) {
      console.log('[ClickPDF] FOUND button! Clicking:', btn);
      btn.click();
      return true;
    }
  }
  
  // Step 4: Look for image buttons with PDF-related src
  const imgButtons = document.querySelectorAll('input[type="image"], img[onclick]');
  for (const img of imgButtons) {
    const src = (img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    if (src.includes('pdf') || alt.includes('pdf') || src.includes('save') || alt.includes('save')) {
      console.log('[ClickPDF] FOUND image button! Clicking:', img);
      img.click();
      return true;
    }
  }
  
  // Step 5: Fallback - click last input button (usually at bottom of page)
  console.log('[ClickPDF] Fallback: clicking last input button');
  if (allInputs.length > 0) {
    allInputs[allInputs.length - 1].click();
    return true;
  }
  
  console.error('[ClickPDF] No button found');
  return false;
}

// ============================================================
// STARTUP
// ============================================================

console.log('[Background] e-GP Document Helper service worker loaded (v2.0.1)');

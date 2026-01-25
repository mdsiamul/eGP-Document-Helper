// Hardcoded base URL for e-GP portal
const BASE_URL = 'https://www.eprocure.gov.bd/resources/common/ViewTender.jsp?id=';

// DOM Elements
const tenderIdInput = document.getElementById('tenderId');
const downloadBtn = document.getElementById('downloadBtn');
const openTenderBtn = document.getElementById('openTenderBtn');
const selectAreaBtn = document.getElementById('selectAreaBtn');
const ocrScanBtn = document.getElementById('ocrScanBtn');
const statusDiv = document.getElementById('status');
const progressSection = document.getElementById('progressSection');
const progressText = document.getElementById('progressText');

// ============================================================
// INITIALIZATION
// ============================================================

// Focus on input when popup opens
document.addEventListener('DOMContentLoaded', () => {
  tenderIdInput.focus();
  
  // Check if there are any extracted IDs waiting
  checkForExtractedIds();
});

/**
 * Check for IDs that were extracted before popup was opened
 */
function checkForExtractedIds() {
  chrome.runtime.sendMessage({ action: 'getLastExtractedIds' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('No background response');
      return;
    }
    
    if (response && response.tenderIds && response.tenderIds.length > 0) {
      // Auto-fill the input
      tenderIdInput.value = response.idsString;
      showStatus(`✅ ${response.tenderIds.length} Tender ID(s) auto-filled from selection`, 'success');
      console.log('Auto-filled IDs from previous selection:', response.idsString);
    }
  });
}

// ============================================================
// SCREEN SELECTION FEATURE
// ============================================================

/**
 * Screen selection button click handler
 * Activates the selection overlay on the current tab
 */
selectAreaBtn.addEventListener('click', async () => {
  // Disable button during activation
  selectAreaBtn.disabled = true;
  selectAreaBtn.innerHTML = '<span class="icon">⏳</span><span>Activating...</span>';
  
  try {
    // Send message to background script to start selection
    chrome.runtime.sendMessage({ action: 'startSelection' }, (response) => {
      // Re-enable button
      selectAreaBtn.disabled = false;
      selectAreaBtn.innerHTML = '<span class="icon">🎯</span><span>Select Area to Extract Tender IDs</span>';
      
      if (chrome.runtime.lastError) {
        showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      
      if (response && response.success) {
        // Close the popup to allow selection on the page
        window.close();
      } else {
        showStatus(response?.error || 'Failed to activate selection mode', 'error');
      }
    });
  } catch (error) {
    selectAreaBtn.disabled = false;
    selectAreaBtn.innerHTML = '<span class="icon">🎯</span><span>Select Area to Extract Tender IDs</span>';
    showStatus('Error: ' + error.message, 'error');
  }
});

// ============================================================
// OCR SCAN FEATURE
// ============================================================

/**
 * OCR Scan button click handler
 * Captures visible tab and runs OCR to extract Tender IDs
 */
ocrScanBtn.addEventListener('click', async () => {
  // Disable button during scan
  ocrScanBtn.disabled = true;
  ocrScanBtn.innerHTML = '<span class="icon">⏳</span><span>Scanning document...</span>';
  showStatus('Capturing document...', 'info');
  
  try {
    // Request screenshot from background script
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, async (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
        resetOcrButton();
        return;
      }
      
      if (!response || !response.success) {
        showStatus(response?.error || 'Failed to capture screenshot', 'error');
        resetOcrButton();
        return;
      }
      
      // Show OCR processing status
      showStatus('Running OCR on document... This may take 10-30 seconds.', 'info');
      ocrScanBtn.innerHTML = '<span class="icon">🔍</span><span>Processing OCR...</span>';
      
      // Process OCR using Web Worker
      const result = await processOCRWithWorker(response.imageDataUrl);
      
      if (result.success) {
        // Auto-fill the input with extracted IDs
        tenderIdInput.value = result.idsString;
        showStatus(`✅ ${result.count} Tender ID(s) extracted and copied!`, 'success');
        
        // Copy to clipboard
        try {
          await navigator.clipboard.writeText(result.idsString);
          console.log('Tender IDs copied to clipboard:', result.idsString);
        } catch (clipError) {
          console.log('Clipboard write failed, but IDs are in input field');
        }
      } else {
        showStatus(result.error || 'This document contains no detectable Tender IDs.', 'error');
      }
      
      resetOcrButton();
    });
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
    resetOcrButton();
  }
});

/**
 * Process image with OCR using Tesseract.js directly
 * @param {string} imageDataUrl - Base64 encoded image
 * @returns {Promise<{success: boolean, tenderIds?: string[], idsString?: string, count?: number, error?: string}>}
 */
async function processOCRWithWorker(imageDataUrl) {
  try {
    console.log('OCR: Starting Tesseract recognition...');
    
    // Wait for Tesseract to be available (give it time to load)
    let waitCount = 0;
    while (typeof Tesseract === 'undefined' && waitCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      waitCount++;
    }
    
    // Check if Tesseract is loaded
    if (typeof Tesseract === 'undefined') {
      console.error('Tesseract is still undefined after waiting');
      return {
        success: false,
        error: 'Tesseract.js failed to load. Please close and reopen the popup, or check your internet connection.'
      };
    }
    
    console.log('OCR: Tesseract loaded successfully');
    
    // Create Tesseract worker with progress callback
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        // Send progress updates
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100);
          showStatus(`Processing OCR... ${progress}%`, 'info');
          console.log(`OCR Progress: ${progress}%`);
        }
      }
    });
    
    console.log('OCR: Worker created, starting recognition...');
    
    // Perform OCR on the image
    const { data } = await worker.recognize(imageDataUrl);
    
    console.log('OCR: Recognition complete. Raw text:', data.text);
    
    // Extract Tender IDs using regex
    // Looking for 6-8 digit numbers (typical Tender ID format)
    const tenderIdRegex = /\b\d{6,8}\b/g;
    const matches = data.text.match(tenderIdRegex);
    
    // Terminate worker to free resources
    await worker.terminate();
    console.log('OCR: Worker terminated');
    
    if (!matches || matches.length === 0) {
      console.log('OCR: No Tender IDs found');
      return {
        success: false,
        error: 'No Tender IDs detected in the scanned document.'
      };
    }
    
    // Remove duplicates while preserving order
    const uniqueTenderIds = [...new Set(matches)];
    
    // Create comma-separated string
    const idsString = uniqueTenderIds.join(', ');
    
    console.log('OCR: Extracted Tender IDs:', idsString);
    
    return {
      success: true,
      tenderIds: uniqueTenderIds,
      idsString: idsString,
      count: uniqueTenderIds.length
    };
    
  } catch (error) {
    console.error('OCR: Error during processing:', error);
    return {
      success: false,
      error: 'OCR processing failed: ' + error.message
    };
  }
}

/**
 * Reset OCR button to original state
 */
function resetOcrButton() {
  ocrScanBtn.disabled = false;
  ocrScanBtn.innerHTML = '<span class="icon">📷</span><span>Scan Tender IDs from Document (OCR)</span>';
}

// ============================================================
// MESSAGE LISTENER FOR AUTO-FILL
// ============================================================

/**
 * Listen for messages from content script (via background)
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fillTenderIds') {
    // Auto-fill the input with extracted IDs
    if (request.tenderIds && request.tenderIds.length > 0) {
      tenderIdInput.value = request.idsString;
      showStatus(`✅ ${request.tenderIds.length} Tender ID(s) extracted and filled!`, 'success');
      console.log('Received and filled Tender IDs:', request.idsString);
    }
    sendResponse({ success: true });
    return true;
  }
  return false;
});

// Allow Ctrl+Enter to trigger download
tenderIdInput.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    downloadBtn.click();
  }
});

// Download PDF button click handler
downloadBtn.addEventListener('click', async () => {
  // Get the Tender IDs from input
  const input = tenderIdInput.value.trim();
  
  // Validate input is not empty
  if (!input) {
    showStatus('Please enter at least one Tender ID', 'error');
    return;
  }
  
  // Parse Tender IDs - split by comma or newline
  const tenderIds = input
    .split(/[,\n]+/)  // Split by comma or newline
    .map(id => id.trim())  // Trim whitespace
    .filter(id => id.length > 0);  // Remove empty strings
  
  if (tenderIds.length === 0) {
    showStatus('Please enter valid Tender IDs', 'error');
    return;
  }
  
  console.log('Tender IDs to download:', tenderIds);
  
  // Disable download button during processing
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Downloading...';
  
  // Show progress section
  progressSection.style.display = 'block';
  
  let successCount = 0;
  let failCount = 0;
  
  // Show initial progress
  progressText.textContent = `Starting ${tenderIds.length} download(s)...`;
  showStatus(`Starting ${tenderIds.length} download(s)...`, 'info');
  
  // Download all Tender IDs simultaneously (parallel)
  const downloadPromises = tenderIds.map((tenderId, index) => {
    const fullUrl = BASE_URL + tenderId;
    console.log(`[${index + 1}/${tenderIds.length}] Queuing:`, fullUrl);
    
    return downloadPdf(fullUrl, tenderId)
      .then(result => {
        if (result.success) {
          successCount++;
          console.log(`✓ Downloaded: ${tenderId}`);
        } else {
          failCount++;
          console.error(`✗ Failed: ${tenderId} - ${result.error}`);
        }
        
        // Update progress
        const completed = successCount + failCount;
        progressText.textContent = `Progress: ${completed}/${tenderIds.length} (Success: ${successCount}, Failed: ${failCount})`;
        
        return result;
      })
      .catch(error => {
        failCount++;
        console.error(`Error downloading ${tenderId}:`, error);
        
        const completed = successCount + failCount;
        progressText.textContent = `Progress: ${completed}/${tenderIds.length} (Success: ${successCount}, Failed: ${failCount})`;
        
        return { success: false, error: error.message };
      });
  });
  
  // Wait for all downloads to complete
  await Promise.all(downloadPromises);
  
  // All done
  downloadBtn.disabled = false;
  downloadBtn.textContent = 'Download PDF(s)';
  
  // Show final status
  const summary = `Complete! Success: ${successCount}, Failed: ${failCount}`;
  showStatus(summary, failCount === 0 ? 'success' : 'error');
  progressText.textContent = summary;
  
  // Clear input if all succeeded
  if (failCount === 0) {
    setTimeout(() => {
      tenderIdInput.value = '';
      progressSection.style.display = 'none';
      tenderIdInput.focus();
    }, 3000);
  }
});

// Open Tender(s) button click handler
openTenderBtn.addEventListener('click', () => {
  // Get the Tender IDs from input
  const input = tenderIdInput.value.trim();
  
  // Validate input is not empty
  if (!input) {
    showStatus('Please enter at least one Tender ID', 'error');
    return;
  }
  
  // Parse Tender IDs - split by comma or newline
  const tenderIds = input
    .split(/[,\n]+/)  // Split by comma or newline
    .map(id => id.trim())  // Trim whitespace
    .filter(id => id.length > 0);  // Remove empty strings
  
  if (tenderIds.length === 0) {
    showStatus('Please enter valid Tender IDs', 'error');
    return;
  }
  
  console.log('Opening Tender IDs:', tenderIds);
  
  // Show status
  showStatus(`Opening ${tenderIds.length} tender(s) in new tabs...`, 'info');
  
  // Open each Tender ID in a new tab
  tenderIds.forEach((tenderId) => {
    const fullUrl = BASE_URL + tenderId;
    console.log('Opening URL:', fullUrl);
    
    // Simply open the URL in a new tab
    chrome.tabs.create({ url: fullUrl, active: false });
  });
  
  // Show success message
  setTimeout(() => {
    showStatus(`Opened ${tenderIds.length} tender(s) successfully!`, 'success');
    // Clear input after 2 seconds
    setTimeout(() => {
      tenderIdInput.value = '';
      tenderIdInput.focus();
      statusDiv.className = 'status';
    }, 2000);
  }, 500);
});

/**
 * Download a single PDF
 * @param {string} url - Full URL to download
 * @param {string} tenderId - Tender ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function downloadPdf(url, tenderId) {
  return new Promise((resolve, reject) => {
    console.log('Sending download message for:', tenderId, url);
    
    // Set timeout in case no response
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Request timeout' });
    }, 60000); // 60 second timeout
    
    chrome.runtime.sendMessage(
      {
        action: 'downloadPdf',
        url: url,
        tenderId: tenderId
      },
      (response) => {
        clearTimeout(timeout);
        
        console.log('Received response for', tenderId, ':', response);
        
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        if (response && response.success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response?.error || 'Unknown error' });
        }
      }
    );
  });
}

/**
 * Shows a status message to the user
 * @param {string} message - Message to display
 * @param {string} type - Type of message: 'success', 'error', or 'info'
 */
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }
}

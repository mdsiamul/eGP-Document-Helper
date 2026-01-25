/**
 * e-GP Document Helper - Popup Script (v2.0.1)
 * Unified scanning: DOM extraction first, OCR fallback
 */

// Hardcoded base URL for e-GP portal
const BASE_URL = 'https://www.eprocure.gov.bd/resources/common/ViewTender.jsp?id=';

/**
 * Validate egp id format: must be exactly 7 digits, all numbers
 * @param {string} id - The ID to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidEgpId(id) {
  return /^\d{7}$/.test(id.trim());
}

// DOM Elements
const tenderIdInput = document.getElementById('tenderId');
const downloadBtn = document.getElementById('downloadBtn');
const openTenderBtn = document.getElementById('openTenderBtn');
const scanBtn = document.getElementById('scanBtn');
const scanBtnText = document.getElementById('scanBtnText');
const statusDiv = document.getElementById('status');

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  tenderIdInput.focus();
  checkForExtractedIds();
});

/**
 * Check for IDs extracted before popup opened
 */
function checkForExtractedIds() {
  chrome.runtime.sendMessage({ action: 'getLastExtractedIds' }, (response) => {
    if (chrome.runtime.lastError) return;
    
    if (response && response.tenderIds && response.tenderIds.length > 0) {
      tenderIdInput.value = response.idsString;
      const mode = response.mode === 'ocr' ? 'OCR' : 'DOM';
      showStatus(`✅ ${response.tenderIds.length} Tender ID(s) extracted via ${mode}`, 'success');
    }
  });
}

// ============================================================
// SCAN BUTTON
// ============================================================

scanBtn.addEventListener('click', async () => {
  // Disable button
  scanBtn.disabled = true;
  scanBtnText.textContent = 'Activating...';
  
  try {
    chrome.runtime.sendMessage({ action: 'startUnifiedScan' }, (response) => {
      // Reset button
      scanBtn.disabled = false;
      scanBtnText.textContent = 'Scan Tender IDs';
      
      if (chrome.runtime.lastError) {
        showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      
      if (response && response.success) {
        // Close popup to allow selection on page
        window.close();
      } else {
        showStatus(response?.error || 'Failed to start scanning', 'error');
      }
    });
  } catch (error) {
    scanBtn.disabled = false;
    scanBtnText.textContent = 'Scan Tender IDs';
    showStatus('Error: ' + error.message, 'error');
  }
});

// ============================================================
// MESSAGE LISTENER
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle extracted IDs from scan
  if (request.action === 'fillTenderIds') {
    if (request.tenderIds && request.tenderIds.length > 0) {
      tenderIdInput.value = request.idsString;
      const mode = request.mode === 'ocr' ? 'OCR' : 'DOM';
      const badge = request.mode === 'ocr' ? '📷' : '📄';
      showStatus(`${badge} ${request.tenderIds.length} Tender ID(s) extracted via ${mode}!`, 'success');
    }
    sendResponse({ success: true });
    return true;
  }
  
  // Handle scan status updates
  if (request.action === 'scanStatus') {
    showStatus(request.message, request.type || 'info');
    sendResponse({ success: true });
    return true;
  }
});

// ============================================================
// DOWNLOAD / OPEN BUTTONS
// ============================================================

downloadBtn.addEventListener('click', async () => {
  const input = tenderIdInput.value.trim();
  
  if (!input) {
    showStatus('Please enter at least one Tender ID', 'error');
    return;
  }
  
  const tenderIds = input
    .split(/[,\n]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0 && isValidEgpId(id));
  
  if (tenderIds.length === 0) {
    showStatus('Please enter valid Tender IDs (7 digits, all numbers)', 'error');
    return;
  }
  
  downloadBtn.disabled = true;
  console.log(`[Popup] Starting download for ${tenderIds.length} tenders:`, tenderIds);
  showStatus(`Downloading ${tenderIds.length} PDF(s) in parallel...`, 'info');
  
  // Start all downloads in parallel
  const downloadPromises = tenderIds.map((tenderId, index) => {
    console.log(`[Popup] Initiating download ${index + 1} of ${tenderIds.length}: ${tenderId}`);
    const fullUrl = BASE_URL + tenderId;
    return downloadPdf(fullUrl, tenderId);
  });
  
  // Wait for all downloads to complete
  const results = await Promise.all(downloadPromises);
  console.log(`[Popup] All download requests completed:`, results);
  
  // Count successes and failures
  let successCount = 0;
  let failCount = 0;
  
  results.forEach((result, index) => {
    if (result.success) {
      successCount++;
    } else {
      failCount++;
      console.log(`Failed to download ${tenderIds[index]}:`, result.error);
    }
  });
  
  console.log(`[Popup] All downloads complete. Success: ${successCount}, Failed: ${failCount}`);
  
  downloadBtn.disabled = false;
  
  if (failCount === 0) {
    showStatus(`✅ Downloaded ${successCount} PDF(s) successfully!`, 'success');
  } else {
    showStatus(`Downloaded ${successCount}, failed ${failCount}`, 'warning');
  }
});

openTenderBtn.addEventListener('click', () => {
  const input = tenderIdInput.value.trim();
  
  if (!input) {
    showStatus('Please enter at least one Tender ID', 'error');
    return;
  }
  
  const tenderIds = input
    .split(/[,\n]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0 && isValidEgpId(id));
  
  if (tenderIds.length === 0) {
    showStatus('Please enter valid Tender IDs (7 digits, all numbers)', 'error');
    return;
  }
  
  tenderIds.forEach((tenderId) => {
    const fullUrl = BASE_URL + tenderId;
    chrome.tabs.create({ url: fullUrl, active: false });
  });
  
  showStatus(`Opened ${tenderIds.length} tender(s) in new tabs`, 'success');
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function downloadPdf(url, tenderId) {
  return new Promise((resolve) => {
    console.log(`[Popup/downloadPdf] Sending message to background for tender ${tenderId}`);
    
    const timeout = setTimeout(() => {
      console.log(`[Popup/downloadPdf] Timeout for tender ${tenderId}`);
      resolve({ success: false, error: 'Request timeout' });
    }, 45000); // 45 seconds per download
    
    chrome.runtime.sendMessage(
      { action: 'downloadPdf', url: url, tenderId: tenderId },
      (response) => {
        clearTimeout(timeout);
        console.log(`[Popup/downloadPdf] Received response for tender ${tenderId}:`, response);
        
        if (chrome.runtime.lastError) {
          console.log(`[Popup/downloadPdf] Runtime error for tender ${tenderId}:`, chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        resolve(response || { success: false, error: 'No response' });
      }
    );
  });
}

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 5000);
  }
}

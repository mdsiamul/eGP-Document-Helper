// Hardcoded base URL for e-GP portal
const BASE_URL = 'https://www.eprocure.gov.bd/resources/common/ViewTender.jsp?id=';

// DOM Elements
const tenderIdInput = document.getElementById('tenderId');
const downloadBtn = document.getElementById('downloadBtn');
const openTenderBtn = document.getElementById('openTenderBtn');
const selectAreaBtn = document.getElementById('selectAreaBtn');
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

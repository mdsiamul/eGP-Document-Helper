/**
 * Background Service Worker for e-GP Document Helper
 * Handles PDF download requests from the popup
 * Handles screen selection messaging for Tender ID extraction
 */

// Store extracted IDs temporarily (for when popup opens after extraction)
let lastExtractedIds = null;

// Listen for messages from popup.js and content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle download PDF requests
  if (request.action === 'downloadPdf') {
    console.log('Received downloadPdf request:', request.tenderId);
    downloadPdf(request.url, request.tenderId)
      .then(() => {
        console.log('Download successful, sending response');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Download error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
  
  // Handle extracted tender IDs from content script
  if (request.action === 'tenderIdsExtracted') {
    console.log('Received extracted Tender IDs:', request.tenderIds);
    
    // Store the IDs
    lastExtractedIds = {
      tenderIds: request.tenderIds,
      idsString: request.idsString,
      timestamp: Date.now()
    };
    
    // Try to send to popup if it's open
    chrome.runtime.sendMessage({
      action: 'fillTenderIds',
      tenderIds: request.tenderIds,
      idsString: request.idsString
    }).catch(() => {
      // Popup not open, IDs are stored for later
      console.log('Popup not open, IDs stored for retrieval');
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  // Handle screenshot capture request for OCR
  if (request.action === 'captureScreenshot') {
    console.log('Received captureScreenshot request');
    
    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      
      const tab = tabs[0];
      
      // Check if the tab URL is accessible
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
        sendResponse({ success: false, error: 'Cannot capture browser internal pages' });
        return;
      }
      
      try {
        // Capture the visible tab area
        const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'png',
          quality: 100
        });
        
        console.log('Screenshot captured successfully');
        sendResponse({ 
          success: true, 
          imageDataUrl: imageDataUrl 
        });
      } catch (error) {
        console.error('Error capturing screenshot:', error);
        sendResponse({ 
          success: false, 
          error: 'Failed to capture screenshot: ' + error.message 
        });
      }
    });
    
    return true; // Keep message channel open for async response
  }
  
  // Handle request for last extracted IDs
  if (request.action === 'getLastExtractedIds') {
    sendResponse(lastExtractedIds || { tenderIds: null });
    // Clear after retrieval
    lastExtractedIds = null;
    return true;
  }
  
  // Handle request to activate selection mode
  if (request.action === 'startSelection') {
    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      
      const tab = tabs[0];
      
      // Check if the tab URL is accessible
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
        sendResponse({ success: false, error: 'Cannot run on browser internal pages' });
        return;
      }
      
      try {
        // First, try to inject the content script if not already loaded
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(() => {
          // Script might already be injected, continue anyway
        });
        
        // Send message to activate selection
        chrome.tabs.sendMessage(tab.id, { action: 'activateSelection' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error activating selection:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true });
          }
        });
      } catch (error) {
        console.error('Error injecting content script:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
    
    // Return true to indicate async response
    return true;
  }
  
  // Always return true to keep message channel open
  return true;
});

/**
 * Downloads a PDF file by opening the URL in a new tab and clicking the "Save As PDF" button
 * This function automates the manual click process on the e-GP portal
 * 
 * Logic:
 * 1. Open the URL in a new tab
 * 2. Wait for the page to load
 * 3. Inject a content script to find and click the "Save As PDF" button
 * 4. Close the tab after a delay
 * 
 * Important:
 * - Opens a visible tab (required to access page content)
 * - Clicks the actual button on the page
 * - Tab closes automatically after download is triggered
 * 
 * @param {string} url - The URL of the PDF page
 * @param {string} tenderId - The Tender ID (for logging)
 * @returns {Promise} - Resolves when button is clicked, rejects on error
 */
function downloadPdf(url, tenderId) {
  return new Promise((resolve, reject) => {
    // Step 1: Create a new tab with the URL (active/visible to avoid session issues)
    chrome.tabs.create({ url: url, active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      console.log(`Tab opened for Tender: ${tenderId}, Tab ID: ${tab.id}`);
      
      // Step 2: Wait for the tab to finish loading
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          // Remove this listener
          chrome.tabs.onUpdated.removeListener(listener);
          
// Wait additional 2 seconds for page to fully render and any redirects to complete
          setTimeout(() => {
            // Check if page redirected to session timeout
            chrome.tabs.get(tab.id, (currentTab) => {
              if (chrome.runtime.lastError) {
                console.error('Tab no longer exists:', chrome.runtime.lastError);
                reject(new Error('Tab was closed'));
                return;
              }
              
              if (currentTab.url.includes('SessionTimedOut')) {
                console.error('Page redirected to SessionTimedOut - website may require login or session');
                reject(new Error('Session timeout - the website may require you to open it in a regular tab first'));
                return;
              }
              
              console.log('Page fully loaded, attempting to click button...');
          
          // Step 3: Inject content script to click the "Save As PDF" button
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: clickSaveAsPdfButton
          }, async (results) => {
            if (chrome.runtime.lastError) {
              console.error('Script injection error:', chrome.runtime.lastError);
              // Don't try to close tab, just reject
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            
            // Wait for the async function to complete
            if (results && results[0]) {
              const buttonFound = await results[0].result;
              
              if (buttonFound) {
                console.log(`Save As PDF button clicked for Tender: ${tenderId}`);
                
                // Step 4: Close the tab after 3 seconds (allow download to start)
                setTimeout(() => {
                  chrome.tabs.remove(tab.id, () => {
                    if (chrome.runtime.lastError) {
                      console.log('Tab already closed or does not exist');
                    } else {
                      console.log(`Tab closed for Tender: ${tenderId}`);
                    }
                  });
                }, 3000);
                
                resolve(true);
              } else {
                console.error('Save As PDF button not found');
                // Keep tab open so user can manually click
                reject(new Error('Save As PDF button not found. Tab kept open - you can click manually.'));
              }
            } else {
              console.error('Script execution failed');
              reject(new Error('Script execution failed'));
            }
          });
            });
          }, 2000); // Wait 2 seconds after page load
        }
      });
      
      // Set a timeout in case page never loads
      setTimeout(() => {
        chrome.tabs.get(tab.id, (currentTab) => {
          if (!chrome.runtime.lastError && currentTab) {
            chrome.tabs.remove(tab.id, () => {
              if (!chrome.runtime.lastError) {
                console.log('Tab closed due to timeout');
              }
            });
          }
          reject(new Error('Page load timeout'));
        });
      }, 30000); // 30 second timeout
    });
  });
}

/**
 * Content script function that runs in the page context
 * Scrolls to bottom, waits, then finds and clicks the "Save As PDF" button
 * This function is injected into the e-GP page
 * 
 * @returns {Promise<boolean>} - True if button found and clicked, false otherwise
 */
async function clickSaveAsPdfButton() {
  console.log('=== Starting button search ===');
  
  // Step 1: Scroll to bottom
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 2: Find all INPUT buttons
  const allInputs = document.querySelectorAll('input[type="button"], input[type="submit"], input[type="image"]');
  console.log(`Found ${allInputs.length} input buttons`);
  
  // Try each input button
  for (const input of allInputs) {
    const value = (input.value || input.alt || '').toLowerCase().trim();
    console.log(`Input: "${value}"`);
    
    if (value.includes('save') || value.includes('pdf')) {
      console.log('FOUND! Clicking input:', input);
      input.click();
      return true;
    }
  }
  
  // Step 3: Try regular buttons
  const allButtons = document.querySelectorAll('button, a');
  console.log(`Found ${allButtons.length} buttons/links`);
  
  for (const btn of allButtons) {
    const text = btn.textContent.toLowerCase().trim();
    if (text.includes('save') && text.includes('pdf')) {
      console.log('FOUND button! Clicking:', btn);
      btn.click();
      return true;
    }
  }
  
  // Step 4: Click first input at bottom of page as fallback
  console.log('=== Fallback: clicking first input button ===');
  if (allInputs.length > 0) {
    console.log('Clicking first input button as fallback');
    allInputs[allInputs.length - 1].click(); // Click last input (likely at bottom)
    return true;
  }
  
  console.error('No button found');
  return false;
}

/**
 * Listens for download completion or interruption
 * This is optional but provides better logging and error handling
 * 
 * @param {number} downloadId - The ID of the download to monitor
 * @param {string} tenderId - The Tender ID for logging purposes
 */
function listenForDownloadCompletion(downloadId, tenderId) {
  // Create a listener for this specific download
  const listener = (delta) => {
    // Check if this is the download we're monitoring
    if (delta.id !== downloadId) {
      return;
    }
    
    // Check if download completed successfully
    if (delta.state && delta.state.current === 'complete') {
      console.log(`Download completed successfully for Tender: ${tenderId}`);
      // Remove the listener after completion
      chrome.downloads.onChanged.removeListener(listener);
    }
    
    // Check if download was interrupted
    if (delta.state && delta.state.current === 'interrupted') {
      console.error(`Download interrupted for Tender: ${tenderId}`);
      // Remove the listener after interruption
      chrome.downloads.onChanged.removeListener(listener);
    }
    
    // Check for specific errors
    if (delta.error) {
      console.error(`Download error for Tender ${tenderId}:`, delta.error.current);
    }
  };
  
  // Register the listener
  chrome.downloads.onChanged.addListener(listener);
  
  // Optional: Set a timeout to remove listener after 5 minutes
  // (in case download takes very long or fails silently)
  setTimeout(() => {
    chrome.downloads.onChanged.removeListener(listener);
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Optional: Clean up old listeners on service worker startup
 * Service workers can be stopped and restarted by Chrome
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('e-GP Document Helper service worker started');
});

/**
 * Optional: Log when extension is installed or updated
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('e-GP Document Helper extension installed');
  } else if (details.reason === 'update') {
    console.log('e-GP Document Helper extension updated');
  }
});

/**
 * e-GP Document Helper - Content Script (v2.0.1)
 * Handles area selection overlay, DOM extraction, and OCR fallback
 */

(function() {
  // Prevent multiple injections
  if (window.__egpDocHelperInjected) return;
  window.__egpDocHelperInjected = true;

  // Selection state
  let isSelecting = false;
  let selectionOverlay = null;
  let selectionBox = null;
  let startX = 0, startY = 0;

  // Tender ID regex: exactly 7 digit numbers
  const TENDER_ID_REGEX = /\b\d{7}\b/g;
  
  /**
   * Validate egp id format: must be exactly 7 digits, all numbers
   * @param {string} id - The ID to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  function isValidEgpId(id) {
    return /^\d{7}$/.test(id.trim());
  }

  // ============================================================
  // MESSAGE LISTENER
  // ============================================================

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'activateUnifiedSelection') {
      activateSelectionMode();
      sendResponse({ success: true });
      return true;
    }
  });

  // ============================================================
  // SELECTION MODE
  // ============================================================

  function activateSelectionMode() {
    if (isSelecting) return;
    isSelecting = true;

    // Create overlay
    selectionOverlay = document.createElement('div');
    selectionOverlay.id = 'egp-selection-overlay';
    selectionOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(9, 89, 91, 0.15);
      cursor: crosshair;
      z-index: 2147483647;
    `;

    // Instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #09595B 0%, #0a7173 100%);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 2147483647;
    `;
    instructions.textContent = '🎯 Draw a box around the Tender IDs. Press ESC to cancel.';
    selectionOverlay.appendChild(instructions);

    // Selection box
    selectionBox = document.createElement('div');
    selectionBox.id = 'egp-selection-box';
    selectionBox.style.cssText = `
      position: fixed;
      border: 3px dashed #09595B;
      background: rgba(14, 165, 164, 0.2);
      display: none;
      pointer-events: none;
      z-index: 2147483647;
    `;
    selectionOverlay.appendChild(selectionBox);

    document.body.appendChild(selectionOverlay);

    // Event listeners
    selectionOverlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  }

  function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    const rect = selectionBox.getBoundingClientRect();
    
    // Minimum selection size
    if (rect.width < 20 || rect.height < 20) {
      showNotification('Selection too small. Please draw a larger box.', 'error');
      return;
    }
    
    // Process the selection
    processSelection(rect);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanupSelection();
    }
  }

  function cleanupSelection() {
    isSelecting = false;
    if (selectionOverlay) {
      selectionOverlay.remove();
      selectionOverlay = null;
      selectionBox = null;
    }
    document.removeEventListener('keydown', onKeyDown);
  }

  // ============================================================
  // PROCESS SELECTION (DOM FIRST, OCR FALLBACK)
  // ============================================================

  async function processSelection(rect) {
    showNotification('🔍 Scanning selected area...', 'info');
    
    // Step 1: Try DOM extraction first
    const domIds = extractDOMText(rect);
    
    if (domIds.length > 0) {
      // DOM extraction successful
      console.log('[Content] DOM extraction found IDs:', domIds);
      cleanupSelection();
      sendExtractedIds(domIds, 'dom');
      showNotification(`✅ Found ${domIds.length} Tender ID(s)`, 'success');
      return;
    }
    
    // Step 2: Fallback to OCR
    console.log('[Content] No DOM IDs found, initiating OCR...');
    showNotification('📷 No text found. Starting OCR scan...', 'info');

    // Send selection bounds to background for OCR processing
    const selectionRect = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    };

    chrome.runtime.sendMessage({
      action: 'processOCR',
      rect: selectionRect,
      dpr: window.devicePixelRatio || 1
    }, (ocrResult) => {
      cleanupSelection();

      if (chrome.runtime.lastError) {
        console.error('[Content] OCR request error:', chrome.runtime.lastError);
        showNotification('OCR error: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      if (ocrResult?.success && ocrResult.tenderIds?.length > 0) {
        console.log('[Content] OCR found IDs:', ocrResult.tenderIds);
        sendExtractedIds(ocrResult.tenderIds, 'ocr');
        showNotification(`✅ Found ${ocrResult.tenderIds.length} Tender ID(s) via OCR`, 'success');
      } else {
        const errorMsg = ocrResult?.error || 'No Tender Proposal IDs detected';
        console.log('[Content] OCR failed:', errorMsg);
        showNotification(errorMsg, 'error');
      }
    });
  }

  // ============================================================
  // DOM TEXT EXTRACTION
  // ============================================================

  function extractDOMText(rect) {
    const allText = [];
    
    // Get all text nodes in the document
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.trim();
      
      if (!text) continue;
      
      // Get parent element's bounding box
      const parent = node.parentElement;
      if (!parent) continue;
      
      const nodeRect = parent.getBoundingClientRect();
      
      // Check if element is within selection rectangle
      if (isRectIntersecting(nodeRect, rect)) {
        allText.push(text);
      }
    }
    
    // Also check input/textarea values
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      const inputRect = input.getBoundingClientRect();
      if (isRectIntersecting(inputRect, rect)) {
        if (input.value) {
          allText.push(input.value);
        }
      }
    });
    
    // Extract Tender IDs from collected text
    const combinedText = allText.join(' ');
    const matches = combinedText.match(TENDER_ID_REGEX);
    
    if (!matches) return [];
    
    // Remove duplicates while preserving order and validate format
    const uniqueIds = [...new Set(matches)].filter(id => isValidEgpId(id));
    
    console.log('DOM extracted text:', combinedText.substring(0, 500));
    console.log('Found IDs:', uniqueIds);
    
    return uniqueIds;
  }

  function isRectIntersecting(nodeRect, selectionRect) {
    return !(
      nodeRect.right < selectionRect.left ||
      nodeRect.left > selectionRect.right ||
      nodeRect.bottom < selectionRect.top ||
      nodeRect.top > selectionRect.bottom
    );
  }

  // ============================================================
  // SEND RESULTS
  // ============================================================

  function sendExtractedIds(tenderIds, mode) {
    const idsString = tenderIds.join(', ');
    
    // Copy to clipboard
    navigator.clipboard.writeText(idsString).then(() => {
      console.log('IDs copied to clipboard:', idsString);
    }).catch(err => {
      console.log('Clipboard write failed:', err);
    });
    
    // Send to background/popup
    chrome.runtime.sendMessage({
      action: 'tenderIdsExtracted',
      tenderIds: tenderIds,
      idsString: idsString,
      mode: mode
    });
  }

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  function showNotification(message, type) {
    // Remove existing notification
    const existing = document.getElementById('egp-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.id = 'egp-notification';
    
    let bgColor, borderColor;
    switch (type) {
      case 'success':
        bgColor = 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)';
        borderColor = '#28a745';
        break;
      case 'error':
        bgColor = 'linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%)';
        borderColor = '#dc3545';
        break;
      default:
        bgColor = 'linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%)';
        borderColor = '#17a2b8';
    }
    
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: #333;
      padding: 14px 28px;
      border-radius: 8px;
      border-left: 4px solid ${borderColor};
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      z-index: 2147483647;
      animation: slideUp 0.3s ease;
    `;
    
    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translate(-50%, 20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
    `;
    notification.appendChild(style);
    
    notification.appendChild(document.createTextNode(message));
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 4000);
  }

})();

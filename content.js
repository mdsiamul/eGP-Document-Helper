/**
 * Content Script for e-GP Document Helper
 * Implements screen selection overlay for Tender ID extraction
 * 
 * Features:
 * - Transparent dark overlay on activation
 * - Drag-to-select rectangular area
 * - DOM-based text extraction (no OCR)
 * - Tender ID detection using regex
 * - Clipboard copy functionality
 * - Message passing to popup
 */

// ============================================================
// PREVENT DUPLICATE INJECTION
// ============================================================

// Prevent multiple script injections
if (window.egpSelectorActive !== undefined) {
  console.log('[e-GP Helper] Content script already loaded, skipping...');
} else {
  window.egpSelectorActive = false;
}

// ============================================================
// CONFIGURATION
// ============================================================

// Configurable regex pattern for Tender ID detection
// Matches numeric strings with 5-15 digits
const TENDER_ID_REGEX = /\b\d{5,15}\b/g;

// ============================================================
// STATE VARIABLES
// ============================================================

let isSelectionActive = false;
let overlay = null;
let selectionBox = null;
let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;

// ============================================================
// OVERLAY CREATION
// ============================================================

/**
 * Creates the transparent dark overlay for screen selection
 * @returns {HTMLElement} The overlay element
 */
function createOverlay() {
  const overlayEl = document.createElement('div');
  overlayEl.id = 'egp-selection-overlay';
  overlayEl.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.4);
    z-index: 2147483646;
    cursor: crosshair;
    user-select: none;
    -webkit-user-select: none;
  `;
  
  // Add instruction tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'egp-selection-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #09595B 0%, #0a7173 100%);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    z-index: 2147483647;
    pointer-events: none;
    text-align: center;
  `;
  tooltip.innerHTML = `
    <div style="margin-bottom: 4px;">📌 Drag to select an area containing Tender IDs</div>
    <div style="font-size: 12px; opacity: 0.9;">Press <kbd style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px;">ESC</kbd> to cancel</div>
  `;
  
  overlayEl.appendChild(tooltip);
  return overlayEl;
}

/**
 * Creates the selection rectangle element
 * @returns {HTMLElement} The selection box element
 */
function createSelectionBox() {
  const box = document.createElement('div');
  box.id = 'egp-selection-box';
  box.style.cssText = `
    position: fixed;
    border: 2px dashed #09595B;
    background: rgba(9, 89, 91, 0.15);
    z-index: 2147483647;
    pointer-events: none;
    display: none;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4);
  `;
  return box;
}

// ============================================================
// SELECTION LOGIC
// ============================================================

/**
 * Activates the screen selection mode
 */
function activateSelection() {
  if (isSelectionActive) return;
  
  isSelectionActive = true;
  window.egpSelectorActive = true;
  
  // Create and append overlay
  overlay = createOverlay();
  selectionBox = createSelectionBox();
  
  document.body.appendChild(overlay);
  document.body.appendChild(selectionBox);
  
  // Attach event listeners
  overlay.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('keydown', handleKeyDown);
  
  console.log('[e-GP Helper] Selection mode activated');
}

/**
 * Deactivates the screen selection mode and cleans up
 */
function deactivateSelection() {
  if (!isSelectionActive) return;
  
  isSelectionActive = false;
  window.egpSelectorActive = false;
  
  // Remove event listeners
  if (overlay) {
    overlay.removeEventListener('mousedown', handleMouseDown);
  }
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('keydown', handleKeyDown);
  
  // Remove overlay elements
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  if (selectionBox && selectionBox.parentNode) {
    selectionBox.parentNode.removeChild(selectionBox);
  }
  
  overlay = null;
  selectionBox = null;
  
  console.log('[e-GP Helper] Selection mode deactivated');
}

/**
 * Handles mouse down event - starts selection
 * @param {MouseEvent} e 
 */
function handleMouseDown(e) {
  e.preventDefault();
  e.stopPropagation();
  
  startX = e.clientX;
  startY = e.clientY;
  endX = e.clientX;
  endY = e.clientY;
  
  if (selectionBox) {
    selectionBox.style.display = 'block';
    updateSelectionBox();
  }
}

/**
 * Handles mouse move event - updates selection rectangle
 * @param {MouseEvent} e 
 */
function handleMouseMove(e) {
  if (!isSelectionActive || selectionBox.style.display === 'none') return;
  
  e.preventDefault();
  
  endX = e.clientX;
  endY = e.clientY;
  
  updateSelectionBox();
}

/**
 * Handles mouse up event - completes selection and extracts IDs
 * @param {MouseEvent} e 
 */
function handleMouseUp(e) {
  if (!isSelectionActive || selectionBox.style.display === 'none') return;
  
  e.preventDefault();
  e.stopPropagation();
  
  endX = e.clientX;
  endY = e.clientY;
  
  // Get scroll offsets
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  
  // Calculate selection rectangle with scroll offsets
  const rect = {
    left: Math.min(startX, endX) + scrollX,
    top: Math.min(startY, endY) + scrollY,
    right: Math.max(startX, endX) + scrollX,
    bottom: Math.max(startY, endY) + scrollY
  };
  
  // Minimum selection size check
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  
  if (width < 10 || height < 10) {
    console.log('[e-GP Helper] Selection too small, cancelled');
    deactivateSelection();
    return;
  }
  
  console.log('[e-GP Helper] Selection rect:', rect);
  
  // Extract tender IDs from selected area
  const tenderIds = extractTenderIdsFromSelection(rect);
  
  // Deactivate selection mode
  deactivateSelection();
  
  // Process extracted IDs
  if (tenderIds.length > 0) {
    const idsString = tenderIds.join(', ');
    
    // Copy to clipboard immediately (must be in user gesture)
    try {
      navigator.clipboard.writeText(idsString).then(() => {
        console.log('[e-GP Helper] Copied to clipboard:', idsString);
      }).catch(err => {
        console.error('[e-GP Helper] Clipboard write failed:', err);
        // Fallback
        copyToClipboardFallback(idsString);
      });
    } catch (err) {
      console.error('[e-GP Helper] Clipboard API error:', err);
      copyToClipboardFallback(idsString);
    }
    
    // Send to popup via background script
    sendIdsToPopup(tenderIds);
    
    // Show success notification
    showNotification(`✅ Extracted ${tenderIds.length} Tender ID(s)`, idsString);
    
    console.log('[e-GP Helper] Extracted Tender IDs:', idsString);
  } else {
    showNotification('⚠️ No Tender IDs found', 'Try selecting a different area');
    console.log('[e-GP Helper] No Tender IDs found in selection');
  }
}

/**
 * Handles keyboard events - ESC to cancel
 * @param {KeyboardEvent} e 
 */
function handleKeyDown(e) {
  if (e.key === 'Escape' && isSelectionActive) {
    e.preventDefault();
    deactivateSelection();
    showNotification('❌ Selection cancelled', '');
    console.log('[e-GP Helper] Selection cancelled by user');
  }
}

/**
 * Updates the visual selection box based on current coordinates
 */
function updateSelectionBox() {
  if (!selectionBox) return;
  
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

// ============================================================
// TENDER ID EXTRACTION
// ============================================================

/**
 * Extracts visible text from DOM elements within the selection rectangle
 * @param {Object} selectionRect - The selection rectangle {left, top, right, bottom}
 * @returns {string[]} Array of unique Tender IDs found
 */
function extractTenderIdsFromSelection(selectionRect) {
  const tenderIdSet = new Set();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  
  console.log('[e-GP Helper] Starting extraction, scroll offset:', { scrollX, scrollY });
  
  // Get all potentially visible elements
  const allElements = document.querySelectorAll('*');
  let checkedCount = 0;
  let intersectCount = 0;
  
  allElements.forEach(element => {
    try {
      // Skip script, style, and other non-visual elements
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'script' || tagName === 'style' || tagName === 'noscript' || 
          tagName === 'head' || tagName === 'meta' || tagName === 'link') {
        return;
      }
      
      // Get bounding rectangle
      const rect = element.getBoundingClientRect();
      
      // Adjust rect for scroll position
      const adjustedRect = {
        left: rect.left + scrollX,
        top: rect.top + scrollY,
        right: rect.right + scrollX,
        bottom: rect.bottom + scrollY
      };
      
      checkedCount++;
      
      // Check if element intersects with selection
      if (intersects(selectionRect, adjustedRect)) {
        intersectCount++;
        
        // Check if element is visible
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return;
        }
        
        // Extract text content
        let text = '';
        
        // Try multiple methods to get text
        if (element.value) {
          // Input/textarea elements
          text = element.value;
        } else if (element.textContent) {
          text = element.textContent;
        } else if (element.innerText) {
          text = element.innerText;
        }
        
        // Clean and normalize text
        text = (text || '').replace(/\s+/g, ' ').trim();
        
        if (text.length > 0) {
          // Extract tender IDs from this text
          extractTenderIdsFromText(text, tenderIdSet);
        }
      }
    } catch (e) {
      // Silently ignore elements that can't be measured
    }
  });
  
  console.log('[e-GP Helper] Checked:', checkedCount, 'Intersected:', intersectCount, 'IDs found:', tenderIdSet.size);
  
  // Convert Set to Array and preserve insertion order
  return Array.from(tenderIdSet);
}

/**
 * Gets only the direct text content of an element (excluding children)
 * @param {HTMLElement} element 
 * @returns {string}
 */
function getDirectTextContent(element) {
  let text = '';
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent;
    }
  }
  return text;
}

/**
 * Checks if element rectangle intersects with selection rectangle
 * @param {Object} selection - Selection rectangle
 * @param {Object} elementRect - Element bounding rectangle
 * @returns {boolean}
 */
function intersects(selection, elementRect) {
  return !(
    elementRect.right < selection.left ||
    elementRect.left > selection.right ||
    elementRect.bottom < selection.top ||
    elementRect.top > selection.bottom
  );
}

/**
 * Extracts Tender IDs from text using regex and adds to Set
 * @param {string} text 
 * @param {Set} tenderIdSet 
 */
function extractTenderIdsFromText(text, tenderIdSet) {
  if (!text || typeof text !== 'string') return;
  
  // Reset regex lastIndex
  TENDER_ID_REGEX.lastIndex = 0;
  
  let match;
  while ((match = TENDER_ID_REGEX.exec(text)) !== null) {
    const tenderId = match[0];
    tenderIdSet.add(tenderId);
  }
}

// ============================================================
// CLIPBOARD & MESSAGING
// ============================================================

/**
 * Fallback clipboard copy using execCommand
 * @param {string} text 
 */
function copyToClipboardFallback(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (success) {
      console.log('[e-GP Helper] Copied to clipboard (fallback):', text);
    } else {
      console.error('[e-GP Helper] Fallback copy failed');
    }
  } catch (err) {
    console.error('[e-GP Helper] Fallback clipboard error:', err);
  }
}

/**
 * Sends extracted IDs to the popup via background script
 * @param {string[]} tenderIds 
 */
function sendIdsToPopup(tenderIds) {
  chrome.runtime.sendMessage({
    action: 'tenderIdsExtracted',
    tenderIds: tenderIds,
    idsString: tenderIds.join(', ')
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('[e-GP Helper] Popup not open, IDs stored for later');
    } else {
      console.log('[e-GP Helper] IDs sent to popup:', response);
    }
  });
}

// ============================================================
// NOTIFICATION
// ============================================================

/**
 * Shows a temporary notification on the page
 * @param {string} title 
 * @param {string} message 
 */
function showNotification(title, message) {
  // Remove existing notification if any
  const existing = document.getElementById('egp-notification');
  if (existing) {
    existing.remove();
  }
  
  const notification = document.createElement('div');
  notification.id = 'egp-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #09595B 0%, #0a7173 100%);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    z-index: 2147483647;
    max-width: 400px;
    animation: egp-slide-in 0.3s ease;
  `;
  
  notification.innerHTML = `
    <style>
      @keyframes egp-slide-in {
        from {
          opacity: 0;
          transform: translateX(100px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @keyframes egp-slide-out {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(100px);
        }
      }
    </style>
    <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
    ${message ? `<div style="font-size: 12px; opacity: 0.9; word-break: break-all;">${message}</div>` : ''}
    <div style="font-size: 11px; opacity: 0.7; margin-top: 8px;">📋 Copied to clipboard</div>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'egp-slide-out 0.3s ease forwards';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }
  }, 4000);
}

// ============================================================
// MESSAGE LISTENER
// ============================================================

/**
 * Listen for messages from popup or background script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'activateSelection') {
    // Activate the selection mode
    activateSelection();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'ping') {
    // Health check
    sendResponse({ success: true, active: isSelectionActive });
    return true;
  }
  
  return false;
});

// Log that content script is loaded
console.log('[e-GP Helper] Content script loaded and ready');

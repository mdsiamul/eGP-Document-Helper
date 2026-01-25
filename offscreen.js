/**
 * e-GP Document Helper - Offscreen OCR Engine (v2.0.1)
 * 
 * Production-grade OCR pipeline for numeric Tender Proposal IDs.
 * Runs in offscreen document with full DOM access (Image, Canvas).
 * 
 * Pipeline:
 * 1. Region capture & crop
 * 2. Stroke-aware adaptive preprocessing
 * 3. Row-by-row segmentation
 * 4. Number-only OCR per row
 * 5. Character normalization
 * 6. Length detection & validation
 * 7. 5↔8 disambiguation
 * 8. Position-based frequency correction
 * 9. Silent rejection
 * 10. Visual order output
 */

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  // OCR settings
  CONFIDENCE_THRESHOLD: 60,        // Minimum digit confidence
  HIGH_CONFIDENCE: 80,             // High confidence threshold
  AMBIGUOUS_THRESHOLD: 75,         // Threshold for 5↔8 disambiguation
  
  // Length detection
  MIN_ID_LENGTH: 6,
  MAX_ID_LENGTH: 8,
  
  // Correction limits
  MAX_CORRECTIONS_PER_ID: 1,       // Silent reject if more needed
  
  // Row segmentation
  MIN_ROW_HEIGHT: 8,               // Minimum pixels for valid row
  ROW_GAP_THRESHOLD: 5,            // Minimum gap between rows

  // Liberal row segmentation (to avoid missing rows)
  LIBERAL_MIN_ROW_HEIGHT: 3,
  LIBERAL_PROJECTION_RATIO: 0.002,  // 0.2% of width counts as "ink"
  LIBERAL_DARK_PIXEL_THRESHOLD: 180,
  ROW_BAND_PADDING_Y: 6,           // Expand row bands to allow overlap
  MAX_DETECTED_ROWS: 80,

  // Row OCR retry
  RETRY_CONFIDENCE_THRESHOLD: 55,  // Retry second pass if below this or empty
  
  // Preprocessing
  THIN_STROKE_THRESHOLD: 2.5,      // Edge density for thin vs thick
  
  // Paths (local, no CDN)
  TESSERACT_WORKER_PATH: chrome.runtime.getURL('tesseract/worker.min.js'),
  TESSERACT_CORE_PATH: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
  TESSERACT_LANG_PATH: chrome.runtime.getURL('tesseract/lang-data'),
};

// Character normalization map (OCR common mistakes)
const CHAR_NORMALIZE_MAP = {
  'O': '0', 'o': '0', 'D': '0',
  'I': '1', 'i': '1', 'l': '1', 'L': '1', '|': '1',
  'S': '5', 's': '5',
  'B': '8', 'b': '8',
  'Z': '2', 'z': '2',
  'G': '6', 'g': '9',
  'q': '9', 'Q': '0',
  'A': '4', 'a': '4',
  'T': '7', 't': '7',
};

// ============================================================
// STATE
// ============================================================

let tesseractWorker = null;
let isInitializing = false;

// ============================================================
// MESSAGE LISTENER
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'runOCR') {
    handleOCR(request)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('OCR error:', error);
        sendResponse({
          success: false,
          error: error.message || 'OCR processing failed',
          tenderIds: []
        });
      });
    return true; // Keep channel open for async response
  }
});

// ============================================================
// MAIN OCR HANDLER
// ============================================================

async function handleOCR(request) {
  const { imageDataUrl, rect, dpr } = request;
  
  if (!imageDataUrl) {
    throw new Error('No image data provided');
  }
  
  if (!rect || typeof rect.x !== 'number') {
    throw new Error('Invalid selection rectangle');
  }
  
  console.log('[OCR] Starting pipeline...');
  console.log('[OCR] Selection:', rect, 'DPR:', dpr);
  
  // Step 1: Load and crop image
  const croppedCanvas = await cropImage(imageDataUrl, rect, dpr || 1);
  console.log('[OCR] Cropped:', croppedCanvas.width, 'x', croppedCanvas.height);

  // When the user is zoomed out, the screenshot contains fewer pixels per digit.
  // Upscaling the crop makes rows/characters large enough for Tesseract.
  const workingCanvas = maybeUpscaleForOcr(croppedCanvas);
  if (workingCanvas !== croppedCanvas) {
    console.log('[OCR] Upscaled crop:', workingCanvas.width, 'x', workingCanvas.height);
  }
  
  // Step 2: Detect stroke thickness and preprocess
  const strokeType = detectStrokeType(workingCanvas);
  console.log('[OCR] Stroke type:', strokeType);
  
  const preprocessedCanvas = preprocessImage(workingCanvas, strokeType);
  const grayscaleCanvas = preprocessGrayscaleOnly(workingCanvas);

  // Step 3: Segment rows (LIBERAL + OVERLAPPING)
  // Goal: OCR extra rows rather than miss real ones.
  const rows = dedupeRows([
    ...segmentRowsLiberal(preprocessedCanvas, { source: 'stroke-aware' }),
    ...segmentRowsLiberal(grayscaleCanvas, { source: 'grayscale-only' }),
    ...segmentRowsLiberal(workingCanvas, { source: 'raw' }),
  ]).slice(0, CONFIG.MAX_DETECTED_ROWS);

  console.log('[OCR] Detected rows (liberal):', rows.length);

  if (rows.length === 0) {
    return {
      success: false,
      error: 'No text rows detected in selection',
      tenderIds: [],
      rowsDebug: []
    };
  }
  
  // Step 4: Initialize Tesseract
  await initTesseract();
  
  // Step 5: OCR each row (guaranteed attempt + 2-pass retry)
  const { ocrResults, rowsDebug } = await ocrRowsTwoPass(rows, preprocessedCanvas, grayscaleCanvas);
  console.log('[OCR] Raw results:', ocrResults);
  
  // Step 6: Process and validate IDs
  const validatedIds = processOcrResults(ocrResults);
  console.log('[OCR] Validated IDs:', validatedIds);
  
  if (validatedIds.length === 0) {
    return {
      success: false,
      error: 'No valid Tender Proposal IDs detected',
      tenderIds: [],
      rowsDebug
    };
  }
  
  return {
    success: true,
    tenderIds: validatedIds,
    count: validatedIds.length,
    rowsDebug
  };
}

// ============================================================
// PREPROCESS (ALTERNATE: GRAYSCALE ONLY)
// ============================================================

function preprocessGrayscaleOnly(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  const outData = outCtx.createImageData(canvas.width, canvas.height);
  const out = outData.data;

  // Grayscale + mild contrast only (NO thresholding)
  for (let i = 0; i < data.length; i += 4) {
    let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray = Math.min(255, Math.max(0, (gray - 128) * 1.25 + 128));
    out[i] = out[i + 1] = out[i + 2] = gray;
    out[i + 3] = 255;
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

// ============================================================
// STEP 1: IMAGE CROPPING
// ============================================================

function cropImage(dataUrl, rect, dpr) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // Scale coordinates by device pixel ratio
      const x = Math.round(rect.x * dpr);
      const y = Math.round(rect.y * dpr);
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      
      // Clamp to image bounds
      const sx = Math.max(0, Math.min(x, img.width - 1));
      const sy = Math.max(0, Math.min(y, img.height - 1));
      const sw = Math.min(width, img.width - sx);
      const sh = Math.min(height, img.height - sy);
      
      canvas.width = sw;
      canvas.height = sh;
      
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      
      resolve(canvas);
    };
    
    img.onerror = () => reject(new Error('Failed to load screenshot image'));
    img.src = dataUrl;
  });
}

/**
 * If the user is zoomed out, the captured pixels per character can be too low.
 * Upscale the crop to a more OCR-friendly size. This is fully automatic.
 */
function maybeUpscaleForOcr(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return canvas;

  // Heuristic: small crops (or short height) typically mean tiny glyphs.
  // Upscale moderately to improve OCR; cap to avoid huge memory use.
  const maxDim = 2400;
  let scale = 1;

  if (h < 160 || w < 500) scale = 3;
  else if (h < 260 || w < 800) scale = 2;

  if (scale === 1) return canvas;

  const targetW = Math.min(maxDim, w * scale);
  const targetH = Math.min(maxDim, h * scale);
  if (targetW === w && targetH === h) return canvas;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });

  // For downsampled UI text, smoothing during upscale usually helps OCR.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(canvas, 0, 0, w, h, 0, 0, targetW, targetH);

  return outCanvas;
}

// ============================================================
// STEP 2: STROKE-AWARE PREPROCESSING
// ============================================================

/**
 * Detect if text has thin or thick strokes using edge density analysis
 */
function detectStrokeType(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Convert to grayscale and detect edges
  const width = canvas.width;
  const height = canvas.height;
  const gray = new Uint8Array(width * height);
  
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4;
    gray[idx] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  
  // Simple edge detection (horizontal gradient)
  let edgeSum = 0;
  let edgeCount = 0;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
      const gy = Math.abs(gray[idx + width] - gray[idx - width]);
      const edge = Math.sqrt(gx * gx + gy * gy);
      
      if (edge > 30) { // Edge threshold
        edgeSum += edge;
        edgeCount++;
      }
    }
  }
  
  // Calculate edge density
  const totalPixels = width * height;
  const edgeDensity = (edgeCount / totalPixels) * 100;
  
  console.log('[Preprocess] Edge density:', edgeDensity.toFixed(2) + '%');
  
  // Higher edge density = thinner strokes (more edges per area)
  return edgeDensity > CONFIG.THIN_STROKE_THRESHOLD ? 'thin' : 'thick';
}

/**
 * Apply stroke-aware preprocessing
 */
function preprocessImage(canvas, strokeType) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  const outData = outCtx.createImageData(canvas.width, canvas.height);
  const out = outData.data;
  
  if (strokeType === 'thin') {
    // THIN STROKES: Gentle processing to preserve detail
    console.log('[Preprocess] Thin stroke pipeline');
    
    for (let i = 0; i < data.length; i += 4) {
      // Grayscale
      let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Mild contrast boost (1.2x)
      gray = Math.min(255, Math.max(0, (gray - 128) * 1.2 + 128));
      
      // Slight sharpening via local contrast
      out[i] = out[i + 1] = out[i + 2] = gray;
      out[i + 3] = 255;
    }
  } else {
    // THICK STROKES: Aggressive processing
    console.log('[Preprocess] Thick stroke pipeline');
    
    // First pass: grayscale + contrast
    const gray = new Uint8Array(data.length / 4);
    for (let i = 0; i < data.length; i += 4) {
      let g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Strong contrast boost (1.5x)
      g = Math.min(255, Math.max(0, (g - 128) * 1.5 + 128));
      gray[i / 4] = g;
    }
    
    // Adaptive thresholding (local mean)
    const width = canvas.width;
    const height = canvas.height;
    const blockSize = 15;
    const C = 10; // Threshold offset
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        // Calculate local mean
        let sum = 0;
        let count = 0;
        const half = Math.floor(blockSize / 2);
        
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              sum += gray[ny * width + nx];
              count++;
            }
          }
        }
        
        const mean = sum / count;
        const threshold = mean - C;
        
        // Binary threshold
        const val = gray[idx] < threshold ? 0 : 255;
        
        const outIdx = idx * 4;
        out[outIdx] = out[outIdx + 1] = out[outIdx + 2] = val;
        out[outIdx + 3] = 255;
      }
    }
    
    // Noise cleanup (simple morphological opening)
    cleanupNoise(out, width, height);
  }
  
  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

/**
 * Simple noise cleanup using morphological operations
 */
function cleanupNoise(data, width, height) {
  // Erode then dilate (opening) to remove small noise
  const temp = new Uint8Array(width * height);
  
  // Erode (shrink white regions)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      let min = 255;
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nIdx = (y + dy) * width + (x + dx);
          min = Math.min(min, data[nIdx * 4]);
        }
      }
      temp[idx] = min;
    }
  }
  
  // Dilate (expand white regions)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      let max = 0;
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nIdx = (y + dy) * width + (x + dx);
          max = Math.max(max, temp[nIdx]);
        }
      }
      
      data[idx * 4] = data[idx * 4 + 1] = data[idx * 4 + 2] = max;
    }
  }
}

// ============================================================
// STEP 3: ROW SEGMENTATION (LIBERAL + OVERLAPPING)
// ============================================================

function segmentRowsLiberal(canvas, meta = {}) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  const projection = new Array(height).fill(0);
  const darkThreshold = CONFIG.LIBERAL_DARK_PIXEL_THRESHOLD;

  // Identify near-solid vertical lines (table borders) and ignore them during projection.
  // Otherwise borders can make every scanline look "inked", merging all rows.
  const ignoredCols = new Uint8Array(width);
  const edgeMargin = Math.min(8, Math.floor(width * 0.08));
  for (let x = 0; x < width; x++) {
    let darkCount = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < darkThreshold) darkCount++;
    }
    const ratio = darkCount / Math.max(1, height);
    // Treat very dark columns near edges as borders.
    if (ratio > 0.92 && (x < edgeMargin || x >= width - edgeMargin)) {
      ignoredCols[x] = 1;
    }
  }

  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (ignoredCols[x]) continue;
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < darkThreshold) count++;
    }
    projection[y] = count;
  }

  const threshold = Math.max(1, Math.floor(width * CONFIG.LIBERAL_PROJECTION_RATIO));
  const rawBands = [];
  let inBand = false;
  let startY = 0;

  for (let y = 0; y < height; y++) {
    if (!inBand && projection[y] > threshold) {
      inBand = true;
      startY = y;
    } else if (inBand && projection[y] <= threshold) {
      inBand = false;
      const bandHeight = y - startY;
      rawBands.push({ y: startY, height: Math.max(1, bandHeight) });
    }
  }

  if (inBand) {
    rawBands.push({ y: startY, height: Math.max(1, height - startY) });
  }

  // If borders caused one huge band, force a sliding window oversegmentation.
  if (rawBands.length === 1) {
    const only = rawBands[0];
    const huge = only.height > Math.max(80, Math.floor(height * 0.6));
    if (huge) {
      rawBands.length = 0;
      const win = Math.max(CONFIG.MIN_ROW_HEIGHT, 42);
      const stride = Math.max(10, Math.floor(win / 2));
      for (let y = 0; y < height; y += stride) {
        rawBands.push({ y, height: Math.min(win, height - y) });
      }
    }
  }

  // If we found nothing, fall back to a sliding window grid (still liberal)
  if (rawBands.length === 0) {
    const win = Math.max(CONFIG.MIN_ROW_HEIGHT, 18);
    const stride = Math.max(6, Math.floor(win / 2));
    for (let y = 0; y < height; y += stride) {
      rawBands.push({ y, height: Math.min(win, height - y) });
    }
  }

  // Expand bands to allow overlap and preserve thin rows
  const paddedBands = [];
  for (const band of rawBands) {
    const baseY = Math.max(0, band.y);
    const baseH = Math.max(1, band.height);

    // Keep the base band
    paddedBands.push({ y: baseY, height: baseH });

    // Add an expanded overlapping band (critical to avoid missing strokes)
    const pad = CONFIG.ROW_BAND_PADDING_Y;
    const y0 = Math.max(0, baseY - pad);
    const y1 = Math.min(height, baseY + baseH + pad);
    paddedBands.push({ y: y0, height: Math.max(1, y1 - y0) });
  }

  // Compute X bounds per band, but NEVER filter out a band pre-OCR.
  const rows = paddedBands.map(band => {
    const y0 = Math.max(0, Math.min(height - 1, band.y));
    const y1 = Math.max(y0 + 1, Math.min(height, band.y + band.height));

    let minX = width;
    let maxX = -1;

    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < width; x++) {
        if (ignoredCols[x]) continue;
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness < darkThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }

    // If we didn't find ink bounds, use full width (still OCR it)
    if (maxX < 0) {
      minX = 0;
      maxX = width - 1;
    }

    const paddingX = 8;
    minX = Math.max(0, minX - paddingX);
    maxX = Math.min(width - 1, maxX + paddingX);

    const rowY = y0;
    const rowH = Math.max(1, y1 - y0);

    return {
      x: minX,
      y: rowY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, rowH),
      centerY: rowY + rowH / 2,
      source: meta.source || 'unknown'
    };
  });

  return rows;
}

function dedupeRows(rows) {
  // Sort by y, then height.
  const sorted = [...rows].sort((a, b) => (a.y - b.y) || (a.height - b.height));
  const deduped = [];
  const yTol = 2;
  const hTol = 2;

  for (const r of sorted) {
    const last = deduped[deduped.length - 1];
    if (
      last &&
      Math.abs(last.y - r.y) <= yTol &&
      Math.abs(last.height - r.height) <= hTol &&
      Math.abs(last.x - r.x) <= 4 &&
      Math.abs(last.width - r.width) <= 6
    ) {
      // Keep the one with larger area (usually safer)
      const lastArea = last.width * last.height;
      const rArea = r.width * r.height;
      if (rArea > lastArea) deduped[deduped.length - 1] = r;
      continue;
    }
    deduped.push(r);
  }

  return deduped;
}

/**
 * Extract row image from canvas
 */
function extractRowImage(canvas, row) {
  const rowCanvas = document.createElement('canvas');
  const padding = 3;
  
  rowCanvas.width = Math.max(1, row.width);
  rowCanvas.height = Math.max(1, row.height + padding * 2);
  
  const ctx = rowCanvas.getContext('2d', { willReadFrequently: true });
  
  // White background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, rowCanvas.width, rowCanvas.height);
  
  // Draw row
  ctx.drawImage(
    canvas,
    row.x, row.y, row.width, row.height,
    0, padding, row.width, row.height
  );
  
  return rowCanvas;
}

/**
 * Ensure the image sent to Tesseract meets minimal size requirements.
 * Tesseract can throw (e.g. "Image too small to scale") when width < 3.
 */
function ensureMinOcrCanvasSize(sourceCanvas, minWidth = 3, minHeight = 3) {
  const srcWidth = sourceCanvas?.width ?? 0;
  const srcHeight = sourceCanvas?.height ?? 0;

  if (srcWidth <= 0 || srcHeight <= 0) {
    const blank = document.createElement('canvas');
    blank.width = minWidth;
    blank.height = minHeight;
    const ctx = blank.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, blank.width, blank.height);
    return blank;
  }
  if (srcWidth >= minWidth && srcHeight >= minHeight) return sourceCanvas;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = Math.max(minWidth, srcWidth);
  outCanvas.height = Math.max(minHeight, srcHeight);

  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0, srcWidth, srcHeight, 0, 0, outCanvas.width, outCanvas.height);

  return outCanvas;
}

// ============================================================
// STEP 4: TESSERACT INITIALIZATION
// ============================================================

async function initTesseract() {
  if (tesseractWorker) return tesseractWorker;
  if (isInitializing) {
    // Wait for existing initialization
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 100));
    }
    return tesseractWorker;
  }
  
  isInitializing = true;
  console.log('[Tesseract] Initializing worker...');
  console.log('[Tesseract] Config:', CONFIG);
  
  try {
    // Check if Tesseract is available
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js not loaded');
    }
    
    // Use Tesseract.js v5 API.
    // IMPORTANT: disable blob workers in MV3 to avoid CSP failures.
    try {
      tesseractWorker = await Tesseract.createWorker(
        'eng',
        1,
        {
          workerPath: CONFIG.TESSERACT_WORKER_PATH,
          corePath: CONFIG.TESSERACT_CORE_PATH,
          langPath: CONFIG.TESSERACT_LANG_PATH,
          workerBlobURL: false,
          logger: msg => {
            if (msg.status === 'recognizing text') {
              console.log('[Tesseract] Progress:', Math.round(msg.progress * 100) + '%');
            }
          }
        }
      );
      
    } catch (err) {
      console.error('[Tesseract] Worker creation failed:', err);
      throw new Error(`Failed to create Tesseract worker: ${err.message}`);
    }
    
    // Configure for numeric-only recognition
    try {
      await tesseractWorker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '7', // PSM 7 = SINGLE_LINE
        preserve_interword_spaces: '0',
      });
    } catch (err) {
      console.error('[Tesseract] Parameter setting failed:', err);
      throw new Error(`Failed to set Tesseract parameters: ${err.message}`);
    }
    
    console.log('[Tesseract] Worker ready');
    return tesseractWorker;
  } catch (err) {
    console.error('[Tesseract] Initialization error:', err);
    tesseractWorker = null;
    throw err;
  } finally {
    isInitializing = false;
  }
}

// ============================================================
// STEP 5: OCR EACH ROW
// ============================================================

async function ocrRowsTwoPass(rows, pass1Canvas, pass2Canvas) {
  const ocrResults = [];
  const rowsDebug = [];

  for (const row of rows) {
    const rowDebug = {
      y: row.centerY,
      row,
      attempts: [],
      chosen: null
    };

    // PASS 1: stroke-aware preprocessing
    const attempt1 = await ocrSingleRow(row, pass1Canvas, { pass: 1, label: 'stroke-aware' });
    rowDebug.attempts.push(attempt1.debug);

    let chosen = attempt1;

    // Retry if empty or low confidence
    const needsRetry = !attempt1.text || (typeof attempt1.confidence === 'number' && attempt1.confidence < CONFIG.RETRY_CONFIDENCE_THRESHOLD);

    // PASS 2: grayscale-only (no thresholding)
    if (needsRetry) {
      const attempt2 = await ocrSingleRow(row, pass2Canvas, { pass: 2, label: 'grayscale-only' });
      rowDebug.attempts.push(attempt2.debug);

      // Choose best: prefer non-empty; then higher confidence
      if (attempt2.text && !attempt1.text) {
        chosen = attempt2;
      } else if (attempt2.text && attempt1.text) {
        if ((attempt2.confidence ?? 0) >= (attempt1.confidence ?? 0)) chosen = attempt2;
      }
    }

    rowDebug.chosen = {
      text: chosen.text,
      confidence: chosen.confidence,
      pass: chosen.pass,
      label: chosen.label
    };
    rowsDebug.push(rowDebug);

    // IMPORTANT: Do not reject/skip here. Even empty stays represented in rowsDebug.
    ocrResults.push({
      text: chosen.text,
      confidence: chosen.confidence,
      chars: chosen.chars,
      y: row.centerY,
      row
    });
  }

  return { ocrResults, rowsDebug };
}

async function ocrSingleRow(row, sourceCanvas, meta) {
  const extracted = extractRowImage(sourceCanvas, row);
  const ensured = ensureMinOcrCanvasSize(extracted, 3, 3);

  if ((extracted?.width ?? 0) < 3 || (extracted?.height ?? 0) < 3) {
    console.warn(`[OCR] Row coerced to min size: extracted=${extracted?.width ?? 0}x${extracted?.height ?? 0} ensured=${ensured.width}x${ensured.height} row=${JSON.stringify(row)}`);
  }

  const rowDataUrl = ensured.toDataURL('image/png');

  try {
    // If a band is tall (can happen with borders or dense layouts), treat it as a block.
    // PSM 6 = SINGLE_BLOCK, PSM 7 = SINGLE_LINE, PSM 8 = SINGLE_WORD
    const psm = ensured.height < 25 ? '8' : (ensured.height > 70 ? '6' : '7');
    await tesseractWorker.setParameters({ tessedit_pageseg_mode: psm });
    const result = await tesseractWorker.recognize(rowDataUrl);

    const chars = [];
    if (result.data.symbols) {
      for (const symbol of result.data.symbols) {
        chars.push({ char: symbol.text, confidence: symbol.confidence });
      }
    } else if (result.data.words) {
      for (const word of result.data.words) {
        if (word.symbols) {
          for (const symbol of word.symbols) {
            chars.push({ char: symbol.text, confidence: symbol.confidence });
          }
        }
      }
    }

    const text = (result.data.text || '').trim();
    const confidence = result.data.confidence;

    return {
      pass: meta.pass,
      label: meta.label,
      text,
      confidence,
      chars,
      debug: {
        pass: meta.pass,
        label: meta.label,
        extracted: { w: extracted?.width ?? 0, h: extracted?.height ?? 0 },
        ensured: { w: ensured.width, h: ensured.height },
        psm,
        text,
        confidence
      }
    };
  } catch (err) {
    console.error('[OCR] Row error:', err);
    return {
      pass: meta.pass,
      label: meta.label,
      text: '',
      confidence: 0,
      chars: [],
      debug: {
        pass: meta.pass,
        label: meta.label,
        extracted: { w: extracted?.width ?? 0, h: extracted?.height ?? 0 },
        ensured: { w: ensured.width, h: ensured.height },
        error: err?.message || String(err)
      }
    };
  }
}

// ============================================================
// STEP 6-10: PROCESS AND VALIDATE RESULTS
// ============================================================

function processOcrResults(ocrResults) {
  // Filter and normalize results
  const candidates = [];
  
  for (const result of ocrResults) {
    // NOTE: Do not apply early confidence thresholds here.
    // If OCR text is empty, it will be rejected later (post-OCR), but we keep
    // the row position separately in rowsDebug.
    if (!result.text) continue;
    
    // Step 5: Character normalization
    let normalized = normalizeText(result.text);
    let chars = normalizeChars(result.chars);
    
    // Extract numeric portion
    const numericMatch = normalized.match(/\d+/);
    if (!numericMatch) continue;
    
    let id = numericMatch[0];
    
    // Filter chars to match extracted ID
    if (chars.length > id.length) {
      // Find the starting position of the numeric match
      const startIdx = normalized.indexOf(id);
      if (startIdx >= 0) {
        chars = chars.slice(startIdx, startIdx + id.length);
      }
    }
    
    candidates.push({
      id: id,
      chars: chars,
      confidence: result.confidence,
      y: result.y,
      corrections: 0
    });
  }
  
  if (candidates.length === 0) return [];
  
  // Step 6: Detect dominant length
  const lengthCounts = {};
  for (const c of candidates) {
    const len = c.id.length;
    if (len >= CONFIG.MIN_ID_LENGTH && len <= CONFIG.MAX_ID_LENGTH) {
      lengthCounts[len] = (lengthCounts[len] || 0) + 1;
    }
  }
  
  let dominantLength = 7; // Default
  let maxCount = 0;
  for (const [len, count] of Object.entries(lengthCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantLength = parseInt(len);
    }
  }
  
  console.log('[Validate] Dominant length:', dominantLength);
  
  // Step 8: Build position frequency map
  const positionFreq = buildPositionFrequency(candidates, dominantLength);
  
  // Step 7-9: Validate and correct each candidate
  const validated = [];
  
  for (const candidate of candidates) {
    // Length check
    if (candidate.id.length !== dominantLength) {
      // Try to repair if close
      if (candidate.id.length === dominantLength - 1 || candidate.id.length === dominantLength + 1) {
        // Cannot reliably repair without assumptions - reject
        console.log('[Validate] Rejecting wrong length:', candidate.id);
        continue;
      }
      continue;
    }
    
    // Apply corrections
    const corrected = applyCorrections(candidate, positionFreq, candidates);
    
    if (corrected) {
      validated.push(corrected);
    }
  }
  
  // Step 10: Sort by Y position (visual order)
  validated.sort((a, b) => a.y - b.y);
  
  // Remove duplicates preserving order
  const seen = new Set();
  const unique = [];
  
  for (const v of validated) {
    if (!seen.has(v.id)) {
      seen.add(v.id);
      unique.push(v.id);
    }
  }
  
  // Final regex validation
  return unique.filter(id => /^\d{6,8}$/.test(id));
}

/**
 * Normalize text using character map
 */
function normalizeText(text) {
  let result = '';
  for (const char of text) {
    result += CHAR_NORMALIZE_MAP[char] || char;
  }
  // Remove all non-digit characters
  return result.replace(/[^\d]/g, '');
}

/**
 * Normalize character array
 */
function normalizeChars(chars) {
  return chars.map(c => ({
    char: CHAR_NORMALIZE_MAP[c.char] || c.char,
    confidence: c.confidence,
    originalChar: c.char
  }));
}

/**
 * Build frequency map for each digit position
 */
function buildPositionFrequency(candidates, targetLength) {
  const freq = [];
  
  for (let pos = 0; pos < targetLength; pos++) {
    freq[pos] = {};
    
    for (const c of candidates) {
      if (c.id.length === targetLength) {
        const digit = c.id[pos];
        freq[pos][digit] = (freq[pos][digit] || 0) + 1;
      }
    }
  }
  
  return freq;
}

/**
 * Apply correction rules with strict validation
 */
function applyCorrections(candidate, positionFreq, allCandidates) {
  const { id, chars, confidence, y } = candidate;
  let correctedId = id.split('');
  let corrections = 0;
  
  // Check each digit
  for (let pos = 0; pos < correctedId.length; pos++) {
    const digit = correctedId[pos];
    const charInfo = chars[pos] || { confidence: confidence };
    
    // Step 9: Check for low confidence
    if (charInfo.confidence < CONFIG.CONFIDENCE_THRESHOLD) {
      console.log(`[Validate] Low confidence digit at pos ${pos}: ${digit} (${charInfo.confidence})`);
      
      // Try position-based correction
      const dominant = getDominantDigit(positionFreq[pos]);
      
      if (dominant && dominant !== digit) {
        // Check if correction is safe
        const dominantFreq = positionFreq[pos][dominant] || 0;
        const currentFreq = positionFreq[pos][digit] || 0;
        
        if (dominantFreq > currentFreq * 2) {
          console.log(`[Correct] Position ${pos}: ${digit} → ${dominant}`);
          correctedId[pos] = dominant;
          corrections++;
        }
      }
      
      if (corrections > CONFIG.MAX_CORRECTIONS_PER_ID) {
        console.log('[Validate] Too many corrections needed, rejecting:', id);
        return null;
      }
    }
    
    // Step 7: 5 ↔ 8 disambiguation
    if (digit === '8' || digit === '5') {
      const disambiguated = disambiguate58(
        digit,
        pos,
        charInfo,
        positionFreq,
        allCandidates,
        chars
      );
      
      if (disambiguated === null) {
        // Rules disagree - silent reject
        console.log('[Validate] 5↔8 rules disagree, rejecting:', id);
        return null;
      }
      
      if (disambiguated !== digit) {
        console.log(`[Correct] 5↔8 at pos ${pos}: ${digit} → ${disambiguated}`);
        correctedId[pos] = disambiguated;
        corrections++;
        
        if (corrections > CONFIG.MAX_CORRECTIONS_PER_ID) {
          console.log('[Validate] Too many corrections needed, rejecting:', id);
          return null;
        }
      }
    }
  }
  
  return {
    id: correctedId.join(''),
    y: y,
    corrections: corrections
  };
}

/**
 * Get most frequent digit at position
 */
function getDominantDigit(freqMap) {
  if (!freqMap) return null;
  
  let maxDigit = null;
  let maxCount = 0;
  
  for (const [digit, count] of Object.entries(freqMap)) {
    if (count > maxCount) {
      maxCount = count;
      maxDigit = digit;
    }
  }
  
  return maxDigit;
}

/**
 * Disambiguate between 5 and 8 using multiple rules
 */
function disambiguate58(digit, pos, charInfo, positionFreq, allCandidates, allChars) {
  // Only process ambiguous cases
  if (charInfo.confidence >= CONFIG.AMBIGUOUS_THRESHOLD) {
    return digit; // High confidence, keep as-is
  }
  
  const votes = { '5': 0, '8': 0 };
  let rulesApplied = 0;
  
  // Rule A: Confidence comparison with neighbors
  const avgNeighborConf = calculateNeighborConfidence(allChars, pos);
  if (charInfo.confidence < CONFIG.AMBIGUOUS_THRESHOLD && avgNeighborConf > CONFIG.HIGH_CONFIDENCE) {
    // This digit is suspiciously low confidence
    // Slight preference for simpler shape (5)
    votes['5']++;
    rulesApplied++;
  }
  
  // Rule B: Column consistency across rows
  const columnDigits = getColumnDigits(allCandidates, pos);
  const freq5 = columnDigits.filter(d => d === '5').length;
  const freq8 = columnDigits.filter(d => d === '8').length;
  
  if (freq5 > freq8 * 1.5) {
    votes['5']++;
    rulesApplied++;
  } else if (freq8 > freq5 * 1.5) {
    votes['8']++;
    rulesApplied++;
  }
  
  // Rule C: Position frequency
  const posFreq = positionFreq[pos] || {};
  const pos5Freq = posFreq['5'] || 0;
  const pos8Freq = posFreq['8'] || 0;
  
  if (pos5Freq > pos8Freq * 2) {
    votes['5']++;
    rulesApplied++;
  } else if (pos8Freq > pos5Freq * 2) {
    votes['8']++;
    rulesApplied++;
  }
  
  // If no rules applied or very low confidence, be conservative
  if (rulesApplied === 0) {
    return digit; // No evidence to change
  }
  
  // Check for unanimous agreement
  if (votes['5'] > 0 && votes['8'] === 0) {
    return '5';
  } else if (votes['8'] > 0 && votes['5'] === 0) {
    return '8';
  } else if (votes['5'] !== votes['8']) {
    // Majority wins
    return votes['5'] > votes['8'] ? '5' : '8';
  }
  
  // Votes tied - reject if confidence is very low
  if (charInfo.confidence < CONFIG.CONFIDENCE_THRESHOLD) {
    return null; // Signal rejection
  }
  
  return digit; // Keep original
}

/**
 * Calculate average confidence of neighboring characters
 */
function calculateNeighborConfidence(chars, pos) {
  const neighbors = [];
  
  if (pos > 0 && chars[pos - 1]) {
    neighbors.push(chars[pos - 1].confidence);
  }
  if (pos < chars.length - 1 && chars[pos + 1]) {
    neighbors.push(chars[pos + 1].confidence);
  }
  
  if (neighbors.length === 0) return 0;
  return neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
}

/**
 * Get digits at specific position from all candidates
 */
function getColumnDigits(candidates, pos) {
  const digits = [];
  
  for (const c of candidates) {
    if (c.id.length > pos) {
      digits.push(c.id[pos]);
    }
  }
  
  return digits;
}

// ============================================================
// STARTUP
// ============================================================

console.log('[Offscreen] OCR engine loaded');

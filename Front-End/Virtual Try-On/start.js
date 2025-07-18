// VTO Widget - Stylish Edition Content Script (start3_stylish.js) - v1.10
'use strict';

// Log script start immediately
console.log("VTO Stylish Extension Script: start3_stylish.js loading...");

// ==========================================================================
// SECTION 1: Helper Functions (Defined First)
// ==========================================================================

/**
 * Safely retrieves and parses a JSON array from localStorage.
 * @param {string} key The localStorage key.
 * @param {Array} defaultValue The default value to return if key not found or invalid.
 * @returns {Array} The parsed array or the default value.
 */
function getLocalStorageJson(key, defaultValue) {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    try {
        if (typeof item === 'string' && item.trim().startsWith('[')) {
            return JSON.parse(item);
        } else {
            console.warn("VTO Extension: localStorage item doesn't look like JSON array, returning default:", key);
            return defaultValue;
        }
    } catch (e) {
        console.error("VTO Extension: Error parsing localStorage item:", key, e);
        try { localStorage.removeItem(key); } catch(removeErr) { console.error("Failed to remove corrupted key:", key, removeErr); }
        return defaultValue;
    }
}

// ==========================================================================
// SECTION 2: Main Widget Logic Function
// ==========================================================================

function runVtoWidget() {
    // Wrap the entire execution in a try-catch
    try {
        console.log("VTO Stylish Extension Script: Running runVtoWidget()...");

        // --- Configuration ---
        const GRADIO_APP_BASE_URL = "https://23b6-35-238-13-221.ngrok-free.app/"; // <<<--- ### MUST BE UPDATED ###
        const USER_IMAGE_STORAGE_KEY = "userImage";
        const GRADIO_API_ENDPOINT = GRADIO_APP_BASE_URL.replace(/\/$/, '') + "/run/tryon";
        const API_DEFAULTS = { is_checked: true, is_checked_crop: true, denoise_steps: 30, is_randomize_seed: false, seed: 42 };
        const HISTORY_STORAGE_KEY = "vtoWidgetHistory_Extension";
        const REQUEST_TIMEOUT_MS = 180000; // 3 minutes

        // --- Basic URL Check ---
        if (!GRADIO_APP_BASE_URL || GRADIO_APP_BASE_URL.includes("YOUR-") || GRADIO_APP_BASE_URL === "https://") {
            console.error("VTO Extension ERROR: GRADIO_APP_BASE_URL is not configured! Please update it in start3_stylish.js.");
            return; // Exit early
        }
        console.log("VTO Extension: Using API Endpoint:", GRADIO_API_ENDPOINT);

        // --- State Variables ---
        let humanFileDataUrl = null;
        let garmentFileDataUrl = null;
        let currentAbortController = null;
        let isDragging = false; // For dragging widget
        let isMinimized = false; // For minimize state
        let offsetX = 0, offsetY = 0; // For drag offset
        let currentX = 0, currentY = 0; // For current mouse position during drag
        let lastActiveView = 'initial'; // To restore view after maximize

        // --- Create Widget Container & HTML (NEW STRUCTURE) ---
        if (document.getElementById("virtualTryOnWidget")) {
            console.warn("VTO Extension: Widget container already exists. Removing old one.");
            try { document.getElementById("virtualTryOnWidget").remove(); } catch(e){ console.error("Error removing existing widget:", e); }
        }
        const widgetContainer = document.createElement("div");
        widgetContainer.id = "virtualTryOnWidget";
        // --- NEW HTML Structure with Header and Content Wrapper ---
        widgetContainer.innerHTML = `
          <div id="vto-widget-header">
            <h4>Virtual Try-On</h4>
            <button id="vto-minimize-btn" title="Minimize/Maximize">_</button> <!-- Minimize icon -->
          </div>
          <div id="vto-widget-content">
              <div id="vtoInitialChoice">
                  <!-- Title moved to header -->
                  <button id="vtoChoiceNew">New Try-On</button>
                  <button id="vtoChoiceHistory">View History</button>
              </div>
              <div id="vtoMainContent">
                  <button id="vtoBackButton">< Back</button>
                  <h4>Create Your Try-On</h4>
                  <div class="vto-input-section"> <!-- Human -->
                      <label for="vtoHumanInput">1. Your Photo:</label>
                      <button id="vtoUploadHumanBtn">Upload Photo</button>
                      <input type="file" id="vtoHumanInput" accept="image/*" style="display: none;">
                      <img id="vtoHumanPreview" src="#" alt="Your Photo Preview">
                      <button id="vtoRemoveHumanBtn" style="display: none;">Remove</button>
                  </div>
                  <div class="vto-input-section"> <!-- Garment -->
                      <label for="vtoGarmentInput">2. Garment Photo:</label>
                      <button id="vtoUploadGarmentBtn">Upload Garment</button>
                      <input type="file" id="vtoGarmentInput" accept="image/*" style="display: none;">
                      <!-- Drop Zone initially visible, Preview hidden (handled by JS/CSS) -->
                      <div id="vtoGarmentDropZone">Drag & Drop Garment Image Here <br> or Paste Image URL</div>
                      <img id="vtoGarmentPreview" src="#" alt="Garment Preview">
                      <button id="vtoRemoveGarmentBtn" style="display: none;">Remove</button>
                  </div>
                  <div class="vto-input-section"> <!-- Details -->
                      <label for="vtoGarmentDesc">3. Garment Description:</label>
                      <input type="text" id="vtoGarmentDesc" placeholder="e.g., red floral print t-shirt">
                      <label for="vtoCategory">4. Category:</label>
                      <select id="vtoCategory"><option value="upper_body">Upper Body</option><option value="lower_body">Lower Body</option><option value="dress">Dress</option><option value="others">Others</option></select>
                      <label for="vtoNumImages">5. Number of Images:</label>
                      <input type="number" id="vtoNumImages" value="1" min="1" max="4">
                  </div>
                  <button id="vtoTryOnBtn">Try It On!</button>
                  <button id="vtoCancelBtn" style="display: none;">Cancel Request</button>
                  <div id="vtoStatus"></div>
                  <div id="vtoSpinner" class="vto-spinner"></div>
                  <div id="vtoResultArea"></div>
              </div>
              <div id="vtoHistoryContent">
                  <button id="vtoHistoryBackButton">< Back</button>
                  <h5>Try-On History</h5>
                  <div id="vtoHistoryList">History is loading...</div>
                  <button id="vtoClearHistoryBtn">Clear History</button>
              </div>
          </div>
        `;

        // Append to body
        if (!document.body) { console.error("VTO FATAL: document.body not found!"); return; }
        try { document.body.appendChild(widgetContainer); console.log("VTO Extension: Widget container appended."); }
        catch (appendError) { console.error("VTO FATAL: Error appending widget container:", appendError); return; }

        // --- Get UI Element References ---
        let widgetHeader, widgetContent, minimizeBtn; // NEW elements
        let initialChoiceDiv, mainContentDiv, historyContentDiv, choiceNewBtn, choiceHistoryBtn, backButton,
            historyBackButton, historyListDiv, clearHistoryBtn, uploadHumanBtn, humanInput, humanPreview,
            removeHumanBtn, uploadGarmentBtn, garmentInput, garmentDropZone, garmentPreview, removeGarmentBtn,
            garmentDescInput, categorySelect, numImagesInput, tryOnBtn, cancelBtn, statusDiv, spinner, resultArea;

        try {
            widgetHeader = document.getElementById("vto-widget-header");
            widgetContent = document.getElementById("vto-widget-content");
            minimizeBtn = document.getElementById("vto-minimize-btn");
            initialChoiceDiv = document.getElementById("vtoInitialChoice");
            mainContentDiv = document.getElementById("vtoMainContent");
            historyContentDiv = document.getElementById("vtoHistoryContent");
            choiceNewBtn = document.getElementById("vtoChoiceNew");
            choiceHistoryBtn = document.getElementById("vtoChoiceHistory");
            backButton = document.getElementById("vtoBackButton");
            historyBackButton = document.getElementById("vtoHistoryBackButton");
            historyListDiv = document.getElementById("vtoHistoryList");
            clearHistoryBtn = document.getElementById("vtoClearHistoryBtn");
            uploadHumanBtn = document.getElementById("vtoUploadHumanBtn");
            humanInput = document.getElementById("vtoHumanInput");
            humanPreview = document.getElementById("vtoHumanPreview");
            removeHumanBtn = document.getElementById("vtoRemoveHumanBtn");
            uploadGarmentBtn = document.getElementById("vtoUploadGarmentBtn");
            garmentInput = document.getElementById("vtoGarmentInput");
            garmentDropZone = document.getElementById("vtoGarmentDropZone");
            garmentPreview = document.getElementById("vtoGarmentPreview");
            removeGarmentBtn = document.getElementById("vtoRemoveGarmentBtn");
            garmentDescInput = document.getElementById("vtoGarmentDesc");
            categorySelect = document.getElementById("vtoCategory");
            numImagesInput = document.getElementById("vtoNumImages");
            tryOnBtn = document.getElementById("vtoTryOnBtn");
            cancelBtn = document.getElementById("vtoCancelBtn");
            statusDiv = document.getElementById("vtoStatus");
            spinner = document.getElementById("vtoSpinner");
            resultArea = document.getElementById("vtoResultArea");
        } catch (getElError) { console.error("VTO FATAL: Error getting element refs:", getElError); if (widgetContainer?.parentNode) widgetContainer.parentNode.removeChild(widgetContainer); return; }

        // --- Element Check (Including NEW elements) ---
        const elementsToCheck = { widgetHeader, widgetContent, minimizeBtn, initialChoiceDiv, mainContentDiv, historyContentDiv, choiceNewBtn, choiceHistoryBtn, backButton, historyBackButton, historyListDiv, clearHistoryBtn, uploadHumanBtn, humanInput, humanPreview, removeHumanBtn, uploadGarmentBtn, garmentInput, garmentDropZone, garmentPreview, removeGarmentBtn, garmentDescInput, categorySelect, numImagesInput, tryOnBtn, cancelBtn, statusDiv, spinner, resultArea };
        let missingElement = null;
        for (const name in elementsToCheck) { if (!elementsToCheck[name]) { missingElement = name; break; } }
        if (missingElement) { console.error(`VTO FATAL: Element variable '${missingElement}' is null. Aborting.`); if (widgetContainer?.parentNode) widgetContainer.parentNode.removeChild(widgetContainer); return; }
        console.log("VTO Check: All essential elements found.");
        // --- End Check ---


        // --- Helper Functions (Defined within runVtoWidget scope) ---

        const setStatus = (message, type = 'info') => {
            if (!statusDiv || !spinner) {console.warn("setStatus: statusDiv or spinner missing"); return; }
            statusDiv.textContent = message;
            statusDiv.className = ''; // Reset classes first
            if (message) { // Add class only if there is a message
                statusDiv.classList.add(`vto-status-${type}`);
            }
        };

        function loadUserImageFromStorage() {
            chrome.storage.local.get([USER_IMAGE_STORAGE_KEY], (result) => {
                 if (chrome.runtime.lastError) { console.warn("VTO Widget: Error loading user image:", chrome.runtime.lastError); return; }
                if (result.userImage) {
                    console.log("VTO Widget: Found stored user image.");
                    const dataUrl = result.userImage;
                    handleFileSelectFromDataUrl(dataUrl, humanPreview, removeHumanBtn, (data) => humanFileDataUrl = data, false); // isGarment = false
                } else { console.log("VTO Widget: No user image found in storage."); }
            });
        }

        function handleFileSelectFromDataUrl(dataUrl, previewElement, removeBtnElement, fileVarSetter, isGarment = false) {
            if (!previewElement || !removeBtnElement) { console.warn("handleFileSelectFromDataUrl: preview/remove button missing"); if(fileVarSetter) fileVarSetter(dataUrl); return; }
            previewElement.src = dataUrl;
            previewElement.style.display = "block";
            removeBtnElement.style.display = "inline-block";
            if (fileVarSetter) fileVarSetter(dataUrl);

            // Toggle drop zone visibility for garment
            if (isGarment && garmentDropZone) {
                garmentDropZone.style.display = 'none';
                console.log("VTO UI: Hiding drop zone, showing garment preview.");
            }
        }

        async function fetchImageAsDataUrl(url) {
            setStatus("Fetching image from URL...", 'loading');
            try {
                console.log("VTO fetchImage: Attempting direct fetch for:", url);
                const response = await fetch(url, { mode: 'cors' });
                console.log("VTO fetchImage: Direct fetch response status:", response.status);
                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                const blob = await response.blob();
                console.log("VTO fetchImage: Blob received, size:", blob.size);

                return new Promise((resolve, reject) => {
                    let reader;
                    try {
                        reader = new FileReader();
                        reader.onloadend = () => {
                            if (typeof reader.result === 'string' && reader.result.startsWith('data:image')) {
                                setStatus("", 'info'); resolve(reader.result);
                            } else { console.error("VTO fetchImage: Invalid FileReader result"); setStatus("Failed to read image data correctly.", 'error'); reject(new Error("Invalid FileReader result")); }
                        };
                        reader.onerror = (err) => { console.error("VTO fetchImage: FileReader error:", err); setStatus("Error reading fetched image blob.", 'error'); reject(err); };
                        reader.readAsDataURL(blob);
                    } catch (fileReaderError) { console.error("VTO fetchImage: Error during FileReader setup/read:", fileReaderError); setStatus("Error processing fetched image data.", 'error'); reject(fileReaderError); }
                });
            } catch (fetchOrBlobError) {
                console.warn("VTO fetchImage: Direct fetch/blob failed, trying Image fallback. Error:", fetchOrBlobError);
                setStatus("Trying image fallback...", 'loading');
                return new Promise((resolve, reject) => {
                    let img;
                    try {
                        img = new Image(); img.crossOrigin = "Anonymous";
                        img.onload = () => {
                            let canvas, ctx;
                            try {
                                canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
                                ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas context failed");
                                ctx.drawImage(img, 0, 0); const dataUrl = canvas.toDataURL("image/png");
                                console.log("VTO fetchImage: Image fallback success (Canvas)."); setStatus("", 'info'); resolve(dataUrl);
                            } catch (canvasError) { console.error("VTO fetchImage: Fallback canvas error:", canvasError); setStatus("Error converting fallback image.", 'error'); reject(canvasError); }
                        };
                        img.onerror = (err) => { console.error("VTO fetchImage: Fallback load error:", err); setStatus("Failed to load image from URL (fallback).", 'error'); reject(err); };
                        if (!url || typeof url !== 'string' || !(url.startsWith('http')||url.startsWith('data:'))) throw new Error("Invalid URL for Image fallback"); // Allow data URLs too
                        img.src = url;
                    } catch (imageSetupError) { console.error("VTO fetchImage: Fallback setup error:", imageSetupError); setStatus("Error preparing image fallback.", 'error'); reject(imageSetupError); }
                });
            }
        } // End fetchImageAsDataUrl

        const resetMainForm = () => {
            console.log("VTO Extension: Resetting main form.");
            humanFileDataUrl = null; garmentFileDataUrl = null;
            if (humanPreview) { humanPreview.src = "#"; humanPreview.style.display = "none"; }
            if (removeHumanBtn) removeHumanBtn.style.display = "none";
            if (humanInput) humanInput.value = "";
            if (garmentPreview) { garmentPreview.src = "#"; garmentPreview.style.display = "none"; }
            if (removeGarmentBtn) removeGarmentBtn.style.display = "none";
            if (garmentInput) garmentInput.value = "";
            if (garmentDropZone) { garmentDropZone.textContent = "Drag & Drop Garment Image Here <br> or Paste Image URL"; garmentDropZone.classList.remove('dragover'); garmentDropZone.style.display = 'block'; } // SHOW drop zone
            if (garmentDescInput) garmentDescInput.value = '';
            if (categorySelect) categorySelect.value = 'upper_body';
            if (numImagesInput) numImagesInput.value = 1;
            setStatus('', 'info');
            if (resultArea) resultArea.innerHTML = '';
            if (tryOnBtn) tryOnBtn.disabled = false;
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (currentAbortController) { try { currentAbortController.abort("Form Reset"); } catch(e) {} currentAbortController = null; }
        };

        const handleHumanFileSelect = (file) => {
            if (!file || !file.type.startsWith("image/")) { setStatus("Please select a valid image file.", 'warning'); if(humanInput) humanInput.value = ""; return; }
            if (!humanPreview || !removeHumanBtn) { console.warn("handleHumanFileSelect: preview/remove button missing."); }
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;
                if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
                     handleFileSelectFromDataUrl(dataUrl, humanPreview, removeHumanBtn, (data) => humanFileDataUrl = data, false); // Use the helper
                     chrome.storage.local.set({ [USER_IMAGE_STORAGE_KEY]: dataUrl }, () => {
                         if (chrome.runtime.lastError) { setStatus("Error saving user image.", 'error'); }
                         else { setStatus(`User image updated: ${file.name}`, 'info'); }
                     });
                 } else { setStatus("Failed to read file correctly.", 'error'); }
            };
            reader.onerror = (err) => { console.error("FileReader error (Human):", err); setStatus("Error reading file.", 'error'); };
            reader.readAsDataURL(file);
        };

        const handleHumanFileRemove = () => {
            if (humanPreview) { humanPreview.src = "#"; humanPreview.style.display = "none"; }
            if (removeHumanBtn) removeHumanBtn.style.display = "none";
            if (humanInput) humanInput.value = "";
            humanFileDataUrl = null;
            chrome.storage.local.remove(USER_IMAGE_STORAGE_KEY, () => {
                 if (chrome.runtime.lastError) { setStatus("Error removing stored image.", 'error'); }
                 else { setStatus("User image removed.", 'info'); }
            });
        };

        const handleGarmentFileSelect = (file, previewElement, removeBtnElement, fileVarSetter) => {
            if (!file || !file.type.startsWith("image/")) { setStatus("Please select a valid garment image file.", 'warning'); if (garmentInput) garmentInput.value = ""; return; }
            if (!previewElement || !removeBtnElement) { console.warn("handleGarmentFileSelect: preview/remove button missing."); }
            let reader;
            try {
                reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target.result;
                    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
                        // Use the helper function which handles UI toggle
                        handleFileSelectFromDataUrl(dataUrl, previewElement, removeBtnElement, fileVarSetter, true); // isGarment = true
                        setStatus(`Garment image added: ${file.name}`, 'info');
                    } else { console.error("VTO handleGarmentFileSelect: Invalid FileReader result type."); setStatus("Failed to read garment file correctly.", 'error'); }
                };
                reader.onerror = (err) => { console.error("VTO handleGarmentFileSelect: FileReader error:", err); setStatus("Error reading garment file.", 'error'); };
                reader.readAsDataURL(file);
            } catch (fileReaderError) { console.error("VTO handleGarmentFileSelect: Error during FileReader setup/read:", fileReaderError); setStatus("Error processing garment file.", 'error'); }
        };

        const handleGarmentFileRemove = (previewElement, removeBtnElement, inputElement, fileVarSetter) => {
            if(previewElement) { previewElement.src = "#"; previewElement.style.display = "none"; }
            if(removeBtnElement) { removeBtnElement.style.display = "none"; }
            if(inputElement) inputElement.value = "";
            if(fileVarSetter) fileVarSetter(null);
            setStatus("Garment image removed.", 'info');
            // SHOW drop zone
            if (garmentDropZone) {
                garmentDropZone.style.display = 'block';
                console.log("VTO UI: Hiding garment preview, showing drop zone.");
            }
        };

        // --- UI Switching Functions (Tracking lastActiveView) ---
        function showInitialChoice() {
            if (!isMinimized) {
                if (initialChoiceDiv) initialChoiceDiv.style.display = "block";
                if (mainContentDiv) mainContentDiv.style.display = "none";
                if (historyContentDiv) historyContentDiv.style.display = "none";
                lastActiveView = 'initial';
                 console.log("VTO View: Switched to Initial");
            }
            resetMainForm();
        }
        function showMainContent() {
            if (!isMinimized) {
                if (initialChoiceDiv) initialChoiceDiv.style.display = "none";
                if (mainContentDiv) mainContentDiv.style.display = "block";
                if (historyContentDiv) historyContentDiv.style.display = "none";
                lastActiveView = 'main';
                 console.log("VTO View: Switched to Main");
            }
        }
        function showHistoryContent() {
             if (!isMinimized) {
                if (initialChoiceDiv) initialChoiceDiv.style.display = "none";
                if (mainContentDiv) mainContentDiv.style.display = "none";
                if (historyContentDiv) historyContentDiv.style.display = "block";
                lastActiveView = 'history';
                console.log("VTO View: Switched to History");
                loadHistory();
             }
        }

        // --- History Handling ---
        function loadHistory() {
            if (!historyListDiv) { return; }
            historyListDiv.innerHTML = '';
            try {
                const history = getLocalStorageJson(HISTORY_STORAGE_KEY, []);
                if (history.length === 0) { historyListDiv.innerHTML = "<div>History is empty.</div>"; return; }
                history.forEach((item) => {
                    const entryDiv=document.createElement('div'); entryDiv.className='vto-history-entry';
                    const previewsDiv=document.createElement('div'); previewsDiv.className='vto-history-previews';
                    if(item.humanPreviewSrc){const i=document.createElement('img');i.src=item.humanPreviewSrc;i.alt="Human";previewsDiv.appendChild(i);}
                    if(item.garmentPreviewSrc){const i=document.createElement('img');i.src=item.garmentPreviewSrc;i.alt="Garment";previewsDiv.appendChild(i);}
                    entryDiv.appendChild(previewsDiv);
                    const paramsDiv=document.createElement('div'); paramsDiv.className='vto-history-params'; paramsDiv.textContent=`Desc: ${item.params?.desc||'N/A'}, Cat: ${item.params?.category||'N/A'}, Num: ${item.params?.numImages||'N/A'}`; entryDiv.appendChild(paramsDiv);
                    const resultsDiv=document.createElement('div'); resultsDiv.className='vto-history-results';
                    if(item.resultImages&&Array.isArray(item.resultImages)){item.resultImages.forEach((url,idx)=>{const i=document.createElement('img');i.src=url;i.alt=`Result ${idx+1}`;resultsDiv.appendChild(i);});}
                    entryDiv.appendChild(resultsDiv);
                    historyListDiv.appendChild(entryDiv);
                });
            } catch (e) { console.error("VTO History Error:", e); historyListDiv.innerHTML = "<div>Error loading history.</div>"; }
        };
        function saveToHistory(humanSrc, garmentSrc, params, resultImagesBase64) {
            try {
                let history = getLocalStorageJson(HISTORY_STORAGE_KEY, []);
                const newEntry = { timestamp: Date.now(), humanPreviewSrc: humanSrc, garmentPreviewSrc: garmentSrc, params: params, resultImages: resultImagesBase64 };
                history.unshift(newEntry);
                if (history.length > 20) { history = history.slice(0, 20); }
                localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
                console.log(`VTO History: Saved. Total items: ${history.length}`);
            } catch (e) { console.error("VTO History Save Error:", e); setStatus("Error saving history.", 'error'); }
        };

        // --- Dragging Logic ---
        function dragMouseDown(e) {
            if (e.target.closest('button')) return; // Ignore clicks on buttons in header
            if (!isMinimized && e.target.closest('#vto-widget-header') || isMinimized) {
                 console.log("VTO Drag: Start");
                 e = e || window.event; e.preventDefault();
                 offsetX = e.clientX - widgetContainer.offsetLeft;
                 offsetY = e.clientY - widgetContainer.offsetTop;
                 isDragging = true;
                 if(isMinimized) widgetContainer.style.cursor = 'grabbing'; else widgetHeader.style.cursor = 'grabbing';
                 document.addEventListener('mouseup', closeDragElement);
                 document.addEventListener('mousemove', elementDrag);
             }
        }
        function elementDrag(e) {
            if (isDragging) {
                e = e || window.event; e.preventDefault();
                let newLeft = e.clientX - offsetX; let newTop = e.clientY - offsetY;
                const minX = 0, minY = 0; const maxX = window.innerWidth - widgetContainer.offsetWidth; const maxY = window.innerHeight - widgetContainer.offsetHeight;
                newLeft = Math.max(minX, Math.min(newLeft, maxX)); newTop = Math.max(minY, Math.min(newTop, maxY));
                widgetContainer.style.left = newLeft + "px"; widgetContainer.style.top = newTop + "px";
            }
        }
        function closeDragElement() {
            if (isDragging) {
                console.log("VTO Drag: End");
                isDragging = false;
                document.removeEventListener('mouseup', closeDragElement); document.removeEventListener('mousemove', elementDrag);
                if(isMinimized) widgetContainer.style.cursor = 'grab'; if(widgetHeader) widgetHeader.style.cursor = 'grab';
            }
        }

        // --- Minimize Logic ---
        function toggleMinimize() {
            isMinimized = !isMinimized;
            console.log("VTO Minimize: Toggled, isMinimized=", isMinimized);
            if (isMinimized) {
                widgetContainer.classList.add('vto-minimized');
                minimizeBtn.textContent = '□'; minimizeBtn.title = 'Maximize';
                if (initialChoiceDiv) initialChoiceDiv.style.display = 'none'; if (mainContentDiv) mainContentDiv.style.display = 'none'; if (historyContentDiv) historyContentDiv.style.display = 'none';
            } else {
                widgetContainer.classList.remove('vto-minimized');
                minimizeBtn.textContent = '_'; minimizeBtn.title = 'Minimize';
                console.log("VTO Minimize: Restoring view:", lastActiveView);
                if (lastActiveView === 'initial') showInitialChoice();
                else if (lastActiveView === 'main') showMainContent();
                else if (lastActiveView === 'history') showHistoryContent();
                else showInitialChoice(); // Default fallback
            }
        }

        // --- Event Listeners Setup ---
        function setupEventListeners() {
            console.log("VTO Extension: Setting up event listeners.");
            choiceNewBtn.addEventListener("click", showMainContent);
            choiceHistoryBtn.addEventListener("click", showHistoryContent);
            backButton.addEventListener("click", showInitialChoice);
            historyBackButton.addEventListener("click", showInitialChoice);
            clearHistoryBtn.addEventListener("click", () => { if (confirm("Clear history?")) { localStorage.removeItem(HISTORY_STORAGE_KEY); loadHistory(); setStatus("History cleared.", 'info'); } });
            uploadHumanBtn.addEventListener("click", () => humanInput.click());
            humanInput.addEventListener("change", (e) => { if(e.target.files?.length) handleHumanFileSelect(e.target.files[0]); });
            removeHumanBtn.addEventListener("click", handleHumanFileRemove);
            uploadGarmentBtn.addEventListener("click", () => garmentInput.click());
            garmentInput.addEventListener("change", (e) => { if(e.target.files?.length) handleGarmentFileSelect(e.target.files[0], garmentPreview, removeGarmentBtn, (data) => garmentFileDataUrl = data); });
            removeGarmentBtn.addEventListener("click", () => { handleGarmentFileRemove(garmentPreview, removeGarmentBtn, garmentInput, (data) => garmentFileDataUrl = data); }); // Uses modified remove handler

            // Drag and Drop Listeners
            garmentDropZone.addEventListener("dragenter", (e) => { e.preventDefault(); garmentDropZone.classList.add('dragover'); });
            garmentDropZone.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; garmentDropZone.classList.add('dragover'); });
            garmentDropZone.addEventListener("dragleave", (e) => { e.preventDefault(); if (e.target === garmentDropZone || !garmentDropZone.contains(e.relatedTarget)) { garmentDropZone.classList.remove('dragover'); } });
            garmentDropZone.addEventListener("drop", async (e) => {
                e.preventDefault(); console.log("--- VTO DEBUG: drop event fired ---"); garmentDropZone.classList.remove('dragover'); garmentDropZone.textContent = "Processing drop...";
                try {
                    const files = e.dataTransfer.files; let handled = false;
                    if (files && files.length > 0) { const file = files[0]; if (file.type.startsWith("image/")) { console.log("VTO DEBUG: Processing file:", file.name); handleGarmentFileSelect(file, garmentPreview, removeGarmentBtn, (data) => garmentFileDataUrl = data); handled = true; } else { setStatus("Dropped file not supported.", "warning"); } }
                    if (!handled) {
                        let imageUrl = null; if (e.dataTransfer.types.includes("text/uri-list")) imageUrl = e.dataTransfer.getData("text/uri-list"); if (!imageUrl && e.dataTransfer.types.includes("text/plain")) imageUrl = e.dataTransfer.getData("text/plain");
                        if (imageUrl) { imageUrl = imageUrl.trim(); console.log("VTO DEBUG: Processing URL:", imageUrl); if (imageUrl.startsWith("http") || imageUrl.startsWith("data:image")) { const dataUrl = await fetchImageAsDataUrl(imageUrl); if (dataUrl) { console.log("VTO DEBUG: URL success."); handleFileSelectFromDataUrl(dataUrl, garmentPreview, removeGarmentBtn, (data) => garmentFileDataUrl = data, true); handled = true; } else { console.log("VTO DEBUG: URL failed."); } } else { setStatus("Dropped text is not a valid URL.", "warning"); } }
                    }
                    if (!handled) { if (!files || files.length === 0 || (files.length > 0 && !files[0].type.startsWith("image/"))) { setStatus("Could not get image from drop.", 'warning'); } }
                } catch (dropErr) { console.error("VTO Drop Error:", dropErr); setStatus("Error processing dropped item.", 'error'); }
                finally { if (garmentDropZone && garmentDropZone.textContent.includes("Processing")) { garmentDropZone.textContent = "Drag & Drop Garment Image Here <br> or Paste Image URL"; } }
            });

            // Try On Button Listener
            tryOnBtn.addEventListener("click", async () => {
                console.log("VTO Extension: 'Try It On!' button clicked.");
                if (!humanFileDataUrl) { setStatus("Please upload your photo.", 'warning'); return; }
                if (!garmentFileDataUrl) { setStatus("Please upload or drop a garment photo.", 'warning'); return; }
                const garmentDesc = garmentDescInput?.value?.trim() ?? "";
                if (!garmentDesc) { setStatus("Please enter garment description.", 'warning'); return; }
                // ... URL check ...
                const category = categorySelect?.value ?? 'upper_body';
                const numberOfImages = parseInt(numImagesInput?.value ?? "1", 10);
                const payloadData = [ humanFileDataUrl, garmentFileDataUrl, garmentDesc, category, API_DEFAULTS.is_checked, API_DEFAULTS.is_checked_crop, API_DEFAULTS.denoise_steps, API_DEFAULTS.is_randomize_seed, API_DEFAULTS.seed, numberOfImages ];
                const payload = { data: payloadData };

                setStatus("Sending request...", 'loading');
                if (resultArea) resultArea.innerHTML = ""; tryOnBtn.disabled = true; cancelBtn.style.display = 'block';
                currentAbortController = new AbortController(); const signal = currentAbortController.signal;
                const timeoutId = setTimeout(() => { if(currentAbortController) currentAbortController.abort(`Timeout`); }, REQUEST_TIMEOUT_MS);
                console.log("VTO Fetch: Sending to", GRADIO_API_ENDPOINT);

                try {
                    const response = await fetch(GRADIO_API_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: signal }); clearTimeout(timeoutId);
                    console.log("VTO Fetch: Response Status:", response.status);
                    if (!response.ok) throw new Error(`API Error ${response.status}`);

                    const apiResponse = await response.json(); console.log("VTO Fetch: API Response OK");
                    let imageUrls = []; let finalBase64Images = [];
                    // Safely extract URLs from potential Gradio formats
                    const galleryData = apiResponse?.data?.[0];
                    if (Array.isArray(galleryData)) {
                        galleryData.forEach((item, index) => {
                             let relativePath = item?.url || (item?.path ? `/file=${item.path}` : (item?.name ? `/file=${item.name}` : null));
                             if (relativePath && typeof relativePath === 'string') {
                                  try {
                                      let fullUrl = (relativePath.startsWith('http') || relativePath.startsWith('data:')) ? relativePath : GRADIO_APP_BASE_URL.replace(/\/$/, '') + (relativePath.startsWith('/') ? relativePath : '/' + relativePath);
                                      if (fullUrl.startsWith("http") || fullUrl.startsWith("data:")) imageUrls.push(fullUrl); else console.warn(`Invalid URL[${index}]: ${fullUrl}`);
                                  } catch (urlError) { console.error(`URL Construct Error[${index}]:`, urlError); }
                             } else { console.warn(`No path/url in item[${index}]`); }
                        });
                    }
                    if (imageUrls.length === 0) throw new Error("No valid image URLs found in API response.");

                    setStatus(`Success! Loading ${imageUrls.length} image(s)...`, 'loading'); if (resultArea) resultArea.innerHTML = '';
                    const imagePromises = imageUrls.map((url, index) =>
                        new Promise(async (resolve, reject) => {
                            const imgElement = document.createElement("img"); imgElement.alt = `Loading result ${index + 1}...`; if (resultArea) resultArea.appendChild(imgElement);
                            try {
                                const imgResponse = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } }); if (!imgResponse.ok) throw new Error(`HTTP ${imgResponse.status}`);
                                const blob = await imgResponse.blob(); const reader = new FileReader();
                                reader.onloadend = () => { if (typeof reader.result === 'string' && reader.result.startsWith('data:image')) { imgElement.src = reader.result; imgElement.alt = `Try-on Result ${index + 1}`; resolve(reader.result); } else { reject(new Error('Invalid base64')); } };
                                reader.onerror = reject; reader.readAsDataURL(blob);
                            } catch (imgFetchError) { console.error(`Failed loading result ${index + 1} from ${url}:`, imgFetchError); imgElement.alt = `Failed load result ${index + 1}`; reject(imgFetchError); } // Set alt on error
                        })
                    );
                    const settledResults = await Promise.allSettled(imagePromises);
                    finalBase64Images = settledResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                    if (finalBase64Images.length > 0) {
                        setStatus(`Success! Generated ${finalBase64Images.length} image(s).`, 'success');
                        const historyParams = { desc: garmentDesc, category: category, numImages: finalBase64Images.length };
                        saveToHistory(humanFileDataUrl, garmentFileDataUrl, historyParams, finalBase64Images);
                    } else { throw new Error("Failed to load any result images."); } // Throw error if none loaded

                } catch (error) {
                    console.error("VTO 'Try On' Error:", error);
                    clearTimeout(timeoutId); // Ensure timeout cleared on error
                    if (error.name === 'AbortError') { setStatus(`Request ${signal.reason || 'cancelled'}.`, 'warning'); }
                    else if (error.message.startsWith('API Error')) { setStatus(error.message, 'error'); }
                    else if (error.message.includes("No valid image URLs")) { setStatus(error.message, 'warning'); }
                    else if (error.message.includes("Failed to load any result images")) { setStatus(error.message, 'warning'); }
                    else { setStatus(`Error. Check console/server.`, 'error'); } // General fetch/processing error
                } finally {
                    if (tryOnBtn) tryOnBtn.disabled = false;
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    currentAbortController = null;
                    console.log("VTO Extension: Try-on attempt finished.");
                }
            }); // End tryOnBtn click handler

            // Cancel Button
            cancelBtn.addEventListener("click", () => { if (currentAbortController) { setStatus("Request cancelling...", 'warning'); currentAbortController.abort("Cancelled by user"); } });

            // Dragging Listener
            widgetHeader.addEventListener('mousedown', dragMouseDown);
            // Minimize Listener
            minimizeBtn.addEventListener('click', toggleMinimize);

            console.log("VTO Extension: Event listeners setup complete.");
        } // End setupEventListeners

        // --- Message Listener Setup ---
        function setupMessageListener() {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                console.log("VTO Widget: Message received", message);
                if (message.type === "VTO_UPDATE_USER_IMAGE" && message.imageData) {
                    if (!humanPreview || !removeHumanBtn) { sendResponse({ status: "ignored" }); return false; }
                    // Use helper which calls handleFileSelectFromDataUrl
                    handleHumanFileSelect({ // Mock a File object somewhat if needed by handler
                         name: "image_from_popup.png",
                         type: "image/png", // Assume png or detect from dataURL?
                         // No need for actual file content, just pass dataURL
                     }); // This seems wrong, should call handleFileSelectFromDataUrl directly
                     handleFileSelectFromDataUrl(message.imageData, humanPreview, removeHumanBtn, (data) => humanFileDataUrl = data, false); // Correct call
                     setStatus("User image updated from popup.", 'info');
                     sendResponse({ status: "received" }); return true;
                } else if (message.type === "VTO_CLEAR_USER_IMAGE") {
                    handleHumanFileRemove(); setStatus("User image removed via popup.", 'info');
                    sendResponse({ status: "received" }); return true;
                }
                sendResponse({ status: "ignored" }); return false;
            });
            console.log("VTO Extension: Message listener setup complete.");
        }

        // --- Initialize Widget ---
        setupEventListeners();
        setupMessageListener();
        loadUserImageFromStorage();
        if (garmentDropZone) garmentDropZone.style.display = 'block'; // Show drop zone initially
        showInitialChoice();
        console.log("VTO Stylish Extension: Initialized Successfully (v1.10).");

    } catch (majorError) {
         console.error("VTO FATAL ERROR during runVtoWidget execution:", majorError);
         const widget = document.getElementById("virtualTryOnWidget");
         if (widget?.parentNode) { try { widget.parentNode.removeChild(widget); } catch(e) {} }
    }
} // End of runVtoWidget


// ==========================================================================
// SECTION 3: Script Execution Start
// ==========================================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { requestAnimationFrame(() => { setTimeout(runVtoWidget, 250); }); });
} else {
    requestAnimationFrame(() => { setTimeout(runVtoWidget, 250); });
}
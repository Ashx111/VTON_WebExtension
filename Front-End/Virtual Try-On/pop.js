document.addEventListener("DOMContentLoaded", () => {
    // Get references to static elements
    const contentDiv = document.getElementById("content");
    const widgetControlsDiv = document.getElementById("widgetControls");
  
    // References within widgetControlsDiv (only valid if controls are shown)
    let uploadBtn, fileInput, statusText, preview, removeBtn;
    let clothesSection, clothesDropZone, clothesFileInput, clothesSelectBtn, clothesStatus, clothesPreview, removeClothesBtn;
  
    function initializeControls() {
        uploadBtn = document.getElementById("uploadBtn");
        fileInput = document.getElementById("fileInput");
        statusText = document.getElementById("status");
        preview = document.getElementById("preview");
        removeBtn = document.getElementById("removeBtn");
        clothesSection = document.getElementById("clothesSection");
        clothesDropZone = document.getElementById("clothesDropZone");
        clothesFileInput = document.getElementById("clothesFileInput");
        clothesSelectBtn = document.getElementById("clothesSelectBtn");
        clothesStatus = document.getElementById("clothesStatus");
        clothesPreview = document.getElementById("clothesPreview");
        removeClothesBtn = document.getElementById("removeClothesBtn");
  
         // Add button classes for styling from widget_style.css
         uploadBtn?.classList.add('vto-choice-new'); // Example class, adjust if needed
         removeBtn?.classList.add('vto-cancel-btn'); // Example class
         clothesSelectBtn?.classList.add('vto-choice-history'); // Example class
         removeClothesBtn?.classList.add('vto-cancel-btn'); // Example class
  
         setupEventListeners(); // Setup listeners only after elements are confirmed available
         loadStoredUserImage(); // Load existing image on popup open
    }
  
    function setPopupStatus(element, message, isError = false) {
        if (element) {
            element.textContent = message;
            element.style.color = isError ? 'var(--vto-error-color)' : 'var(--vto-text-medium)';
        }
    }
  
   function loadStoredUserImage() {
          chrome.storage.local.get(["userImage"], (result) => {
              if (chrome.runtime.lastError) {
                  console.error("Error getting userImage:", chrome.runtime.lastError);
                  setPopupStatus(statusText, "Error loading stored image.", true);
                  return;
              }
              if (result.userImage) {
                  if (preview) {
                      preview.src = result.userImage;
                      preview.style.display = "block";
                  }
                  if (removeBtn) removeBtn.style.display = "inline-block";
                  if (clothesSection) clothesSection.style.display = "block"; // Show clothes section if user image exists
                  setPopupStatus(statusText, "Stored image loaded.");
              } else {
                   setPopupStatus(statusText, "No default image stored.");
                   // Ensure dependent elements are hidden if no image
                   if (preview) preview.style.display = "none";
                   if (removeBtn) removeBtn.style.display = "none";
                   if (clothesSection) clothesSection.style.display = "none";
              }
          });
      }
  
  
    function setupEventListeners() {
        // --- User Image Handling ---
        if (uploadBtn) {
            uploadBtn.addEventListener("click", () => fileInput?.click());
        }
  
        if (fileInput) {
            fileInput.addEventListener("change", function () {
                const file = fileInput.files[0];
                if (file) {
                    if (!file.type.startsWith("image/")) {
                        setPopupStatus(statusText, "Please upload an image file!", true);
                        fileInput.value = ""; // Clear the input
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        const imageData = e.target.result;
                        // Store with a distinct key, e.g., "userImage"
                        chrome.storage.local.set({ userImage: imageData }, function () {
                            if (chrome.runtime.lastError) {
                                 console.error("Error saving userImage:", chrome.runtime.lastError);
                                 setPopupStatus(statusText, "Error saving image.", true);
                                 return;
                             }
                            if (preview) {
                                 preview.src = imageData;
                                 preview.style.display = "block";
                             }
                             if (removeBtn) removeBtn.style.display = "inline-block";
                             if (clothesSection) clothesSection.style.display = "block"; // Show clothes section
                             setPopupStatus(statusText, `Stored image updated: ${file.name}`);
  
                             // --- Send message to content script to update widget ---
                              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                  if (tabs[0] && tabs[0].id) {
                                      chrome.tabs.sendMessage(tabs[0].id, {
                                          type: "VTO_UPDATE_USER_IMAGE",
                                          imageData: imageData
                                      }, response => {
                                           if (chrome.runtime.lastError) {
                                              console.warn("Could not send message to content script (it might not be loaded yet or on this page):", chrome.runtime.lastError.message);
                                           } else if (response && response.status === "received") {
                                               console.log("Content script received user image update.");
                                           }
                                      });
                                  }
                              });
                             // --- End message sending ---
                        });
                    };
                     reader.onerror = () => {
                         setPopupStatus(statusText, "Error reading file.", true);
                     };
                    reader.readAsDataURL(file);
                }
            });
        }
  
        if (removeBtn) {
            removeBtn.addEventListener("click", function () {
                chrome.storage.local.remove("userImage", function () {
                     if (chrome.runtime.lastError) {
                         console.error("Error removing userImage:", chrome.runtime.lastError);
                         setPopupStatus(statusText, "Error removing image.", true);
                         return;
                     }
                    if (preview) {
                         preview.src = "";
                         preview.style.display = "none";
                     }
                     removeBtn.style.display = "none"; // Hide remove button itself
                     if (clothesSection) clothesSection.style.display = "none"; // Hide clothes section
                     setPopupStatus(statusText, "Stored image removed.");
  
                     // Clear clothes preview as well when main image is removed
                     if (clothesPreview) clothesPreview.src = "";
                     if (clothesPreview) clothesPreview.style.display = "none";
                     if (removeClothesBtn) removeClothesBtn.style.display = "none";
                     setPopupStatus(clothesStatus, "");
  
                    // --- Send message to content script to clear widget image ---
                      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                          if (tabs[0] && tabs[0].id) {
                              chrome.tabs.sendMessage(tabs[0].id, {
                                  type: "VTO_CLEAR_USER_IMAGE"
                              }, response => {
                                  if (chrome.runtime.lastError) {
                                      console.warn("Could not send message to content script (it might not be loaded yet or on this page):", chrome.runtime.lastError.message);
                                  } else if (response && response.status === "received") {
                                       console.log("Content script received clear image request.");
                                  }
                              });
                          }
                      });
                     // --- End message sending ---
                });
            });
        }
  
        // --- Clothes Image Preview Handling (Popup Only) ---
        if (clothesDropZone) {
            clothesDropZone.addEventListener("dragover", (e) => {
                e.preventDefault();
                clothesDropZone.classList.add("dragover");
            });
            clothesDropZone.addEventListener("dragleave", (e) => {
                e.preventDefault();
                clothesDropZone.classList.remove("dragover");
            });
            clothesDropZone.addEventListener("drop", (e) => {
                e.preventDefault();
                clothesDropZone.classList.remove("dragover");
                handleClothesFile(e.dataTransfer.files[0]);
            });
        }
  
        if (clothesSelectBtn) {
            clothesSelectBtn.addEventListener("click", () => clothesFileInput?.click());
        }
  
        if (clothesFileInput) {
            clothesFileInput.addEventListener("change", () => handleClothesFile(clothesFileInput.files[0]));
        }
  
         if (removeClothesBtn) {
             removeClothesBtn.addEventListener("click", () => {
                 if (clothesPreview) {
                     clothesPreview.src = "";
                     clothesPreview.style.display = "none";
                 }
                 removeClothesBtn.style.display = "none";
                  if (clothesFileInput) clothesFileInput.value = ""; // Clear file input
                 setPopupStatus(clothesStatus, "Clothes preview removed.");
             });
         }
    } // End setupEventListeners
  
     function handleClothesFile(file) {
          if (file && file.type.startsWith("image/")) {
              const reader = new FileReader();
              reader.onload = function(e) {
                  const imageData = e.target.result;
                  if (clothesPreview) {
                      clothesPreview.src = imageData;
                      clothesPreview.style.display = "block";
                  }
                  if (removeClothesBtn) removeClothesBtn.style.display = "inline-block";
                  setPopupStatus(clothesStatus, `Preview: ${file.name}`);
              };
              reader.onerror = () => {
                  setPopupStatus(clothesStatus, "Error reading clothes file.", true);
              };
              reader.readAsDataURL(file);
          } else if (file) {
               setPopupStatus(clothesStatus, "Please select/drop an image file!", true);
          }
           if (clothesFileInput) clothesFileInput.value = ""; // Clear input after processing drop/selection
      }
  
  
    // --- Main Execution ---
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
           contentDiv.innerHTML = "<p>Could not get current tab information.</p>";
           return;
      }
      const tab = tabs[0];
      // Use more specific host checks if possible, but includes() is okay for broader matches
      const allowedSites = [
          "://www.amazon.com/", "://www.amazon.co.uk/", "://www.amazon.in/",
          "://www.myntra.com/", "://www.ajio.com/", "://www.flipkart.com/"
          // Add protocol check and trailing slash for robustness
      ];
      // Check if tab.url is defined and is a string
      const isAllowed = tab.url && typeof tab.url === 'string' && allowedSites.some(site => tab.url.includes(site));
  
      if (isAllowed) {
        // Hide the initial message div and show the controls
        contentDiv.style.display = 'none';
        widgetControlsDiv.style.display = 'block';
        initializeControls(); // Get elements and set up listeners
      } else {
        // Keep the controls hidden and show a message in the content div
        widgetControlsDiv.style.display = 'none';
        contentDiv.style.display = 'block'; // Ensure this is visible
        contentDiv.innerHTML = "<p>VTO Widget is not active on this site.</p>";
      }
    });
  });
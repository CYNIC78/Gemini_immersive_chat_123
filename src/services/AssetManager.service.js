/**
 * AssetManager Service
 * Handles all logic for the character-specific Asset Manager UI,
 * including creating groups, uploading files, and rendering the gallery.
 */

// This will hold the character's assets while we are editing them.
let currentAssets = [];
let currentGroups = ['All Assets'];
let activeGroupName = 'All Assets';

// References to our UI elements
const groupsListEl = document.querySelector('#asset-groups-list');
const galleryGridEl = document.querySelector('#asset-gallery-grid');
const newGroupNameInput = document.querySelector('#new-group-name');
const addGroupBtn = document.querySelector('#btn-add-group');
const uploadBtn = document.querySelector('#btn-upload-asset');
const currentGroupHeader = document.querySelector('#current-group-header');

/**
 * Initializes the Asset Manager for a specific character's assets.
 * @param {Array} personalityAssets - The array of assets from the personality object.
 */
export function initialize(personalityAssets = []) {
    currentAssets = JSON.parse(JSON.stringify(personalityAssets || []));
    activeGroupName = 'All Assets';
    const uniqueGroups = new Set(currentAssets.map(asset => asset.group));
    currentGroups = ['All Assets', ...uniqueGroups];
    renderGroups();
    renderGallery();
}

/**
 * Returns the current state of the assets array.
 * @returns {Array} - The current, possibly modified, assets array.
 */
export function getAssets() {
    return currentAssets;
}

/**
 * Renders the list of groups in the left panel.
 */
function renderGroups() {
    groupsListEl.innerHTML = '';
    currentGroups.forEach(groupName => {
        const groupEl = document.createElement('div');
        groupEl.classList.add('group-item');
        groupEl.textContent = groupName;
        if (groupName === activeGroupName) {
            groupEl.classList.add('active');
        }
        groupEl.addEventListener('click', () => {
            activeGroupName = groupName;
            currentGroupHeader.textContent = groupName;
            renderGroups();
            renderGallery();
        });
        groupsListEl.appendChild(groupEl);
    });
}

/**
 * Renders the grid of asset cards in the main gallery view.
 */
function renderGallery() {
    galleryGridEl.innerHTML = '';
    const assetsToShow = activeGroupName === 'All Assets'
        ? currentAssets
        : currentAssets.filter(asset => asset.group === activeGroupName);
        
    if (assetsToShow.length === 0) {
        galleryGridEl.innerHTML = `<p style="opacity: 0.6;">No assets in this group. Try uploading some!</p>`;
    } else {
       assetsToShow.forEach(asset => {
            const card = createAssetCard(asset);
            galleryGridEl.appendChild(card);
       });
    }
}

/**
 * Creates an HTML element for a single asset card.
 * @param {object} asset - The asset object to render.
 * @returns {HTMLElement} - The asset card element.
 */
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.classList.add('asset-card');
    card.innerHTML = `
        <img src="${asset.base64Data}" class="asset-thumbnail" alt="${asset.filename}">
        <div class="asset-info">
            <p class="asset-filename">${asset.filename}</p>
            <input type="text" class="asset-tags-input input-field" placeholder="Add tags..." value="${asset.tags.join(', ')}">
        </div>
        <button class="btn-delete-asset material-symbols-outlined" title="Delete Asset">delete</button>
    `;

    // --- Event Listeners for the card ---
    const tagsInput = card.querySelector('.asset-tags-input');
    tagsInput.addEventListener('change', () => {
        // Update the tags in our temporary array when the input changes
        asset.tags = tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean);
    });
    
    // We will add the delete button functionality later.

    return card;
}


/**
 * Handles adding a new group.
 */
function addGroup() {
    const newName = newGroupNameInput.value.trim();
    if (newName && !currentGroups.includes(newName)) {
        currentGroups.push(newName);
        newGroupNameInput.value = '';
        renderGroups();
    }
}

/**
 * Handles the file upload process.
 */
function handleUpload() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // For now, we only accept images. We'll add audio later.
    fileInput.accept = 'image/png, image/jpeg, image/gif';
    fileInput.multiple = true; // Allow selecting multiple files

    fileInput.addEventListener('change', () => {
        // A "real" array from the FileList
        const files = Array.from(fileInput.files);
        
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64Data = e.target.result;
                const newAsset = {
                    id: `asset-${Date.now()}-${Math.random()}`, // Unique ID
                    filename: file.name,
                    type: 'image', // Hardcoded for now
                    group: activeGroupName === 'All Assets' ? 'Unsorted' : activeGroupName,
                    tags: [],
                    base64Data: base64Data
                };

                // If uploading to "All Assets", and "Unsorted" group doesn't exist, create it.
                if (newAsset.group === 'Unsorted' && !currentGroups.includes('Unsorted')) {
                    currentGroups.push('Unsorted');
                    renderGroups();
                }

                currentAssets.push(newAsset);
                renderGallery(); // Re-render the gallery to show the new asset
            };
            reader.readAsDataURL(file); // This triggers the 'onload' event
        });
    });

    fileInput.click(); // Open the file selection dialog
}

// Attach event listeners to the buttons
addGroupBtn.addEventListener('click', addGroup);
newGroupNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addGroup();
    }
});
uploadBtn.addEventListener('click', handleUpload);
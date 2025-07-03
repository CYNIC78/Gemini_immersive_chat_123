/**
 * AssetManager Service
 * Handles all logic for the character-specific Asset Manager UI,
 * including creating groups, uploading files, and rendering the gallery.
 */

// This will hold the character's assets while we are editing them.
// It's like a temporary notepad.
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
 * This is called when the user opens the "Add/Edit Personality" form.
 * @param {Array} personalityAssets - The array of assets from the personality object.
 */
export function initialize(personalityAssets = []) {
    // We make a deep copy to avoid changing the original data until we save.
    currentAssets = JSON.parse(JSON.stringify(personalityAssets));
    
    // Reset state from any previous edits
    activeGroupName = 'All Assets';
    
    // Figure out all the unique group names from the assets
    const uniqueGroups = new Set(currentAssets.map(asset => asset.group));
    currentGroups = ['All Assets', ...uniqueGroups];
    
    // Render the UI
    renderGroups();
    renderGallery();
}

/**
 * Returns the current state of the assets array.
 * This is called when the user clicks "Submit" on the form.
 * @returns {Array} - The current, possibly modified, assets array.
 */
export function getAssets() {
    return currentAssets;
}

/**
 * Renders the list of groups in the left panel.
 */
function renderGroups() {
    groupsListEl.innerHTML = ''; // Clear the list first
    currentGroups.forEach(groupName => {
        const groupEl = document.createElement('div');
        groupEl.classList.add('group-item');
        groupEl.textContent = groupName;
        if (groupName === activeGroupName) {
            groupEl.classList.add('active');
        }
        
        // Add click event to switch the active group
        groupEl.addEventListener('click', () => {
            activeGroupName = groupName;
            currentGroupHeader.textContent = groupName; // Update header
            renderGroups(); // Re-render to show the new active group
            renderGallery(); // Re-render the gallery for the selected group
        });
        
        groupsListEl.appendChild(groupEl);
    });
}

/**
 * Renders the grid of asset cards in the main gallery view.
 */
function renderGallery() {
    galleryGridEl.innerHTML = ''; // Clear the gallery first
    
    // Filter assets to show only those in the active group
    const assetsToShow = activeGroupName === 'All Assets'
        ? currentAssets
        : currentAssets.filter(asset => asset.group === activeGroupName);
        
    if (assetsToShow.length === 0) {
        galleryGridEl.innerHTML = `<p style="opacity: 0.6;">No assets in this group. Try uploading some!</p>`;
    } else {
       // We will add the code to render asset cards here in a future step.
    }
}

/**
 * Handles adding a new group.
 */
function addGroup() {
    const newName = newGroupNameInput.value.trim();
    if (newName && !currentGroups.includes(newName)) {
        currentGroups.push(newName);
        newGroupNameInput.value = ''; // Clear the input
        renderGroups(); // Update the UI with the new group
    }
}

// Attach event listeners to the buttons
addGroupBtn.addEventListener('click', addGroup);

// Also add group when user presses Enter
newGroupNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); // prevent form submission
        addGroup();
    }
});
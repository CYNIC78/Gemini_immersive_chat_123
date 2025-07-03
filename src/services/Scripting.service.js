/**
 * Scripting Service
 * Provides special functions that can be used inside a character's custom script.
 */

// A private variable to hold the character's assets during script execution.
let _assets = [];

/**
 * Sets the assets to be used for the current script execution.
 * @param {Array} assets - The character's asset array.
 */
export function setAssetContext(assets) {
    _assets = assets || [];
}

/**
 * Finds a random asset with a specific tag and returns its image data.
 * This function is intended to be made available inside the custom script sandbox.
 * @param {string} tag - The tag to search for.
 * @returns {string|null} - The base64 data of a matching image, or null if not found.
 */
export function getImageByTag(tag) {
    if (!_assets || _assets.length === 0) {
        return null;
    }
    
    // Find all assets that have the tag and are images.
    const matchingAssets = _assets.filter(asset =>
        asset.type === 'image' && asset.tags.includes(tag.trim())
    );

    if (matchingAssets.length === 0) {
        return null; // No matching assets found
    }

    // Pick a random one from the matches.
    const randomIndex = Math.floor(Math.random() * matchingAssets.length);
    return matchingAssets[randomIndex].base64Data;
}
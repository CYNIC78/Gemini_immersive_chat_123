// src/components/WhatsNew.component.js

// --- IMPORTS ---
import * as overlayService from "./../services/Overlay.service";
import { getVersion } from "../utils/helpers";

// --- DOM ELEMENT SELECTION ---
const whatsNewButton = document.querySelector("#btn-whatsnew");
const versionBadge = document.querySelector("#badge-version");
const changelogVersionHeader = document.querySelector('#header-version');

// --- INITIALIZATION ---

// Get the current application version.
const currentVersion = getVersion();

// 1. Display the current version number in the UI.
versionBadge.textContent = `v${currentVersion}`;
changelogVersionHeader.textContent += ` v${currentVersion}`;

// 2. Check for application updates to notify the user.
const lastSeenVersion = localStorage.getItem("version");

if (lastSeenVersion !== currentVersion) {
    // If the current version is different from the last one stored, it's an update.
    console.log(`New version detected. From ${lastSeenVersion} to ${currentVersion}.`);
    
    // Highlight the "What's New" button to draw attention.
    whatsNewButton.classList.add("badge-highlight");
    
    // Update localStorage with the new version so this only runs once.
    localStorage.setItem("version", currentVersion);

    // Remove the highlight after 7 seconds to be less intrusive.
    setTimeout(() => {
        whatsNewButton.classList.remove("badge-highlight");
    }, 7000);
}

// --- EVENT LISTENERS ---

// When the "What's New" button is clicked...
whatsNewButton.addEventListener("click", () => {
    // ...open the changelog overlay.
    overlayService.showChangelog();
    // ...and remove any highlight it might have.
    whatsNewButton.classList.remove("badge-highlight");
});



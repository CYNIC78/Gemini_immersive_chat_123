// src/components/Sidebar.component.js

// --- IMPORTS ---
import * as helpers from "../utils/helpers";

// --- DOM ELEMENT SELECTION ---
// Grouping all element queries together for clarity.
const sidebar = document.querySelector(".sidebar");
const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");

const tabs = document.querySelectorAll(".navbar-tab");
const tabHighlight = document.querySelector("#navbar-tab-highlight");
const sidebarViews = document.querySelectorAll(".sidebar-section");

// --- STATE MANAGEMENT ---
// Tracks the currently active tab to prevent unnecessary re-renders.
let activeTabIndex = undefined;

// --- FUNCTIONS ---

/**
 * Handles the logic for switching between sidebar tabs.
 * @param {HTMLElement} tab - The tab element that was clicked.
 */
function navigateTo(tab) {
    const index = [...tabs].indexOf(tab);

    // Do nothing if the clicked tab is already the active one.
    if (index === activeTabIndex) {
        return;
    }

    // Deactivate the previously active tab and view, if one exists.
    if (activeTabIndex !== undefined) {
        tabs[activeTabIndex].classList.remove("navbar-tab-active");
        helpers.hideElement(sidebarViews[activeTabIndex]);
    }

    // Activate the new tab and view.
    tab.classList.add("navbar-tab-active");
    helpers.showElement(sidebarViews[index], true);
    activeTabIndex = index;

    // Move the visual highlight bar to the new tab's position.
    tabHighlight.style.left = `calc(100% / ${tabs.length} * ${index})`;
}

// --- EVENT LISTENERS ---

// Listener for the button that collapses the sidebar.
hideSidebarButton.addEventListener("click", () => {
    helpers.hideElement(sidebar);
});

// Listener for the button that expands the sidebar.
showSidebarButton.addEventListener("click", () => {
    // The 'false' argument likely prevents a 'display: flex' style, using 'display: block' instead.
    helpers.showElement(sidebar, false);
});

// Assign a click listener to each tab to trigger navigation.
for (const tab of tabs) {
    tab.addEventListener("click", () => {
        navigateTo(tab);
    });
}

// --- INITIALIZATION ---
// Set the width of the highlight bar to match the width of a single tab.
tabHighlight.style.width = `calc(100% / ${tabs.length})`;

// Programmatically navigate to the first tab on page load to set the initial state.
navigateTo(tabs[0]);
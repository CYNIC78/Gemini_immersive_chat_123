// Aphrodisiac | main.js - Application Entry Point

// --- IMPORTS ---
// Import services for core functionality.
import * as settingsService from "./services/Settings.service";
import * as personalityService from "./services/Personality.service";
import * as overlayService from './services/Overlay.service';
import *as chatsService from './services/Chats.service';
import { db } from './services/Db.service'; // Direct import of the database instance
import * as helpers from "./utils/helpers";

// --- DYNAMIC COMPONENT LOADING ---
// Automatically discovers and executes all component scripts in the components folder.
// This makes the app modular and easier to maintain without needing to import each one manually.
const components = import.meta.glob('./components/*.js');
for (const path in components) {
    components[path]();
}

// --- INITIALIZATION ---
// Initializes the application in a specific order to ensure dependencies are met.
async function initialize() {
    // 1. Load user settings first, as other services may depend on them.
    settingsService.initialize();

    // 2. Initialize the database and migrate data schemas if needed.
    await chatsService.initialize(db);
    await personalityService.migratePersonalities(db);

    // 3. Initialize services that populate the UI from the database.
    await personalityService.initialize();
}

// --- EVENT LISTENERS ---
// Binds UI elements to their respective service functions.
function setupEventListeners() {
    document.querySelector("#btn-hide-overlay").addEventListener("click", () => overlayService.closeOverlay());

    document.querySelector("#btn-new-chat").addEventListener("click", () => {
        // Prevent creating a new chat if the current one is already empty.
        if (!chatsService.getCurrentChatId()) {
            return;
        }
        chatsService.newChat();
    });

    document.querySelector("#btn-clearall-personality").addEventListener("click", () => {
        if (confirm("Are you sure you want to delete all custom personalities?")) {
            personalityService.removeAll();
        }
    });

    document.querySelector("#btn-reset-chat").addEventListener("click", () => {
        if (confirm("Are you sure you want to delete all chats? This cannot be undone.")) {
            chatsService.deleteAllChats(db);
        }
    });

    document.querySelector("#btn-import-personality").addEventListener("click", () => {
        // Create a temporary, hidden file input to trigger the browser's file picker.
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json'; // Restrict selection to JSON files.

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return; // Exit if no file was selected.

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const personality = JSON.parse(e.target.result);
                    personalityService.add(personality);
                } catch (error) {
                    console.error("Failed to parse personality JSON:", error);
                    alert("Error: The selected file is not a valid personality JSON.");
                }
            };
            reader.readAsText(file);
        });
        fileInput.click();
    });

    // Handles responsive behavior for the sidebar.
    window.addEventListener("resize", () => {
        // Automatically show the sidebar on larger screens if it was hidden.
        if (window.innerWidth > 1032) {
            const container = document.querySelector(".container");
            if (container.classList.contains("sidebar-hidden")) {
                container.classList.remove("sidebar-hidden");
            }
        }
    });
}

// --- APP START ---
// Run the initialization and set up listeners once the DOM is ready.
document.addEventListener('DOMContentLoaded', () => {
    initialize();
    setupEventListeners();
});
// Wait for the page content to be fully loaded before running script
document.addEventListener('DOMContentLoaded', () => {

    // Select the elements we need to work with
    const container = document.querySelector('.container');
    const btnHideSidebar = document.querySelector('#btn-hide-sidebar');
    const btnShowSidebar = document.querySelector('#btn-show-sidebar');

    // --- Sidebar Toggle Logic ---

    // When the "Hide" button is clicked...
    btnHideSidebar.addEventListener('click', () => {
        container.classList.add('sidebar-hidden');
        // Optional: Save the state so the browser remembers
        localStorage.setItem('sidebarState', 'hidden');
    });

    // When the "Show" button is clicked...
    btnShowSidebar.addEventListener('click', () => {
        container.classList.remove('sidebar-hidden');
        // Optional: Save the state so the browser remembers
        localStorage.setItem('sidebarState', 'visible');
    });

    // --- Check for saved state on page load ---
    // This makes the page remember if the sidebar was hidden on the last visit
    if (localStorage.getItem('sidebarState') === 'hidden') {
        container.classList.add('sidebar-hidden');
    }

    // --- Sidebar Resizing Logic ---
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.querySelector('#sidebar-resizer');

    const MIN_WIDTH = 280; // Minimum sidebar width in pixels
    const DEFAULT_WIDTH = 480; // Default width in pixels (equivalent to 30rem)

    // Function to set the sidebar width from localStorage or to default
    const setInitialSidebarWidth = () => {
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
            sidebar.style.width = `${savedWidth}px`;
        } else {
            sidebar.style.width = `${DEFAULT_WIDTH}px`;
        }
    };

    // Set the initial width when the page loads
    setInitialSidebarWidth();

    // This function runs when the mouse moves during a resize
    const handleResize = (e) => {
        // Get the sidebar's left edge position
        const sidebarRect = sidebar.getBoundingClientRect();
        // Calculate the new width
        const newWidth = e.clientX - sidebarRect.left;
        // Apply the new width, respecting the minimum width
        sidebar.style.width = `${Math.max(MIN_WIDTH, newWidth)}px`;
    };

    // This function runs when the mouse button is released
    const stopResize = () => {
        // Remove the class from the body
        document.body.classList.remove('is-resizing');

        // Remove the event listeners from the window
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', stopResize);

        // Save the final width to localStorage so it's remembered
        localStorage.setItem('sidebarWidth', sidebar.offsetWidth);
    };

    // Add the starting event listener to the resizer element
    resizer.addEventListener('mousedown', (e) => {
        // Prevent default browser actions (like selecting text)
        e.preventDefault();

        // Add a class to the body to indicate resizing is active
        document.body.classList.add('is-resizing');

        // Attach listeners to the whole window to handle the drag
        window.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', stopResize);
    });
});


import * as personalityService from "./services/Personality.service";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';
import { db } from './services/Db.service';
import * as helpers from "./utils/helpers";

//load all component code
const components = import.meta.glob('./components/*.js');
for (const path in components) {
    components[path]();
}

// Initialize in the correct order
settingsService.initialize();

// Initialize database and migrate
await chatsService.initialize(db);
//await personalityService.migratePersonalities(db);
await personalityService.initialize();

//event listeners
const hideOverlayButton = document.querySelector("#btn-hide-overlay");
hideOverlayButton.addEventListener("click", () => overlayService.closeOverlay());

const newChatButton = document.querySelector("#btn-new-chat");
// --- UPDATED NEW CHAT LOGIC ---
newChatButton.addEventListener("click", async () => {
    const selectedPersonality = await personalityService.getSelected();
    
    // Check if the personality has a first message prompt.
    if (selectedPersonality.firstMessagePrompt && selectedPersonality.firstMessagePrompt.trim() !== "") {
        // If yes, use the new function to start the chat with the character's message.
        await chatsService.startChatWithPersonality(db);
    } else {
        // If no, use the existing logic for a blank new chat.
        if (!chatsService.getCurrentChatId()) {
            return;
        }
        chatsService.newChat();
    }
});
// --- END OF UPDATE ---

const clearAllButton = document.querySelector("#btn-clearall-personality");
clearAllButton.addEventListener("click", () => {
    personalityService.removeAll();
});

const deleteAllChatsButton = document.querySelector("#btn-reset-chat");
deleteAllChatsButton.addEventListener("click", () => { chatsService.deleteAllChats(db) });


const importPersonalityButton = document.querySelector("#btn-import-personality");
importPersonalityButton.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const personality = JSON.parse(e.target.result);
            personalityService.add(personality);
        };
        reader.readAsText(file);
    });
    fileInput.click();
    fileInput.remove();
});

window.addEventListener("resize", () => {
    //show sidebar if window is resized to desktop size
    if (window.innerWidth > 1032) {
        const sidebarElement = document.querySelector(".sidebar");
        //to prevent running showElement more than necessary
        if (sidebarElement.style.opacity == 0) {
            helpers.showElement(sidebarElement, false);
        }
    }
});
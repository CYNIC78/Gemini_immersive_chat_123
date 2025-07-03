// src/components/ChatInput.component.js

// --- IMPORTS ---
// Services for message handling and database interaction.
import * as messageService from '../services/Message.service';
import * as dbService from '../services/Db.service';
// Utility functions for tasks like encoding text.
import * as helpers from '../utils/helpers';

// --- DOM ELEMENT SELECTION ---
const messageInput = document.querySelector("#messageInput");
const sendMessageButton = document.querySelector("#btn-send");

// --- FUNCTIONS ---

/**
 * Handles the process of sending a user's message.
 */
async function sendMessage() {
    // Get the sanitized and encoded message content from the input field.
    const message = helpers.getEncoded(messageInput.innerHTML);

    // Don't send an empty message.
    if (!message || message.trim().length === 0) {
        return;
    }

    // Clear the input field immediately for a responsive feel.
    messageInput.innerHTML = "";

    try {
        // Pass the message to the message service to be processed and sent.
        await messageService.send(message, dbService.db);
    } catch (error) {
        // Log the full error for debugging purposes.
        console.error("Failed to send message:", error);

        // Display a user-friendly alert for common API errors.
        if (error.status === 429 || error.code === 429) {
            alert("Error: API rate limit reached. Please try again later or switch to a different model like Flash.");
        } else {
            // Display a generic error message for other issues.
            alert("An unexpected error occurred. Please see the console for details.");
        }
    }
}

// --- EVENT LISTENERS ---

// Listener to send message with 'Enter' key, but allow new lines with 'Shift+Enter'.
messageInput.addEventListener("keydown", (e) => {
    // Check if the user is on a mobile device, as 'Enter' key behavior can differ.
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // If Enter is pressed WITHOUT Shift key on a non-mobile device, send the message.
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault(); // Prevents the default action (like adding a new line).
        sendMessageButton.click(); // Programmatically click the send button.
    }
});

// Listener to handle pasting text into the content-editable div.
messageInput.addEventListener("paste", (e) => {
    e.preventDefault(); // Stop the browser's default paste behavior.
    // Get the plain text from the clipboard.
    const text = (e.originalEvent || e).clipboardData.getData('text/plain');
    // Insert the plain text at the cursor position. This sanitizes the input.
    document.execCommand("insertText", false, text);
});

// Listener to clean up the input field if it only contains an empty line break.
messageInput.addEventListener("input", () => {
    if (messageInput.innerHTML === "<br>") {
        messageInput.innerHTML = "";
    }
});

// Listener for the main send button.
sendMessageButton.addEventListener("click", sendMessage);
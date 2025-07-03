// src/components/ApiKeyInput.component.js

// --- IMPORTS ---
// This component currently imports the Google AI SDK directly for validation.
// Note: This is unusual; this logic might be moved to a service in the future.
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- DOM ELEMENT SELECTION ---
const apiKeyInput = document.querySelector("#apiKeyInput");
const apiKeyError = document.querySelector(".api-key-error");

// --- STATE MANAGEMENT ---
// A timer to manage the delay before validating the API key.
let debounceTimer;

// --- FUNCTIONS ---

/**
 * Validates the API key by making a small, non-billable test call to Google.
 * Updates the UI to reflect whether the key is valid or invalid.
 */
async function validateApiKey() {
    const apiKey = apiKeyInput.value.trim();

    // If the input is empty, reset the styles and do nothing.
    if (!apiKey) {
        apiKeyInput.classList.remove("api-key-valid", "api-key-invalid");
        apiKeyError.style.display = "none";
        return;
    }

    try {
        // Initialize the AI client with the provided key.
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        
        // This is a minimal, fast, and generally free call to check if the key is authentic.
        await model.generateContent("test");

        // If the call succeeds, the key is valid.
        apiKeyInput.classList.add("api-key-valid");
        apiKeyInput.classList.remove("api-key-invalid");
        apiKeyError.style.display = "none";

    } catch (error) {
        // If the call fails, the key is likely invalid.
        console.error("API Key validation failed:", error);
        apiKeyInput.classList.add("api-key-invalid");
        apiKeyInput.classList.remove("api-key-valid");
        apiKeyError.style.display = "flex";
    }
}


// --- EVENT LISTENERS ---

// Listen for input events on the API key field.
apiKeyInput.addEventListener("input", () => {
    // This is a "debouncing" mechanism.
    // It prevents the validation function from running on every single keystroke.

    // 1. Clear the previous timer, if it exists.
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    // 2. Reset the input field's visual state while the user is typing.
    apiKeyInput.classList.remove("api-key-valid", "api-key-invalid");
    apiKeyError.style.display = "none";

    // 3. Set a new timer. The validation will only run after the user has stopped typing for 1.5 seconds.
    debounceTimer = setTimeout(validateApiKey, 1500);
});
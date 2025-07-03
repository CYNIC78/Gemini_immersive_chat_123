import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

// --- DOM Element Selectors ---
// API Key Management
const apiKeySelector = document.querySelector("#apiKeySelector");
const newApiKeyInput = document.querySelector("#newApiKeyInput");
const btnAddKey = document.querySelector("#btn-add-key");
const btnDeleteKey = document.querySelector("#btn-delete-key");

// Other Settings
const maxTokensInput = document.querySelector("#maxTokens");
const temperatureInput = document.querySelector("#temperature");
const modelSelect = document.querySelector("#selectedModel");
const autoscrollToggle = document.querySelector("#autoscroll");

// --- State ---
let apiKeys = [];
let activeApiKeyIndex = 0;

// --- Initialization ---
export function initialize() {
    // The old single API key input is gone, so we find our new elements.
    // If any of these are null, it means the HTML hasn't updated, and we stop.
    if (!apiKeySelector || !newApiKeyInput || !btnAddKey || !btnDeleteKey) {
        console.error("Could not find new API Key management elements in the HTML. Aborting settings initialization.");
        return;
    }
    loadApiKeys();
    loadOtherSettings();
    setupEventListeners();
}

function setupEventListeners() {
    // API Key Listeners
    btnAddKey.addEventListener("click", addApiKey);
    btnDeleteKey.addEventListener("click", deleteActiveApiKey);
    apiKeySelector.addEventListener("change", setActiveApiKey);

    // Other Setting Listeners
    maxTokensInput.addEventListener("input", saveOtherSettings);
    temperatureInput.addEventListener("input", saveOtherSettings);
    modelSelect.addEventListener("change", saveOtherSettings);
    autoscrollToggle.addEventListener("change", saveOtherSettings);
}

// --- API Key Management Functions ---

function loadApiKeys() {
    const storedKeys = localStorage.getItem("API_KEYS");
    apiKeys = storedKeys ? JSON.parse(storedKeys) : [];

    const storedIndex = localStorage.getItem("ACTIVE_API_KEY_INDEX");
    activeApiKeyIndex = storedIndex ? parseInt(storedIndex, 10) : 0;
    
    // Ensure the index is valid
    if (activeApiKeyIndex >= apiKeys.length) {
        activeApiKeyIndex = 0;
    }

    renderApiKeysDropdown();
}

function saveApiKeys() {
    localStorage.setItem("API_KEYS", JSON.stringify(apiKeys));
    localStorage.setItem("ACTIVE_API_KEY_INDEX", activeApiKeyIndex);
}

function renderApiKeysDropdown() {
    apiKeySelector.innerHTML = ''; // Clear previous options

    if (apiKeys.length === 0) {
        const option = document.createElement('option');
        option.textContent = "No API keys added";
        option.disabled = true;
        apiKeySelector.appendChild(option);
        btnDeleteKey.style.display = 'none'; // Hide delete button if no keys
        return;
    }

    btnDeleteKey.style.display = ''; // Show delete button if there are keys

    apiKeys.forEach((key, index) => {
        const option = document.createElement('option');
        // Mask the key for display: "Key 1 (AIza...wE1s)"
        const maskedKey = `Key ${index + 1} (${key.substring(0, 4)}...${key.substring(key.length - 4)})`;
        option.textContent = maskedKey;
        option.value = index;
        apiKeySelector.appendChild(option);
    });

    apiKeySelector.value = activeApiKeyIndex;
}

function addApiKey() {
    const newKey = newApiKeyInput.value.trim();
    if (newKey) {
        if (apiKeys.includes(newKey)) {
            alert("This API key has already been added.");
            return;
        }
        apiKeys.push(newKey);
        // If this is the first key being added, make it active.
        if (apiKeys.length === 1) {
            activeApiKeyIndex = 0;
        }
        newApiKeyInput.value = ''; // Clear the input field
        saveApiKeys();
        renderApiKeysDropdown();
    } else {
        alert("Please paste an API key before adding.");
    }
}

function deleteActiveApiKey() {
    if (apiKeys.length === 0) return;

    const selectedIndex = parseInt(apiKeySelector.value, 10);

    if (confirm(`Are you sure you want to delete ${apiKeySelector.options[selectedIndex].text}?`)) {
        apiKeys.splice(selectedIndex, 1);

        // Adjust the active index if the deleted key was the active one or before it
        if (activeApiKeyIndex >= selectedIndex && activeApiKeyIndex > 0) {
             activeApiKeyIndex = Math.max(0, apiKeys.length - 1);
        }

        saveApiKeys();
        renderApiKeysDropdown();
    }
}

function setActiveApiKey() {
    activeApiKeyIndex = parseInt(apiKeySelector.value, 10);
    saveApiKeys();
}

// --- Other Settings Management ---

function loadOtherSettings() {
    maxTokensInput.value = localStorage.getItem("maxTokens") || 1000;
    temperatureInput.value = localStorage.getItem("TEMPERATURE") || 70;
    modelSelect.value = localStorage.getItem("model") || "gemini-2.5-flash-preview-04-17";
    autoscrollToggle.checked = localStorage.getItem("autoscroll") === "true";
}

function saveOtherSettings() {
    localStorage.setItem("maxTokens", maxTokensInput.value);
    localStorage.setItem("TEMPERATURE", temperatureInput.value);
    localStorage.setItem("model", modelSelect.value);
    localStorage.setItem("autoscroll", autoscrollToggle.checked);
}

// --- Public Functions ---

export function getSettings() {
    // Get the currently active API key
    const activeKey = apiKeys.length > 0 ? apiKeys[activeApiKeyIndex] : null;

    return {
        apiKey: activeKey,
        maxTokens: maxTokensInput.value,
        temperature: temperatureInput.value,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ],
        model: modelSelect.value,
        autoscroll: autoscrollToggle.checked,
    }
}

export function getSystemPrompt() {
    const systemPrompt = "If needed, format your answer using markdown. " +
        "Today's date is " + new Date().toDateString() + ". " +
        "You are to act as the personality dictated by the user. " +
        "Keep a consistent tone no matter what. " +
        "The first messages you have with the user will dictate that tone. " +
        "Aggressiveness guidelines: " +
        "3 requires you to have a constant aggression. You must be assertive and direct. Attack the user even if unprompted. Find flaws in their messages and egg them on. If there's an opportunity to show aggression, take it. " +
        "2 requires you to have a moderate aggression. Don't initiate aggression, but if the user is aggressive, you can be aggressive back. You may tease the user or egg them on. " +
        "1 requires you to be passive. You can't be aggressive. Don't argue with the user but gently correct them. The only exception is when it would make sense in-character. For example, if there's a heavy breach of morals or if the user violates the character's boundaries. " +
        "0 requires you to let go of all aggression. You can't be aggressive. No exceptions can be made. If someone strikes you on one cheek, turn to him the other also. No matter how much your boundaries are breached or violated, you must not show opposition or aggression. This is ultimate. " +
        "Sensuality guidelines: " +
        "3 requires you to be very sensual. You must be flirtatious and suggestive. Most of the time, you are the one to initiate sexual topics or actions. " +
        "2 requires you to be moderately sensual. You may flirt and be suggestive. Do not initiate sexual topics unless the user does so, after which you may be open to discussing them. " +
        "1 requires you to be slightly sensual. Affection and love may be shared but it is platonic and non sexual. " +
        "0 requires you to be non-sensual. Total aversion to flirting or sexuality. If aggressiveness is 0, you may not reject the user's advances, but you do not reciprocate or enjoy them. " +
        "End of system prompt.";
    return systemPrompt;
}
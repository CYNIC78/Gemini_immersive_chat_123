import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

// --- DOM Element References ---
const ApiKeyInput = document.querySelector("#apiKeyInput");
const maxTokensInput = document.querySelector("#maxTokens");
const temperatureInput = document.querySelector("#temperature");
const modelSelect = document.querySelector("#selectedModel");
const autoscrollToggle = document.querySelector("#autoscroll");

// --- Local Storage Keys ---
const STORAGE_KEYS = {
    API_KEY: "API_KEY",
    MAX_TOKENS: "maxTokens",
    TEMPERATURE: "TEMPERATURE",
    MODEL: "model",
    AUTOSCROLL: "autoscroll"
};

/**
 * Initializes the settings service. Loads settings and adds event listeners.
 */
export function initialize() {
    loadSettings();
    ApiKeyInput.addEventListener("input", saveSettings);
    maxTokensInput.addEventListener("input", saveSettings);
    temperatureInput.addEventListener("input", saveSettings);
    modelSelect.addEventListener("change", saveSettings);
    autoscrollToggle.addEventListener("change", saveSettings);
}

/**
 * Loads all settings from the browser's local storage and applies them to the UI.
 * Uses default values if no setting is found.
 */
export function loadSettings() {
    ApiKeyInput.value = localStorage.getItem(STORAGE_KEYS.API_KEY) || "";
    maxTokensInput.value = localStorage.getItem(STORAGE_KEYS.MAX_TOKENS) || 1000;
    temperatureInput.value = localStorage.getItem(STORAGE_KEYS.TEMPERATURE) || 70;
    modelSelect.value = localStorage.getItem(STORAGE_KEYS.MODEL) || "gemini-2.5-flash";
    autoscrollToggle.checked = localStorage.getItem(STORAGE_KEYS.AUTOSCROLL) === "true";
}

/**
 * Saves the current state of all settings from the UI to local storage.
 */
export function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.API_KEY, ApiKeyInput.value);
    localStorage.setItem(STORAGE_KEYS.MAX_TOKENS, maxTokensInput.value);
    localStorage.setItem(STORAGE_KEYS.TEMPERATURE, temperatureInput.value);
    localStorage.setItem(STORAGE_KEYS.MODEL, modelSelect.value);
    localStorage.setItem(STORAGE_KEYS.AUTOSCROLL, autoscrollToggle.checked);
}

/**
 * Gathers the current settings from the UI and formats them for an API call.
 * @returns {object} The settings object for the Gemini API.
 */
export function getSettings() {
    return {
        apiKey: ApiKeyInput.value,
        maxTokens: maxTokensInput.value,
        temperature: temperatureInput.value,
        // Safety settings are hardcoded to be as permissive as possible.
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ],
        model: modelSelect.value,
        autoscroll: autoscrollToggle.checked,
    };
}

/**
 * Constructs and returns the main system prompt that instructs the AI on its behavior.
 * @returns {string} The complete system prompt.
 */
export function getSystemPrompt() {
    // This prompt provides detailed instructions on how the AI should behave based on
    // personality traits like aggressiveness and sensuality.
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
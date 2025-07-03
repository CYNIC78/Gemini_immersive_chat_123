import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as helpers from "../utils/helpers.js";

// This is a temporary diagnostic function. It is intentionally simple.
export async function send(msg, db) {
    console.log("--- RUNNING DIAGNOSTIC TEST ---");

    const settings = settingsService.getSettings();
    if (!settings.apiKey) {
        alert("DIAGNOSTIC: No API Key found.");
        return;
    }
    if (!msg) {
        alert("DIAGNOSTIC: No message entered.");
        return;
    }

    // Display user message immediately for responsiveness
    const messageContainer = document.querySelector(".message-container");
    const userMessage = document.createElement("div");
    userMessage.classList.add("message", "message-user");
    userMessage.innerHTML = `<div class="message-header"><h3 class="message-role">You</h3></div><div class="message-text">${msg}</div>`;
    messageContainer.append(userMessage);
    helpers.messageContainerScrollToBottom();

    try {
        const ai = new GoogleGenerativeAI(settings.apiKey);

        // Use the simplest possible model and configuration
        const model = ai.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        // Send ONLY the message, with no history or system instructions.
        const result = await model.generateContentStream(msg);

        // Display model's response
        const modelMessage = document.createElement("div");
        modelMessage.classList.add("message", "message-model");
        modelMessage.innerHTML = `<div class="message-header"><h3 class="message-role">Model (Diagnostic)</h3></div><div class="message-text"></div>`;
        messageContainer.append(modelMessage);
        const messageContent = modelMessage.querySelector(".message-text");

        let rawText = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            rawText += chunkText;
            messageContent.innerHTML = marked.parse(rawText, { breaks: true });
            helpers.messageContainerScrollToBottom();
        }

        console.log("--- DIAGNOSTIC TEST SUCCEEDED ---");

    } catch (error) {
        console.error("--- DIAGNOSTIC TEST FAILED ---", error);
        const messageContainer = document.querySelector(".message-container");
        const errorElement = document.createElement("div");
        errorElement.style.color = 'red';
        errorElement.innerHTML = `<strong>DIAGNOSTIC FAILED:</strong> Check the console (F12) for a detailed error report. The error is: <pre>${error.message}</pre>`;
        messageContainer.append(errorElement);
    }
}

// All other functions are disabled for this test.
export async function insertMessage() { console.log("insertMessage disabled for diagnostic."); }
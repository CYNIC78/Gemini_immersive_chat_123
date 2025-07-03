import { GoogleGenAI } from "@google/genai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

/**
 * Sends a user's message to the Gemini API and handles the response.
 * @param {string} msg - The user's message text.
 * @param {object} db - The Dexie database instance.
 */
export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    
    if (!selectedPersonality) {
        alert("Please select a personality before starting a chat.");
        return;
    }
    if (settings.apiKey === "") {
        alert("Please enter an API key in the Settings tab.");
        return;
    }
    if (!msg) {
        return;
    }

    // If this is the first message in a new chat, generate a title first.
    if (!await chatsService.getCurrentChat(db)) {
        const titleGenAI = new GoogleGenAI({ apiKey: settings.apiKey });
        const response = await titleGenAI.models.generateContent({
            model: 'gemini-2.0-flash', // Use a fast model for title generation
            contents: "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg,
        });
        const title = response.text;
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click(); // Select the newly created chat
    }

    await insertMessage("user", msg, null, null, db);
    helpers.messageContainerScrollToBottom();
    
    // --- Model and History Setup ---
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const currentChat = await chatsService.getCurrentChat(db);

    // 1. Construct the initial system prompt and personality instructions.
    const history = [
        {
            role: "user",
            parts: [{ text: `Personality Name: ${selectedPersonality.name}, Personality Description: ${selectedPersonality.description}, Personality Prompt: ${selectedPersonality.prompt}. Your level of aggression is ${selectedPersonality.aggressiveness} out of 3. Your sensuality is ${selectedPersonality.sensuality} out of 3.` }]
        },
        {
            role: "model",
            parts: [{ text: "okie dokie. from now on, I will be acting as the personality you have chosen" }]
        }
    ];

    // 2. Add tone examples to the history, if they exist.
    if (selectedPersonality.toneExamples) {
        history.push(
            ...selectedPersonality.toneExamples.map((tone) => ({ role: "model", parts: [{ text: tone }] }))
        );
    }

    // 3. Add the actual conversation history from the database.
    history.push(
        ...currentChat.content.map((msg) => {
            // The API expects only `role` and `parts`. We strip our custom `personality` property.
            return { role: msg.role, parts: msg.parts };
        })
    );

    // --- API Call and Streaming Response ---
    const chatSession = ai.chats.create({
        model: settings.model,
        history: history,
        config: {
            maxOutputTokens: parseInt(settings.maxTokens),
            temperature: settings.temperature / 100,
            systemPrompt: settingsService.getSystemPrompt(),
            safetySettings: settings.safetySettings,
            responseMimeType: "text/plain"
        }
    });

    const stream = await chatSession.sendMessageStream({ message: msg });

    // Insert a placeholder for the model's message, which will be filled by the stream.
    const reply = await insertMessage("model", "", selectedPersonality.name, stream, db, selectedPersonality.image);
    
    // After the stream is complete, save the full conversation to the database.
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
}

/**
 * Regenerates a model's response. It removes the previous user/model message pair
 * from the history and resubmits the user's message.
 * @param {HTMLElement} responseElement - The model's message element to be regenerated.
 * @param {object} db - The Dexie database instance.
 */
async function regenerate(responseElement, db) {
    const userMessage = responseElement.previousElementSibling.querySelector(".message-text").textContent;
    const elementIndex = [...responseElement.parentElement.children].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);

    // Remove the last user-model message pair from the history.
    chat.content = chat.content.slice(0, elementIndex - 1);
    await db.chats.put(chat);
    
    await chatsService.loadChat(chat.id, db);
    await send(userMessage, db);
}

/**
 * Sets up event listeners for editing a message in-place.
 * @param {HTMLElement} messageElement - The message element (.message).
 * @param {object} db - The Dexie database instance.
 */
function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector(".btn-edit");
    const saveButton = messageElement.querySelector(".btn-save");
    const messageText = messageElement.querySelector(".message-text");

    if (!editButton || !saveButton) return;

    // Handle 'Edit' button click
    editButton.addEventListener("click", () => {
        messageText.setAttribute("contenteditable", "true");
        messageText.focus();
        editButton.style.display = "none";
        saveButton.style.display = "inline-block";
        messageText.dataset.originalContent = messageText.innerHTML; // Store original for cancellation

        // Place cursor at the end of the text
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(messageText);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    });

    // Handle 'Save' button click
    saveButton.addEventListener("click", async () => {
        messageText.removeAttribute("contenteditable");
        editButton.style.display = "inline-block";
        saveButton.style.display = "none";
        
        const messageContainer = document.querySelector(".message-container");
        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);
        await updateMessageInDatabase(messageElement, messageIndex, db);
    });

    // Handle keyboard shortcuts
    messageText.addEventListener("keydown", (e) => {
        // Save on Enter (if Shift is not pressed)
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveButton.click();
        }
        // Cancel on Escape
        if (e.key === "Escape") {
            messageText.innerHTML = messageText.dataset.originalContent;
            messageText.removeAttribute("contenteditable");
            editButton.style.display = "inline-block";
            saveButton.style.display = "none";
        }
    });
}

/**
 * Updates a specific message's content in the database.
 * @param {HTMLElement} messageElement - The message element being edited.
 * @param {number} messageIndex - The index of the message in the chat history.
 * @param {object} db - The Dexie database instance.
 */
async function updateMessageInDatabase(messageElement, messageIndex, db) {
    if (!db) return;
    try {
        const messageHTML = messageElement.querySelector(".message-text").innerHTML;
        const rawText = messageHTML.replace(/<[^>]*>/g, "").trim(); // Strip HTML for storage
        
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex]) return;

        currentChat.content[messageIndex].parts[0].text = rawText;
        await db.chats.put(currentChat);
        console.log("Message updated in database.");
    } catch (error) {
        console.error("Error updating message in database:", error);
        alert("Failed to save your edited message. Please try again.");
    }
}

/**
 * Inserts a new message element into the DOM. Handles both user and model messages.
 * For model messages, it can process a live stream from the API.
 * @param {string} sender - 'user' or 'model'.
 * @param {string} msg - The initial message text (can be empty for streaming).
 * @param {string|null} selectedPersonalityTitle - The name of the personality speaking.
 * @param {object|null} netStream - The API stream object.
 * @param {object|null} db - The Dexie database instance.
 * @param {string|null} pfpSrc - The source URL for the profile picture.
 * @returns {Promise<object>|void} For streaming messages, returns an object with final HTML and Markdown.
 */
export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    if (sender !== "user") {
        // --- Model Message ---
        newMessage.classList.add("message-model");
        newMessage.innerHTML = `
            <div class="message-header">
                <img class="pfp" src="${pfpSrc}" loading="lazy"></img>
                <h3 class="message-role">${selectedPersonalityTitle}</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-refresh btn-textual material-symbols-outlined" title="Regenerate response">refresh</button>
                    <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text"></div>
        `;

        newMessage.querySelector(".btn-refresh").addEventListener("click", async () => {
            try {
                await regenerate(newMessage, db);
            } catch (error) {
                if (error.status === 429) {
                    alert("Error: API rate limit reached. Please try again later or use the Flash model.");
                } else {
                    alert("An error occurred during regeneration. See console for details.");
                }
                console.error(error);
            }
        });

        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(newMessage, db));

        const messageContent = newMessage.querySelector(".message-text");

        if (netStream) {
            // Handle streaming response
            let rawText = "";
            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) {
                        rawText += chunk.text;
                        messageContent.innerHTML = marked.parse(rawText, { breaks: true });
                        helpers.messageContainerScrollToBottom();
                    }
                }
                // Stream finished
                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: rawText };
            } catch (error) {
                alert("Error processing stream response: " + error);
                console.error("Stream error:", error);
                return { HTML: messageContent.innerHTML, md: rawText };
            }
        } else {
            // Handle non-streaming response
            messageContent.innerHTML = marked.parse(msg);
        }
        setupMessageEditing(newMessage, db);

    } else {
        // --- User Message ---
        newMessage.classList.add("message-user");
        newMessage.innerHTML = `
            <div class="message-header">
                <h3 class="message-role">You:</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-regenerate btn-textual material-symbols-outlined" title="Regenerate response">refresh</button>
                    <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text">${helpers.getDecoded(msg)}</div>
        `;
        
        // This button regenerates the *next* message (the model's response)
        const regenerateButton = newMessage.querySelector(".btn-regenerate");
        regenerateButton?.addEventListener("click", async () => {
            const botResponseElement = newMessage.nextElementSibling;
            if (botResponseElement && botResponseElement.classList.contains('message-model')) {
                await regenerate(botResponseElement, db);
            }
        });

        newMessage.querySelector(".btn-delete")?.addEventListener("click", () => deleteMessage(newMessage, db));
        
        hljs.highlightAll();
        setupMessageEditing(newMessage, db);
    }
}

/**
 * Deletes a message from the DOM and the database.
 * @param {HTMLElement} messageElement - The message element to delete.
 * @param {object} db - The Dexie database instance.
 */
async function deleteMessage(messageElement, db) {
    // ALWAYS confirm a destructive action!
    if (!confirm("Are you sure you want to delete this message? This cannot be undone.")) {
        return;
    }

    try {
        const messageContainer = document.querySelector(".message-container");
        const currentChat = await chatsService.getCurrentChat(db);
        
        // Find the message's index in the DOM to safely find it in the database.
        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);

        if (messageIndex === -1) {
            throw new Error("Could not find the message to delete.");
        }
        
        // Remove exactly ONE message from the chat history array in the database.
        currentChat.content.splice(messageIndex, 1);
        await db.chats.put(currentChat);
        
        // --- THE ROBUST FIX ---
        // Instead of manually removing the element from the screen (which can be buggy),
        // we simply tell the chat service to reload the entire chat.
        // This guarantees that what you see on screen perfectly matches what's in the database.
        await chatsService.loadChat(currentChat.id, db);

        console.log(`Deleted 1 message and reloaded the chat.`);

    } catch (error) {
        console.error("Failed to delete the message:", error);
        alert("An error occurred while trying to delete the message. Please check the console for details.");
    }
}
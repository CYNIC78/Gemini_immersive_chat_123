import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

/**
 * Sends a user message, gets a response from the AI, and saves it to the chat.
 */
export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) return;
    if (!settings.apiKey) {
        alert("Please enter an API key in Settings.");
        return;
    }
    if (!msg) return;

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const generationConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: settings.temperature / 100,
    };

    let currentChat = await chatsService.getCurrentChat(db);
    // Create a new chat if one doesn't exist
    if (!currentChat) {
        const titleModel = ai.getGenerativeModel({ model: settings.model });
        const result = await titleModel.generateContent(`Generate a short, snappy title for a chat that starts with this message: "${msg}"`);
        const title = result.response.text();
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
        currentChat = await chatsService.getCurrentChat(db); // Re-fetch the newly created chat
    }

    // Add user message to history and display it
    const userMessage = { role: "user", parts: [{ text: msg }] };
    currentChat.content.push(userMessage);
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db); // Reload chat to display user message
    helpers.messageContainerScrollToBottom();
    
    // --- Generate AI Response ---
    const history = buildHistoryForApi(currentChat, selectedPersonality);
    const generativeModel = ai.getGenerativeModel({
        model: settings.model,
        systemInstruction: settingsService.getSystemPrompt(),
    });

    const chatSession = generativeModel.startChat({
        history: history,
        generationConfig: generationConfig,
        safetySettings: settings.safetySettings
    });

    const stream = await chatSession.sendMessageStream(msg);
    
    // Display the new message placeholder and stream the response
    const placeholder = await insertMessage({ role: 'model' }, currentChat.content.length, db, selectedPersonality);
    const reply = await streamResponse(placeholder, stream);

    // Create the first version of the model's message
    const modelMessage = {
        role: "model",
        personality: selectedPersonality.name,
        personalityid: selectedPersonality.id,
        versions: [ { text: reply.md } ], // Store response as the first version
        activeVersion: 0 // The first version is active by default
    };

    // Save the new model message to the database
    currentChat.content.push(modelMessage);
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db); // Reload to show final message with controls
}

/**
 * Regenerates a response for a given model message.
 */
async function regenerate(messageIndex, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    let currentChat = await chatsService.getCurrentChat(db);

    // Get the history up to the point of the message being regenerated
    const history = buildHistoryForApi(currentChat, selectedPersonality, messageIndex);
    const userPrompt = currentChat.content[messageIndex - 1].parts[0].text;

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const generativeModel = ai.getGenerativeModel({
        model: settings.model,
        systemInstruction: settingsService.getSystemPrompt(),
    });
    const chatSession = generativeModel.startChat({ history: history, safetySettings: settings.safetySettings });
    
    const stream = await chatSession.sendMessageStream(userPrompt);

    // Visually replace the old message content with the streaming response
    const messageElement = document.querySelector(`.message-container .message:nth-child(${messageIndex + 1})`);
    const messageContentEl = messageElement.querySelector('.message-text');
    messageContentEl.innerHTML = ''; // Clear old content
    const reply = await streamResponse({querySelector: () => messageContentEl}, stream);

    // Add the new response as a new version
    const modelMessage = currentChat.content[messageIndex];
    modelMessage.versions.push({ text: reply.md });
    modelMessage.activeVersion = modelMessage.versions.length - 1; // Set the new version as active

    // Save and reload
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
}

/**
 * Inserts a message element into the DOM.
 * This function now handles both user and model messages based on the passed object.
 */
export async function insertMessage(msgObj, index, db, personality = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    newMessage.dataset.index = index; // Store the index for later reference
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    if (msgObj.role === "model") {
        newMessage.classList.add("message-model");
        const pfpSrc = personality ? personality.image : '';
        const messageRole = personality ? personality.name : 'Model';
        
        // Determine version information
        const hasVersions = msgObj.versions && msgObj.versions.length > 1;
        const activeVersion = msgObj.activeVersion || 0;
        const versionText = msgObj.versions ? msgObj.versions[activeVersion].text : "";

        newMessage.innerHTML = `
            <div class="message-header">
                <img class="pfp" src="${pfpSrc}" loading="lazy">
                <h3 class="message-role">${messageRole}</h3>
                <div class="message-actions">
                    ${hasVersions ? `
                    <div class="version-swiper">
                        <button class="btn-version-prev btn-textual material-symbols-outlined">chevron_left</button>
                        <span>${activeVersion + 1}/${msgObj.versions.length}</span>
                        <button class="btn-version-next btn-textual material-symbols-outlined">chevron_right</button>
                    </div>
                    ` : ''}
                    <button class="btn-refresh btn-textual material-symbols-outlined" title="Regenerate response">refresh</button>
                    <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-text">${marked.parse(versionText, { breaks: true })}</div>
        `;
        hljs.highlightAll();

        // --- EVENT LISTENERS ---
        newMessage.querySelector(".btn-refresh").addEventListener("click", () => regenerate(index, db));
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
        
        if(hasVersions) {
            newMessage.querySelector(".btn-version-prev").addEventListener("click", () => switchVersion(index, -1, db));
            newMessage.querySelector(".btn-version-next").addEventListener("click", () => switchVersion(index, 1, db));
        }

    } else { // User message
        newMessage.classList.add("message-user");
        newMessage.innerHTML = `
            <div class="message-header">
                <h3 class="message-role">You</h3>
                <div class="message-actions">
                     <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                     <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                     <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-text">${marked.parse(msgObj.parts[0].text, { breaks: true })}</div>
        `;
        setupMessageEditing(newMessage, index, db);
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
    }
    return newMessage;
}

/**
 * Handles switching between different versions of a model's message.
 */
async function switchVersion(messageIndex, direction, db) {
    const currentChat = await chatsService.getCurrentChat(db);
    const message = currentChat.content[messageIndex];
    
    let newVersionIndex = message.activeVersion + direction;

    // Cycle through versions
    if (newVersionIndex >= message.versions.length) newVersionIndex = 0;
    if (newVersionIndex < 0) newVersionIndex = message.versions.length - 1;

    message.activeVersion = newVersionIndex;
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db); // Reload chat to show the new version
}

/**
 * Deletes a message from the chat history.
 */
async function deleteMessage(index, db) {
    if (!confirm("Are you sure you want to delete this message? This cannot be undone.")) return;

    try {
        const currentChat = await chatsService.getCurrentChat(db);
        currentChat.content.splice(index, 1); // Remove the message at the given index
        await db.chats.put(currentChat);
        await chatsService.loadChat(currentChat.id, db);
    } catch (error) {
        console.error("Failed to delete the message:", error);
        alert("An error occurred while trying to delete the message.");
    }
}

/**
 * Streams a response into a message element's text container.
 */
async function streamResponse(messageElement, netStream) {
    const messageContent = messageElement.querySelector(".message-text");
    let rawText = "";
    try {
        for await (const chunk of netStream) {
            const chunkText = chunk.text();
            rawText += chunkText;
            messageContent.innerHTML = marked.parse(rawText, { breaks: true });
            helpers.messageContainerScrollToBottom();
        }
        hljs.highlightAll();
        helpers.messageContainerScrollToBottom();
        return { HTML: messageContent.innerHTML, md: rawText };
    } catch (error) {
        messageContent.innerHTML += "<br><br><strong style='color:red;'>Error: Response stopped. Check console (F12).</strong>";
        console.error("Stream error:", error);
        return { HTML: messageContent.innerHTML, md: rawText };
    }
}

/**
 * Builds the chat history array for the Google AI API.
 */
function buildHistoryForApi(chat, personality, stoppingIndex = null) {
    const history = [
        {
            role: "user",
            parts: [{ text: `Personality Name: ${personality.name}, Personality Description: ${personality.description}, Personality Prompt: ${personality.prompt}. Your level of aggression is ${personality.aggressiveness} out of 3. Your sensuality is ${personality.sensuality} out of 3.` }]
        },
        {
            role: "model",
            parts: [{ text: "okie dokie. from now on, I will be acting as the personality you have chosen" }]
        }
    ];
    
    if (personality.toneExamples) {
        history.push(...personality.toneExamples.map(tone => ({ role: "model", parts: [{ text: tone }] })));
    }

    const contentToProcess = stoppingIndex ? chat.content.slice(0, stoppingIndex) : chat.content;
    
    for (const msg of contentToProcess) {
         if (msg.role === "model") {
            // For model messages, use the currently active version's text
            const text = msg.versions[msg.activeVersion].text;
            history.push({ role: "model", parts: [{ text: text }] });
        } else {
            // For user messages, use the text directly
            history.push({ role: "user", parts: [{ text: msg.parts[0].text }] });
        }
    }
    return history;
}

// Functions for editing messages (simplified for brevity, can be expanded later)
function setupMessageEditing(messageElement, index, db) {
    // ... (Editing logic remains the same, but would need to update based on index)
}
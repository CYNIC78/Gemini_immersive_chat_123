import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

function buildContentHistory(chat, stoppingIndex = null) {
    const contentToProcess = stoppingIndex ? chat.content.slice(0, stoppingIndex) : chat.content;
    const history = [];
    
    for (const msg of contentToProcess) {
         if (msg.role === "model") {
            const text = msg.versions[msg.activeVersion].text;
            history.push({ role: "model", parts: [{ text: text }] });
        } else {
            history.push({ role: "user", parts: [{ text: msg.parts[0].text }] });
        }
    }
    return history;
}

// --- NEW: Function to generate the character's first message ---
export async function generateFirstMessage(db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    let currentChat = await chatsService.getCurrentChat(db);

    if (!selectedPersonality || !settings.apiKey || !currentChat || !selectedPersonality.firstMessagePrompt) {
        console.error("Missing required data for generating first message.");
        return;
    }

    let firstMessageUserContent = selectedPersonality.firstMessagePrompt;
    if (selectedPersonality.scenario && selectedPersonality.scenario.trim() !== "") {
        firstMessageUserContent = `Scenario: ${selectedPersonality.scenario}\n\nInstructions: ${firstMessageUserContent}`;
    }

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;
    
    const generationConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: settings.temperature / 100,
    };

    const model = ai.getGenerativeModel({
        model: settings.model,
        systemInstruction: fullSystemInstruction,
        generationConfig: generationConfig,
        safetySettings: settings.safetySettings
    });

    const contents = [{ role: 'user', parts: [{ text: firstMessageUserContent }] }];
    const result = await model.generateContentStream({ contents });
    
    const placeholder = await insertMessage({ role: 'model' }, 0, db, selectedPersonality); // Insert at index 0
    const reply = await streamResponse(placeholder, result.stream); 

    const modelMessage = {
        role: "model",
        personality: selectedPersonality.name,
        personalityid: selectedPersonality.id,
        versions: [{ text: reply.md }],
        activeVersion: 0
    };

    currentChat.content.push(modelMessage);
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
}

export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) { return alert("Please select a character."); }
    if (!settings.apiKey) { return alert("Please enter an API key."); }
    if (!msg) { return; }

    const ai = new GoogleGenerativeAI(settings.apiKey);
    
    let currentChat = await chatsService.getCurrentChat(db);
    if (!currentChat) {
        const titleModel = ai.getGenerativeModel({ model: settings.model });
        const titleResult = await titleModel.generateContent(`You are a title generator. Your ONLY job is to create a short, concise title (6 words max) for a chat that starts with the following message. Do NOT add any extra text, conversation, greetings, or quotation marks. ONLY reply with the title itself. Message: "${msg}"`);
        const title = titleResult.response.text();
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
        currentChat = await chatsService.getCurrentChat(db);
    }
    
    let apiMsg = msg;
    if (selectedPersonality.reminder && selectedPersonality.reminder.trim() !== "") {
        apiMsg = `${msg}\n\n${selectedPersonality.reminder}`;
    }

    const history = buildContentHistory(currentChat);
    const contents = [...history, { role: 'user', parts: [{ text: apiMsg }] }];

    const userMessage = { role: "user", parts: [{ text: msg }] };
    currentChat.content.push(userMessage);
    await insertMessage(userMessage, currentChat.content.length - 1, db);
    helpers.messageContainerScrollToBottom();
    
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;
    
    const generationConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: settings.temperature / 100,
    };

    const model = ai.getGenerativeModel({
        model: settings.model,
        systemInstruction: fullSystemInstruction,
        generationConfig: generationConfig,
        safetySettings: settings.safetySettings
    });

    const result = await model.generateContentStream({ contents });
    
    const placeholder = await insertMessage({ role: 'model' }, currentChat.content.length, db, selectedPersonality);
    const reply = await streamResponse(placeholder, result.stream); 

    const modelMessage = {
        role: "model",
        personality: selectedPersonality.name,
        personalityid: selectedPersonality.id,
        versions: [{ text: reply.md }],
        activeVersion: 0
    };

    currentChat.content.push(modelMessage);
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
}

async function regenerate(messageIndex, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    let currentChat = await chatsService.getCurrentChat(db);
    let contents = [];

    if (messageIndex === 0) {
        let firstMessageUserContent = selectedPersonality.firstMessagePrompt;
        if (selectedPersonality.scenario && selectedPersonality.scenario.trim() !== "") {
            firstMessageUserContent = `Scenario: ${selectedPersonality.scenario}\n\nInstructions: ${firstMessageUserContent}`;
        }
        contents = [{ role: 'user', parts: [{ text: firstMessageUserContent }] }];
    } else {
        const originalUserMsgText = currentChat.content[messageIndex - 1].parts[0].text;
        let apiMsg = originalUserMsgText;
        if (selectedPersonality.reminder && selectedPersonality.reminder.trim() !== "") {
            apiMsg = `${originalUserMsgText}\n\n${selectedPersonality.reminder}`;
        }
        const history = buildContentHistory(currentChat, messageIndex);
        contents = [...history, { role: 'user', parts: [{ text: apiMsg }] }];
    }
    
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const model = ai.getGenerativeModel({
        model: settings.model,
        systemInstruction: fullSystemInstruction,
    });

    const result = await model.generateContentStream({ contents });

    const messageElement = document.querySelector(`.message-container .message:nth-child(${messageIndex + 1})`);
    const messageContentEl = messageElement.querySelector('.message-text');
    messageContentEl.innerHTML = '';
    const reply = await streamResponse({ querySelector: () => messageContentEl }, result.stream);

    const modelMessage = currentChat.content[messageIndex];
    modelMessage.versions.push({ text: reply.md });
    modelMessage.activeVersion = modelMessage.versions.length - 1;

    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
}

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
        return { HTML: messageContent.innerHTML, md: rawText };
    } catch (error) {
        messageContent.innerHTML += `<br><br><strong style='color:red;'>Error during stream. Check console (F12).</strong>`;
        console.error("Stream error:", error);
        return { HTML: messageContent.innerHTML, md: rawText };
    }
}

export async function insertMessage(msgObj, index, db, personality = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    newMessage.dataset.index = index;
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    if (msgObj.role === "model") {
        newMessage.classList.add("message-model");
        const pfpSrc = personality ? personality.image : '';
        const messageRole = personality ? personality.name : 'Model';
        
        const hasVersions = msgObj.versions && msgObj.versions.length > 1;
        const activeVersion = msgObj.activeVersion !== undefined ? msgObj.activeVersion : 0;
        const versionText = msgObj.versions ? msgObj.versions[activeVersion].text : "";

        newMessage.innerHTML = `
            <div class="message-header">
                <img class="pfp" src="${pfpSrc}" loading="lazy">
                <h3 class="message-role">${messageRole}</h3>
                <div class="message-actions">
                    ${hasVersions ? `<div class="version-swiper"><button class="btn-version-prev btn-textual material-symbols-outlined">chevron_left</button><span>${activeVersion + 1}/${msgObj.versions.length}</span><button class="btn-version-next btn-textual material-symbols-outlined">chevron_right</button></div>` : ''}
                    <button class="btn-refresh btn-textual material-symbols-outlined" title="Regenerate response">refresh</button>
                    <!-- BUG FIX: Add Edit button for Model Messages -->
                    <button class="btn-edit btn-textual material-symbols-outlined" title="Edit message">edit</button>
                    <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-text">${marked.parse(versionText, { breaks: true })}</div>`;
        hljs.highlightAll();

        newMessage.querySelector(".btn-refresh").addEventListener("click", () => regenerate(index, db));
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
        
        // BUG FIX: Edit functionality for Model Messages
        const editButton = newMessage.querySelector(".btn-edit");
        const messageContentEl = newMessage.querySelector(".message-text");
        
        editButton.addEventListener("click", () => {
            messageContentEl.contentEditable = true; // Make the content editable
            messageContentEl.focus(); // Focus on it so the user can type
        });

        // Save changes when user clicks away from the message
        messageContentEl.addEventListener("blur", async () => {
            if (messageContentEl.contentEditable === "true") {
                messageContentEl.contentEditable = false; // Turn off contenteditable
                const currentChat = await chatsService.getCurrentChat(db);
                // Update the active version's text with the new content
                currentChat.content[index].versions[currentChat.content[index].activeVersion].text = messageContentEl.textContent;
                await db.chats.put(currentChat); // Save to database
                // Re-parse to update formatting (like markdown)
                messageContentEl.innerHTML = marked.parse(messageContentEl.textContent, { breaks: true });
                hljs.highlightAll(); // Re-highlight code blocks
            }
        });
        // --- END BUG FIX ---
        
        if(hasVersions) {
            newMessage.querySelector(".btn-version-prev").addEventListener("click", () => switchVersion(index, -1, db));
            newMessage.querySelector(".btn-version-next").addEventListener("click", () => switchVersion(index, 1, db));
        }

    } else { // User message
        newMessage.classList.add("message-user");
        newMessage.innerHTML = `
            <div class="message-header"><h3 class="message-role">You</h3><div class="message-actions">
                <!-- BUG FIX: Add Edit button for User Messages -->
                <button class="btn-edit btn-textual material-symbols-outlined" title="Edit message">edit</button>
                <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
            </div></div>
            <!-- BUG FIX: Make User message text contenteditable -->
            <div class="message-text" contenteditable="true">${marked.parse(msgObj.parts[0].text, { breaks: true })}</div>`;
        
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
        
        // BUG FIX: Save changes for User Messages on blur
        const messageContentEl = newMessage.querySelector(".message-text");
        messageContentEl.addEventListener("blur", async () => {
            const currentChat = await chatsService.getCurrentChat(db);
            // Update the user message's text
            currentChat.content[index].parts[0].text = messageContentEl.textContent;
            await db.chats.put(currentChat); // Save to database
            // Re-parse to update formatting (like markdown)
            messageContentEl.innerHTML = marked.parse(messageContentEl.textContent, { breaks: true });
            hljs.highlightAll(); // Re-highlight code blocks
        });
        // --- END BUG FIX ---
    }
    return newMessage;
}

async function switchVersion(messageIndex, direction, db) {
    const currentChat = await chatsService.getCurrentChat(db);
    const message = currentChat.content[messageIndex];
    let newVersionIndex = message.activeVersion + direction;
    if (newVersionIndex >= message.versions.length) newVersionIndex = 0;
    if (newVersionIndex < 0) newVersionIndex = message.versions.length - 1;
    message.activeVersion = newVersionIndex;
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
}

async function deleteMessage(index, db) {
    if (!confirm("Are you sure you want to delete this message?")) return;
    const currentChat = await chatsService.getCurrentChat(db);
    currentChat.content.splice(index, 1);
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
}
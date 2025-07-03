import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
import * as characterScriptService from "./CharacterScript.service.js"; // NEW: Import our script service

// --- NEW HELPER FUNCTIONS ---

/**
 * Creates a temporary "Typing..." indicator to show the AI is working.
 * @param {object} personality - The personality that is "typing".
 * @returns {HTMLElement} - The indicator element.
 */
function createTypingIndicator(personality) {
    const indicator = document.createElement("div");
    indicator.classList.add("message", "message-model", "message-typing");
    indicator.innerHTML = `
        <div class="message-header">
            <img class="pfp" src="${personality.image}" loading="lazy">
            <h3 class="message-role">${personality.name}</h3>
        </div>
        <div class="message-text">
            <i>Typing...</i>
        </div>
    `;
    return indicator;
}

/**
 * Reads a response stream from the Gemini API and collects it into a single text string.
 * @param {object} netStream - The response stream from model.generateContentStream.
 * @returns {Promise<string>} - The complete text response from the model.
 */
async function streamResponseToText(netStream) {
    let rawText = "";
    try {
        for await (const chunk of netStream) {
            rawText += chunk.text();
        }
        return rawText;
    } catch (error) {
        console.error("Stream error:", error);
        return rawText + `\n<br><br><strong style='color:red;'>Error: Could not get response from model. See console (F12) for details.</strong>`;
    }
}

// --- END OF NEW HELPER FUNCTIONS ---


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

export async function generateFirstMessage(db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    let currentChat = await chatsService.getCurrentChat(db);

    if (!selectedPersonality || !settings.apiKey || !currentChat || !selectedPersonality.firstMessagePrompt) {
        return;
    }

    const typingIndicator = createTypingIndicator(selectedPersonality);
    document.querySelector(".message-container").append(typingIndicator);
    helpers.messageContainerScrollToBottom();

    let firstMessageUserContent = selectedPersonality.firstMessagePrompt;
    if (selectedPersonality.scenario && selectedPersonality.scenario.trim() !== "") {
        firstMessageUserContent = `Scenario: ${selectedPersonality.scenario}\n\nInstructions: ${firstMessageUserContent}`;
    }

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;
    
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: fullSystemInstruction });
    const contents = [{ role: 'user', parts: [{ text: firstMessageUserContent }] }];
    const result = await model.generateContentStream({ contents });
    
    const rawText = await streamResponseToText(result.stream);
    typingIndicator.remove();

    let modifiedText = rawText;
    let displayPersonality = selectedPersonality;

    if (selectedPersonality.customScript && selectedPersonality.customScript.trim() !== "") {
        const scriptResult = await characterScriptService.execute(selectedPersonality.customScript, selectedPersonality, rawText, firstMessageUserContent);
        modifiedText = scriptResult.modelResponse;
        displayPersonality = { ...selectedPersonality, ...scriptResult.character };
    }

    const modelMessage = {
        role: "model",
        personality: selectedPersonality.name,
        personalityid: selectedPersonality.id,
        versions: [{ text: modifiedText }],
        activeVersion: 0
    };

    currentChat.content.push(modelMessage);
    await db.chats.put(currentChat);
    
    await insertMessage(modelMessage, currentChat.content.length - 1, db, displayPersonality);
    helpers.messageContainerScrollToBottom();
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
    
    const typingIndicator = createTypingIndicator(selectedPersonality);
    document.querySelector(".message-container").append(typingIndicator);
    helpers.messageContainerScrollToBottom();

    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;
    
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: fullSystemInstruction });
    const result = await model.generateContentStream({ contents });
    
    const rawText = await streamResponseToText(result.stream);
    typingIndicator.remove();

    let modifiedText = rawText;
    let displayPersonality = selectedPersonality;

    if (selectedPersonality.customScript && selectedPersonality.customScript.trim() !== "") {
        const scriptResult = await characterScriptService.execute(selectedPersonality.customScript, selectedPersonality, rawText, msg);
        modifiedText = scriptResult.modelResponse;
        displayPersonality = { ...selectedPersonality, ...scriptResult.character };
    }

    const modelMessage = {
        role: "model",
        personality: selectedPersonality.name,
        personalityid: selectedPersonality.id,
        versions: [{ text: modifiedText }],
        activeVersion: 0
    };

    currentChat.content.push(modelMessage);
    await db.chats.put(currentChat);
    
    await insertMessage(modelMessage, currentChat.content.length - 1, db, displayPersonality);
    helpers.messageContainerScrollToBottom();
}

async function regenerate(messageIndex, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    let currentChat = await chatsService.getCurrentChat(db);
    let contents = [];
    let userMessageText = "";

    if (messageIndex === 0) {
        let firstMessageUserContent = selectedPersonality.firstMessagePrompt;
        if (selectedPersonality.scenario && selectedPersonality.scenario.trim() !== "") {
            firstMessageUserContent = `Scenario: ${selectedPersonality.scenario}\n\nInstructions: ${firstMessageUserContent}`;
        }
        contents = [{ role: 'user', parts: [{ text: firstMessageUserContent }] }];
        userMessageText = firstMessageUserContent;
    } else {
        const originalUserMsgText = currentChat.content[messageIndex - 1].parts[0].text;
        userMessageText = originalUserMsgText;
        let apiMsg = originalUserMsgText;
        if (selectedPersonality.reminder && selectedPersonality.reminder.trim() !== "") {
            apiMsg = `${originalUserMsgText}\n\n${selectedPersonality.reminder}`;
        }
        const history = buildContentHistory(currentChat, messageIndex - 1);
        contents = [...history, { role: 'user', parts: [{ text: apiMsg }] }];
    }
    
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: fullSystemInstruction });

    const result = await model.generateContentStream({ contents });
    const rawText = await streamResponseToText(result.stream);
    
    let modifiedText = rawText;
    // NOTE: For simplicity, regeneration does not support dynamic avatar changes, only text modification.
    if (selectedPersonality.customScript && selectedPersonality.customScript.trim() !== "") {
        const scriptResult = await characterScriptService.execute(selectedPersonality.customScript, selectedPersonality, rawText, userMessageText);
        modifiedText = scriptResult.modelResponse;
    }

    const modelMessage = currentChat.content[messageIndex];
    modelMessage.versions.push({ text: modifiedText });
    modelMessage.activeVersion = modelMessage.versions.length - 1;

    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
}

async function regenerateUserMessage(userMessageIndex, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    let currentChat = await chatsService.getCurrentChat(db);
    const userMessage = currentChat.content[userMessageIndex];

    const history = buildContentHistory(currentChat, userMessageIndex + 1); 
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: fullSystemInstruction });

    const result = await model.generateContentStream({ contents: history });
    const rawText = await streamResponseToText(result.stream);

    let modifiedText = rawText;
    // NOTE: For simplicity, regeneration does not support dynamic avatar changes, only text modification.
    if (selectedPersonality.customScript && selectedPersonality.customScript.trim() !== "") {
        const scriptResult = await characterScriptService.execute(selectedPersonality.customScript, selectedPersonality, rawText, userMessage.parts[0].text);
        modifiedText = scriptResult.modelResponse;
    }
    
    const existingModelMessageIndex = userMessageIndex + 1;
    let modelMessage = currentChat.content[existingModelMessageIndex];

    if (modelMessage && modelMessage.role === "model") {
        modelMessage.versions.push({ text: modifiedText });
        modelMessage.activeVersion = modelMessage.versions.length - 1;
    } else {
        modelMessage = {
            role: "model",
            personality: selectedPersonality.name,
            personalityid: selectedPersonality.id,
            versions: [{ text: modifiedText }],
            activeVersion: 0
        };
        currentChat.content.splice(existingModelMessageIndex, 0, modelMessage); 
    }
    
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db); 
}

// THIS FUNCTION IS NO LONGER USED for live streaming, but kept for reference if needed.
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

    let messageContentEl;

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
                    <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-text" contenteditable="true">${marked.parse(versionText, { breaks: true })}</div>`;
        hljs.highlightAll();

        messageContentEl = newMessage.querySelector(".message-text");

        newMessage.querySelector(".btn-refresh").addEventListener("click", () => regenerate(index, db));
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
        
        messageContentEl.addEventListener("blur", async () => {
            const currentChat = await chatsService.getCurrentChat(db);
            currentChat.content[index].versions[currentChat.content[index].activeVersion].text = messageContentEl.textContent;
            await db.chats.put(currentChat);
            messageContentEl.innerHTML = marked.parse(messageContentEl.textContent, { breaks: true });
            hljs.highlightAll();
        });
        
        if(hasVersions) {
            newMessage.querySelector(".btn-version-prev").addEventListener("click", () => switchVersion(index, -1, db));
            newMessage.querySelector(".btn-version-next").addEventListener("click", () => switchVersion(index, 1, db));
        }

    } else { // User message
        newMessage.classList.add("message-user");
        newMessage.innerHTML = `
            <div class="message-header"><h3 class="message-role">You</h3><div class="message-actions">
                <button class="btn-refresh btn-textual material-symbols-outlined" title="Regenerate response">refresh</button>
                <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
            </div></div>
            <div class="message-text" contenteditable="true">${marked.parse(msgObj.parts[0].text, { breaks: true })}</div>`;
        
        messageContentEl = newMessage.querySelector(".message-text");

        newMessage.querySelector(".btn-refresh").addEventListener("click", () => regenerateUserMessage(index, db));
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
        
        messageContentEl.addEventListener("blur", async () => {
            const currentChat = await chatsService.getCurrentChat(db);
            currentChat.content[index].parts[0].text = messageContentEl.textContent;
            await db.chats.put(currentChat);
            messageContentEl.innerHTML = marked.parse(messageContentEl.textContent, { breaks: true });
            hljs.highlightAll();
        });
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
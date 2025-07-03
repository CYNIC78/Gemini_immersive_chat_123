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
    
    // --- NEW: Reminder Logic ---
    // Check if the selected personality has a reminder text.
    let apiMsg = msg;
    if (selectedPersonality.reminder && selectedPersonality.reminder.trim() !== "") {
        // If it does, append it to the message being sent to the API.
        // This does NOT get saved in the chat history.
        apiMsg = `${msg}\n\n${selectedPersonality.reminder}`;
    }
    // --- End of Reminder Logic ---

    const history = buildContentHistory(currentChat);
    // Use the potentially modified message (with reminder) for the API call.
    const contents = [...history, { role: 'user', parts: [{ text: apiMsg }] }];

    // Use the ORIGINAL, unmodified message to save to the database.
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

    // --- NEW: Reminder Logic for Regeneration ---
    const originalUserMsgText = currentChat.content[messageIndex - 1].parts[0].text;
    let apiMsg = originalUserMsgText;
    if (selectedPersonality.reminder && selectedPersonality.reminder.trim() !== "") {
        apiMsg = `${originalUserMsgText}\n\n${selectedPersonality.reminder}`;
    }
    // --- End of Reminder Logic ---

    const history = buildContentHistory(currentChat, messageIndex);
    // Use the modified message for the API call
    const contents = [...history, { role: 'user', parts: [{ text: apiMsg }] }];

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
                    <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-text">${marked.parse(versionText, { breaks: true })}</div>`;
        hljs.highlightAll();

        newMessage.querySelector(".btn-refresh").addEventListener("click", () => regenerate(index, db));
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
        
        if(hasVersions) {
            newMessage.querySelector(".btn-version-prev").addEventListener("click", () => switchVersion(index, -1, db));
            newMessage.querySelector(".btn-version-next").addEventListener("click", () => switchVersion(index, 1, db));
        }

    } else { // User message
        newMessage.classList.add("message-user");
        newMessage.innerHTML = `
            <div class="message-header"><h3 class="message-role">You</h3><div class="message-actions"><button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button></div></div>
            <div class="message-text">${marked.parse(msgObj.parts[0].text, { breaks: true })}</div>`;
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
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
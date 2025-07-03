import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

/**
 * Builds the chat history array for the Google AI API.
 * This version is clean and only contains the actual conversation turns.
 */
function buildCleanHistory(chat, stoppingIndex = null) {
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

/**
 * Sends a user message, gets a response from the AI, and saves it to the chat.
 */
export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) {
        alert("Please select a character before starting a chat.");
        return;
    }
    if (!settings.apiKey) {
        alert("Please enter an API key in Settings.");
        return;
    }
    if (!msg) return;

    const ai = new GoogleGenerativeAI(settings.apiKey);
    
    let currentChat = await chatsService.getCurrentChat(db);
    if (!currentChat) {
        const titleModel = ai.getGenerativeModel({ model: settings.model });
        const result = await titleModel.generateContent(`You are a title generator. Your ONLY job is to create a short, concise title (4 words max) for a chat that starts with the following message. Do NOT add any extra text, conversation, or quotation marks. Just the title. Message: "${msg}"`);
        const title = result.response.text();
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
        currentChat = await chatsService.getCurrentChat(db);
    }

    const userMessage = { role: "user", parts: [{ text: msg }] };
    currentChat.content.push(userMessage);
    await insertMessage(userMessage, currentChat.content.length -1, db);
    helpers.messageContainerScrollToBottom();
    
    // --- THIS IS THE FIX: Combine all instructions into one system prompt ---
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;
    
    const generativeModel = ai.getGenerativeModel({
        model: settings.model,
        systemInstruction: fullSystemInstruction,
    });

    // --- Generate AI Response using a CLEAN history ---
    const cleanHistory = buildCleanHistory(currentChat);
    const chatSession = generativeModel.startChat({
        history: cleanHistory,
        generationConfig: {
            maxOutputTokens: parseInt(settings.maxTokens),
            temperature: settings.temperature / 100,
        },
        safetySettings: settings.safetySettings
    });
    
    const stream = await chatSession.sendMessageStream(msg);
    
    const placeholder = await insertMessage({ role: 'model' }, currentChat.content.length, db, selectedPersonality);
    const reply = await streamResponse(placeholder, stream);

    const modelMessage = {
        role: "model",
        personality: selectedPersonality.name,
        personalityid: selectedPersonality.id,
        versions: [ { text: reply.md } ],
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
    const userPrompt = currentChat.content[messageIndex - 1].parts[0].text;
    
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const fullSystemInstruction = mainSystemPrompt + "\n\n" + characterPrompt;

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const generativeModel = ai.getGenerativeModel({
        model: settings.model,
        systemInstruction: fullSystemInstruction,
    });

    const cleanHistory = buildCleanHistory(currentChat, messageIndex);
    const chatSession = generativeModel.startChat({ history: cleanHistory, safetySettings: settings.safetySettings });
    
    const stream = await chatSession.sendMessageStream(userPrompt);

    const messageElement = document.querySelector(`.message-container .message:nth-child(${messageIndex + 1})`);
    const messageContentEl = messageElement.querySelector('.message-text');
    messageContentEl.innerHTML = '';
    const reply = await streamResponse({querySelector: () => messageContentEl}, stream);

    const modelMessage = currentChat.content[messageIndex];
    modelMessage.versions.push({ text: reply.md });
    modelMessage.activeVersion = modelMessage.versions.length - 1;

    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
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
                     <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-text">${marked.parse(msgObj.parts[0].text, { breaks: true })}</div>
        `;
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
    if (!confirm("Are you sure you want to delete this message? This cannot be undone.")) return;

    try {
        const currentChat = await chatsService.getCurrentChat(db);
        currentChat.content.splice(index, 1);
        await db.chats.put(currentChat);
        await chatsService.loadChat(currentChat.id, db);
    } catch (error) {
        console.error("Failed to delete the message:", error);
        alert("An error occurred while trying to delete the message.");
    }
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
        helpers.messageContainerScrollToBottom();
        return { HTML: messageContent.innerHTML, md: rawText };
    } catch (error) {
        messageContent.innerHTML += "<br><br><strong style='color:red;'>Error: Response stopped. Check console (F12).</strong>";
        console.error("Stream error:", error);
        return { HTML: messageContent.innerHTML, md: rawText };
    }
}
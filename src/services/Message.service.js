import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
import * as characterScriptService from "./CharacterScript.service.js";

// --- Core Helper Functions ---

async function streamAndProcessResponse(stream, personality, userMessage, targetElement = null) {
    let placeholder = targetElement;
    if (!placeholder) {
        // If no target is provided (for new messages), create one.
        placeholder = await insertMessage({ role: 'model', versions: [{text:''}] }, -1, null, personality);
    }
    const textElement = placeholder.querySelector('.message-text');
    let rawText = "";

    try {
        for await (const chunk of stream) {
            rawText += chunk.text();
            textElement.innerHTML = marked.parse(rawText, { breaks: true });
            helpers.messageContainerScrollToBottom();
        }
    } catch (error) {
        console.error("Stream error:", error);
        textElement.innerHTML += `<br><br><strong style='color:red;'>Error during stream. Check console (F12).</strong>`;
    }
    hljs.highlightAll();

    let modifiedText = rawText;
    let finalImage = personalityService.findDefaultAvatar(personality);

    if (personality.customScript && personality.customScript.trim() !== "") {
        const scriptResult = await characterScriptService.execute(personality.customScript, personality, rawText, userMessage);
        modifiedText = scriptResult.modelResponse;
        
        if (scriptResult.character && scriptResult.character.image) {
            finalImage = scriptResult.character.image;
            const characterCard = document.querySelector(`#personality-${personality.id}`);
            if (characterCard) {
                const cardImage = characterCard.querySelector('.background-img');
                if (cardImage) cardImage.src = finalImage;
            }
        }
    }

    placeholder.querySelector('.pfp').src = finalImage;
    textElement.innerHTML = marked.parse(modifiedText, { breaks: true });
    hljs.highlightAll();

    return {
        role: "model",
        personality: personality.name,
        personalityid: personality.id,
        versions: [{ text: modifiedText }],
        activeVersion: 0,
    };
}


function buildContentHistory(chat, stoppingIndex = null) {
    const contentToProcess = stoppingIndex ? chat.content.slice(0, stoppingIndex) : chat.content;
    const history = [];
    for (const msg of contentToProcess) {
        if (msg.role === "model") {
            const text = msg.versions[msg.activeVersion].text;
            history.push({ role: "model", parts: [{ text }] });
        } else {
            history.push({ role: "user", parts: [{ text: msg.parts[0].text }] });
        }
    }
    return history;
}

export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality || !settings.apiKey || !msg) return;

    let currentChat = await chatsService.getCurrentChat(db);
    if (!currentChat) {
        const ai = new GoogleGenerativeAI(settings.apiKey);
        const titleModel = ai.getGenerativeModel({ model: settings.model });
        const titleResult = await titleModel.generateContent(`Create a short, concise title (6 words max) for a chat that starts with this message. Do NOT add extra text or quotes. Message: "${msg}"`);
        const id = await chatsService.addChat(titleResult.response.text(), null, db);
        document.querySelector(`#chat${id}`).click();
        currentChat = await chatsService.getCurrentChat(db);
    }
    
    const userMessage = { role: "user", parts: [{ text: msg }] };
    currentChat.content.push(userMessage);
    await insertMessage(userMessage, currentChat.content.length - 1, db);
    helpers.messageContainerScrollToBottom();

    let apiMsg = selectedPersonality.reminder ? `${msg}\n\n${selectedPersonality.reminder}` : msg;
    const history = buildContentHistory(currentChat);
    const contents = [...history, { role: 'user', parts: [{ text: apiMsg }] }];
    
    const ai = new GoogleGenerativeAI(settings.apiKey);
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: mainSystemPrompt + "\n\n" + characterPrompt });
    const result = await model.generateContentStream({ contents });

    const modelMessage = await streamAndProcessResponse(result.stream, selectedPersonality, msg);
    
    currentChat.content.push(modelMessage);
    await db.chats.put(currentChat);
    await chatsService.loadChat(currentChat.id, db);
}

async function regenerate(messageIndex, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    let currentChat = await chatsService.getCurrentChat(db);
    
    const messageElement = document.querySelector(`.message[data-index="${messageIndex}"]`);
    messageElement.querySelector('.message-text').innerHTML = "<i>Regenerating...</i>";

    const userMessageText = messageIndex === 0 
        ? (selectedPersonality.firstMessagePrompt || "")
        : currentChat.content[messageIndex - 1].parts[0].text;
    
    const history = buildContentHistory(currentChat, messageIndex);
    const contents = [...history, { role: 'user', parts: [{ text: userMessageText }] }];

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const mainSystemPrompt = settingsService.getSystemPrompt();
    const characterPrompt = `You are to act as the following character: ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: mainSystemPrompt + "\n\n" + characterPrompt });
    
    const result = await model.generateContentStream({ contents });
    
    // Stream the response directly into the existing message element
    const newVersionData = await streamAndProcessResponse(result.stream, selectedPersonality, userMessageText, messageElement);

    const modelMessage = currentChat.content[messageIndex];
    modelMessage.versions.push(newVersionData.versions[0]);
    modelMessage.activeVersion = modelMessage.versions.length - 1;
    await db.chats.put(currentChat);
    
    // Update the version swiper text
    const swiperElement = messageElement.querySelector('.version-swiper span');
    if (swiperElement) {
        swiperElement.textContent = `${modelMessage.activeVersion + 1}/${modelMessage.versions.length}`;
    } else {
        // If swiper didn't exist, we need to reload to build it properly.
        await chatsService.loadChat(currentChat.id, db);
    }
}


// --- The rest of the file remains largely the same ---

export async function insertMessage(msgObj, index, db, personality = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    newMessage.dataset.index = index;
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    if (msgObj.role === "model") {
        newMessage.classList.add("message-model");
        const pfpSrc = (personality && personality.image) || (personality ? personalityService.findDefaultAvatar(personality) : '');
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

        newMessage.querySelector(".btn-refresh").addEventListener("click", () => regenerate(index, db));
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
        
        const messageContentEl = newMessage.querySelector(".message-text");
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
        
        const messageContentEl = newMessage.querySelector(".message-text");
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

// These functions will now just reload the chat to ensure stability
async function regenerateUserMessage(userMessageIndex, db) {
    await chatsService.loadChat(chatsService.getCurrentChatId(), db);
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
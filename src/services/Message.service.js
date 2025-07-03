import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
import * as characterScriptService from "./CharacterScript.service.js";

// --- Helper Functions ---

function createTypingIndicator(personality) {
    const indicator = document.createElement("div");
    indicator.classList.add("message", "message-model", "message-typing");
    const defaultAvatar = personalityService.findDefaultAvatar(personality);
    indicator.innerHTML = `
        <div class="message-header">
            <img class="pfp" src="${defaultAvatar}" loading="lazy">
            <h3 class="message-role">${personality.name}</h3>
        </div>
        <div class="message-text"><i>Typing...</i></div>
    `;
    return indicator;
}

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

// NEW: This function creates the "fake stream" typing effect
function streamTextToElement(element, text) {
    let index = 0;
    const interval = setInterval(() => {
        if (index < text.length) {
            element.innerHTML = marked.parse(text.substring(0, index + 1), { breaks: true });
            helpers.messageContainerScrollToBottom();
            index++;
        } else {
            clearInterval(interval);
            hljs.highlightAll(); // Apply syntax highlighting once done
        }
    }, 20); // 20ms delay between characters, adjust for speed
}


// --- End of Helper Functions ---


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

    if (!selectedPersonality || !settings.apiKey || !currentChat || !selectedPersonality.firstMessagePrompt) return;

    // We can't use the typing indicator here because we replace the whole message list.
    // So we add the new message directly.
    const placeholder = await insertMessage({ role: 'model', versions: [{ text: '...' }] }, 0, db, selectedPersonality);
    const messageTextElement = placeholder.querySelector('.message-text');
    messageTextElement.innerHTML = "<i>Typing...</i>";
    helpers.messageContainerScrollToBottom();

    let firstMessageUserContent = selectedPersonality.firstMessagePrompt;
    if (selectedPersonality.scenario && selectedPersonality.scenario.trim() !== "") {
        firstMessageUserContent = `Scenario: ${selectedPersonality.scenario}\n\nInstructions: ${firstMessageUserContent}`;
    }

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: settingsService.getSystemPrompt() }); // Simplified for first message
    const result = await model.generateContentStream(firstMessageUserContent);
    const rawText = await streamResponseToText(result.stream);
    
    let modifiedText = rawText;
    let displayPersonality = { ...selectedPersonality, image: personalityService.findDefaultAvatar(selectedPersonality) };

    if (selectedPersonality.customScript && selectedPersonality.customScript.trim() !== "") {
        const scriptResult = await characterScriptService.execute(selectedPersonality.customScript, selectedPersonality, rawText, firstMessageUserContent);
        modifiedText = scriptResult.modelResponse;
        const finalImage = scriptResult.character.image || personalityService.findDefaultAvatar(selectedPersonality);
        displayPersonality = { ...selectedPersonality, image: finalImage };
    }
    
    // Update the UI
    const pfpElement = placeholder.querySelector('.pfp');
    pfpElement.src = displayPersonality.image;
    streamTextToElement(messageTextElement, modifiedText);

    // Update the database
    const modelMessage = {
        role: "model",
        personality: selectedPersonality.name,
        personalityid: selectedPersonality.id,
        versions: [{ text: modifiedText }],
        activeVersion: 0
    };
    currentChat.content.push(modelMessage);
    await db.chats.put(currentChat);
}

export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality || !settings.apiKey || !msg) return;

    let currentChat = await chatsService.getCurrentChat(db);
    if (!currentChat) {
        const ai = new GoogleGenerativeAI(settings.apiKey);
        const titleModel = ai.getGenerativeModel({ model: settings.model });
        const titleResult = await titleModel.generateContent(`Create a short title (max 6 words) for a chat starting with: "${msg}". No quotes, no extra text.`);
        const title = titleResult.response.text();
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
        currentChat = await chatsService.getCurrentChat(db);
    }
    
    const userMessage = { role: "user", parts: [{ text: msg }] };
    currentChat.content.push(userMessage);
    await insertMessage(userMessage, currentChat.content.length - 1, db);
    helpers.messageContainerScrollToBottom();
    
    const placeholder = await insertMessage({ role: 'model' }, currentChat.content.length, db, selectedPersonality);
    const messageTextElement = placeholder.querySelector('.message-text');
    messageTextElement.innerHTML = "<i>Typing...</i>";
    helpers.messageContainerScrollToBottom();

    let apiMsg = msg;
    if (selectedPersonality.reminder && selectedPersonality.reminder.trim() !== "") {
        apiMsg = `${msg}\n\n${selectedPersonality.reminder}`;
    }
    const history = buildContentHistory(currentChat);
    const contents = [...history, { role: 'user', parts: [{ text: apiMsg }] }];

    const ai = new GoogleGenerativeAI(settings.apiKey);
    const fullSystemInstruction = `${settingsService.getSystemPrompt()}\n\nYou are to act as ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: fullSystemInstruction });
    
    const result = await model.generateContentStream({ contents });
    const rawText = await streamResponseToText(result.stream);
    
    let modifiedText = rawText;
    let displayPersonality = { ...selectedPersonality, image: personalityService.findDefaultAvatar(selectedPersonality) };

    if (selectedPersonality.customScript && selectedPersonality.customScript.trim() !== "") {
        const scriptResult = await characterScriptService.execute(selectedPersonality.customScript, selectedPersonality, rawText, msg);
        modifiedText = scriptResult.modelResponse;
        const finalImage = scriptResult.character.image || personalityService.findDefaultAvatar(selectedPersonality);
        displayPersonality = { ...selectedPersonality, image: finalImage };
        
        if (scriptResult.character && scriptResult.character.image) {
            const characterCard = document.querySelector(`#personality-${selectedPersonality.id}`);
            if (characterCard) {
                const cardImage = characterCard.querySelector('.background-img');
                if (cardImage) cardImage.src = scriptResult.character.image;
            }
        }
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

    const pfpElement = placeholder.querySelector('.pfp');
    pfpElement.src = displayPersonality.image;
    streamTextToElement(messageTextElement, modifiedText);
    // After streaming, update the placeholder to be a full message card
    await chatsService.loadChat(currentChat.id, db);
}

async function regenerate(messageIndex, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    let currentChat = await chatsService.getCurrentChat(db);
    
    const messageElement = document.querySelector(`.message[data-index="${messageIndex}"]`);
    const messageTextElement = messageElement.querySelector('.message-text');
    messageTextElement.innerHTML = "<i>Regenerating...</i>";

    let contents = [];
    let userMessageText = "";

    if (messageIndex === 0) {
        let firstMessageUserContent = selectedPersonality.firstMessagePrompt;
        if (selectedPersonality.scenario) firstMessageUserContent = `Scenario: ${selectedPersonality.scenario}\n\nInstructions: ${firstMessageUserContent}`;
        contents = [{ role: 'user', parts: [{ text: firstMessageUserContent }] }];
        userMessageText = firstMessageUserContent;
    } else {
        const originalUserMsgText = currentChat.content[messageIndex - 1].parts[0].text;
        userMessageText = originalUserMsgText;
        let apiMsg = originalUserMsgText;
        if (selectedPersonality.reminder) apiMsg = `${originalUserMsgText}\n\n${selectedPersonality.reminder}`;
        const history = buildContentHistory(currentChat, messageIndex - 1);
        contents = [...history, { role: 'user', parts: [{ text: apiMsg }] }];
    }
    
    const ai = new GoogleGenerativeAI(settings.apiKey);
    const fullSystemInstruction = `${settingsService.getSystemPrompt()}\n\nYou are to act as ${selectedPersonality.name}. Description: ${selectedPersonality.description}. Core Instructions: ${selectedPersonality.prompt}`;
    const model = ai.getGenerativeModel({ model: settings.model, systemInstruction: fullSystemInstruction });

    const result = await model.generateContentStream({ contents });
    const rawText = await streamResponseToText(result.stream);
    
    let modifiedText = rawText;
    let finalImage = personalityService.findDefaultAvatar(selectedPersonality);
    
    if (selectedPersonality.customScript) {
        const scriptResult = await characterScriptService.execute(selectedPersonality.customScript, selectedPersonality, rawText, userMessageText);
        modifiedText = scriptResult.modelResponse;
        
        if (scriptResult.character && scriptResult.character.image) {
            finalImage = scriptResult.character.image;
            const isLastMessage = messageIndex === currentChat.content.length - 1;
            if (isLastMessage) {
                const characterCard = document.querySelector(`#personality-${selectedPersonality.id}`);
                if (characterCard) characterCard.querySelector('.background-img').src = finalImage;
            }
        }
    }

    const modelMessage = currentChat.content[messageIndex];
    modelMessage.versions.push({ text: modifiedText });
    modelMessage.activeVersion = modelMessage.versions.length - 1;
    await db.chats.put(currentChat);

    const pfpElement = messageElement.querySelector('.pfp');
    pfpElement.src = finalImage;
    streamTextToElement(messageTextElement, modifiedText);

    // After streaming, update the message to include the new version swiper
    setTimeout(() => chatsService.loadChat(currentChat.id, db), modifiedText.length * 20 + 500);
}

async function regenerateUserMessage(userMessageIndex, db) {
    // This function will remain as a full reload for now for stability.
    await chatsService.loadChat(chatsService.getCurrentChatId(), db);
}

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
        
        if (versionText === '...') { // It's a placeholder
            newMessage.querySelector('.message-actions').style.display = 'none';
        } else {
            hljs.highlightAll();
        }

        newMessage.querySelector(".btn-refresh").addEventListener("click", () => regenerate(index, db));
        newMessage.querySelector(".btn-delete").addEventListener("click", () => deleteMessage(index, db));
        
        if(hasVersions) {
            newMessage.querySelector(".btn-version-prev").addEventListener("click", () => switchVersion(index, -1, db));
            newMessage.querySelector(".btn-version-next").addEventListener("click", () => switchVersion(index, 1, db));
        }

    } else { // User message
        newMessage.classList.add("message-user");
        newMessage.innerHTML = `...`; // Simplified for brevity
        await chatsService.loadChat(chatsService.getCurrentChatId(), db); // Just reload for user messages
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
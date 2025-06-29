// handles sending messages to the api

import { GoogleGenAI } from "@google/genai";
import { marked } from "marked";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) {
        return;
    }
    if (settings.apiKey === "") {
        alert("Please enter an API key");
        return;
    }
    if (!msg) {
        return;
    }

    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const config = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: settings.temperature / 100,
        systemPrompt: settingsService.getSystemPrompt(),
        safetySettings: settings.safetySettings,
        responseMimeType: "text/plain"
    };

    if (!await chatsService.getCurrentChat(db)) {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg,
        });
        const title = response.text;
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
    }

    await insertMessage("user", msg, null, null, db);
    helpers.messageContainerScrollToBottom();

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

    if (selectedPersonality.toneExamples) {
        history.push(...selectedPersonality.toneExamples.map((tone) => {
            return { role: "model", parts: [{ text: tone }] };
        }));
    }

    const currentChat = await chatsService.getCurrentChat(db);
    history.push(...currentChat.content.map((msg) => {
        return { role: msg.role, parts: msg.parts };
    }));

    const chat = ai.chats.create({
        model: settings.model,
        history: history,
        config: config
    });

    const stream = await chat.sendMessageStream({ message: msg });

    const reply = await insertMessage("model", "", selectedPersonality.name, stream, db, selectedPersonality.image);

    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
}

async function regenerate(responseElement, db) {
    const message = responseElement.previousElementSibling.querySelector(".message-text").textContent;
    const elementIndex = [...responseElement.parentElement.children].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);

    chat.content = chat.content.slice(0, elementIndex - 1);
    await db.chats.put(chat);
    await chatsService.loadChat(chat.id, db);
    await send(message, db);
}

function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector(".btn-edit");
    const saveButton = messageElement.querySelector(".btn-save");
    const messageText = messageElement.querySelector(".message-text");

    if (!editButton || !saveButton) return;

    editButton.addEventListener("click", () => {
        messageText.setAttribute("contenteditable", "true");
        messageText.focus();

        editButton.style.display = "none";
        saveButton.style.display = "inline-block";

        messageText.dataset.originalContent = messageText.innerHTML;

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(messageText);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    });

    saveButton.addEventListener("click", async () => {
        messageText.removeAttribute("contenteditable");
        editButton.style.display = "inline-block";
        saveButton.style.display = "none";

        const messageContainer = document.querySelector(".message-container");
        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);

        await updateMessageInDatabase(messageElement, messageIndex, db);
    });

    messageText.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveButton.click();
        }

        if (e.key === "Escape") {
            messageText.innerHTML = messageText.dataset.originalContent;
            messageText.removeAttribute("contenteditable");
            editButton.style.display = "inline-block";
            saveButton.style.display = "none";
        }
    });
}

async function updateMessageInDatabase(messageElement, messageIndex, db) {
    if (!db) return;

    try {
        const messageText = messageElement.querySelector(".message-text").innerHTML;
        const rawText = messageText.replace(/<[^>]*>/g, "").trim();

        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex]) return;

        currentChat.content[messageIndex].parts[0].text = rawText;

        await db.chats.put(currentChat);
        console.log("Message updated in database");
    } catch (error) {
        console.error("Error updating message in database:", error);
        alert("Failed to save your edited message. Please try again.");
    }
}

export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    if (sender != "user") {
        newMessage.classList.add("message-model");
        const messageRole = selectedPersonalityTitle;

        newMessage.innerHTML = `
            <div class="message-header">
                <img class="pfp" src="${pfpSrc}" loading="lazy"></img>
                <h3 class="message-role">${messageRole}</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
                    <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text"></div>
        `;

        const refreshButton = newMessage.querySelector(".btn-refresh");
        refreshButton.addEventListener("click", async () => {
            try {
                await regenerate(newMessage, db);
            } catch (error) {
                if (error.status === 429) {
                    alert("Error, you have reached the API's rate limit. Please try again later or use the Flash model.");
                    return;
                }
                alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
                console.error(error);
            }
        });

        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg);
        } else {
            let rawText = "";
            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) {
                        rawText += chunk.text;
                        messageContent.innerHTML = marked.parse(rawText, { breaks: true });
                        helpers.messageContainerScrollToBottom();
                    }
                }
                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                return { HTML: messageContent.innerHTML, md: rawText };
            } catch (error) {
                alert("Error processing response: " + error);
                console.error("Stream error:", error);
                return { HTML: messageContent.innerHTML, md: rawText };
            }
        }
    } else {
        newMessage.classList.add("message-user");

        const messageRole = "You:";
        newMessage.innerHTML = `
            <div class="message-header">
                <h3 class="message-role">${messageRole}</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-regenerate btn-textual material-symbols-outlined" title="Regenerate response">replay</button>
                    <button class="btn-delete btn-textual material-symbols-outlined" title="Delete message">delete</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text">${helpers.getDecoded(msg)}</div>
        `;

        const regenerateButton = newMessage.querySelector(".btn-regenerate");
        if (regenerateButton) {
            regenerateButton.addEventListener("click", async () => {
                const botResponseElement = newMessage.nextElementSibling;
                if (botResponseElement && botResponseElement.classList.contains('message-model')) {
                    await regenerate(botResponseElement, db);
                }
            });
        }

        const deleteButton = newMessage.querySelector(".btn-delete");
        if (deleteButton) {
            deleteButton.addEventListener("click", () => deleteMessage(newMessage, db));
        }

        hljs.highlightAll();
        setupMessageEditing(newMessage, db);
    }
}

async function deleteMessage(messageElement, db) {
    if (!confirm("Are you sure you want to delete this message? This cannot be undone.")) {
        return;
    }

    try {
        const messageContainer = document.querySelector(".message-container");
        const currentChat = await chatsService.getCurrentChat(db);

        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);

        if (messageIndex === -1) {
            throw new Error("Could not find message to delete.");
        }

        let messagesToDelete = 1;
        const nextElement = messageElement.nextElementSibling;

        if (messageElement.classList.contains('message-user') && nextElement && nextElement.classList.contains('message-model')) {
            messagesToDelete = 2;
        }

        currentChat.content.splice(messageIndex, messagesToDelete);
        await db.chats.put(currentChat);
        await chatsService.loadChat(currentChat.id, db);

        console.log(`Deleted ${messagesToDelete} message(s) and reloaded chat.`);

    } catch (error) {
        console.error("Failed to delete message:", error);
        alert("An error occurred while trying to delete the message.");
    }
}

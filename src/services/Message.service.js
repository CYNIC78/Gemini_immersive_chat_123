//handles sending messages to the api

import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
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
    //model setup
    const ai = new GoogleGenerativeAI(settings.apiKey);
    
    // FIXED: generationConfig no longer contains safetySettings.
    const generationConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: settings.temperature / 100,
    };
    
    //user msg handling
    //we create a new chat if there is none is currently selected
    if (!await chatsService.getCurrentChat(db)) { 
        // A simpler, more robust way to generate the title
        const titleModel = ai.getGenerativeModel({ model: settings.model });
        const result = await titleModel.generateContent(
            "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg
        );
        const title = result.response.text();
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
    }
    await insertMessage("user", msg, null, null, db);
    helpers.messageContainerScrollToBottom();
    //model reply
    
    // Create chat history
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
    
    // Add tone examples if available
    if (selectedPersonality.toneExamples) {
        history.push(
            ...selectedPersonality.toneExamples.map((tone) => {
                return { role: "model", parts: [{ text: tone }] }
            })
        );
    }
    
    // Add chat history
    const currentChat = await chatsService.getCurrentChat(db);
    history.push(
        ...currentChat.content.map((msg) => {
            return { role: msg.role, parts: msg.parts } //we remove the `personality` property as the API expects only `role` and `parts`
        })
    );
    
    // Get the generative model with the selected model from settings
    const generativeModel = ai.getGenerativeModel({
        model: settings.model,
        systemInstruction: settingsService.getSystemPrompt(),
    });

    // Create chat session
    const chat = generativeModel.startChat({
        history: history,
        // FIXED: generationConfig and safetySettings are now separate, top-level properties
        generationConfig: generationConfig,
        safetySettings: settings.safetySettings
    });
    
    // Send message with streaming
    const result = await chat.sendMessageStream(msg);
    
    const reply = await insertMessage("model", "", selectedPersonality.name, result.stream, db, selectedPersonality.image);
    //save chat history and settings
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    //settingsService.saveSettings();
}

async function regenerate(responseElement, db) {
    //basically, we remove every message after the response we wish to regenerate, then send the message again.
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
    
    // Handle edit button click
    editButton.addEventListener("click", () => {
        // Enable editing
        messageText.setAttribute("contenteditable", "true");
        messageText.focus();
        
        // Show save button, hide edit button
        editButton.style.display = "none";
        saveButton.style.display = "inline-block";
        
        // Store original content to allow cancellation
        messageText.dataset.originalContent = messageText.innerHTML;
        
        // Place cursor at the end
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(messageText);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    });
    
    // Handle save button click
    saveButton.addEventListener("click", async () => {
        // Disable editing
        messageText.removeAttribute("contenteditable");
        
        // Show edit button, hide save button
        editButton.style.display = "inline-block";
        saveButton.style.display = "none";
        
        // Get the message index to update the correct message in chat history
        const messageContainer = document.querySelector(".message-container");
        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);
        
        // Update the chat history in database
        await updateMessageInDatabase(messageElement, messageIndex, db);
    });
    
    // Handle keydown events in the editable message
    messageText.addEventListener("keydown", (e) => {
        // Save on Enter key (without shift for newlines)
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveButton.click();
        }
        
        // Cancel on Escape key
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
        // Get the updated message text
        const messageText = messageElement.querySelector(".message-text").innerHTML;
        const rawText = messageText.replace(/<[^>]*>/g, "").trim(); // Strip HTML for storing in parts
        
        // Get the current chat and update the specific message
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex]) return;
        
        // Update the message content in the parts array
        currentChat.content[messageIndex].parts[0].text = rawText;
        
        // Save the updated chat back to the database
        await db.chats.put(currentChat);
        console.log("Message updated in database");
    } catch (error) {
        console.error("Error updating message in database:", error);
        alert("Failed to save your edited message. Please try again.");
    }
}

export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null) {
    // Create new message div for the user's message then append to message container's top
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    // Handle model's message
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
                    <button class="btn-refresh btn-textual material-symbols-outlined" title="Regenerate response">refresh</button>
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

        const deleteButton = newMessage.querySelector(".btn-delete");
        if (deleteButton) {
            deleteButton.addEventListener("click", () => deleteMessage(newMessage, db));
        }

        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg);
        } else {
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
                setupMessageEditing(newMessage, db); 
                return { HTML: messageContent.innerHTML, md: rawText };
            } catch (error) {
                messageContent.innerHTML += "<br><br><strong style='color:red;'>Error: Response stopped. Please check the browser console (F12) for details.</strong>";
                console.error("Stream error:", error);
                return { HTML: messageContent.innerHTML, md: rawText };
            }
        }
        setupMessageEditing(newMessage, db);
    } else {
        // Add a specific class for user messages to make styling easier
        newMessage.classList.add("message-user");

        const messageRole = "You:";
        newMessage.innerHTML = `
            <div class="message-header">
                <h3 class="message-role">${messageRole}</h3>
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
            throw new Error("Could not find the message to delete.");
        }
        
        currentChat.content.splice(messageIndex, 1);
        
        await db.chats.put(currentChat);
        
        await chatsService.loadChat(currentChat.id, db);

        console.log(`Deleted 1 message and reloaded the chat.`);

    } catch (error) {
        console.error("Failed to delete the message:", error);
        alert("An error occurred while trying to delete the message. Please check the console for details.");
    }
}
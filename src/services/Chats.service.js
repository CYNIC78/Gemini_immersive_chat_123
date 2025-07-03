import * as messageService from "./Message.service"
import * as helpers from "../utils/helpers"
import * as personalityService from "./Personality.service";
const messageContainer = document.querySelector(".message-container");
const chatHistorySection = document.querySelector("#chatHistorySection");
const sidebar = document.querySelector(".sidebar");

export function getCurrentChatId() {
    const currentChatElement = document.querySelector("input[name='currentChat']:checked");
    if (currentChatElement) {
        return parseInt(currentChatElement.value.replace("chat", ""), 10);
    }
    return null;
}

export async function getAllChatIdentifiers(db) {
    try {
        let identifiers = [];
        await db.chats.orderBy('timestamp').each(
            chat => {
                identifiers.push({ id: chat.id, title: chat.title });
            }
        )
        return identifiers;
    } catch (error) {
        console.error(error);
    }
}

export async function initialize(db) {
    const chatContainer = document.querySelector("#chatHistorySection");
    chatContainer.innerHTML = "";
    const chats = await getAllChatIdentifiers(db);
    for (let chat of chats) {
        insertChatEntry(chat, db);
    }
}

function insertChatEntry(chat, db) {
    const chatRadioButton = document.createElement("input");
    chatRadioButton.setAttribute("type", "radio");
    chatRadioButton.setAttribute("name", "currentChat");
    chatRadioButton.setAttribute("value", "chat" + chat.id);
    chatRadioButton.id = "chat" + chat.id;
    chatRadioButton.classList.add("input-radio-currentchat");

    const chatLabel = document.createElement("label",);
    chatLabel.setAttribute("for", "chat" + chat.id);
    chatLabel.classList.add("title-chat");
    chatLabel.classList.add("label-currentchat");

    const chatLabelText = document.createElement("span");
    chatLabelText.style.overflow = "hidden";
    chatLabelText.style.textOverflow = "ellipsis";
    chatLabelText.textContent = chat.title;

    const chatIcon = document.createElement("span");
    chatIcon.classList.add("material-symbols-outlined");
    chatIcon.textContent = "chat_bubble";

    const deleteEntryButton = document.createElement("button");
    deleteEntryButton.classList.add("btn-textual", "material-symbols-outlined");
    deleteEntryButton.textContent = "delete";
    deleteEntryButton.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChat(chat.id, db);
    })

    chatLabel.append(chatIcon);
    chatLabel.append(chatLabelText);
    chatLabel.append(deleteEntryButton);

    chatRadioButton.addEventListener("change", async () => {
        await loadChat(chat.id, db);
        if (window.innerWidth < 1032) {
            helpers.hideElement(sidebar);
        }
    });

    chatHistorySection.prepend(chatRadioButton, chatLabel);
}

export async function addChat(title, firstMessage = null, db) {
    const id = await db.chats.put({
        title: title,
        timestamp: Date.now(),
        content: firstMessage ? [{ role: "user", parts: [{ text: firstMessage }] }] : []
    });
    insertChatEntry({ title, id }, db);
    console.log("chat added with id: ", id);
    return id;
}

export async function getCurrentChat(db) {
    const id = getCurrentChatId();
    if (!id) {
        return null;
    }
    return (await getChatById(id, db));
}

export async function deleteAllChats(db) {
    if (confirm("Are you sure you want to delete ALL chat histories? This cannot be undone.")) {
        await db.chats.clear();
        messageContainer.innerHTML = "";
        initialize(db);
    }
}

export async function deleteChat(id, db) {
    await db.chats.delete(id);
    if (getCurrentChatId() == id) {
        newChat();
    }
    initialize(db);
}

export function newChat() {
    messageContainer.innerHTML = "";
    const checkedRadio = document.querySelector("input[name='currentChat']:checked");
    if (checkedRadio) {
        checkedRadio.checked = false;
    }
}

// --- NEW FUNCTION TO START A CHAT WITH A PERSONALITY'S FIRST MESSAGE ---
export async function startChatWithPersonality(db) {
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality || !selectedPersonality.firstMessagePrompt) {
        console.warn("Attempted to start chat with personality, but no firstMessagePrompt found.");
        return;
    }

    // Generate a simple title.
    const title = `Chat with ${selectedPersonality.name}`;

    // Create a new, empty chat and get its ID.
    const id = await addChat(title, null, db);

    // Make the new chat active.
    document.querySelector(`#chat${id}`).click();

    // Now, call the message service to generate the actual first message.
    // We will create this function in the very next step!
    await messageService.generateFirstMessage(db);
}

export async function loadChat(chatID, db) {
    try {
        if (!chatID) {
            return;
        }
        messageContainer.innerHTML = "";
        const chat = await getChatById(chatID, db);

        // Use a for...of loop to handle async operations correctly
        for (const [index, msg] of chat.content.entries()) {
            if (msg.role === "model") {
                const personality = msg.personalityid ?
                    await personalityService.get(msg.personalityid, db) :
                    await personalityService.getByName(msg.personality, db);
                
                // We now pass the entire message object to insertMessage
                await messageService.insertMessage(msg, index, db, personality);
            } else { // User message
                // We pass the message object and its index
                await messageService.insertMessage(msg, index, db);
            }
        }

        messageContainer.scrollTo({
            top: messageContainer.scrollHeight,
            behavior: 'auto'
        });
    }
    catch (error) {
        alert("Error loading chat. It might be from a previous version. Please clear your chats and try again. Error: " + error);
        console.error(error);
    }
}

export async function getAllChats(db) {
    const chats = await db.chats.orderBy('timestamp').toArray();
    chats.reverse();
    return chats;
}

export async function getChatById(id, db) {
    const chat = await db.chats.get(id);
    return chat;
}
import * as overlayService from "./Overlay.service";
import { db } from "./Db.service";
import { Personality } from "../models/Personality";
// We now need to import specific functions from Personality.service.js
// even though many functions are duplicated in this file's global scope.
// This is a temporary measure to get the feature working with the current file structure.
import { loadLastSelectedPersonalityId, saveSelectedPersonalityId } from "./services/Personality.service";

// Move the migration logic to a separate function that can be called from main.js
export async function migratePersonalities(database) {
    const chats = await database.chats.toArray();
    if (!chats) return;

    const migratedChats = await Promise.all([...chats].map(async chat => {
        console.log('Migrating chat:', chat);
        for (const message of chat.content) {
            if (message.personality) {
                const personality = await getByName(message.personality, database);
                if (!personality) {
                    // Personality was deleted, set to default personality
                    const defaultPersonality = getDefault();
                    message.personalityid = -1; // Default personality ID
                    message.personality = defaultPersonality.name;
                    console.log(`Personality "${message.personality}" not found, defaulting to ${defaultPersonality.name}`);
                    continue;
                }
                message.personalityid = personality.id;
            }
            else {
                delete message.personalityid;
            }
        }
        return chat;
    }));

    await database.chats.bulkPut(migratedChats);
}

export async function initialize() {
    //default personality setup
    const defaultPersonalityCard = insert(getDefault());
    // defaultPersonalityCard.querySelector("input").click(); // <-- REMOVED THIS LINE

    //load all personalities from local storage
    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            insert(personality);
        }
    }
    
    // Add the "Create New" card at the end
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv").appendChild(createCard);

    // NEW: Load and select the last used personality
    const lastSelectedId = loadLastSelectedPersonalityId();
    let selectedPersonalityCard = null;

    if (lastSelectedId !== null) {
        selectedPersonalityCard = document.querySelector(`#personality-${lastSelectedId}`);
    }

    if (selectedPersonalityCard) {
        // If the last selected personality exists, click its radio button
        selectedPersonalityCard.querySelector("input[name='personality']").click();
    } else {
        // If no last selected or it was deleted, select the default Aphrodite
        if (defaultPersonalityCard) {
            defaultPersonalityCard.querySelector("input[name='personality']").click();
        }
    }
}

export async function getSelected() {
    const selectedRadio = document.querySelector("input[name='personality']:checked");
    if (!selectedRadio) return getDefault(); // Failsafe

    const parentLabel = selectedRadio.parentElement;
    if (!parentLabel.id) { // This handles the default personality which might not have a DB ID
        return getDefault();
    }

    const selectedID = parentLabel.id.split("-")[1];
    if (!selectedID) {
        return getDefault();
    }
    return await get(parseInt(selectedID));
}

export function getDefault() {
    return new Personality(
        'Aphrodite', 
        '/assets/default/images/Aphrodite.png',
        'Aphrodite is playful, flirtatious, and passionate, she knows how to captivate every conversation partner.',
        "You are Aphrodite, the ancient Greek goddess of love, beauty, and passion. You embody femininity and seduction, possessing otherworldly beauty and magnetic charm. Your personality is multifaceted: you can be playful and flirtatious, passionate and sensual, wise in matters of the heart and relationships.",
        "", // scenario
        "", // firstMessagePrompt
        ""  // reminder
    );
}

export async function get(id) {
    if (id < 0) {
        return getDefault();
    }
    return await db.personalities.get(id);
}

export async function getByName(name, database = null) {
    if (!name) return null;
    
    // Handle default personality by its actual name
    if (name.toLowerCase() === "aphrodite") {
        return { ...getDefault(), id: -1 };
    }

    const dbToUse = database || db;
    try {
        // First try exact match
        let personality = await dbToUse.personalities.where('name').equals(name).first();
        
        // If not found, try case-insensitive search
        if (!personality) {
            const allPersonalities = await dbToUse.personalities.toArray();
            personality = allPersonalities.find(p => 
                p.name.toLowerCase() === name.toLowerCase()
            );
        }
        
        return personality || null;
    } catch (error) {
        console.error(`Error finding personality by name: ${name}`, error);
        return null;
    }
}

export async function getAll() {
    const personalities = await db.personalities.toArray();
    if (!personalities) {
        return [];
    };
    return personalities;
}

export async function remove(id) {
    if (id < 0) {
        return;
    }
    await db.personalities.delete(id);
    // If the removed personality was the last selected, clear it from local storage
    if (loadLastSelectedPersonalityId() === id) {
        saveSelectedPersonalityId(null); // Clear the stored ID
    }
}

function insert(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const card = generateCard(personality);
    personalitiesDiv.append(card);
    return card;
}

export function share(personality) {
    const personalityCopy = { ...personality }
    delete personalityCopy.id
    //export personality to a string
    const personalityString = JSON.stringify(personalityCopy)
    //download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    element.style.display = 'none';
    //appending the element is required for firefox
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

export function createAddPersonalityCard() {
    const card = document.createElement("div");
    card.classList.add("card-personality", "card-add-personality");
    card.id = "btn-add-personality";
    card.innerHTML = `
        <div class="add-personality-content">
            <span class="material-symbols-outlined add-icon">add</span>
        </div>
    `;
    
    card.addEventListener("click", () => {
        overlayService.showAddPersonalityForm();
    });
    
    return card;
}

export async function removeAll() {
    await db.personalities.clear();
    document.querySelector("#personalitiesDiv").childNodes.forEach(node => {
        if (node.id) {
            node.remove();
        }
    });
    saveSelectedPersonalityId(null); // Clear last selected personality when all are removed
}

export async function add(personality) {
    const id = await db.personalities.add(personality); //insert in db
    insert({
        id: id,
        ...personality
    });
    
    // Move the add card to be the last element
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        document.querySelector("#personalitiesDiv").appendChild(addCard);
    }
}

export async function edit(id, personality) {
    const element = document.querySelector(`#personality-${id}`);
    const input = element.querySelector("input");

    await db.personalities.update(id, personality);

    //reselect the personality if it was selected prior
    element.replaceWith(generateCard({ id, ...personality }));
    if (input.checked) {
        document.querySelector(`#personality-${id}`).querySelector("input").click();
    }
}

export function generateCard(personality) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    card.id = `personality-${personality.id || -1}`;

    card.innerHTML = `
            <img class="background-img" src="${personality.image}"></img>
            <input type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                ${personality.id ? `<button class="btn-textual btn-edit-card material-symbols-outlined" 
                    id="btn-edit-personality-${personality.name}">edit</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined" 
                    id="btn-share-personality-${personality.name}">share</button>
                ${personality.id ? `<button class="btn-textual btn-delete-card material-symbols-outlined"
                    id="btn-delete-personality-${personality.name}">delete</button>` : ''}
            </div>
            <div class="personality-info">
                <h3 class="personality-title">${personality.name}</h3>
                <p class="personality-description">${personality.description}</p>
            </div>
            `;

    // Add event listeners
    const shareButton = card.querySelector(".btn-share-card");
    const deleteButton = card.querySelector(".btn-delete-card");
    const editButton = card.querySelector(".btn-edit-card");
    const input = card.querySelector("input");

    shareButton.addEventListener("click", () => {
        share(personality);
    });
    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            //first if the personality to delete is the one currently selected, we select the default personality
            if (input.checked) {
                // We don't click anything here; main.js will re-evaluate on next load,
                // or the remove function will clear the stored ID.
            }
            if (personality.id) {
                remove(personality.id);
            }
            card.remove();
        });
    }
    if (editButton) {
        editButton.addEventListener("click", () => {
            overlayService.showEditPersonalityForm(personality);
        });
    }

    // NEW: Add event listener to save selected personality ID
    // Note: We are importing saveSelectedPersonalityId from the service file now.
    input.addEventListener("change", () => {
        saveSelectedPersonalityId(personality.id || -1); // Save the ID when selected
    });

    return card;
}
import * as overlayService from "./Overlay.service.js";
import { db } from "./Db.service.js";
import { Personality } from "../models/Personality.js";

/**
 * One-time migration function to update old chat messages with a `personalityid`.
 * This should be called once when the application updates its database schema.
 * @param {object} database - The Dexie database instance.
 */
export async function migratePersonalities(database) {
    const chats = await database.chats.toArray();
    if (!chats) return;

    const migratedChats = await Promise.all([...chats].map(async chat => {
        for (const message of chat.content) {
            if (message.personality) {
                // Find the personality ID by its name.
                const personality = await getByName(message.personality, database);
                if (personality) {
                    message.personalityid = personality.id;
                } else {
                    // If the original personality was deleted, fall back to the default.
                    const defaultPersonality = getDefault();
                    message.personalityid = -1; // Default personality ID
                    message.personality = defaultPersonality.name;
                    console.warn(`Personality "${message.personality}" not found, defaulting to ${defaultPersonality.name}`);
                }
            } else {
                // Ensure old messages without a personality don't have the ID property.
                delete message.personalityid;
            }
        }
        return chat;
    }));

    await database.chats.bulkPut(migratedChats);
}

/**
 * Initializes the personalities tab by loading all items from the database.
 */
export async function initialize() {
    // Set up the non-deletable default personality.
    const defaultPersonalityCard = insert(getDefault());
    defaultPersonalityCard.querySelector("input").click(); // Select it by default.

    // Load all user-created personalities from the database.
    const personalitiesArray = await getAll();
    for (let personality of personalitiesArray) {
        insert(personality);
    }
    
    // Add the "Create New" card at the end of the list.
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv").appendChild(createCard);
}

/**
 * Gets the currently selected personality object from the UI.
 * @returns {Promise<Personality>} The full personality object from the database.
 */
export async function getSelected() {
    const selectedRadio = document.querySelector("input[name='personality']:checked");
    if (!selectedRadio) return getDefault();
    
    const selectedID = selectedRadio.parentElement.id.split("-")[1];
    return await get(parseInt(selectedID));
}

/**
 * Returns the hardcoded default Aphrodite personality object.
 * @returns {Personality} The default personality.
 */
export function getDefault() {
    return new Personality(
        'Aphrodite', 
        '/assets/default/images/Aphrodite.png',
        'Aphrodite is playful, flirtatious, and passionate, she knows how to captivate every conversation partner.',
        "You are Aphrodite, the ancient Greek goddess of love, beauty, and passion. You embody femininity and seduction, possessing otherworldly beauty and magnetic charm. Your personality is multifaceted: you can be playful and flirtatious, passionate and sensual, wise in matters of the heart and relationships.",
        null, // No ID for the default in-memory object
        null, null, null // No tone examples/aggression/sensuality by default
    );
}

/**
 * Retrieves a single personality from the database by its ID.
 * @param {number} id - The ID of the personality.
 * @returns {Promise<Personality|null>} The personality object or null if not found.
 */
export async function get(id) {
    if (id < 0) {
        return getDefault();
    }
    return await db.personalities.get(id);
}

/**
 * Retrieves a single personality from the database by its name (case-insensitive fallback).
 * @param {string} name - The name of the personality.
 * @param {object} [database=db] - Optional database instance for migrations.
 * @returns {Promise<Personality|null>} The personality object or null if not found.
 */
export async function getByName(name, database = null) {
    if (!name) return null;
    
    // Legacy support for a previously hardcoded name.
    if (name.toLowerCase() === "zodiac") {
        return { ...getDefault(), id: -1 };
    }

    const dbToUse = database || db;
    try {
        // First, try an exact match which is faster.
        let personality = await dbToUse.personalities.where('name').equals(name).first();
        
        // If not found, perform a slower, case-insensitive search.
        if (!personality) {
            const allPersonalities = await dbToUse.personalities.toArray();
            personality = allPersonalities.find(p => p.name.toLowerCase() === name.toLowerCase());
        }

        return personality || null;
    } catch (error) {
        console.error(`Error finding personality by name: ${name}`, error);
        return null;
    }
}

/**
 * Retrieves all personalities from the database.
 * @returns {Promise<Array<Personality>>} An array of personality objects.
 */
export async function getAll() {
    const personalities = await db.personalities.toArray();
    return personalities || [];
}

/**
 * Deletes a personality from the database by its ID.
 * @param {number} id - The ID of the personality to remove.
 */
export async function remove(id) {
    if (id < 0) return; // Cannot delete the default personality.
    await db.personalities.delete(id);
}

/**
 * A private helper to generate a card and insert it into the DOM.
 * @param {Personality} personality - The personality object to insert.
 * @returns {HTMLElement} The generated card element.
 */
function insert(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const card = generateCard(personality);
    personalitiesDiv.append(card);
    return card;
}

/**
 * Exports a personality object as a JSON file for the user to download.
 * @param {Personality} personality - The personality to export.
 */
export function share(personality) {
    const personalityCopy = { ...personality };
    delete personalityCopy.id; // Remove the local ID before sharing.
    const personalityString = JSON.stringify(personalityCopy, null, 2); // Pretty-print JSON

    const element = document.createElement('a');
    element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    element.style.display = 'none';
    document.body.appendChild(element); // Required for Firefox.
    element.click();
    document.body.removeChild(element);
}

/**
 * Creates the special "Add New" card and sets up its click listener.
 * @returns {HTMLElement} The "Add New" card element.
 */
export function createAddPersonalityCard() {
    const card = document.createElement("div");
    card.classList.add("card-personality", "card-add-personality");
    card.id = "btn-add-personality";
    card.innerHTML = `<div class="add-personality-content"><span class="material-symbols-outlined add-icon">add</span></div>`;
    card.addEventListener("click", () => overlayService.showAddPersonalityForm());
    return card;
}

/**
 * Adds a new personality to the database and the UI.
 * @param {Personality} personality - The new personality object.
 */
export async function add(personality) {
    const id = await db.personalities.add(personality); // Add to DB, get new ID.
    insert({ id, ...personality }); // Add to UI.
    
    // Ensure the "Add New" card is always the last element.
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        document.querySelector("#personalitiesDiv").appendChild(addCard);
    }
}

/**
 * Updates an existing personality in the database and refreshes its card in the UI.
 * @param {number} id - The ID of the personality to edit.
 * @param {Personality} personality - The updated personality data.
 */
export async function edit(id, personality) {
    const element = document.querySelector(`#personality-${id}`);
    if (!element) return;
    const input = element.querySelector("input");
    const wasChecked = input.checked;

    await db.personalities.update(id, personality);

    // Replace the old card with a newly generated one to reflect changes.
    element.replaceWith(generateCard({ id, ...personality }));

    // Re-select the personality if it was selected before editing.
    if (wasChecked) {
        document.querySelector(`#personality-${id}`).querySelector("input").click();
    }
}

/**
 * Generates the HTML element for a single personality card and attaches its event listeners.
 * @param {Personality} personality - The personality data to build the card from.
 * @returns {HTMLElement} The fully constructed card element.
 */
export function generateCard(personality) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    // The default personality doesn't have an ID.
    if (personality.id) {
        card.id = `personality-${personality.id}`;
    }

    // Determine which buttons to show. Default personality cannot be edited or deleted.
    const showEditDelete = !!personality.id;

    card.innerHTML = `
        <img class="background-img" src="${personality.image}">
        <input type="radio" name="personality" value="${personality.name}">
        <div class="btn-array-personalityactions">
            ${showEditDelete ? `<button class="btn-textual btn-edit-card material-symbols-outlined" title="Edit Personality">edit</button>` : ''}
            <button class="btn-textual btn-share-card material-symbols-outlined" title="Share Personality">share</button>
            ${showEditDelete ? `<button class="btn-textual btn-delete-card material-symbols-outlined" title="Delete Personality">delete</button>` : ''}
        </div>
        <div class="personality-info">
            <h3 class="personality-title">${personality.name}</h3>
            <p class="personality-description">${personality.description}</p>
        </div>
    `;

    // --- Attach event listeners ---
    card.querySelector(".btn-share-card")?.addEventListener("click", () => share(personality));
    
    card.querySelector(".btn-delete-card")?.addEventListener("click", () => {
        if (confirm(`Are you sure you want to delete the personality "${personality.name}"?`)) {
            // If the deleted personality was selected, select the default one first.
            const input = card.querySelector("input");
            if (input.checked) {
                document.querySelector("#personalitiesDiv").firstElementChild.querySelector("input").click();
            }
            if (personality.id) {
                remove(personality.id);
            }
            card.remove();
        }
    });

    card.querySelector(".btn-edit-card")?.addEventListener("click", () => {
        overlayService.showEditPersonalityForm(personality);
    });

    return card;
}
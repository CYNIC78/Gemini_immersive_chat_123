import * as overlayService from "./Overlay.service";
import { db } from "./Db.service";
import { Personality } from "../models/Personality";

// A helper function to find the default avatar image from assets
function findDefaultAvatar(personality) {
    if (personality.assets && personality.assets.length > 0 && personality.defaultAvatarTag) {
        const tag = personality.defaultAvatarTag.trim();
        const defaultAsset = personality.assets.find(asset => 
            asset.type === 'image' && asset.tags.includes(tag)
        );
        if (defaultAsset) {
            return defaultAsset.base64Data;
        }
    }
    // Fallback for the very first default character or if no matching tag is found
    if (personality.name === 'Aphrodite') {
        return '/assets/default/images/Aphrodite.png';
    }
    return ''; // Return empty string for other characters if no avatar is found
}


export async function initialize() {
    const defaultPersonalityCard = insert(getDefault());
    defaultPersonalityCard.querySelector("input").click();
    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            insert(personality);
        }
    }
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv").appendChild(createCard);
}

export async function getSelected() {
    const selectedRadio = document.querySelector("input[name='personality']:checked");
    if (!selectedRadio) return getDefault();
    const parentLabel = selectedRadio.parentElement;
    if (!parentLabel.id) {
        return getDefault();
    }
    const selectedID = parentLabel.id.split("-")[1];
    if (!selectedID) {
        return getDefault();
    }
    return await get(parseInt(selectedID));
}

export function getDefault() {
    // Note: The 'image' property is now effectively unused for new characters,
    // but we keep a value for the hardcoded default Aphrodite.
    return new Personality(
        'Aphrodite',
        'Aphrodite is playful, flirtatious, and passionate, she knows how to captivate every conversation partner.',
        "You are Aphrodite, the ancient Greek goddess of love, beauty, and passion. You embody femininity and seduction, possessing otherworldly beauty and magnetic charm. Your personality is multifaceted: you can be playful and flirtatious, passionate and sensual, wise in matters of the heart and relationships.",
        "", "", "", 0, 0, false, false, [], "", [], "default"
    );
}

export async function get(id) {
    if (id < 0) {
        return getDefault();
    }
    return await db.personalities.get(id);
}

export async function getAll() {
    return await db.personalities.toArray() || [];
}

export async function remove(id) {
    if (id >= 0) {
        await db.personalities.delete(id);
    }
}

function insert(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const card = generateCard(personality);
    personalitiesDiv.append(card);
    return card;
}

export function share(personality) {
    const personalityCopy = { ...personality };
    delete personalityCopy.id;
    // We remove the large base64 data before sharing to keep file size small
    if (personalityCopy.assets) {
        personalityCopy.assets.forEach(asset => delete asset.base64Data);
    }
    const personalityString = JSON.stringify(personalityCopy);
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

export function createAddPersonalityCard() {
    const card = document.createElement("div");
    card.classList.add("card-personality", "card-add-personality");
    card.id = "btn-add-personality";
    card.innerHTML = `<div class="add-personality-content"><span class="material-symbols-outlined add-icon">add</span></div>`;
    card.addEventListener("click", () => overlayService.showAddPersonalityForm());
    return card;
}

export async function removeAll() {
    await db.personalities.clear();
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const cardsToRemove = personalitiesDiv.querySelectorAll('.card-personality:not(.card-add-personality)');
    cardsToRemove.forEach(card => {
        if (card.id !== 'personality--1') { // Don't remove default Aphrodite card
            card.remove();
        }
    });
}

export async function add(personality) {
    // The "image" property is now deprecated and should be set based on assets
    delete personality.image; 
    const id = await db.personalities.add(personality);
    insert({ id, ...personality });
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        document.querySelector("#personalitiesDiv").appendChild(addCard);
    }
}

export async function edit(id, personality) {
    const element = document.querySelector(`#personality-${id}`);
    const input = element.querySelector("input");
    
    // The "image" property is now deprecated
    delete personality.image; 

    const existingPersonality = await db.personalities.get(id);
    const updatedPersonality = { ...existingPersonality, ...personality };

    await db.personalities.update(id, updatedPersonality);

    element.replaceWith(generateCard({ id, ...updatedPersonality }));
    if (input.checked) {
        document.querySelector(`#personality-${id}`).querySelector("input").click();
    }
}

export function generateCard(personality) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    card.id = `personality-${personality.id || -1}`;
    
    // Find the correct image source using our new system
    const imageSrc = findDefaultAvatar(personality);

    card.innerHTML = `
            <img class="background-img" src="${imageSrc}"></img>
            <input type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                ${personality.id ? `<button class="btn-textual btn-edit-card material-symbols-outlined">edit</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined">share</button>
                ${personality.id ? `<button class="btn-textual btn-delete-card material-symbols-outlined">delete</button>` : ''}
            </div>
            <div class="personality-info">
                <h3 class="personality-title">${personality.name}</h3>
                <p class="personality-description">${personality.description}</p>
            </div>
            `;

    const shareButton = card.querySelector(".btn-share-card");
    const deleteButton = card.querySelector(".btn-delete-card");
    const editButton = card.querySelector(".btn-edit-card");
    const input = card.querySelector("input");

    shareButton.addEventListener("click", () => share(personality));

    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            if (input.checked) {
                document.querySelector("#personalitiesDiv").firstElementChild.click();
            }
            if (personality.id) {
                remove(personality.id);
            }
            card.remove();
        });
    }
    if (editButton) {
        editButton.addEventListener("click", () => overlayService.showEditPersonalityForm(personality));
    }
    return card;
}
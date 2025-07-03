import { Personality } from "../models/Personality";
import * as personalityService from '../services/Personality.service';
import * as stepperService from '../services/Stepper.service';
import * as overlayService from '../services/Overlay.service';
import * as assetManager from '../services/AssetManager.service.js'; // NEW: Import the Asset Manager

const form = document.querySelector("#form-add-personality");
const stepper = stepperService.get('stepper-add-personality');
const btn = document.querySelector('#btn-add-tone-example');

// Intercept the show and edit functions to initialize the asset manager
const originalShow = overlayService.showAddPersonalityForm;
overlayService.showAddPersonalityForm = function() {
    assetManager.initialize([]); // Initialize with empty assets for a new character
    originalShow.apply(this, arguments);
};

const originalEdit = overlayService.showEditPersonalityForm;
overlayService.showEditPersonalityForm = function(personality) {
    assetManager.initialize(personality.assets); // Initialize with the character's existing assets
    originalEdit.apply(this, arguments);
};
// --- End of Interception ---


form.submit = () => {
    //turn all the form data into a personality object
    const personality = new Personality();
    const data = new FormData(form);

    // Get assets from the asset manager service
    personality.assets = assetManager.getAssets(); // NEW: Get assets from the manager

    for (const [key, value] of data.entries()) {
        if (key.includes("tone")) {
            if(value){
                personality.toneExamples.push(value);
            }
            continue;
        }
        if (key === 'id') {
            continue;
        }
        personality[key] = value;
    }

    //handle both edit and add cases
    const id = data.get('id');
    if (id) {
        personalityService.edit(parseInt(id), personality);
    }
    else {
        personalityService.add(personality);
    }

    overlayService.closeOverlay();
}

//this code is for setting up the `add tone example` button
btn.addEventListener('click', (e) => {
    e.preventDefault();
    const input = document.createElement('input');
    input.type = 'text';
    input.name = `tone-example-${document.querySelectorAll('.tone-example').length + 1}`;
    input.classList.add('tone-example');
    input.placeholder = 'Tone example';
    btn.before(input);
});
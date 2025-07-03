// src/components/AddPersonalityForm.component.js

// --- IMPORTS ---
import { Personality } from "../models/Personality";
import * as personalityService from '../services/Personality.service';
import * as stepperService from '../services/Stepper.service';
import * as overlayService from '../services/Overlay.service';

// --- DOM ELEMENT SELECTION ---
const form = document.querySelector("#form-add-personality");
const addToneExampleButton = document.querySelector('#btn-add-tone-example');

// --- SERVICE INITIALIZATION ---
// Get a reference to the specific stepper instance controlling this form.
const stepper = stepperService.get('stepper-add-personality');

// --- FORM SUBMISSION LOGIC ---
/**
 * This custom 'submit' function is attached directly to the form object.
 * It is likely called by an external module (like the Stepper service) when the final step is completed.
 */
form.submit = () => {
    const personality = new Personality();
    const formData = new FormData(form);

    // Process the form data to populate the new Personality object.
    for (const [key, value] of formData.entries()) {
        // Special handling for dynamically added tone examples.
        if (key.startsWith("tone-example")) {
            if (value.trim()) { // Only add non-empty examples.
                personality.toneExamples.push(value.trim());
            }
            continue; // Skip to the next form entry.
        }

        // The 'id' field is used for editing, not as a direct property.
        if (key === 'id') {
            continue;
        }

        // Assign all other form fields to the personality object.
        personality[key] = value;
    }

    // Determine if this is a new personality or an edit of an existing one.
    const personalityId = formData.get('id');
    if (personalityId) {
        // If an ID exists, we are editing.
        personalityService.edit(parseInt(personalityId), personality);
    } else {
        // If no ID exists, we are adding a new one.
        personalityService.add(personality);
    }

    // Close the form overlay after submission.
    overlayService.closeOverlay();
};

// --- EVENT LISTENERS ---

// Listener for the "Add Tone Example" button.
addToneExampleButton.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent the button from submitting the form.

    // Create a new input element for the tone example.
    const input = document.createElement('input');
    input.type = 'text';
    // Dynamically create a unique name for the new input.
    input.name = `tone-example-${document.querySelectorAll('.tone-example').length + 1}`;
    input.classList.add('tone-example', 'input-field'); // Add classes for styling.
    input.placeholder = 'Enter another tone example';
    
    // Insert the new input field into the form, right before the button.
    addToneExampleButton.before(input);
});
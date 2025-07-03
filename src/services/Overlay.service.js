import { showElement, hideElement } from '../utils/helpers.js';
import * as stepperService from './Stepper.service.js';

// Get references to the main overlay elements from the DOM.
const overlay = document.querySelector(".overlay");
const overlayItems = overlay.querySelector(".overlay-content").children;
const personalityForm = document.querySelector("#form-add-personality");

/**
 * Displays the overlay with the 'Add Personality' form.
 */
export function showAddPersonalityForm() {
    showElement(overlay, false);
    showElement(personalityForm, false);
}

/**
 * Populates the personality form with existing data and displays it for editing.
 * @param {object} personality - The personality object to edit.
 */
export function showEditPersonalityForm(personality) {
    // Populate the form fields with the data from the personality object.
    for (const key in personality) {
        if (key === 'toneExamples') {
            // Special handling for tone examples, as they are dynamic inputs.
            for (const [index, tone] of personality.toneExamples.entries()) {
                if (index === 0) {
                    // The first input field already exists, so just set its value.
                    const input = personalityForm.querySelector(`input[name="tone-example-1"]`);
                    input.value = tone;
                    continue;
                }
                // For subsequent examples, create a new input element and append it.
                const input = document.createElement('input');
                input.type = 'text';
                input.name = `tone-example-${index}`;
                input.classList.add('tone-example');
                input.placeholder = 'Tone example';
                input.value = tone;
                personalityForm.querySelector("#btn-add-tone-example").before(input);
            }
        }
        // For all other keys, find the corresponding input and set its value.
        const input = personalityForm.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = personality[key];
        }
    }
    showElement(overlay, false);
    showElement(personalityForm, false);
}

/**
 * Displays the overlay with the 'What's New' changelog content.
 */
export function showChangelog() {
    const whatsNew = document.querySelector("#whats-new");
    showElement(overlay, false);
    showElement(whatsNew, false);
}

/**
 * Hides the overlay and resets any content that was being displayed.
 */
export function closeOverlay() {
    hideElement(overlay);

    // Loop through all items within the overlay content area to hide and reset them.
    for (const item of overlayItems) {
        hideElement(item);

        // If the item is a form, perform additional cleanup.
        if (item instanceof HTMLFormElement) {
            item.reset(); // Natively resets all form fields.
            
            // Remove any dynamically added 'tone example' inputs, leaving only the first one.
            item.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index !== 0) {
                    element.remove();
                }
            });

            // If the form has a stepper, reset it back to the first step.
            const stepper = stepperService.get(item.firstElementChild.id);
            if (stepper) {
                stepper.step = 0;
                stepperService.update(stepper);
            }
        }
    }
}
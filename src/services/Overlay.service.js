import { showElement, hideElement } from '../utils/helpers';
import * as stepperService from './Stepper.service';
const overlay = document.querySelector(".overlay");
const overlayItems = overlay.querySelector(".overlay-content").children;
const personalityForm = document.querySelector("#form-add-personality");

export function showAddPersonalityForm() {
    showElement(overlay, false);
    showElement(personalityForm, false);
}

export function showEditPersonalityForm(personality) {
    //populate the form with the personality data
    for (const key in personality) {
        if (key === 'toneExamples') {
            for (const [index, tone] of personality.toneExamples.entries()) {
                if (index === 0) {
                    const input = personalityForm.querySelector(`input[name="tone-example-1"]`);
                    input.value = tone;
                    continue;
                }
                const input = document.createElement('input');
                input.type = 'text';
                input.name = `tone-example-${index}`;
                input.classList.add('tone-example');
                input.placeholder = 'Tone example';
                input.value = tone;
                personalityForm.querySelector("#btn-add-tone-example").before(input);
            }
            continue; // Continue to the next key after handling toneExamples
        }
        const input = personalityForm.querySelector(`[name="${key}"]`);
        if (!input) {
            continue;
        }

        // --- UPDATED LOGIC ---
        // This now correctly handles checkboxes as well as regular text inputs.
        if (input.type === 'checkbox') {
            input.checked = personality[key];
        } else {
            input.value = personality[key];
        }
        // --- END OF UPDATE ---
    }
    showElement(overlay, false);
    showElement(personalityForm, false);
}

export function showChangelog() {
    const whatsNew = document.querySelector("#whats-new");
    showElement(overlay, false);
    showElement(whatsNew, false);
}

export function closeOverlay() {
    hideElement(overlay);

    for (const item of overlayItems) {
        hideElement(item);
        //reset the form and stepper
        if (item instanceof HTMLFormElement) {
            item.reset();
            //remove all but the first tone example
            item.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index !== 0) {
                    element.remove();
                }
            });
            const stepper = stepperService.get(item.firstElementChild.id);
            if (stepper) {
                stepper.step = 0;
                stepperService.update(stepper);
            }
        }
    }
}
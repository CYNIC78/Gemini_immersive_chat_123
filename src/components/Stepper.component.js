// src/components/Stepper.component.js

// --- IMPORTS ---
import * as stepperService from "../services/Stepper.service";

// --- INITIALIZATION ---
// This script assumes that all steppers have been registered with the stepperService.
// It retrieves a list of all stepper instances to make them interactive.
const steppers = stepperService.getAll();

// This loop iterates through every stepper found on the page and wires up its controls.
for (const stepper of steppers) {
    // --- DOM ELEMENT SELECTION ---
    // A stepper is expected to be a direct child of the form it controls.
    const form = stepper.element.parentElement;
    
    // Find the control buttons within this specific stepper instance.
    const nextButton = stepper.element.querySelector("#btn-stepper-next");
    const prevButton = stepper.element.querySelector("#btn-stepper-previous");
    const submitButton = stepper.element.querySelector("#btn-stepper-submit");

    // --- EVENT LISTENERS ---
    
    // Wire up the 'Next' button.
    nextButton.addEventListener("click", () => {
        stepper.step++; // Advance to the next step.
        stepperService.update(stepper); // Tell the service to update the UI.
    });

    // Wire up the 'Previous' button.
    prevButton.addEventListener("click", () => {
        stepper.step--; // Go back to the previous step.
        stepperService.update(stepper); // Tell the service to update the UI.
    });

    // Wire up the 'Submit' button.
    submitButton.addEventListener("click", (e) => {
        e.preventDefault(); // Prevent the default browser form submission.
        
        // This is a key architectural choice: instead of handling submission here,
        // we delegate it to a custom '.submit()' method on the parent form.
        // This allows form-specific logic (like in AddPersonalityForm.component.js).
        if (form && typeof form.submit === 'function') {
            form.submit();
        } else {
            console.error("The parent form does not have a custom .submit() method.", form);
        }
    });
}
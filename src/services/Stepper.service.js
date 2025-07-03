/**
 * Finds all stepper elements on the page and initializes them.
 * Each stepper object contains a reference to its DOM element and its current step index.
 * @type {Array<{element: HTMLElement, step: number}>}
 */
const steppers = [...document.querySelectorAll(".stepper")].map((element) => ({ element: element, step: 0 }));

/**
 * Updates the visual state of a stepper to display the correct step.
 * It hides all other steps and adds/removes classes for styling the first/last steps.
 * @param {{element: HTMLElement, step: number}} stepper - The stepper object to update.
 */
export function update(stepper) {
    const steps = stepper.element.querySelectorAll(".step");
    // Clamp the step index to be within the valid range of available steps.
    stepper.step = Math.max(0, Math.min(stepper.step, steps.length - 1));

    // Add helper classes to the main stepper element for CSS styling (e.g., to hide 'Prev' on step 0).
    stepper.element.classList.toggle("first-step", stepper.step === 0);
    stepper.element.classList.toggle("final-step", stepper.step === steps.length - 1);
    
    // Show the active step and hide all others.
    for (let i = 0; i < steps.length; i++) {
        if (i !== stepper.step) {
            steps[i].classList.remove("active");
        } else {
            steps[i].classList.add("active");
        }
    }
}

/**
 * Retrieves a specific step element from a stepper by its index.
 * @param {{element: HTMLElement, step: number}} stepper - The stepper object.
 * @param {number} index - The index of the step to retrieve.
 * @returns {HTMLElement} The step element at the given index.
 */
export function getStep(stepper, index){
    return stepper.element.querySelectorAll(".step")[index];
}

/**
 * Finds and returns a specific stepper object by its element ID.
 * @param {string} id - The ID of the stepper's root element.
 * @returns {{element: HTMLElement, step: number}|undefined} The stepper object or undefined if not found.
 */
export function get(id) {
    return steppers.find(stepper => stepper.element.id === id);
}

/**
 * Returns the array of all initialized stepper objects.
 * @returns {Array<{element: HTMLElement, step: number}>} The array of all steppers.
 */
export function getAll(){
    return steppers;
}
// src/components/TemperatureSlider.component.js

// --- DOM ELEMENT SELECTION ---
const temperatureSlider = document.querySelector("#temperature");
const temperatureValueLabel = document.querySelector("#label-temperature");

// --- FUNCTIONS ---

/**
 * Updates the text label to match the slider's current value.
 * The slider's value is an integer (e.g., 70), which is divided by 100
 * to display it as a decimal (e.g., 0.7) for the user.
 */
function updateLabel() {
    const sliderValue = temperatureSlider.value;
    temperatureValueLabel.textContent = (sliderValue / 100).toFixed(2);
}

// --- EVENT LISTENERS ---

// Listen for the 'input' event, which fires continuously as the user drags the slider.
temperatureSlider.addEventListener("input", updateLabel);

// --- INITIALIZATION ---

// Set the initial value of the label when the page first loads.
updateLabel();
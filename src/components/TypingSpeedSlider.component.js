// --- Typing Speed Slider Component ---

const typingSpeedSlider = document.querySelector("#typingSpeed");
const typingSpeedLabel = document.querySelector("#label-typingSpeed");

function updateTypingSpeedLabel() {
    // We are inverting the value for display so that left is "slow" and right is "fast"
    const displayValue = 150 - Number(typingSpeedSlider.value);
    typingSpeedLabel.textContent = `${displayValue}ms`;
}

// Check if the elements exist before adding listeners
if (typingSpeedSlider && typingSpeedLabel) {
    // Update the label when the page first loads
    updateTypingSpeedLabel();
    
    // Update the label whenever the slider is moved
    typingSpeedSlider.addEventListener("input", updateTypingSpeedLabel);
}
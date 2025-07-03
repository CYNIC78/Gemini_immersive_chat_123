// src/components/Tooltip.component.js

// --- IMPORTS ---
// Import the core Tippy.js functionality.
import tippy from 'tippy.js';
// Import the necessary CSS for default styling and the chosen theme.
import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/material.css';

// --- INITIALIZATION ---

// Select all elements on the page that are designated to have a tooltip.
// In our HTML, these are elements with class="tooltip".
const tooltipElements = document.querySelectorAll('.tooltip');

// Iterate over each found element to initialize its tooltip.
for (const element of tooltipElements) {
    // Use the tippy() function to create a tooltip instance for the element.
    tippy(element, {
        // The text content of the tooltip is read from the 'info' attribute
        // of the HTML element. e.g., <button class="tooltip" info="Click me!">
        content: element.getAttribute("info"),

        // Apply a pre-defined visual style.
        theme: "material",

        // Position the tooltip above the element.
        placement: "top",

        // Include a small pointer arrow.
        arrow: true,
    });
}
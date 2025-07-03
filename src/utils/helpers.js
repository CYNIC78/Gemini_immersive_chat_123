import DOMPurify from 'dompurify';
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { getSettings } from '../services/Settings.service.js';

/**
 * This file contains generic helper functions used throughout the application.
 */

/**
 * Hides an element with a fade-out animation.
 * @param {HTMLElement} element - The DOM element to hide.
 */
export function hideElement(element) {
    if (!element) return;
    
    element.style.transition = 'opacity 0.2s ease-out';
    element.style.opacity = '0';
    // After the transition finishes, set display to none.
    setTimeout(() => {
        element.style.display = 'none';
    }, 200);
}

/**
 * Shows an element with a fade-in animation.
 * @param {HTMLElement} element - The DOM element to show.
 * @param {boolean} wait - If true, waits for the hide animation to finish before starting.
 */
export function showElement(element, wait) {
    if (!element) return;
    
    const timeToWait = wait ? 200 : 0;

    setTimeout(() => {
        element.style.display = 'flex'; // Or 'block', 'flex' is more common for our layouts.
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.2s ease-in';
        
        // Using requestAnimationFrame ensures the 'display' change is rendered before the opacity transition starts.
        requestAnimationFrame(() => {
            element.style.opacity = '1';
        });
    }, timeToWait);
}

/**
 * Applies a darkening overlay to a card's background image.
 * NOTE: This is brittle and assumes the background-image is a single URL.
 * @param {HTMLElement} element - The card element.
 */
export function darkenCard(element) {
    const bgImageMatch = element.style.backgroundImage.match(/url\((.*?)\)/);
    if (!bgImageMatch) return;
    const imageUrl = bgImageMatch[1].replace(/('|")/g, '');
    element.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${imageUrl}')`;
}

/**
 * Removes the darkening overlay from a card's background image.
 * NOTE: This is brittle and assumes the background-image started as a single URL.
 * @param {HTMLElement} element - The card element.
 */
export function lightenCard(element) {
    const bgImageMatch = element.style.backgroundImage.match(/url\((.*?)\)/);
    if (!bgImageMatch) return;
    const imageUrl = bgImageMatch[1].replace(/('|")/g, '');
    element.style.backgroundImage = `url('${imageUrl}')`;
}

/**
 * Returns the current hardcoded application version.
 * @returns {string} The application version.
 */
export function getVersion(){
    return "0.9.6";
}

/**
 * Sanitizes an HTML string to prevent XSS attacks.
 * @param {string} string - The potentially unsafe HTML string.
 * @returns {string} The sanitized HTML string.
 */
export function getSanitized(string) {
    return DOMPurify.sanitize(string.trim());
}

/**
 * Helper to convert HTML entities back to characters.
 * @param {string} innerHTML - HTML string with entities like <.
 * @returns {string} String with characters like <.
 */
function getUnescaped(innerHTML){
    return innerHTML.replace(/</g, "<").replace(/>/g, ">").replace(/&/g, "&");
}

/**
 * Helper to convert <br> tags to newline characters.
 * @param {string} innerHTML - HTML string with <br> tags.
 * @returns {string} String with \n characters.
 */
function getMdNewLined(innerHTML){
    return innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/\n{2,}/g, "\n");
}

/**
 * Converts rich text from a contenteditable element into a clean, plain text format for API submission.
 * @param {string} innerHTML - The innerHTML from an editable element.
 * @returns {string} A clean string with newlines.
 */
export function getEncoded(innerHTML){
    return getUnescaped(getMdNewLined(innerHTML)).trim();
}

/**
 * Converts a plain text string (with newlines) into displayable HTML using Markdown.
 * @param {string} encoded - The plain text string.
 * @returns {string} An HTML string parsed from Markdown.
 */
export function getDecoded(encoded){
    const reEscaped = encoded.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
    return marked.parse(reEscaped, { breaks: true });
}

/**

 * Scrolls the message container to the very bottom if autoscroll is enabled.
 */
export function messageContainerScrollToBottom(){
    if (!getSettings().autoscroll) {
        return;
    }
    const container = document.querySelector(".message-container");
    // Setting scrollTop to scrollHeight is the most direct way to scroll to the bottom.
    container.scrollTop = container.scrollHeight;
}
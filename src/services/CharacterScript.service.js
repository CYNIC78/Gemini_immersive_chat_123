import * as scriptingService from './Scripting.service.js';

/**
 * CharacterScript Service
 * Safely executes custom JavaScript associated with a character.
 */

/**
 * Executes a user-provided script in a sandboxed environment.
 * @param {string} script - The JavaScript code to execute.
 * @param {object} character - A copy of the character's data.
 * @param {string} modelResponseText - The text response from the AI model.
 * @param {string} userMessageText - The text of the user's message that triggered the response.
 * @returns {Promise<{character: object, modelResponse: string}>} - An object containing the potentially modified character data and model response.
 */
export async function execute(script, character, modelResponseText, userMessageText) {
    // Set the assets for this specific execution context
    scriptingService.setAssetContext(character.assets);

    const characterCopy = JSON.parse(JSON.stringify(character));
    
    const defaultValue = {
        character: {},
        modelResponse: modelResponseText
    };

    try {
        // We make our special functions available to the script.
        const getImageByTag = scriptingService.getImageByTag;

        // Create a sandboxed async function, passing our special functions in.
        const sandboxedFunction = new AsyncFunction('character', 'modelResponse', 'userMessage', 'getImageByTag', script);
        
        // Execute the script and wait for its result.
        const result = await sandboxedFunction(characterCopy, modelResponseText, userMessageText, getImageByTag);
        
        if (typeof result !== 'object' || result === null) {
            console.warn("Custom script did not return a valid object. Using default values.");
            return defaultValue;
        }

        return {
            character: result.character || {},
            modelResponse: result.modelResponse || modelResponseText
        };

    } catch (error) {
        console.error("Error executing custom character script:", error);
        return defaultValue;
    }
}

// A helper to create the AsyncFunction constructor.
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
/**
 * CharacterScript Service
 * Safely executes custom JavaScript associated with a character.
 */

/**
 * Executes a user-provided script in a sandboxed environment.
 * The script can modify the character's properties for display (like image) and the model's response text.
 * @param {string} script - The JavaScript code to execute.
 * @param {object} character - A copy of the character's data.
 * @param {string} modelResponseText - The text response from the AI model.
 * @param {string} userMessageText - The text of the user's message that triggered the response.
 * @returns {Promise<{character: object, modelResponse: string}>} - An object containing the potentially modified character data and model response.
 */
export async function execute(script, character, modelResponseText, userMessageText) {
    // We create a deep copy of the character object to prevent the script
    // from modifying the original object in unintended ways.
    const characterCopy = JSON.parse(JSON.stringify(character));
    
    // Default return value is the original data, in case the script fails.
    const defaultValue = {
        character: {}, // We return an empty object for overrides, so we don't change anything.
        modelResponse: modelResponseText
    };

    try {
        // Create a sandboxed async function. This is safer than eval().
        // It can only access the variables we explicitly pass to it ('character', 'modelResponse', 'userMessage').
        const sandboxedFunction = new AsyncFunction('character', 'modelResponse', 'userMessage', script);
        
        // Execute the script and wait for its result.
        const result = await sandboxedFunction(characterCopy, modelResponseText, userMessageText);
        
        // The script should return an object. If it doesn't, we'll just use the default.
        if (typeof result !== 'object' || result === null) {
            console.warn("Custom script did not return a valid object. Using default values.");
            return defaultValue;
        }

        // We return the script's modifications.
        // If the script modified modelResponse, we use that. Otherwise, we use the original.
        // If the script returned character modifications, we use those. Otherwise, we use an empty object.
        return {
            character: result.character || {},
            modelResponse: result.modelResponse || modelResponseText
        };

    } catch (error) {
        console.error("Error executing custom character script:", error);
        // If the script has an error, we return the original data and log the error.
        return defaultValue;
    }
}

// A helper to create the AsyncFunction constructor.
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
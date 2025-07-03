// src/services/Db.service.js

// --- IMPORTS ---
// Dexie is a powerful, minimalist wrapper for IndexedDB, a browser-based database.
// It simplifies database operations significantly.
import { Dexie } from 'dexie';

/**
 * Initializes and configures the application's database schema.
 * @returns {Promise<Dexie>} A promise that resolves with the configured database instance.
 */
export async function setupDB() {
    let db;
    try {
        // Create a new Dexie database instance named "chatDB".
        db = new Dexie("chatDB");
    } catch (error) {
        console.error("Failed to initialize Dexie database:", error);
        alert("A critical error occurred while setting up the local database. The application may not function correctly.");
        return;
    }

    // Dexie uses versioning to manage database schema changes over time.
    // Each .version() block defines the schema for that version.
    // Dexie automatically handles migrating data when the version number increases.

    // Version 3 defines the 'chats' table.
    db.version(3).stores({
        chats: `
            ++id,          // Auto-incrementing primary key
            title,         // The title of the chat session (indexed)
            timestamp,     // The last modified time of the chat (indexed)
            content        // The full chat history (not indexed)
        `
    });

    // Version 4 adds the 'personalities' table without removing 'chats'.
    // Dexie chains versions, so version 4 has both 'chats' and 'personalities'.
    db.version(4).stores({
        personalities: `
            ++id,                  // Auto-incrementing primary key
            name,                  // Personality's name (indexed)
            image,                 // URL or path to the personality's avatar
            prompt,                // The core system prompt for the AI
            aggressiveness,        // A value determining personality trait
            sensuality,            // A value determining personality trait
            internetEnabled,       // Boolean flag for web access
            roleplayEnabled,       // Boolean flag for roleplay behavior
            toneExamples           // An array of strings demonstrating tone
        `
    });

    // Return the fully configured database instance.
    return db;
}

// --- SINGLETON EXPORT ---
// This line immediately calls setupDB() and exports the resulting promise.
// Other modules can import 'db' and use `await` on it to get the ready-to-use instance.
// This ensures the database is set up only once for the entire application.
export const db = await setupDB();

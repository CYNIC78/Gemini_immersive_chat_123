export class Personality {
    constructor(
        name = "", 
        image = "", 
        description = "", 
        prompt = "", 
        scenario = "", 
        firstMessagePrompt = "", 
        reminder = "", 
        aggressiveness = 0, 
        sensuality = 0, 
        internetEnabled = false, 
        roleplayEnabled = false, 
        toneExamples = [],
        customScript = "" // NEW: Added custom script property
        ) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.scenario = scenario; // New: Sets the scene for the chat's beginning
        this.firstMessagePrompt = firstMessagePrompt; // New: Instructs the AI on the first message
        this.reminder = reminder; // New: Hidden instruction sent with every message
        this.aggressiveness = aggressiveness;
        this.sensuality = sensuality;
        this.internetEnabled = internetEnabled;
        this.roleplayEnabled = roleplayEnabled;
        this.toneExamples = toneExamples;
        this.customScript = customScript; // NEW: Added custom script property
    }
}
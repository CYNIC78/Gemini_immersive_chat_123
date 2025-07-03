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
        customScript = "",
        assets = [] // NEW: An array to hold media assets
        ) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.scenario = scenario;
        this.firstMessagePrompt = firstMessagePrompt;
        this.reminder = reminder;
        this.aggressiveness = aggressiveness;
        this.sensuality = sensuality;
        this.internetEnabled = internetEnabled;
        this.roleplayEnabled = roleplayEnabled;
        this.toneExamples = toneExamples;
        this.customScript = customScript;
        this.assets = assets; // NEW: Assign the assets array
    }
}
export class Personality {
    constructor(
        name = "", 
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
        assets = [],
        defaultAvatarTag = "default" // NEW: Default avatar tag
        ) {
        this.name = name;
        // this.image is no longer needed here as it's derived from assets
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
        this.assets = assets;
        this.defaultAvatarTag = defaultAvatarTag; // NEW
    }
}
var StatsProvider = Java.type(
    "com.dragonminez.common.stats.StatsProvider"
);

var StatsCapability = Java.type(
    "com.dragonminez.common.stats.StatsCapability"
);

var NpcAPI = Java.type(
    "noppes.npcs.api.NpcAPI"
);

var System = Java.type(
    "java.lang.System"
);


/*
 * ============================================================
 * GENERAL SETTINGS
 * ============================================================
 */

var HARD_MAX_POTENTIAL = 30;
var MAX_LEVEL_10 = 10;

var POTENTIAL_UNLOCK = "potentialunlock";
var FLY = "fly";
var MEDITATION = "meditation";
var KI_CONTROL = "kicontrol";
var KI_MANIPULATION = "kimanipulation";
var KI_SENSE = "kisense";
var JUMP = "jump";
var SPRINT = "sprint";

var DEFENSE_PENETRATION = "defense_penetration";
var HEALING_REDUCTION = "healing_reduction";
var INSTANT_TRANSMISSION = "instant_transmission";
var KI_INFUSION = "ki_infusion";
var KI_BOOST = "kiboost";
var KI_PROTECTION = "kiprotection";

var MAX_SAME_METHOD_STREAK = 5;


/*
 * Must match the storage world used by the Meditation script.
 */
var MEDITATION_STORAGE_WORLD = "overworld";

var KEY_TRIAL_INDEX =
    "med2_global_trial_index";

var KEY_TRIAL_END =
    "med2_global_trial_end";


/*
 * ============================================================
 * COLORS
 *
 * Unicode color codes prevent broken \u00A7 symbols and random text.
 * ============================================================
 */

var C_RESET = "\u00A7r";
var C_DARK_GRAY = "\u00A78";
var C_GRAY = "\u00A77";
var C_WHITE = "\u00A7f";
var C_GOLD = "\u00A76";
var C_YELLOW = "\u00A7e";
var C_GREEN = "\u00A7a";
var C_AQUA = "\u00A7b";
var C_DARK_AQUA = "\u00A73";
var C_BLUE = "\u00A79";
var C_PURPLE = "\u00A75";
var C_LIGHT_PURPLE = "\u00A7d";
var C_RED = "\u00A7c";
var C_DARK_RED = "\u00A74";
var C_BOLD = "\u00A7l";


/*
 * ============================================================
 * SKILL REQUIREMENTS
 * ============================================================
 */

var MEDITATION_REQUIRED_SECONDS = {
    2: 30,
    3: 60,
    4: 120,
    5: 240,
    6: 360,
    7: 480,
    8: 600,
    9: 720,
    10: 900
};

var FLY_LEVEL_SECONDS = {
    2: 60,
    3: 300,
    4: 600,
    5: 1800,
    6: 3600,
    7: 5400,
    8: 7200,
    9: 9000,
    10: 10800
};

var STRENGTH_REQUIREMENTS = {
    1: 20,
    2: 100,
    3: 250,
    4: 500,
    5: 1000,
    6: 1500,
    7: 2000,
    8: 2500,
    9: 3000,
    10: 3500
};


/*
 * ============================================================
 * MEDITATION TRIALS
 *
 * This list must match the Meditation progression script.
 * ============================================================
 */

var MEDITATION_TRIALS = [
    {
        id: "minecraft:plains",
        name: "Plains",
        dimension: "Overworld",
        requirement:
            "Sneak while actively charging Ki below 50% Ki."
    },

    {
        id: "minecraft:desert",
        name: "Desert",
        dimension: "Overworld",
        requirement:
            "Actively charge Ki during daytime while below 40% Ki."
    },

    {
        id: "minecraft:snowy_plains",
        name: "Snowy Plains",
        dimension: "Overworld",
        requirement:
            "Sneak above Y 80 while actively charging Ki."
    },

    {
        id: "minecraft:nether_wastes",
        name: "Nether Wastes",
        dimension: "Nether",
        requirement:
            "Actively charge Ki below Y 64 while below 40% Ki."
    },

    {
        id: "minecraft:warped_forest",
        name: "Warped Forest",
        dimension: "Nether",
        requirement:
            "Sneak and remain within a 1.5-block radius while charging."
    },

    {
        id: "minecraft:soul_sand_valley",
        name: "Soul Sand Valley",
        dimension: "Nether",
        requirement:
            "Remain within 1 block and take no damage for 12 seconds while charging."
    },

    {
        id: "dragonminez:ajissa_plains",
        name: "Ajissa Plains",
        dimension: "Namek",
        requirement:
            "Sneak while actively charging Ki below 50% Ki."
    },

    {
        id: "dragonminez:namekian_rivers",
        name: "Namekian Rivers",
        dimension: "Namek",
        requirement:
            "Remain near water while actively charging Ki below 50% Ki."
    },

    {
        id: "dragonminez:sacredkai_hills",
        name: "Sacred Kai Hills",
        dimension: "Sacred Kai World",
        requirement:
            "Actively charge Ki above Y 90 without damage for 10 seconds."
    },

    {
        id: "dragonminez:hyperbolic_time_chamber",
        name: "Hyperbolic Time Chamber",
        dimension: "HTC",
        requirement:
            "Remain within 1.5 blocks for 10 seconds while charging below 30% Ki."
    }
];


/*
 * ============================================================
 * SAFE DMZ HELPERS
 * ============================================================
 */

function getSkillLevelSafe(
    skills,
    skillId
) {
    try {
        var level = Number(
            skills.getSkillLevel(skillId)
        );

        if (!isNaN(level)) {
            return level;
        }

    } catch (err) {}

    return 0;
}


function getSkillMaxSafe(
    skills,
    skillId,
    fallbackMax
) {
    try {
        var max = Number(
            skills.getMaxSkillLevel(skillId)
        );

        if (
            !isNaN(max) &&
            max > 0
        ) {
            return max;
        }

    } catch (err) {}

    return fallbackMax;
}


/*
 * ============================================================
 * STORED-DATA HELPERS
 * ============================================================
 */

function parseStoredInt(
    stored,
    key
) {
    try {
        if (
            stored != null &&
            stored.has(key)
        ) {
            var value = parseInt(
                "" + stored.get(key)
            );

            if (!isNaN(value)) {
                return value;
            }
        }

    } catch (err) {}

    return 0;
}


function readStoredNumber(
    stored,
    key,
    fallback
) {
    try {
        if (
            stored != null &&
            stored.has(key)
        ) {
            var value = Number(
                "" + stored.get(key)
            );

            if (!isNaN(value)) {
                return value;
            }
        }

    } catch (err) {}

    return fallback;
}


/*
 * ============================================================
 * TIME FORMATTING
 * ============================================================
 */

function formatTime(seconds) {
    seconds = Math.floor(
        Number(seconds)
    );

    if (
        isNaN(seconds) ||
        seconds < 0
    ) {
        seconds = 0;
    }

    var hours = Math.floor(
        seconds / 3600
    );

    var minutes = Math.floor(
        (seconds % 3600) / 60
    );

    var secs =
        seconds % 60;

    if (hours > 0) {
        return (
            hours +
            "h " +
            minutes +
            "m " +
            secs +
            "s"
        );
    }

    if (minutes > 0) {
        return (
            minutes +
            "m " +
            secs +
            "s"
        );
    }

    return secs + "s";
}


function formatMilliseconds(milliseconds) {
    milliseconds = Math.max(
        0,
        Number(milliseconds)
    );

    return formatTime(
        Math.ceil(
            milliseconds / 1000
        )
    );
}


/*
 * ============================================================
 * GLOBAL MEDITATION TRIAL
 * ============================================================
 */

function getMeditationGlobalData(player) {
    var api = null;
    var world = null;

    try {
        api = NpcAPI.Instance();
    } catch (apiErr) {}

    if (api != null) {
        try {
            world = api.getIWorld("minecraft:overworld");
        } catch (err1) {}

        if (world == null) {
            try {
                world = api.getIWorld("overworld");
            } catch (err2) {}
        }

        if (world == null) {
            try {
                var worlds = api.getIWorlds();
                if (worlds != null && worlds.length > 0) {
                    world = worlds[0];
                }
            } catch (err3) {}
        }
    }

    if (world == null && player != null) {
        try {
            world = player.getWorld();
        } catch (err4) {}
    }

    if (world == null) {
        return null;
    }

    try {
        return world.getStoreddata();
    } catch (storedErr) {
        return null;
    }
}


function getCurrentMeditationTrial(player) {
    try {
        var globalStored =
            getMeditationGlobalData(player);

        if (globalStored == null) {
            return null;
        }

        var trialIndex = Math.floor(
            readStoredNumber(
                globalStored,
                KEY_TRIAL_INDEX,
                -1
            )
        );

        var endTime =
            readStoredNumber(
                globalStored,
                KEY_TRIAL_END,
                0
            );

        if (
            trialIndex < 0 ||
            trialIndex >= MEDITATION_TRIALS.length ||
            endTime <= System.currentTimeMillis()
        ) {
            return null;
        }

        return {
            trial:
                MEDITATION_TRIALS[
                    trialIndex
                ],

            endTime:
                endTime,

            remaining:
                Math.max(
                    0,
                    endTime -
                    System.currentTimeMillis()
                )
        };

    } catch (err) {
        return null;
    }
}


/*
 * ============================================================
 * LOCKED SAGA SKILL DISPLAY
 * ============================================================
 */

function showLockedSagaSkill(
    player,
    skills,
    skillId,
    displayName,
    color,
    fallbackMax,
    unlockMessage
) {
    var level =
        getSkillLevelSafe(
            skills,
            skillId
        );

    var max =
        getSkillMaxSafe(
            skills,
            skillId,
            fallbackMax
        );

    if (level < 1) {
        player.message(
            color +
            displayName +
            C_GRAY +
            ": " +
            C_WHITE +
            "0/" +
            max
        );

        player.message(
            C_DARK_GRAY +
            "  - " +
            C_GRAY +
            unlockMessage
        );

        return;
    }

    if (level >= max) {
        player.message(
            color +
            displayName +
            C_GRAY +
            ": " +
            C_GOLD +
            C_BOLD +
            "MAX" +
            C_RESET +
            C_GRAY +
            " (" +
            level +
            "/" +
            max +
            ")"
        );

        return;
    }

    player.message(
        color +
        displayName +
        C_GRAY +
        ": " +
        C_WHITE +
        level +
        "/" +
        max
    );
}


/*
 * ============================================================
 * STRENGTH SKILL DISPLAY
 * ============================================================
 */

function showStrengthSkill(
    player,
    skills,
    skillId,
    displayName,
    color,
    strength
) {
    var level =
        getSkillLevelSafe(
            skills,
            skillId
        );

    var max =
        getSkillMaxSafe(
            skills,
            skillId,
            MAX_LEVEL_10
        );

    if (max > MAX_LEVEL_10) {
        max = MAX_LEVEL_10;
    }

    if (level >= max) {
        player.message(
            color +
            displayName +
            C_GRAY +
            ": " +
            C_GOLD +
            C_BOLD +
            "MAX" +
            C_RESET +
            C_GRAY +
            " (" +
            level +
            "/" +
            max +
            ")"
        );

        return;
    }

    var next =
        level + 1;

    var required =
        STRENGTH_REQUIREMENTS[next];

    if (required == null) {
        player.message(
            color +
            displayName +
            C_GRAY +
            ": " +
            C_WHITE +
            level +
            "/" +
            max
        );

        return;
    }

    var remaining =
        required -
        strength;

    if (remaining < 0) {
        remaining = 0;
    }

    player.message(
        color +
        displayName +
        C_GRAY +
        ": " +
        C_WHITE +
        level +
        "/" +
        max +
        C_DARK_GRAY +
        " -> " +
        C_GRAY +
        "Level " +
        C_WHITE +
        next
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Requires STR: " +
        C_WHITE +
        required +
        C_DARK_GRAY +
        " | " +
        C_GRAY +
        "Remaining: " +
        C_WHITE +
        remaining
    );
}


/*
 * ============================================================
 * POTENTIAL DISPLAY
 * ============================================================
 */

function showPotential(
    player,
    skills,
    stored
) {
    var level =
        getSkillLevelSafe(
            skills,
            POTENTIAL_UNLOCK
        );

    if (
        level >=
        HARD_MAX_POTENTIAL
    ) {
        player.message(
            C_PURPLE +
            "Potential Unlock" +
            C_GRAY +
            ": " +
            C_GOLD +
            C_BOLD +
            "MAX" +
            C_RESET +
            C_GRAY +
            " (" +
            level +
            "/" +
            HARD_MAX_POTENTIAL +
            ")"
        );

        return;
    }

    if (level == 10) {
        player.message(
            C_PURPLE +
            "Potential Unlock" +
            C_GRAY +
            ": " +
            C_WHITE +
            "10/" +
            HARD_MAX_POTENTIAL
        );

        player.message(
            C_DARK_GRAY +
            "  - " +
            C_YELLOW +
            "Speak to Guru to unlock level 11."
        );

        return;
    }

    var next =
        level + 1;

    var required =
        next * 100;

    var progressKey =
        "potentialunlock_points_to_level_" +
        next;

    var progress =
        parseStoredInt(
            stored,
            progressKey
        );

    var remaining =
        required -
        progress;

    if (remaining < 0) {
        remaining = 0;
    }

    var lastMethod =
        stored.has(
            "potentialunlock_last_method"
        )
            ? String(
                stored.get(
                    "potentialunlock_last_method"
                )
            )
            : "none";

    var streak =
        parseStoredInt(
            stored,
            "potentialunlock_same_method_streak"
        );

    player.message(
        C_PURPLE +
        "Potential Unlock" +
        C_GRAY +
        ": " +
        C_WHITE +
        level +
        "/" +
        HARD_MAX_POTENTIAL +
        C_DARK_GRAY +
        " -> " +
        C_GRAY +
        "Level " +
        C_WHITE +
        next
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Progress: " +
        C_WHITE +
        progress +
        "/" +
        required +
        C_DARK_GRAY +
        " | " +
        C_GRAY +
        "Remaining: " +
        C_WHITE +
        remaining
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Method: " +
        C_WHITE +
        lastMethod +
        C_DARK_GRAY +
        " | " +
        C_GRAY +
        "Streak: " +
        C_WHITE +
        streak +
        "/" +
        MAX_SAME_METHOD_STREAK
    );
}


/*
 * ============================================================
 * FLIGHT DISPLAY
 * ============================================================
 */

function showFlight(
    player,
    skills,
    stored
) {
    var level =
        getSkillLevelSafe(
            skills,
            FLY
        );

    var max =
        getSkillMaxSafe(
            skills,
            FLY,
            MAX_LEVEL_10
        );

    if (max > MAX_LEVEL_10) {
        max = MAX_LEVEL_10;
    }

    if (level < 1) {
        player.message(
            C_AQUA +
            "Flight" +
            C_GRAY +
            ": " +
            C_WHITE +
            "0/" +
            max
        );

        player.message(
            C_DARK_GRAY +
            "  - " +
            C_GRAY +
            "Complete the " +
            C_GOLD +
            "Saga Story" +
            C_GRAY +
            " to unlock Flight."
        );

        return;
    }

    if (level >= max) {
        player.message(
            C_AQUA +
            "Flight" +
            C_GRAY +
            ": " +
            C_GOLD +
            C_BOLD +
            "MAX" +
            C_RESET +
            C_GRAY +
            " (" +
            level +
            "/" +
            max +
            ")"
        );

        return;
    }

    var next =
        level + 1;

    var required =
        FLY_LEVEL_SECONDS[next];

    if (required == null) {
        required = 0;
    }

    var progressKey =
        "fly_training_progress_to_level_" +
        next;

    var progress =
        parseStoredInt(
            stored,
            progressKey
        );

    /*
     * Converts older millisecond progress values.
     */
    if (
        required > 0 &&
        progress >
            required * 100
    ) {
        progress =
            Math.floor(
                progress / 1000
            );
    }

    var remaining =
        required -
        progress;

    if (remaining < 0) {
        remaining = 0;
    }

    player.message(
        C_AQUA +
        "Flight" +
        C_GRAY +
        ": " +
        C_WHITE +
        level +
        "/" +
        max +
        C_DARK_GRAY +
        " -> " +
        C_GRAY +
        "Level " +
        C_WHITE +
        next
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Training: " +
        C_WHITE +
        formatTime(progress) +
        "/" +
        formatTime(required) +
        C_DARK_GRAY +
        " | " +
        C_GRAY +
        "Remaining: " +
        C_WHITE +
        formatTime(remaining)
    );
}


/*
 * ============================================================
 * MEDITATION TRIAL DISPLAY
 * ============================================================
 */

function showCurrentMeditationTrial(player) {
    var trialData =
        getCurrentMeditationTrial(player);

    if (trialData == null) {
        player.message(
            C_DARK_GRAY +
            "  - " +
            C_RED +
            "No active Meditation Trial is currently available."
        );

        player.message(
            C_DARK_GRAY +
            "  - " +
            C_GRAY +
            "The trial initializes when the Meditation script begins ticking."
        );

        return;
    }

    var trial =
        trialData.trial;

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_LIGHT_PURPLE +
        C_BOLD +
        "Current Trial" +
        C_RESET +
        C_GRAY +
        ": " +
        C_WHITE +
        trial.name
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Region: " +
        C_AQUA +
        trial.dimension
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Biome ID: " +
        C_DARK_AQUA +
        trial.id
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_YELLOW +
        "Requirement: " +
        C_WHITE +
        trial.requirement
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Focus Rule: " +
        C_WHITE +
        "Release and restart Ki charging every 10 seconds."
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Trial Changes In: " +
        C_GREEN +
        formatMilliseconds(
            trialData.remaining
        )
    );
}


/*
 * ============================================================
 * MEDITATION DISPLAY
 * ============================================================
 */

function showMeditation(
    player,
    skills,
    stored
) {
    var level =
        getSkillLevelSafe(
            skills,
            MEDITATION
        );

    var max =
        getSkillMaxSafe(
            skills,
            MEDITATION,
            MAX_LEVEL_10
        );

    if (max > MAX_LEVEL_10) {
        max = MAX_LEVEL_10;
    }

    if (level < 1) {
        player.message(
            C_LIGHT_PURPLE +
            "Meditation" +
            C_GRAY +
            ": " +
            C_WHITE +
            "0/" +
            max
        );

        player.message(
            C_DARK_GRAY +
            "  - " +
            C_GRAY +
            "Complete the " +
            C_GOLD +
            "Saga Story" +
            C_GRAY +
            " to unlock Meditation."
        );

        showCurrentMeditationTrial(
            player
        );

        return;
    }

    if (level >= max) {
        player.message(
            C_LIGHT_PURPLE +
            "Meditation" +
            C_GRAY +
            ": " +
            C_GOLD +
            C_BOLD +
            "MAX" +
            C_RESET +
            C_GRAY +
            " (" +
            level +
            "/" +
            max +
            ")"
        );

        showCurrentMeditationTrial(
            player
        );

        return;
    }

    var next =
        level + 1;

    var required =
        MEDITATION_REQUIRED_SECONDS[next];

    if (required == null) {
        required =
            next * 120;
    }

    var progressKey =
        "meditation_restore_progress_to_level_" +
        next;

    var progress =
        parseStoredInt(
            stored,
            progressKey
        );

    var remaining =
        required -
        progress;

    if (remaining < 0) {
        remaining = 0;
    }

    player.message(
        C_LIGHT_PURPLE +
        "Meditation" +
        C_GRAY +
        ": " +
        C_WHITE +
        level +
        "/" +
        max +
        C_DARK_GRAY +
        " -> " +
        C_GRAY +
        "Level " +
        C_WHITE +
        next
    );

    player.message(
        C_DARK_GRAY +
        "  - " +
        C_GRAY +
        "Progress: " +
        C_WHITE +
        formatTime(progress) +
        "/" +
        formatTime(required) +
        C_DARK_GRAY +
        " | " +
        C_GRAY +
        "Remaining: " +
        C_WHITE +
        formatTime(remaining)
    );

    showCurrentMeditationTrial(
        player
    );
}


/*
 * ============================================================
 * NPC INTERACTION
 * ============================================================
 */

function interact(event) {
    var player =
        event.player;

    if (player == null) {
        return;
    }

    try {
        var mcPlayer =
            player.getMCEntity();

        var data =
            StatsProvider
                .get(
                    StatsCapability.INSTANCE,
                    mcPlayer
                )
                .orElse(null);

        if (data == null) {
            player.message(
                C_RED +
                "[Skill Progress] ERROR: No DMZ data found."
            );

            return;
        }

        var skills =
            data.getSkills();

        if (skills == null) {
            player.message(
                C_RED +
                "[Skill Progress] ERROR: No DMZ skill data found."
            );

            return;
        }

        var stored =
            player.getStoreddata();

        var dmzLevel =
            Number(
                data.getLevel()
            );

        var kiDamage =
            Number(
                data.getKiDamage()
            );

        var maxEnergy =
            Number(
                data.getMaxEnergy()
            );

        var strength = 0;

        try {
            strength =
                Number(
                    data
                        .getStats()
                        .getStrength()
                );

        } catch (statErr) {}


        /*
         * ====================================================
         * HEADER
         * ====================================================
         */

        player.message(
            C_GOLD +
            C_BOLD +
            "------ Skill Progress ------" +
            C_RESET
        );

        player.message(
            C_GRAY +
            "DMZ Level: " +
            C_WHITE +
            dmzLevel +
            C_DARK_GRAY +
            " | " +
            C_GRAY +
            "Ki Damage: " +
            C_WHITE +
            kiDamage
        );

        player.message(
            C_GRAY +
            "Max Energy: " +
            C_WHITE +
            maxEnergy +
            C_DARK_GRAY +
            " | " +
            C_GRAY +
            "Strength: " +
            C_WHITE +
            strength
        );

        player.message(
            C_DARK_GRAY +
            "----------------------------"
        );


        /*
         * ====================================================
         * CORE SKILLS
         * ====================================================
         */

        player.message(
            C_GOLD +
            C_BOLD +
            "Core Skills" +
            C_RESET
        );

        showPotential(
            player,
            skills,
            stored
        );

        showFlight(
            player,
            skills,
            stored
        );

        showMeditation(
            player,
            skills,
            stored
        );

        showLockedSagaSkill(
            player,
            skills,
            KI_CONTROL,
            "Ki Control",
            C_AQUA,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Ki Control."
        );

        showLockedSagaSkill(
            player,
            skills,
            KI_MANIPULATION,
            "Ki Manipulation",
            C_LIGHT_PURPLE,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Ki Manipulation."
        );

        showLockedSagaSkill(
            player,
            skills,
            KI_SENSE,
            "Ki Sense",
            C_BLUE,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Ki Sense."
        );

        showStrengthSkill(
            player,
            skills,
            JUMP,
            "Jump",
            C_GREEN,
            strength
        );

        showStrengthSkill(
            player,
            skills,
            SPRINT,
            "Sprint",
            C_YELLOW,
            strength
        );


        /*
         * ====================================================
         * DRAGONMINEZ 2.1 SKILLS
         * ====================================================
         */

        player.message(
            C_DARK_GRAY +
            "----------------------------"
        );

        player.message(
            C_GOLD +
            C_BOLD +
            "DragonMineZ 2.1 Skills" +
            C_RESET
        );

        showLockedSagaSkill(
            player,
            skills,
            DEFENSE_PENETRATION,
            "Defense Penetration",
            C_RED,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Defense Penetration."
        );

        showLockedSagaSkill(
            player,
            skills,
            HEALING_REDUCTION,
            "Healing Reduction",
            C_LIGHT_PURPLE,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Healing Reduction."
        );

        showLockedSagaSkill(
            player,
            skills,
            INSTANT_TRANSMISSION,
            "Instant Transmission",
            C_AQUA,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Instant Transmission."
        );

        showLockedSagaSkill(
            player,
            skills,
            KI_INFUSION,
            "Ki Infusion",
            C_PURPLE,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Ki Infusion."
        );

        showLockedSagaSkill(
            player,
            skills,
            KI_BOOST,
            "Ki Boost",
            C_GOLD,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Ki Boost."
        );

        showLockedSagaSkill(
            player,
            skills,
            KI_PROTECTION,
            "Ki Protection",
            C_BLUE,
            MAX_LEVEL_10,
            "Complete the Saga Story to unlock Ki Protection."
        );


        /*
         * ====================================================
         * FOOTER
         * ====================================================
         */

        player.message(
            C_GOLD +
            C_BOLD +
            "----------------------------" +
            C_RESET
        );

    } catch (err) {
        player.message(
            C_DARK_RED +
            "[Skill Progress NPC Error] " +
            C_RED +
            err
        );
    }
}
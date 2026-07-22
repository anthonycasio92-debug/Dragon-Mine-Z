/*
 * ============================================================
 * MEDITATION TRIAL CYCLER
 * DragonMineZ 2.1.3 / CustomNPCs Nashorn
 *
 * Trigger:
 *   noppes script trigger 41
 *
 * This advances the global Meditation trial to the next biome.
 * It uses the same stored-data keys as the current Meditation
 * progression and SkillCheck scripts.
 * ============================================================
 */

/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */
var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var System = Java.type("java.lang.System");
/* Optional — do not fail the whole Script tab if Bukkit bridge is missing. */
var Bukkit = null;
try { Bukkit = Java.type("org.bukkit.Bukkit"); } catch (eBukkit) { Bukkit = null; }

/*
 * ============================================================
 * SETTINGS
 * ============================================================
 */

var TRIGGER_ID = 41;

/*
 * How long the newly selected trial remains active.
 * Default: 30 minutes.
 */
var TRIAL_DURATION_MS = 30 * 60 * 1000;

/*
 * These keys must match the Meditation progression script.
 */
var KEY_TRIAL_INDEX = "med2_global_trial_index";
var KEY_TRIAL_END = "med2_global_trial_end";
var KEY_CYCLE_LOCK = "med2_manual_cycle_lock_until";

/*
 * Optional broadcast to all online players.
 */
var BROADCAST_CHANGE = true;

/*
 * Prevent duplicate executions when the same trigger is handled by
 * multiple loaded CustomNPCs script contexts.
 */
var CYCLE_DEBOUNCE_MS = 5000;


/*
 * ============================================================
 * TRIAL LIST
 *
 * The order must match the Meditation progression script.
 * ============================================================
 */

var MEDITATION_TRIALS = [
    {
        id: "minecraft:plains",
        name: "Plains",
        dimension: "Overworld"
    },
    {
        id: "minecraft:desert",
        name: "Desert",
        dimension: "Overworld"
    },
    {
        id: "minecraft:snowy_plains",
        name: "Snowy Plains",
        dimension: "Overworld"
    },
    {
        id: "minecraft:nether_wastes",
        name: "Nether Wastes",
        dimension: "Nether"
    },
    {
        id: "minecraft:warped_forest",
        name: "Warped Forest",
        dimension: "Nether"
    },
    {
        id: "minecraft:soul_sand_valley",
        name: "Soul Sand Valley",
        dimension: "Nether"
    },
    {
        id: "dragonminez:ajissa_plains",
        name: "Ajissa Plains",
        dimension: "Namek"
    },
    {
        id: "dragonminez:namekian_rivers",
        name: "Namekian Rivers",
        dimension: "Namek"
    },
    {
        id: "dragonminez:sacredkai_hills",
        name: "Sacred Kai Hills",
        dimension: "Sacred Kai World"
    },
    {
        id: "dragonminez:hyperbolic_time_chamber",
        name: "Hyperbolic Time Chamber",
        dimension: "HTC"
    }
];


/*
 * ============================================================
 * COLORS
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
var C_LIGHT_PURPLE = "\u00A7d";
var C_RED = "\u00A7c";
var C_BOLD = "\u00A7l";


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function readNumber(stored, key, fallback) {
    try {
        if (stored != null && stored.has(key)) {
            var value = Number("" + stored.get(key));

            if (!isNaN(value)) {
                return value;
            }
        }
    } catch (err) {}

    return fallback;
}


function findStorageWorld() {
    var api = NpcAPI.Instance();

    /*
     * Try the normal Overworld names first.
     */
    try {
        var world = api.getIWorld("minecraft:overworld");

        if (world != null) {
            return world;
        }
    } catch (err1) {}

    try {
        var world2 = api.getIWorld("overworld");

        if (world2 != null) {
            return world2;
        }
    } catch (err2) {}

    /*
     * Final fallback: use the first loaded world.
     */
    try {
        var worlds = api.getIWorlds();

        if (worlds != null && worlds.length > 0) {
            return worlds[0];
        }
    } catch (err3) {}

    return null;
}


function sendToAll(message) {
    try {
        /*
         * Broadcast exactly once through Bukkit.
         *
         * The previous version looped through every loaded world.
         * CustomNPCs may return the same online players from each world,
         * which caused one message per loaded world.
         */
        if (Bukkit == null) throw "no bukkit";
        Bukkit.getServer().broadcastMessage(message);

    } catch (bukkitErr) {
        /*
         * Fallback: send once through the storage world's command system.
         */
        try {
            var world = findStorageWorld();

            if (world != null) {
                var safeMessage = String(message)
                    .replace(/\\/g, "\\\\")
                    .replace(/"/g, '\\"');

                world.executeCommand(
                    'tellraw @a {"text":"' +
                    safeMessage +
                    '"}'
                );
            }
        } catch (fallbackErr) {}
    }
}


/*
 * ============================================================
 * MAIN TRIGGER
 * ============================================================
 */

function trigger(event) {
    if (event.id != TRIGGER_ID) {
        return;
    }

    try {
        var storageWorld = findStorageWorld();

        if (storageWorld == null) {
            sendToAll(
                C_RED +
                "[Meditation] Unable to find the global storage world."
            );

            return;
        }

        var stored = storageWorld.getStoreddata();
        var now = System.currentTimeMillis();

        /*
         * Global debounce: only one script context may process the trigger.
         */
        var lockUntil = readNumber(
            stored,
            KEY_CYCLE_LOCK,
            0
        );

        if (now < lockUntil) {
            return;
        }

        stored.put(
            KEY_CYCLE_LOCK,
            "" + (now + CYCLE_DEBOUNCE_MS)
        );

        var currentIndex = Math.floor(
            readNumber(
                stored,
                KEY_TRIAL_INDEX,
                -1
            )
        );

        /*
         * Invalid or missing index starts at the first trial.
         * Otherwise move forward and wrap around.
         */
        var nextIndex;

        if (
            currentIndex < 0 ||
            currentIndex >= MEDITATION_TRIALS.length
        ) {
            nextIndex = 0;
        } else {
            nextIndex = currentIndex + 1;

            if (nextIndex >= MEDITATION_TRIALS.length) {
                nextIndex = 0;
            }
        }

        var newEndTime = now + TRIAL_DURATION_MS;

        stored.put(
            KEY_TRIAL_INDEX,
            "" + nextIndex
        );

        stored.put(
            KEY_TRIAL_END,
            "" + newEndTime
        );

        var trial = MEDITATION_TRIALS[nextIndex];

        var message =
            C_GOLD +
            C_BOLD +
            "[Meditation Trial]" +
            C_RESET +
            " " +
            C_WHITE +
            trial.name +
            C_DARK_GRAY +
            " | " +
            C_GRAY +
            trial.dimension +
            C_DARK_GRAY +
            " | " +
            C_AQUA +
            trial.id;

        if (BROADCAST_CHANGE) {
            sendToAll(message);
        }

    } catch (err) {
        sendToAll(
            C_RED +
            "[Meditation Trial Cycler Error] " +
            err
        );
    }
}
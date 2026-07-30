var StatsProvider = Java.type(
    "com.dragonminez.common.stats.StatsProvider"
);

var StatsCapability = Java.type(
    "com.dragonminez.common.stats.StatsCapability"
);

var System = Java.type("java.lang.System");


/*
 * ============================================================
 * SETTINGS
 * ============================================================
 */

var LEVELS_PER_PRESTIGE = 20000;
var MAX_REQUIRED_LEVEL = 100000;

/*
 * Maximum number of unused Prestige Levels that
 * a player may hold at one time.
 */
var MAX_HELD_PRESTIGES = 10;

/*
 * CustomNPCs faction used by the backend.
 */
var FACTION_ID = 4;

var CONFIRM_WINDOW_MS = 10000;


/*
 * ============================================================
 * STORED-DATA KEYS
 * ============================================================
 */

var KEY_TOTAL_PRESTIGES =
    "prestige_total_completed";

var KEY_CONFIRM_TIME =
    "prestige_confirm_until";

var KEY_CONFIRM_NPC =
    "prestige_confirm_npc";


/*
 * ============================================================
 * STANDARD MINECRAFT COLORS
 * ============================================================
 */

var GOLD = "§6";
var YELLOW = "§e";
var AQUA = "§b";
var GREEN = "§a";
var RED = "§c";
var GRAY = "§7";
var WHITE = "§f";
var PURPLE = "§d";
var DARK = "§8";


/*
 * ============================================================
 * MESSAGE HELPERS
 * ============================================================
 */

function sendMessage(player, message) {
    try {
        player.message(message);
    } catch (err) {}
}


function sendSeparator(player) {
    sendMessage(
        player,
        DARK + "--------------------------------"
    );
}


function formatNumber(value) {
    try {
        var number = Math.floor(Number(value));

        return ("" + number).replace(
            /\B(?=(\d{3})+(?!\d))/g,
            ","
        );
    } catch (err) {
        return "" + value;
    }
}


/*
 * ============================================================
 * STORED-DATA HELPERS
 * ============================================================
 */

function readStoredNumber(stored, key, fallback) {
    try {
        if (
            stored != null &&
            stored.has(key)
        ) {
            var value = Number(
                "" + stored.get(key)
            );

            if (
                !isNaN(value) &&
                isFinite(value)
            ) {
                return value;
            }
        }
    } catch (err) {}

    return fallback;
}


/*
 * ============================================================
 * FABLED PRESTIGE CLASS
 * ============================================================
 */

function getFabledPrestigeLevel(player) {
    var classLevel = 1;

    try {
        classLevel = Number(
            player.getClassLevel("Prestige")
        );

        if (
            !isNaN(classLevel) &&
            isFinite(classLevel)
        ) {
            return Math.max(
                1,
                Math.floor(classLevel)
            );
        }
    } catch (err1) {}

    try {
        classLevel = Number(
            player.getClassLevel("prestige")
        );

        if (
            !isNaN(classLevel) &&
            isFinite(classLevel)
        ) {
            return Math.max(
                1,
                Math.floor(classLevel)
            );
        }
    } catch (err2) {}

    return 1;
}


/*
 * ============================================================
 * PERMANENT COMPLETED PRESTIGE COUNT
 * ============================================================
 */

function getCurrentPrestigeLevel(
    player,
    stored
) {
    try {
        if (
            stored.has(
                KEY_TOTAL_PRESTIGES
            )
        ) {
            var savedLevel = Math.floor(
                readStoredNumber(
                    stored,
                    KEY_TOTAL_PRESTIGES,
                    0
                )
            );

            return Math.max(
                0,
                savedLevel
            );
        }
    } catch (err1) {}

    /*
     * Initialize older players from their existing
     * Fabled Prestige class level.
     */
    var fabledLevel =
        getFabledPrestigeLevel(player);

    var prestigeLevel = Math.max(
        0,
        fabledLevel - 1
    );

    stored.put(
        KEY_TOTAL_PRESTIGES,
        "" + prestigeLevel
    );

    return prestigeLevel;
}


/*
 * ============================================================
 * DMZ LEVEL REQUIREMENT
 * ============================================================
 */

function getRequiredLevel(
    currentPrestigeLevel
) {
    var nextPrestigeLevel =
        currentPrestigeLevel + 1;

    var requiredLevel =
        nextPrestigeLevel *
        LEVELS_PER_PRESTIGE;

    if (
        requiredLevel >
        MAX_REQUIRED_LEVEL
    ) {
        requiredLevel =
            MAX_REQUIRED_LEVEL;
    }

    return requiredLevel;
}


/*
 * ============================================================
 * BACKEND PRESTIGE BALANCE
 * ============================================================
 */

function getHeldPrestigeLevels(player) {
    var current = 0;

    /*
     * Direct faction-point getter.
     */
    try {
        current = Number(
            player.getFactionPoints(
                FACTION_ID
            )
        );

        if (
            !isNaN(current) &&
            isFinite(current)
        ) {
            return Math.max(
                0,
                Math.floor(current)
            );
        }
    } catch (err1) {}

    /*
     * Map getter fallback.
     */
    try {
        var map =
            player.getFactionPoints();

        if (
            map != null &&
            typeof map.get === "function"
        ) {
            var value =
                map.get(FACTION_ID);

            if (value != null) {
                current = Number(
                    "" + value
                );

                if (
                    !isNaN(current) &&
                    isFinite(current)
                ) {
                    return Math.max(
                        0,
                        Math.floor(current)
                    );
                }
            }
        }
    } catch (err2) {}

    return 0;
}


function awardBackendPrestigeLevel(player) {
    /*
     * Never allow the stored balance to exceed 10.
     */
    var current =
        getHeldPrestigeLevels(player);

    if (
        current >=
        MAX_HELD_PRESTIGES
    ) {
        return false;
    }

    /*
     * Preferred method.
     */
    try {
        player.addFactionPoints(
            FACTION_ID,
            1
        );

        return true;
    } catch (err1) {}

    /*
     * Fallback method.
     */
    try {
        player.setFactionPoints(
            FACTION_ID,
            current + 1
        );

        return true;
    } catch (err2) {}

    return false;
}


/*
 * ============================================================
 * QUEST AND DIALOGUE RESET
 * ============================================================
 */

function resetPrestigeProgress(player) {
    try {
        player.removeQuest(26);
    } catch (q1) {}

    try {
        player.removeQuest(2);
    } catch (q2) {}

    try {
        player.removeQuest(27);
    } catch (q3) {}

    try {
        player.removeDialog(21);
    } catch (d1) {}

    try {
        player.removeDialog(20);
    } catch (d2) {}

    try {
        player.removeDialog(18);
    } catch (d3) {}

    try {
        player.removeDialog(19);
    } catch (d4) {}
}


/*
 * ============================================================
 * HELD PRESTIGE CAP MESSAGE
 * ============================================================
 */

function showPrestigeCapMessage(
    player,
    heldPrestigeLevels
) {
    sendSeparator(player);

    sendMessage(
        player,
        RED +
        "Maximum Prestige Levels Reached"
    );

    sendMessage(
        player,
        GRAY +
        "Available Prestige Levels: " +
        GOLD +
        heldPrestigeLevels +
        GRAY +
        "/" +
        WHITE +
        MAX_HELD_PRESTIGES
    );

    sendMessage(
        player,
        GRAY +
        "You can only hold " +
        WHITE +
        MAX_HELD_PRESTIGES +
        GRAY +
        " unused Prestige Levels at once."
    );

    sendMessage(
        player,
        YELLOW +
        "Use one before prestiging again."
    );

    sendSeparator(player);
}


/*
 * ============================================================
 * REQUIREMENT FAILURE MESSAGE
 * ============================================================
 */

function showRequirementFailure(
    player,
    currentPrestigeLevel,
    nextPrestigeLevel,
    requiredLevel,
    playerLevel
) {
    sendSeparator(player);

    sendMessage(
        player,
        RED +
        "Prestige Level Requirement Not Met"
    );

    sendMessage(
        player,
        GRAY +
        "Current Prestige Level: " +
        YELLOW +
        currentPrestigeLevel
    );

    sendMessage(
        player,
        GRAY +
        "Next Prestige Level: " +
        GOLD +
        nextPrestigeLevel
    );

    sendMessage(
        player,
        GRAY +
        "Required DMZ Level: " +
        AQUA +
        formatNumber(requiredLevel)
    );

    sendMessage(
        player,
        GRAY +
        "Your DMZ Level: " +
        WHITE +
        formatNumber(playerLevel)
    );

    sendSeparator(player);
}


/*
 * ============================================================
 * CONFIRMATION MESSAGE
 * ============================================================
 */

function showConfirmation(
    player,
    currentPrestigeLevel,
    nextPrestigeLevel,
    requiredLevel,
    playerLevel,
    heldPrestigeLevels
) {
    sendSeparator(player);

    sendMessage(
        player,
        GOLD +
        "Prestige Level Confirmation"
    );

    sendMessage(
        player,
        GRAY +
        "Interact again within " +
        WHITE +
        "10 seconds " +
        GRAY +
        "to confirm."
    );

    sendMessage(
        player,
        GRAY +
        "Current Prestige Level: " +
        YELLOW +
        currentPrestigeLevel
    );

    sendMessage(
        player,
        GRAY +
        "Next Prestige Level: " +
        GOLD +
        nextPrestigeLevel
    );

    sendMessage(
        player,
        GRAY +
        "Available Prestige Levels: " +
        AQUA +
        heldPrestigeLevels +
        GRAY +
        "/" +
        WHITE +
        MAX_HELD_PRESTIGES
    );

    sendMessage(
        player,
        GRAY +
        "Required DMZ Level: " +
        AQUA +
        formatNumber(requiredLevel)
    );

    sendMessage(
        player,
        GRAY +
        "Your DMZ Level: " +
        WHITE +
        formatNumber(playerLevel)
    );

    sendMessage(
        player,
        RED +
        "Warning: Your DMZ stats will be reset."
    );

    if (
        requiredLevel >=
        MAX_REQUIRED_LEVEL
    ) {
        sendMessage(
            player,
            PURPLE +
            "The requirement is capped at " +
            WHITE +
            formatNumber(
                MAX_REQUIRED_LEVEL
            ) +
            PURPLE +
            " DMZ levels."
        );
    }

    sendSeparator(player);
}


/*
 * ============================================================
 * SUCCESS MESSAGE
 * ============================================================
 */

function showSuccess(
    player,
    newPrestigeLevel,
    requiredLevel,
    nextRequiredLevel,
    newHeldPrestigeLevels
) {
    sendSeparator(player);

    sendMessage(
        player,
        GREEN +
        "Prestige Level Increased!"
    );

    sendMessage(
        player,
        GRAY +
        "Current Prestige Level: " +
        GOLD +
        newPrestigeLevel
    );

    sendMessage(
        player,
        GRAY +
        "Next Prestige Level: " +
        YELLOW +
        (newPrestigeLevel + 1)
    );

    sendMessage(
        player,
        GRAY +
        "Available Prestige Levels: " +
        AQUA +
        newHeldPrestigeLevels +
        GRAY +
        "/" +
        WHITE +
        MAX_HELD_PRESTIGES
    );

    sendMessage(
        player,
        GRAY +
        "DMZ Level requirement used: " +
        AQUA +
        formatNumber(requiredLevel)
    );

    sendMessage(
        player,
        GRAY +
        "Next DMZ Level requirement: " +
        AQUA +
        formatNumber(nextRequiredLevel)
    );

    sendMessage(
        player,
        GREEN +
        "Your DMZ stats have been reset."
    );

    sendMessage(
        player,
        GREEN +
        "Your Prestige quests and dialogues have been reset."
    );

    if (
        newHeldPrestigeLevels >=
        MAX_HELD_PRESTIGES
    ) {
        sendMessage(
            player,
            YELLOW +
            "You have reached the limit of " +
            WHITE +
            MAX_HELD_PRESTIGES +
            YELLOW +
            " available Prestige Levels."
        );

        sendMessage(
            player,
            YELLOW +
            "Use one before prestiging again."
        );
    }

    if (
        nextRequiredLevel >=
        MAX_REQUIRED_LEVEL
    ) {
        sendMessage(
            player,
            PURPLE +
            "All future Prestige Levels require " +
            WHITE +
            formatNumber(
                MAX_REQUIRED_LEVEL
            ) +
            PURPLE +
            " DMZ levels."
        );
    }

    sendSeparator(player);
}


/*
 * ============================================================
 * MAIN NPC INTERACTION
 * ============================================================
 */

function interact(event) {
    try {
        var player = event.player;
        var npc = event.npc;

        if (
            player == null ||
            npc == null
        ) {
            return;
        }


        /*
         * Read DragonMineZ stats.
         */
        var mcPlayer =
            player.getMCEntity
                ? player.getMCEntity()
                : player;

        var data =
            StatsProvider
                .get(
                    StatsCapability.INSTANCE,
                    mcPlayer
                )
                .orElse(null);

        if (data == null) {
            sendMessage(
                player,
                RED +
                "Could not read your Dragon Mine Z stats."
            );

            return;
        }

        var level = Number(
            data.getLevel()
        );

        if (
            isNaN(level) ||
            !isFinite(level)
        ) {
            sendMessage(
                player,
                RED +
                "Could not determine your Dragon Mine Z level."
            );

            return;
        }

        level = Math.floor(level);


        /*
         * Read permanent progression data.
         */
        var stored =
            player.getStoreddata();

        var currentPrestigeLevel =
            getCurrentPrestigeLevel(
                player,
                stored
            );

        var nextPrestigeLevel =
            currentPrestigeLevel + 1;

        var requiredLevel =
            getRequiredLevel(
                currentPrestigeLevel
            );


        /*
         * Read how many unused Prestige Levels
         * the player currently holds.
         */
        var heldPrestigeLevels =
            getHeldPrestigeLevels(player);


        /*
         * Hard cap of 10 held Prestige Levels.
         */
        if (
            heldPrestigeLevels >=
            MAX_HELD_PRESTIGES
        ) {
            stored.remove(
                KEY_CONFIRM_TIME
            );

            stored.remove(
                KEY_CONFIRM_NPC
            );

            showPrestigeCapMessage(
                player,
                heldPrestigeLevels
            );

            return;
        }


        /*
         * Check DMZ level requirement.
         */
        if (
            level <
            requiredLevel
        ) {
            showRequirementFailure(
                player,
                currentPrestigeLevel,
                nextPrestigeLevel,
                requiredLevel,
                level
            );

            return;
        }


        /*
         * Read confirmation information.
         */
        var now =
            System.currentTimeMillis();

        var confirmUntil =
            readStoredNumber(
                stored,
                KEY_CONFIRM_TIME,
                0
            );

        var confirmNpc = "";

        try {
            if (
                stored.has(
                    KEY_CONFIRM_NPC
                )
            ) {
                confirmNpc =
                    "" +
                    stored.get(
                        KEY_CONFIRM_NPC
                    );
            }
        } catch (confirmErr) {}

        var thisNpcId =
            "" + npc.getUUID();


        /*
         * ====================================================
         * SECOND INTERACTION
         * ====================================================
         */

        if (
            confirmUntil > now &&
            confirmNpc == thisNpcId
        ) {
            stored.remove(
                KEY_CONFIRM_TIME
            );

            stored.remove(
                KEY_CONFIRM_NPC
            );


            /*
             * Check the cap again in case the player's
             * balance changed during the confirmation window.
             */
            heldPrestigeLevels =
                getHeldPrestigeLevels(player);

            if (
                heldPrestigeLevels >=
                MAX_HELD_PRESTIGES
            ) {
                showPrestigeCapMessage(
                    player,
                    heldPrestigeLevels
                );

                return;
            }


            /*
             * Give the backend Prestige Level before
             * resetting the player.
             */
            var rewardWorked =
                awardBackendPrestigeLevel(
                    player
                );

            if (!rewardWorked) {
                sendSeparator(player);

                sendMessage(
                    player,
                    RED +
                    "Prestige could not be processed."
                );

                sendMessage(
                    player,
                    GRAY +
                    "Your stats were not reset."
                );

                sendMessage(
                    player,
                    GRAY +
                    "Please contact a staff member."
                );

                sendSeparator(player);

                return;
            }


            var name =
                player.getName();


            /*
             * Increase Fabled Prestige class level.
             */
            npc.executeCommand(
                "/class level " +
                name +
                " add 1 Prestige"
            );


            /*
             * Reset DragonMineZ stats.
             */
            npc.executeCommand(
                "/dmzstats reset " +
                name
            );


            /*
             * Reset quests and dialogues.
             */
            resetPrestigeProgress(player);


            /*
             * Permanently increase completed Prestige Level.
             */
            var newPrestigeLevel =
                currentPrestigeLevel + 1;

            stored.put(
                KEY_TOTAL_PRESTIGES,
                "" + newPrestigeLevel
            );


            /*
             * Calculate the next DMZ requirement.
             */
            var nextRequiredLevel =
                getRequiredLevel(
                    newPrestigeLevel
                );

            var newHeldPrestigeLevels =
                getHeldPrestigeLevels(player);


            showSuccess(
                player,
                newPrestigeLevel,
                requiredLevel,
                nextRequiredLevel,
                newHeldPrestigeLevels
            );

            return;
        }


        /*
         * Remove expired confirmation data.
         */
        if (
            confirmUntil > 0 &&
            confirmUntil <= now
        ) {
            stored.remove(
                KEY_CONFIRM_TIME
            );

            stored.remove(
                KEY_CONFIRM_NPC
            );
        }


        /*
         * ====================================================
         * FIRST INTERACTION
         * ====================================================
         */

        stored.put(
            KEY_CONFIRM_TIME,
            "" +
            (
                now +
                CONFIRM_WINDOW_MS
            )
        );

        stored.put(
            KEY_CONFIRM_NPC,
            thisNpcId
        );

        showConfirmation(
            player,
            currentPrestigeLevel,
            nextPrestigeLevel,
            requiredLevel,
            level,
            heldPrestigeLevels
        );

    } catch (err) {
        try {
            event.player.message(
                "§cScript error while processing Prestige Level: §f" +
                err
            );
        } catch (messageErr) {}
    }
}

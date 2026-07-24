/*
 * ============================================================
 * Prestige NPC
 * CustomNPCs NPC Interact script
 *
 * Fixes vs broken paste:
 * - Unicode colors (\u00A7) — literal section signs break CNPC
 * - dmzstats reset via console (NPC executeCommand often has
 *   no permission, so reset silently fails)
 * - Verified command: dmzstats reset <player> 0 false
 * - Clears stuck saga difficultyChosen after reset
 * - Confirms stored prestige count after success
 *
 * Enable: Interact
 * ============================================================
 */

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
var MAX_HELD_PRESTIGES = 10;
var FACTION_ID = 4;
var CONFIRM_WINDOW_MS = 10000;
var FABLED_PRESTIGE_CLASS = "Prestige";


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
 * COLORS (unicode — do not use literal section signs)
 * ============================================================
 */

var GOLD = "\u00A76";
var YELLOW = "\u00A7e";
var AQUA = "\u00A7b";
var GREEN = "\u00A7a";
var RED = "\u00A7c";
var GRAY = "\u00A77";
var WHITE = "\u00A7f";
var PURPLE = "\u00A7d";
var DARK = "\u00A78";


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

function readStoredNumber(stored, key, fallback) {
    try {
        if (stored != null && stored.has(key)) {
            var value = Number("" + stored.get(key));
            if (!isNaN(value) && isFinite(value)) {
                return value;
            }
        }
    } catch (err) {}
    return fallback;
}


/*
 * ============================================================
 * COMMAND EXECUTION
 * Prefer console dispatch so Forge commands have permission.
 * ============================================================
 */

function runServerCommand(command, npc) {
    var cmd = ("" + command).replace(/^\//, "");

    try {
        var Bukkit = Java.type("org.bukkit.Bukkit");
        var ok = Bukkit.dispatchCommand(
            Bukkit.getConsoleSender(),
            cmd
        );
        if (ok === true) {
            return true;
        }
    } catch (bukkitErr) {}

    try {
        if (npc != null && npc.executeCommand) {
            npc.executeCommand(cmd);
            return true;
        }
    } catch (npcErr) {}

    return false;
}

function resetDmzPlayer(player, npc) {
    var name = "" + player.getName();
    var resetCommand =
        "dmzstats reset " + name + " 0 false";

    var ran = runServerCommand(resetCommand, npc);

    /*
     * Direct API fallback if command dispatch failed.
     */
    try {
        var mcPlayer = player.getMCEntity
            ? player.getMCEntity()
            : null;
        if (mcPlayer != null) {
            var data = StatsProvider
                .get(StatsCapability.INSTANCE, mcPlayer)
                .orElse(null);
            if (data != null) {
                data.resetPlayerProgress(
                    mcPlayer,
                    java.lang.Integer.valueOf(0),
                    false,
                    false
                );
                try {
                    var NetworkHandler = Java.type(
                        "com.dragonminez.common.network.NetworkHandler"
                    );
                    var StatsSyncS2C = Java.type(
                        "com.dragonminez.common.network.S2C.StatsSyncS2C"
                    );
                    NetworkHandler.sendToTrackingEntityAndSelf(
                        new StatsSyncS2C(mcPlayer),
                        mcPlayer
                    );
                } catch (syncErr) {}
                ran = true;
            }
        }
    } catch (apiErr) {}

    return ran;
}

function clearStuckSagaDifficulty(player) {
    try {
        var mcPlayer = player.getMCEntity
            ? player.getMCEntity()
            : null;
        if (mcPlayer == null) {
            return;
        }
        var data = StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);
        if (data == null) {
            return;
        }
        var questData = data.getPlayerQuestData();
        if (questData == null) {
            return;
        }
        try {
            questData.requestDifficultyReselect();
        } catch (reselectErr) {
            try {
                questData.setDifficultyChosen(false);
            } catch (setErr) {}
        }
        try {
            var NetworkHandler = Java.type(
                "com.dragonminez.common.network.NetworkHandler"
            );
            var ProgressionSyncS2C = Java.type(
                "com.dragonminez.common.network.S2C.ProgressionSyncS2C"
            );
            NetworkHandler.sendToPlayer(
                new ProgressionSyncS2C(mcPlayer),
                mcPlayer
            );
        } catch (syncErr) {}
    } catch (err) {}
}

function getPlayerDmzLevel(player) {
    var mcPlayer = player.getMCEntity
        ? player.getMCEntity()
        : player;

    var data = StatsProvider
        .get(StatsCapability.INSTANCE, mcPlayer)
        .orElse(null);

    if (data == null) {
        return null;
    }

    var level = Number(data.getLevel());
    if (isNaN(level) || !isFinite(level)) {
        return null;
    }
    return Math.floor(level);
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
        if (!isNaN(classLevel) && isFinite(classLevel)) {
            return Math.max(1, Math.floor(classLevel));
        }
    } catch (err1) {}

    try {
        classLevel = Number(
            player.getClassLevel("prestige")
        );
        if (!isNaN(classLevel) && isFinite(classLevel)) {
            return Math.max(1, Math.floor(classLevel));
        }
    } catch (err2) {}

    /*
     * Bukkit / Fabled fallback used by other scripts.
     */
    try {
        var Bukkit = Java.type("org.bukkit.Bukkit");
        var UUID = Java.type("java.util.UUID");
        var bukkitPlayer = Bukkit.getPlayer(
            UUID.fromString("" + player.getUUID())
        );
        if (bukkitPlayer != null) {
            var plugin = Bukkit.getPluginManager()
                .getPlugin("Fabled");
            if (plugin != null) {
                var loader = plugin.getClass()
                    .getClassLoader();
                var fabledClass = loader.loadClass(
                    "studio.magemonkey.fabled.Fabled"
                );
                var methods = fabledClass.getMethods();
                var getDataMethod = null;
                for (var i = 0; i < methods.length; i++) {
                    if (
                        methods[i].getName() == "getData" &&
                        methods[i].getParameterTypes()
                            .length == 1
                    ) {
                        getDataMethod = methods[i];
                        break;
                    }
                }
                if (getDataMethod != null) {
                    var fabledData = getDataMethod.invoke(
                        null,
                        bukkitPlayer
                    );
                    if (fabledData != null) {
                        var prestigeClass =
                            fabledData.getClass(
                                FABLED_PRESTIGE_CLASS
                            );
                        if (prestigeClass != null) {
                            return Math.max(
                                1,
                                Math.floor(
                                    Number(
                                        prestigeClass.getLevel()
                                    )
                                )
                            );
                        }
                    }
                }
            }
        }
    } catch (err3) {}

    return 1;
}

function getCurrentPrestigeLevel(player, stored) {
    try {
        if (stored.has(KEY_TOTAL_PRESTIGES)) {
            var savedLevel = Math.floor(
                readStoredNumber(
                    stored,
                    KEY_TOTAL_PRESTIGES,
                    0
                )
            );
            return Math.max(0, savedLevel);
        }
    } catch (err1) {}

    var fabledLevel = getFabledPrestigeLevel(player);
    var prestigeLevel = Math.max(0, fabledLevel - 1);

    stored.put(
        KEY_TOTAL_PRESTIGES,
        "" + prestigeLevel
    );

    return prestigeLevel;
}

function getRequiredLevel(currentPrestigeLevel) {
    var nextPrestigeLevel = currentPrestigeLevel + 1;
    var requiredLevel =
        nextPrestigeLevel * LEVELS_PER_PRESTIGE;
    if (requiredLevel > MAX_REQUIRED_LEVEL) {
        requiredLevel = MAX_REQUIRED_LEVEL;
    }
    return requiredLevel;
}


/*
 * ============================================================
 * BACKEND PRESTIGE BALANCE (faction points)
 * ============================================================
 */

function getHeldPrestigeLevels(player) {
    var current = 0;

    try {
        current = Number(
            player.getFactionPoints(FACTION_ID)
        );
        if (!isNaN(current) && isFinite(current)) {
            return Math.max(0, Math.floor(current));
        }
    } catch (err1) {}

    try {
        var map = player.getFactionPoints();
        if (map != null && typeof map.get === "function") {
            var value = map.get(FACTION_ID);
            if (value != null) {
                current = Number("" + value);
                if (!isNaN(current) && isFinite(current)) {
                    return Math.max(0, Math.floor(current));
                }
            }
        }
    } catch (err2) {}

    return 0;
}

function awardBackendPrestigeLevel(player) {
    var current = getHeldPrestigeLevels(player);
    if (current >= MAX_HELD_PRESTIGES) {
        return false;
    }

    try {
        player.addFactionPoints(FACTION_ID, 1);
        return true;
    } catch (err1) {}

    try {
        player.setFactionPoints(FACTION_ID, current + 1);
        return true;
    } catch (err2) {}

    return false;
}

function resetPrestigeProgress(player) {
    try { player.removeQuest(26); } catch (q1) {}
    try { player.removeQuest(2); } catch (q2) {}
    try { player.removeQuest(27); } catch (q3) {}
    try { player.removeDialog(21); } catch (d1) {}
    try { player.removeDialog(20); } catch (d2) {}
    try { player.removeDialog(18); } catch (d3) {}
    try { player.removeDialog(19); } catch (d4) {}
}


/*
 * ============================================================
 * MESSAGES
 * ============================================================
 */

function showPrestigeCapMessage(player, heldPrestigeLevels) {
    sendSeparator(player);
    sendMessage(
        player,
        RED + "Maximum Prestige Levels Reached"
    );
    sendMessage(
        player,
        GRAY + "Available Prestige Levels: " +
        GOLD + heldPrestigeLevels +
        GRAY + "/" +
        WHITE + MAX_HELD_PRESTIGES
    );
    sendMessage(
        player,
        GRAY + "You can only hold " +
        WHITE + MAX_HELD_PRESTIGES +
        GRAY + " unused Prestige Levels at once."
    );
    sendMessage(
        player,
        YELLOW + "Use one before prestiging again."
    );
    sendSeparator(player);
}

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
        RED + "Prestige Level Requirement Not Met"
    );
    sendMessage(
        player,
        GRAY + "Current Prestige Level: " +
        YELLOW + currentPrestigeLevel
    );
    sendMessage(
        player,
        GRAY + "Next Prestige Level: " +
        GOLD + nextPrestigeLevel
    );
    sendMessage(
        player,
        GRAY + "Required DMZ Level: " +
        AQUA + formatNumber(requiredLevel)
    );
    sendMessage(
        player,
        GRAY + "Your DMZ Level: " +
        WHITE + formatNumber(playerLevel)
    );
    sendSeparator(player);
}

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
        GOLD + "Prestige Level Confirmation"
    );
    sendMessage(
        player,
        GRAY + "Interact again within " +
        WHITE + "10 seconds " +
        GRAY + "to confirm."
    );
    sendMessage(
        player,
        GRAY + "Current Prestige Level: " +
        YELLOW + currentPrestigeLevel
    );
    sendMessage(
        player,
        GRAY + "Next Prestige Level: " +
        GOLD + nextPrestigeLevel
    );
    sendMessage(
        player,
        GRAY + "Available Prestige Levels: " +
        AQUA + heldPrestigeLevels +
        GRAY + "/" +
        WHITE + MAX_HELD_PRESTIGES
    );
    sendMessage(
        player,
        GRAY + "Required DMZ Level: " +
        AQUA + formatNumber(requiredLevel)
    );
    sendMessage(
        player,
        GRAY + "Your DMZ Level: " +
        WHITE + formatNumber(playerLevel)
    );
    sendMessage(
        player,
        RED + "Warning: Your DMZ stats will be reset."
    );
    if (requiredLevel >= MAX_REQUIRED_LEVEL) {
        sendMessage(
            player,
            PURPLE + "The requirement is capped at " +
            WHITE + formatNumber(MAX_REQUIRED_LEVEL) +
            PURPLE + " DMZ levels."
        );
    }
    sendSeparator(player);
}

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
        GREEN + "Prestige Level Increased!"
    );
    sendMessage(
        player,
        GRAY + "Current Prestige Level: " +
        GOLD + newPrestigeLevel
    );
    sendMessage(
        player,
        GRAY + "Next Prestige Level: " +
        YELLOW + (newPrestigeLevel + 1)
    );
    sendMessage(
        player,
        GRAY + "Available Prestige Levels: " +
        AQUA + newHeldPrestigeLevels +
        GRAY + "/" +
        WHITE + MAX_HELD_PRESTIGES
    );
    sendMessage(
        player,
        GRAY + "DMZ Level requirement used: " +
        AQUA + formatNumber(requiredLevel)
    );
    sendMessage(
        player,
        GRAY + "Next DMZ Level requirement: " +
        AQUA + formatNumber(nextRequiredLevel)
    );
    sendMessage(
        player,
        GREEN + "Your DMZ stats have been reset."
    );
    sendMessage(
        player,
        GREEN +
        "Your Prestige quests and dialogues have been reset."
    );
    if (newHeldPrestigeLevels >= MAX_HELD_PRESTIGES) {
        sendMessage(
            player,
            YELLOW + "You have reached the limit of " +
            WHITE + MAX_HELD_PRESTIGES +
            YELLOW + " available Prestige Levels."
        );
        sendMessage(
            player,
            YELLOW + "Use one before prestiging again."
        );
    }
    if (nextRequiredLevel >= MAX_REQUIRED_LEVEL) {
        sendMessage(
            player,
            PURPLE + "All future Prestige Levels require " +
            WHITE + formatNumber(MAX_REQUIRED_LEVEL) +
            PURPLE + " DMZ levels."
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

        if (player == null || npc == null) {
            return;
        }

        var level = getPlayerDmzLevel(player);
        if (level == null) {
            sendMessage(
                player,
                RED +
                "Could not read your Dragon Mine Z stats."
            );
            return;
        }

        var stored = player.getStoreddata();

        var currentPrestigeLevel =
            getCurrentPrestigeLevel(player, stored);

        var nextPrestigeLevel =
            currentPrestigeLevel + 1;

        var requiredLevel =
            getRequiredLevel(currentPrestigeLevel);

        var heldPrestigeLevels =
            getHeldPrestigeLevels(player);

        if (heldPrestigeLevels >= MAX_HELD_PRESTIGES) {
            stored.remove(KEY_CONFIRM_TIME);
            stored.remove(KEY_CONFIRM_NPC);
            showPrestigeCapMessage(
                player,
                heldPrestigeLevels
            );
            return;
        }

        if (level < requiredLevel) {
            showRequirementFailure(
                player,
                currentPrestigeLevel,
                nextPrestigeLevel,
                requiredLevel,
                level
            );
            return;
        }

        var now = System.currentTimeMillis();
        var confirmUntil = readStoredNumber(
            stored,
            KEY_CONFIRM_TIME,
            0
        );
        var confirmNpc = "";
        try {
            if (stored.has(KEY_CONFIRM_NPC)) {
                confirmNpc =
                    "" + stored.get(KEY_CONFIRM_NPC);
            }
        } catch (confirmErr) {}

        var thisNpcId = "" + npc.getUUID();

        /*
         * SECOND INTERACTION — confirm prestige
         */
        if (
            confirmUntil > now &&
            confirmNpc == thisNpcId
        ) {
            stored.remove(KEY_CONFIRM_TIME);
            stored.remove(KEY_CONFIRM_NPC);

            heldPrestigeLevels =
                getHeldPrestigeLevels(player);

            if (heldPrestigeLevels >= MAX_HELD_PRESTIGES) {
                showPrestigeCapMessage(
                    player,
                    heldPrestigeLevels
                );
                return;
            }

            var rewardWorked =
                awardBackendPrestigeLevel(player);

            if (!rewardWorked) {
                sendSeparator(player);
                sendMessage(
                    player,
                    RED + "Prestige could not be processed."
                );
                sendMessage(
                    player,
                    GRAY + "Your stats were not reset."
                );
                sendMessage(
                    player,
                    GRAY + "Please contact a staff member."
                );
                sendSeparator(player);
                return;
            }

            var name = "" + player.getName();

            /*
             * Fabled Prestige class +1 via console.
             */
            runServerCommand(
                "class level " + name +
                " add 1 " + FABLED_PRESTIGE_CLASS,
                npc
            );

            /*
             * DMZ reset — must use console / API.
             * npc.executeCommand alone often has no permission.
             */
            var resetWorked = resetDmzPlayer(player, npc);
            if (!resetWorked) {
                sendSeparator(player);
                sendMessage(
                    player,
                    RED +
                    "Prestige reward was given, but DMZ reset failed."
                );
                sendMessage(
                    player,
                    GRAY +
                    "Tell staff to run: " +
                    WHITE +
                    "dmzstats reset " + name + " 0 false"
                );
                sendSeparator(player);
                return;
            }

            clearStuckSagaDifficulty(player);
            resetPrestigeProgress(player);

            var newPrestigeLevel =
                currentPrestigeLevel + 1;

            stored.put(
                KEY_TOTAL_PRESTIGES,
                "" + newPrestigeLevel
            );

            var nextRequiredLevel =
                getRequiredLevel(newPrestigeLevel);

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

        if (confirmUntil > 0 && confirmUntil <= now) {
            stored.remove(KEY_CONFIRM_TIME);
            stored.remove(KEY_CONFIRM_NPC);
        }

        /*
         * FIRST INTERACTION — ask for confirmation
         */
        stored.put(
            KEY_CONFIRM_TIME,
            "" + (now + CONFIRM_WINDOW_MS)
        );
        stored.put(KEY_CONFIRM_NPC, thisNpcId);

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
                "\u00A7cScript error while processing Prestige Level: \u00A7f" +
                err
            );
        } catch (messageErr) {}
    }
}

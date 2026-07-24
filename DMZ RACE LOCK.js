// ============================================================
// Restricted DMZ Race Unlock System
// CustomNPCs 1.20.1 Global Player Script
//
// Checks a configured list of exact DMZ race IDs.
//
// When a player's race is restricted, the script checks the
// configured Fabled skill using the same Fabled classloader
// method used by the working Fabled attribute script.
//
// If the required Fabled skill is below level 1, the script runs:
//
//     dmzstats reset <player> 0 false
//
// The reset is executed as a server command rather than by
// directly calling DMZ's resetPlayerProgress method.
//
// Also clears stuck saga difficultyChosen after resets so the
// Quest Tree difficulty picker works again. No extra script.
// Enable Tick (required) and Trigger (for unlock command).
// Chat is optional and often broken on hybrid servers.
// Unlock without chat:
//   /noppes script trigger 120
//   /noppes script trigger 120 <playerName>
// Also leaves DMZ party if you are a non-leader, because DMZ
// blocks difficulty selection for party members.
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

// Number of player tick events between checks.
//
// This uses the same tick-counter structure as the working
// Fabled attribute script.
var TICK_INTERVAL = 1;


// Number of completed checks to wait before retrying the reset
// command if the player somehow remains in the restricted race.
//
// With the default interval, this provides a reasonable delay
// without permanently stopping the script.
var RESET_RETRY_CHECKS = 5;


// Exact internal DMZ race IDs that require an unlock.
//
// Capitalization is ignored.
//
// Each entry must line up with the corresponding entry in
// REQUIRED_FABLED_SKILLS.
var RESTRICTED_RACE_IDS = [
    "ancient_saiyan"
];


// Exact Fabled skill key OR displayed skill name required for
// each restricted race.
//
// For the current test, the race "test" requires a Fabled skill
// whose key or displayed name is also "test".
//
// Example for later:
//
// var RESTRICTED_RACE_IDS = [
//     "test",
//     "viltrumite",
//     "yardrat"
// ];
//
// var REQUIRED_FABLED_SKILLS = [
//     "test",
//     "race_unlock_viltrumite",
//     "race_unlock_yardrat"
// ];
var REQUIRED_FABLED_SKILLS = [
    "Ancient Saiyan"
];


// Friendly race names used in player messages.
//
// Each position must match RESTRICTED_RACE_IDS.
var RESTRICTED_RACE_DISPLAY_NAMES = [
    "Ancient Saiyan"
];


// Player-facing race lock messages stay on.
// Verbose [Race Lock Debug] spam stays off.
var DEBUG = false;


/*
 * ============================================================
 * SAGA DIFFICULTY HELPERS
 * ============================================================
 *
 * DMZ SetStoryDifficultyC2S ignores clicks when
 * PlayerQuestData.difficultyChosen is already true.
 * dmzstats reset does NOT clear that flag.
 *
 * Extra blockers from DMZ itself:
 * - Party non-leaders cannot select difficulty at all
 * - Joining a party forces difficultyChosen = true
 *
 * Unlock runs from Tick (no Bukkit needed) and from chat:
 *   !unlockdifficulty
 */

var SAGA_UNLOCK_RETRY_TICKS = 40;

function syncProgression(mcPlayer) {
    if (mcPlayer == null) {
        return false;
    }

    try {
        var ProgressionSyncS2C = Java.type(
            "com.dragonminez.common.network.S2C.ProgressionSyncS2C"
        );
        var NetworkHandler = Java.type(
            "com.dragonminez.common.network.NetworkHandler"
        );

        NetworkHandler.sendToPlayer(
            new ProgressionSyncS2C(mcPlayer),
            mcPlayer
        );
        return true;
    } catch (err1) {}

    try {
        var StatsSyncS2C = Java.type(
            "com.dragonminez.common.network.S2C.StatsSyncS2C"
        );
        var NetworkHandler2 = Java.type(
            "com.dragonminez.common.network.NetworkHandler"
        );

        NetworkHandler2.sendToTrackingEntityAndSelf(
            new StatsSyncS2C(mcPlayer),
            mcPlayer
        );
        return true;
    } catch (err2) {}

    return false;
}

function getMcPlayer(player) {
    if (player == null) {
        return null;
    }
    try {
        return player.getMCEntity
            ? player.getMCEntity()
            : null;
    } catch (err) {
        return null;
    }
}

function loadDmzData(player) {
    try {
        var StatsProvider = Java.type(
            "com.dragonminez.common.stats.StatsProvider"
        );
        var StatsCapability = Java.type(
            "com.dragonminez.common.stats.StatsCapability"
        );
        var mcPlayer = getMcPlayer(player);
        if (mcPlayer == null) {
            return null;
        }
        var lazy = StatsProvider.get(
            StatsCapability.INSTANCE,
            mcPlayer
        );
        if (lazy == null) {
            return null;
        }
        return lazy.orElse(null);
    } catch (err) {
        return null;
    }
}

function isDifficultyChosen(questData) {
    if (questData == null) {
        return false;
    }
    try {
        return questData.isDifficultyChosen() === true;
    } catch (err) {
        return false;
    }
}

function hasCreatedCharacter(status) {
    if (status == null) {
        return false;
    }
    try {
        return status.isHasCreatedCharacter() === true;
    } catch (err) {
        return false;
    }
}

function isInDmzParty(questData) {
    if (questData == null) {
        return false;
    }
    try {
        return questData.isInParty() === true;
    } catch (err) {
        return false;
    }
}

function isDmzPartyLeader(questData, mcPlayer) {
    if (questData == null || mcPlayer == null) {
        return false;
    }
    try {
        return questData.isPartyLeader(
            mcPlayer.m_20148_()
        ) === true;
    } catch (err1) {
        try {
            return questData.isPartyLeader(
                mcPlayer.getUUID()
            ) === true;
        } catch (err2) {
            return false;
        }
    }
}

function leaveDmzParty(mcPlayer) {
    if (mcPlayer == null) {
        return false;
    }
    try {
        var PartyManager = Java.type(
            "com.dragonminez.common.quest.PartyManager"
        );
        PartyManager.leaveParty(mcPlayer);
        return true;
    } catch (err1) {}

    try {
        var StatsProvider = Java.type(
            "com.dragonminez.common.stats.StatsProvider"
        );
        var StatsCapability = Java.type(
            "com.dragonminez.common.stats.StatsCapability"
        );
        var dmzData = StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);
        if (dmzData != null) {
            dmzData.getPlayerQuestData().clearPartyState();
            return true;
        }
    } catch (err2) {}

    return false;
}

function clearStuckSagaDifficulty(player, dmzData, notify) {
    if (dmzData == null) {
        return false;
    }

    try {
        var questData =
            dmzData.getPlayerQuestData();

        if (questData == null) {
            return false;
        }

        var mcPlayer = getMcPlayer(player);
        var wasChosen = isDifficultyChosen(questData);
        var wasInParty = isInDmzParty(questData);
        var wasLeader = isDmzPartyLeader(
            questData,
            mcPlayer
        );

        /*
         * Non-leaders never get a working picker even after
         * unlocking difficultyChosen. Leave party so solo
         * selection works again.
         */
        if (wasInParty && !wasLeader) {
            leaveDmzParty(mcPlayer);
            try {
                questData =
                    dmzData.getPlayerQuestData();
            } catch (refreshErr) {}
        }

        try {
            questData.requestDifficultyReselect();
        } catch (reselectErr) {
            try {
                questData.setDifficultyChosen(false);
            } catch (setErr) {
                if (notify && player != null) {
                    player.message(
                        "\u00A7c[Race Lock] Could not clear difficultyChosen: " +
                        setErr
                    );
                }
                return false;
            }
        }

        try {
            questData.setDifficultyChosen(false);
        } catch (forceErr) {}

        var synced = syncProgression(mcPlayer);
        var stillChosen = isDifficultyChosen(questData);

        if (notify && player != null) {
            if (!stillChosen) {
                player.message(
                    "\u00A75[Race Lock] \u00A7aSaga difficulty unlocked."
                );
                player.message(
                    "\u00A77Close and reopen the Saga / Quest Tree, then choose Easy, Normal, or Hard."
                );
            } else {
                player.message(
                    "\u00A7c[Race Lock] Unlock ran but difficultyChosen is still true."
                );
            }

            if (!synced) {
                player.message(
                    "\u00A7c[Race Lock] Client sync failed — relog after unlock."
                );
            }

            if (wasInParty && !wasLeader) {
                player.message(
                    "\u00A7e[Race Lock] Left DMZ party so difficulty selection is allowed."
                );
            }

        } else if (DEBUG && wasChosen && player != null) {
            player.message(
                "\u00A76[Race Lock Debug] \u00A77Cleared stuck saga difficultyChosen so the picker can open again."
            );
        }

        return !stillChosen;
    } catch (err) {
        if (notify && player != null) {
            player.message(
                "\u00A7c[Race Lock] Difficulty unlock error: " +
                err
            );
        }
        return false;
    }
}

/*
 * Keep retrying while character creation is incomplete and
 * difficulty/party state blocks the picker. No Bukkit needed.
 */
function maybeAutoUnlockStuckDifficulty(player, dmzData, temp) {
    if (player == null || dmzData == null || temp == null) {
        return false;
    }

    var questData = null;
    var status = null;
    try {
        questData = dmzData.getPlayerQuestData();
    } catch (qErr) {}
    try {
        status = dmzData.getStatus();
    } catch (sErr) {}

    var created = hasCreatedCharacter(status);
    var chosen = isDifficultyChosen(questData);
    var inParty = isInDmzParty(questData);
    var leader = isDmzPartyLeader(
        questData,
        getMcPlayer(player)
    );

    /*
     * Finished characters keep their chosen difficulty.
     * Use !unlockdifficulty to force reselect.
     */
    if (created) {
        return false;
    }

    var stuck = chosen || (inParty && !leader);
    if (!stuck) {
        return false;
    }

    var coolKey = "race_lock_saga_diff_cooldown";
    var cool = 0;
    try {
        cool = parseInt("" + temp.get(coolKey), 10);
        if (isNaN(cool)) {
            cool = 0;
        }
    } catch (coolErr) {
        cool = 0;
    }

    if (cool > 0) {
        temp.put(coolKey, "" + (cool - 1));
        return false;
    }

    temp.put(coolKey, "" + SAGA_UNLOCK_RETRY_TICKS);
    return clearStuckSagaDifficulty(
        player,
        dmzData,
        true
    );
}

var SAGA_TRIGGER_ID = 120;

function resolveScriptPlayer(event) {
    if (event == null) {
        return null;
    }

    /*
     * Player events (tick/login/chat) expose event.player.
     * ScriptTriggerEvent exposes event.entity + event.arguments.
     * Using only event.player makes /noppes script trigger do nothing.
     */
    try {
        if (event.player != null) {
            return event.player;
        }
    } catch (playerErr) {}

    try {
        if (event.entity != null) {
            var ent = event.entity;
            try {
                if (ent.getMCEntity && ent.getMCEntity() != null) {
                    var mc = ent.getMCEntity();
                    if (
                        mc != null &&
                        (
                            "" + mc.getClass().getName()
                        ).indexOf("Player") >= 0
                    ) {
                        return ent;
                    }
                }
            } catch (entTypeErr) {}

            try {
                if (ent.getName && ent.getUUID) {
                    return ent;
                }
            } catch (entErr) {}
        }
    } catch (entityErr) {}

    try {
        if (
            event.arguments != null &&
            event.arguments.length > 0 &&
            event.arguments[0] != null &&
            ("" + event.arguments[0]).length > 0
        ) {
            var name = ("" + event.arguments[0]).trim();
            var world = null;

            try {
                if (event.player != null) {
                    world = event.player.getWorld();
                }
            } catch (w1) {}

            try {
                if (world == null && event.entity != null) {
                    world = event.entity.getWorld();
                }
            } catch (w2) {}

            try {
                if (world == null && event.level != null) {
                    /* some CNPC builds expose level/world on WorldEvent */
                    var players = event.level.getAllPlayers
                        ? event.level.getAllPlayers()
                        : null;
                    if (players != null) {
                        for (var i = 0; i < players.length; i++) {
                            if (
                                ("" + players[i].getName())
                                    .toLowerCase() ===
                                name.toLowerCase()
                            ) {
                                return players[i];
                            }
                        }
                    }
                }
            } catch (w3) {}

            if (world != null) {
                try {
                    var found = world.getPlayer(name);
                    if (found != null) {
                        return found;
                    }
                } catch (getErr) {}

                try {
                    var all = world.getAllPlayers();
                    for (var j = 0; j < all.length; j++) {
                        if (
                            ("" + all[j].getName())
                                .toLowerCase() ===
                            name.toLowerCase()
                        ) {
                            return all[j];
                        }
                    }
                } catch (scanErr) {}
            }

            /* Bukkit fallback used by other scripts on this server */
            try {
                var Bukkit = Java.type("org.bukkit.Bukkit");
                var bp = Bukkit.getPlayer(name);
                if (bp == null) {
                    bp = Bukkit.getPlayerExact(name);
                }
                if (bp != null) {
                    var NPCAPI = Java.type(
                        "noppes.npcs.api.NpcAPI"
                    ).Instance();
                    var mcBp = bp.getPlayer
                        ? bp.getPlayer()
                        : null;
                    /* CraftBukkit player -> MC -> IPlayer */
                    try {
                        var handle = bp.getClass()
                            .getMethod("getHandle")
                            .invoke(bp);
                        return NPCAPI.getIEntity(handle);
                    } catch (handleErr) {}
                }
            } catch (bukkitErr) {}
        }
    } catch (argErr) {}

    return null;
}

function runManualSagaDifficultyUnlock(player, sourceLabel) {
    if (player == null) {
        return false;
    }

    var dmzData = loadDmzData(player);
    if (dmzData == null) {
        try {
            player.message(
                "\u00A7c[Race Lock] Could not read DMZ data."
            );
        } catch (err2) {}
        return false;
    }

    return clearStuckSagaDifficulty(player, dmzData, true);
}

/*
 * Chat often does nothing on hybrid / plugin chat bridges.
 * Keep it, but prefer Trigger:
 *   /noppes script trigger 120
 *   /noppes script trigger 120 <player>
 */
function chat(event) {
    try {
        var message = "" + event.message;
        if (message == null) {
            return;
        }

        var trimmed = message.trim().toLowerCase();
        if (
            trimmed !== "!unlockdifficulty" &&
            trimmed !== "!sagadifficulty"
        ) {
            return;
        }

        try {
            event.setCanceled(true);
        } catch (cancelErr) {}

        var player = resolveScriptPlayer(event);
        if (player == null) {
            return;
        }
        runManualSagaDifficultyUnlock(player, "chat");
    } catch (err) {
        try {
            var p = resolveScriptPlayer(event);
            if (p != null) {
                p.message(
                    "\u00A7c[Race Lock] Difficulty unlock error: " +
                    err
                );
            }
        } catch (msgErr) {}
    }
}

function trigger(event) {
    try {
        if (
            event.id != null &&
            Number(event.id) !== SAGA_TRIGGER_ID
        ) {
            return;
        }
    } catch (idErr) {}

    try {
        var player = resolveScriptPlayer(event);
        if (player == null) {
            try {
                print(
                    "[Race Lock] trigger " +
                    SAGA_TRIGGER_ID +
                    " could not resolve a player. Use: /noppes script trigger " +
                    SAGA_TRIGGER_ID +
                    " <playerName>"
                );
            } catch (printErr) {}
            return;
        }

        runManualSagaDifficultyUnlock(
            player,
            "trigger " + SAGA_TRIGGER_ID
        );
    } catch (err) {
        try {
            var p2 = resolveScriptPlayer(event);
            if (p2 != null) {
                p2.message(
                    "\u00A7c[Race Lock] Difficulty unlock error: " +
                    err
                );
            }
            print("[Race Lock] trigger error: " + err);
        } catch (msgErr) {}
    }
}

function login(event) {
    try {
        runSessionSagaDifficultyCheck(event.player, true);
    } catch (err) {}
}

/*
 * Once per login session (Tick or Login): prove Race Lock is
 * alive, and unlock if difficulty/party is blocking selection.
 * Works with only Tick enabled — no Chat needed.
 */
function runSessionSagaDifficultyCheck(player, fromLogin) {
    if (player == null) {
        return;
    }

    var temp = player.getTempdata();
    var doneKey = "race_lock_saga_session_check";
    try {
        if (temp.get(doneKey) != null) {
            return;
        }
    } catch (err) {}

    try {
        temp.put(doneKey, "1");
    } catch (putErr) {}

    var dmzData = loadDmzData(player);
    if (dmzData == null) {
        return;
    }

    var questData = null;
    var status = null;
    try {
        questData = dmzData.getPlayerQuestData();
    } catch (qErr) {}
    try {
        status = dmzData.getStatus();
    } catch (sErr) {}

    var chosen = isDifficultyChosen(questData);
    var inParty = isInDmzParty(questData);
    var leader = isDmzPartyLeader(
        questData,
        getMcPlayer(player)
    );

    /*
     * Silent unless something is actually stuck.
     * No debug status spam on login/tick.
     */
    if (chosen || (inParty && !leader)) {
        clearStuckSagaDifficulty(player, dmzData, true);
    }
}

function tryEarlySagaDifficultyUnlock(player) {
    try {
        if (player == null) {
            return;
        }

        /* Session check first so Tick-only installs still unlock. */
        runSessionSagaDifficultyCheck(player, false);

        var temp = player.getTempdata();
        var dmzData = loadDmzData(player);
        if (dmzData == null) {
            return;
        }
        maybeAutoUnlockStuckDifficulty(
            player,
            dmzData,
            temp
        );
    } catch (err) {}
}

function tick(event) {
    try {
        var player = event.player;

        if (player == null) {
            return;
        }

        /*
         * Unlock saga difficulty before any Bukkit-dependent
         * race-lock logic. Missing Bukkit must not block this.
         */
        tryEarlySagaDifficultyUnlock(player);

        var temp =
            player.getTempdata();


        // ====================================================
        // CHECK INTERVAL
        // ====================================================

        var tickKey =
            "restricted_race_command_tick";

        var tickCount =
            temp.get(tickKey);

        if (tickCount == null) {
            tickCount = 0;
        }

        tickCount =
            parseInt("" + tickCount) + 1;

        if (isNaN(tickCount)) {
            tickCount = 1;
        }

        if (tickCount < TICK_INTERVAL) {
            temp.put(
                tickKey,
                "" + tickCount
            );

            return;
        }

        temp.put(
            tickKey,
            "0"
        );


        // ====================================================
        // RESET RETRY COOLDOWN
        // ====================================================

        var retryKey =
            "restricted_race_command_retry";

        var retryChecks =
            temp.get(retryKey);

        if (retryChecks == null) {
            retryChecks = 0;
        }

        retryChecks =
            parseInt("" + retryChecks);

        if (isNaN(retryChecks)) {
            retryChecks = 0;
        }

        if (retryChecks > 0) {
            retryChecks =
                retryChecks - 1;

            temp.put(
                retryKey,
                "" + retryChecks
            );

            return;
        }


        // ====================================================
        // VALIDATE CONFIGURATION
        // ====================================================

        if (
            RESTRICTED_RACE_IDS.length !=
            REQUIRED_FABLED_SKILLS.length
        ) {
            throw (
                "RESTRICTED_RACE_IDS and " +
                "REQUIRED_FABLED_SKILLS must contain " +
                "the same number of entries."
            );
        }

        if (
            RESTRICTED_RACE_DISPLAY_NAMES.length !=
            RESTRICTED_RACE_IDS.length
        ) {
            throw (
                "RESTRICTED_RACE_DISPLAY_NAMES and " +
                "RESTRICTED_RACE_IDS must contain " +
                "the same number of entries."
            );
        }


        // ====================================================
        // JAVA CLASSES
        // ====================================================

        var Bukkit = Java.type(
            "org.bukkit.Bukkit"
        );

        var UUID = Java.type(
            "java.util.UUID"
        );

        var StatsProvider = Java.type(
            "com.dragonminez.common.stats.StatsProvider"
        );

        var StatsCapability = Java.type(
            "com.dragonminez.common.stats.StatsCapability"
        );


        // ====================================================
        // GET THE BUKKIT PLAYER
        //
        // This is copied from the working Fabled attribute
        // script's approach.
        // ====================================================

        var bukkitPlayer =
            Bukkit.getPlayer(
                UUID.fromString(
                    "" + player.getUUID()
                )
            );

        if (bukkitPlayer == null) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] Bukkit player was unavailable."
                );
            }

            return;
        }


        // ====================================================
        // GET DMZ DATA
        // ====================================================

        var lazy = StatsProvider.get(
            StatsCapability.INSTANCE,
            player.getMCEntity()
        );

        if (lazy == null) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] DMZ LazyOptional was unavailable."
                );
            }

            return;
        }

        var dmzData =
            lazy.orElse(null);

        if (dmzData == null) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] DMZ player data was unavailable."
                );
            }

            return;
        }

        var status =
            dmzData.getStatus();

        if (status == null) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] DMZ status data was unavailable."
                );
            }

            return;
        }


        // After a successful reset, DMZ marks the character as
        // not created. Stop checking until the player creates
        // another character.
        //
        // Also unlock stuck saga difficulty once — dmzstats
        // reset leaves difficultyChosen true, which blocks the
        // picker until requestDifficultyReselect runs.

        if (!status.isHasCreatedCharacter()) {
            maybeAutoUnlockStuckDifficulty(
                player,
                dmzData,
                temp
            );

            temp.remove(
                "restricted_race_command_last_state"
            );

            return;
        }

        var character =
            dmzData.getCharacter();

        if (character == null) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] DMZ character data was unavailable."
                );
            }

            return;
        }


        // ====================================================
        // READ THE EXACT DMZ RACE ID
        // ====================================================

        var rawRaceId =
            character.getRace();

        if (rawRaceId == null) {
            return;
        }

        var raceId =
            ("" + rawRaceId).trim();

        if (
            raceId == "" ||
            raceId == "null"
        ) {
            return;
        }

        var lowerRaceId =
            raceId.toLowerCase();


        // ====================================================
        // FIND THE RACE IN THE RESTRICTED LIST
        // ====================================================

        var restrictedIndex = -1;

        var raceIndex;

        for (
            raceIndex = 0;
            raceIndex <
                RESTRICTED_RACE_IDS.length;
            raceIndex++
        ) {
            var configuredRaceId =
                "" +
                RESTRICTED_RACE_IDS[
                    raceIndex
                ];

            configuredRaceId =
                configuredRaceId
                    .trim()
                    .toLowerCase();

            if (
                lowerRaceId ==
                configuredRaceId
            ) {
                restrictedIndex =
                    raceIndex;

                break;
            }
        }


        // The player's current race is not restricted.

        if (restrictedIndex == -1) {
            if (DEBUG) {
                var unrestrictedState =
                    "unrestricted|" +
                    lowerRaceId;

                var oldUnrestrictedState =
                    temp.get(
                        "restricted_race_command_last_state"
                    );

                if (
                    oldUnrestrictedState == null ||
                    ("" + oldUnrestrictedState) !=
                        unrestrictedState
                ) {
                    temp.put(
                        "restricted_race_command_last_state",
                        unrestrictedState
                    );

                    player.message(
                        "\u00A76[Race Lock Debug] \u00A77Actual race ID: \u00A7f[" +
                        raceId +
                        "]"
                    );

                    player.message(
                        "\u00A76[Race Lock Debug] \u00A77This race is not restricted."
                    );
                }
            }

            return;
        }


        // ====================================================
        // READ THE REQUIRED FABLED SKILL
        // ====================================================

        var requiredSkill =
            "" +
            REQUIRED_FABLED_SKILLS[
                restrictedIndex
            ];

        requiredSkill =
            requiredSkill.trim();

        if (requiredSkill == "") {
            throw (
                "Race " +
                raceId +
                " has no required Fabled skill configured."
            );
        }

        var raceDisplayName =
            "" +
            RESTRICTED_RACE_DISPLAY_NAMES[
                restrictedIndex
            ];

        raceDisplayName =
            raceDisplayName.trim();

        if (raceDisplayName == "") {
            raceDisplayName =
                raceId;
        }


        // ====================================================
        // GET THE FABLED PLUGIN
        //
        // This follows the working script exactly:
        //
        // 1. Get plugin from Bukkit.
        // 2. Get the plugin's own classloader.
        // 3. Load studio.magemonkey.fabled.Fabled through it.
        // 4. Find getData.
        // 5. Invoke getData for the Bukkit player.
        // ====================================================

        var plugin =
            Bukkit
                .getPluginManager()
                .getPlugin("Fabled");

        if (
            plugin == null ||
            !plugin.isEnabled()
        ) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] Fabled is not loaded or enabled."
                );
            }

            return;
        }

        var loader =
            plugin
                .getClass()
                .getClassLoader();

        var fabledClass =
            loader.loadClass(
                "studio.magemonkey.fabled.Fabled"
            );

        var getDataMethod = null;

        var methods =
            fabledClass.getMethods();

        var methodIndex;

        for (
            methodIndex = 0;
            methodIndex <
                methods.length;
            methodIndex++
        ) {
            if (
                String(
                    methods[
                        methodIndex
                    ].getName()
                ) == "getData" &&
                methods[
                    methodIndex
                ].getParameterTypes().length == 1
            ) {
                getDataMethod =
                    methods[
                        methodIndex
                    ];

                break;
            }
        }

        if (getDataMethod == null) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] Fabled getData method was not found."
                );
            }

            return;
        }

        var fabledData =
            getDataMethod.invoke(
                null,
                bukkitPlayer
            );

        if (fabledData == null) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] Fabled player data was unavailable."
                );
            }

            return;
        }


        // ====================================================
        // CHECK THE REQUIRED FABLED SKILL
        // ====================================================
        //
        // Verified Fabled method:
        //
        // PlayerData.getSkillLevel(String)
        //
        // This accepts a skill key or displayed skill name.
        // ====================================================

        var skillLevel = 0;

        try {
            skillLevel =
                Number(
                    fabledData.getSkillLevel(
                        requiredSkill
                    )
                );

        } catch (skillError) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] getSkillLevel failed: \u00A7f" +
                    skillError
                );
            }

            return;
        }

        if (isNaN(skillLevel)) {
            skillLevel = 0;
        }


        // ====================================================
        // DEBUG THE RACE AND FABLED RESULT
        // ====================================================

        if (DEBUG) {
            var restrictedState =
                "restricted|" +
                lowerRaceId +
                "|" +
                requiredSkill.toLowerCase() +
                "|" +
                skillLevel;

            var oldRestrictedState =
                temp.get(
                    "restricted_race_command_last_state"
                );

            if (
                oldRestrictedState == null ||
                ("" + oldRestrictedState) !=
                    restrictedState
            ) {
                temp.put(
                    "restricted_race_command_last_state",
                    restrictedState
                );

                player.message(
                    "\u00A76[Race Lock Debug] \u00A77Actual race ID: \u00A7f[" +
                    raceId +
                    "]"
                );

                player.message(
                    "\u00A76[Race Lock Debug] \u00A77Restricted race matched: \u00A7f" +
                    raceId
                );

                player.message(
                    "\u00A76[Race Lock Debug] \u00A77Required Fabled skill: \u00A7f" +
                    requiredSkill
                );

                player.message(
                    "\u00A76[Race Lock Debug] \u00A77Current skill level: \u00A7f" +
                    skillLevel
                );
            }
        }


        // The player has purchased the required race unlock.

        if (skillLevel >= 1) {
            return;
        }


        // ====================================================
        // BUILD THE EXACT DMZ RESET COMMAND
        // ====================================================
        //
        // Verified DMZ syntax:
        //
        // dmzstats reset <targets> <keepPercentage> <keepSkills>
        //
        // For a complete reset:
        //
        // dmzstats reset PlayerName 0 false
        // ====================================================

        var resetCommand =
            "dmzstats reset " +
            player.getName() +
            " 0 false";


        player.message(
            "\u00A7c\u00A7lRACE LOCKED"
        );

        player.message(
            "\u00A77You have not unlocked the race \u00A7f" +
            raceDisplayName +
            "\u00A77."
        );

        player.message(
            "\u00A77Required Fabled skill: \u00A7f" +
            requiredSkill
        );

        if (DEBUG) {
            player.message(
                "\u00A76[Race Lock Debug] \u00A77Running command: \u00A7f" +
                resetCommand
            );
        }


        // ====================================================
        // EXECUTE THE COMMAND
        // ====================================================
        //
        // First try Bukkit's console dispatcher. This gives the
        // command full console permissions.
        //
        // If the Bukkit command bridge does not recognize the
        // Forge command, fall back to CustomNPCs' command
        // executor, which runs through Minecraft's dispatcher.
        // ====================================================

        var dispatchedThroughBukkit = false;
        var customNpcCommandOutput = null;

        try {
            dispatchedThroughBukkit =
                Bukkit.dispatchCommand(
                    Bukkit.getConsoleSender(),
                    resetCommand
                );

        } catch (bukkitCommandError) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Race Lock Debug] Bukkit command error: \u00A7f" +
                    bukkitCommandError
                );
            }

            dispatchedThroughBukkit =
                false;
        }


        if (!dispatchedThroughBukkit) {
            try {
                customNpcCommandOutput =
                    event.API.executeCommand(
                        player.getWorld(),
                        resetCommand
                    );

            } catch (cnpcCommandError) {
                player.message(
                    "\u00A7c[Race Lock] Both command execution methods failed."
                );

                if (DEBUG) {
                    player.message(
                        "\u00A7c[Race Lock Debug] CNPC command error: \u00A7f" +
                        cnpcCommandError
                    );
                }

                temp.put(
                    retryKey,
                    "" + RESET_RETRY_CHECKS
                );

                return;
            }
        }


        // Prevent command spam if the reset did not take effect
        // immediately. The script will retry after the configured
        // number of checks.

        temp.put(
            retryKey,
            "" + RESET_RETRY_CHECKS
        );

        /*
         * Clear stuck saga difficulty as soon as the reset
         * command is issued. Do not wait for the character-
         * created flag to flip — that is what blocks the picker.
         */
        clearStuckSagaDifficulty(
            player,
            dmzData,
            true
        );


        // ====================================================
        // COMMAND RESULT DEBUGGING
        // ====================================================

        if (DEBUG) {
            player.message(
                "\u00A76[Race Lock Debug] \u00A77Bukkit dispatch result: \u00A7f" +
                dispatchedThroughBukkit
            );

            if (customNpcCommandOutput != null) {
                player.message(
                    "\u00A76[Race Lock Debug] \u00A77CNPC command output: \u00A7f" +
                    customNpcCommandOutput
                );
            }
        }


        // ====================================================
        // IMMEDIATE RESET VERIFICATION
        // ====================================================
        //
        // Command execution is normally synchronous, so DMZ's
        // character-created status should already be false.
        //
        // Even if the immediate check has not updated yet, the
        // script will check again after the retry cooldown.
        // ====================================================

        var updatedStatus =
            dmzData.getStatus();

        if (
            updatedStatus != null &&
            !updatedStatus.isHasCreatedCharacter()
        ) {
            /*
             * dmzstats reset clears quest progress but does NOT
             * clear difficultyChosen. If that flag stays true,
             * SetStoryDifficultyC2S rejects every click and the
             * saga difficulty picker never works again.
             */
            clearStuckSagaDifficulty(
                player,
                dmzData,
                true
            );

            player.message(
                "\u00A7a[Race Lock] Your DMZ character was reset."
            );

            player.message(
                "\u00A77Purchase \u00A7f" +
                requiredSkill +
                " \u00A77before selecting \u00A7f" +
                raceDisplayName +
                " \u00A77again."
            );

            temp.remove(
                "restricted_race_command_last_state"
            );

        } else {
            player.message(
                "\u00A7e[Race Lock] The reset command was issued, but DMZ " +
                "still reports the character as created."
            );

            if (DEBUG) {
                player.message(
                    "\u00A7e[Race Lock Debug] The script will retry after " +
                    RESET_RETRY_CHECKS +
                    " checks."
                );
            }
        }

    } catch (error) {
        var playerForError =
            event.player;

        if (playerForError != null) {
            var errorTemp =
                playerForError.getTempdata();

            var errorText =
                "" + error;

            var previousError =
                errorTemp.get(
                    "restricted_race_command_last_error"
                );

            if (
                previousError == null ||
                ("" + previousError) !=
                    errorText
            ) {
                errorTemp.put(
                    "restricted_race_command_last_error",
                    errorText
                );

                playerForError.message(
                    "\u00A7c[Race Lock Error] \u00A7f" +
                    errorText
                );

                print(
                    "[Restricted Race Command] Error for " +
                    playerForError.getName() +
                    ": " +
                    errorText
                );
            }
        }
    }
}
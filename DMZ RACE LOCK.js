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


// Keep this enabled until the test race resets correctly.
//
// It reports:
// - Actual race ID
// - Restricted-list match
// - Required Fabled skill
// - Fabled skill level
// - Exact reset command
// - Command-dispatch result
// - Immediate reset verification
var DEBUG = true;


/*
 * ============================================================
 * SAGA DIFFICULTY HELPERS
 * ============================================================
 *
 * DMZ's SetStoryDifficultyC2S ignores clicks when
 * PlayerQuestData.difficultyChosen is already true.
 * dmzstats reset / resetPlayerProgress does NOT clear that
 * flag, so Race Lock resets can permanently lock the saga
 * difficulty picker until requestDifficultyReselect() runs.
 */

function syncProgression(mcPlayer) {
    if (mcPlayer == null) {
        return;
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
        return;
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
    } catch (err2) {}
}

function clearStuckSagaDifficulty(player, dmzData) {
    if (dmzData == null) {
        return false;
    }

    try {
        var questData =
            dmzData.getPlayerQuestData();

        if (questData == null) {
            return false;
        }

        var wasChosen = false;
        try {
            wasChosen =
                questData.isDifficultyChosen() === true;
        } catch (readErr) {
            wasChosen = false;
        }

        try {
            questData.requestDifficultyReselect();
        } catch (reselectErr) {
            try {
                questData.setDifficultyChosen(false);
            } catch (setErr) {
                return false;
            }
        }

        var mcPlayer = null;
        try {
            mcPlayer = player.getMCEntity
                ? player.getMCEntity()
                : null;
        } catch (mcErr) {}

        syncProgression(mcPlayer);

        if (DEBUG && wasChosen && player != null) {
            player.message(
                "\u00A76[Race Lock Debug] \u00A77Cleared stuck saga difficultyChosen so the picker can open again."
            );
        }

        return true;
    } catch (err) {
        return false;
    }
}


// ============================================================
// GLOBAL PLAYER TICK
// ============================================================

function tick(event) {
    try {
        var player = event.player;

        if (player == null) {
            return;
        }

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
                    "§c[Race Lock Debug] Bukkit player was unavailable."
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
                    "§c[Race Lock Debug] DMZ LazyOptional was unavailable."
                );
            }

            return;
        }

        var dmzData =
            lazy.orElse(null);

        if (dmzData == null) {
            if (DEBUG) {
                player.message(
                    "§c[Race Lock Debug] DMZ player data was unavailable."
                );
            }

            return;
        }

        var status =
            dmzData.getStatus();

        if (status == null) {
            if (DEBUG) {
                player.message(
                    "§c[Race Lock Debug] DMZ status data was unavailable."
                );
            }

            return;
        }


        // After a successful reset, DMZ marks the character as
        // not created. Stop checking until the player creates
        // another character.

        if (!status.isHasCreatedCharacter()) {
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
                    "§c[Race Lock Debug] DMZ character data was unavailable."
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
                        "§6[Race Lock Debug] §7Actual race ID: §f[" +
                        raceId +
                        "]"
                    );

                    player.message(
                        "§6[Race Lock Debug] §7This race is not restricted."
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
                    "§c[Race Lock Debug] Fabled is not loaded or enabled."
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
                    "§c[Race Lock Debug] Fabled getData method was not found."
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
                    "§c[Race Lock Debug] Fabled player data was unavailable."
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
                    "§c[Race Lock Debug] getSkillLevel failed: §f" +
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
                    "§6[Race Lock Debug] §7Actual race ID: §f[" +
                    raceId +
                    "]"
                );

                player.message(
                    "§6[Race Lock Debug] §7Restricted race matched: §f" +
                    raceId
                );

                player.message(
                    "§6[Race Lock Debug] §7Required Fabled skill: §f" +
                    requiredSkill
                );

                player.message(
                    "§6[Race Lock Debug] §7Current skill level: §f" +
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
            "§c§lRACE LOCKED"
        );

        player.message(
            "§7You have not unlocked the race §f" +
            raceDisplayName +
            "§7."
        );

        player.message(
            "§7Required Fabled skill: §f" +
            requiredSkill
        );

        if (DEBUG) {
            player.message(
                "§6[Race Lock Debug] §7Running command: §f" +
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
                    "§c[Race Lock Debug] Bukkit command error: §f" +
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
                    "§c[Race Lock] Both command execution methods failed."
                );

                if (DEBUG) {
                    player.message(
                        "§c[Race Lock Debug] CNPC command error: §f" +
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
            dmzData
        );


        // ====================================================
        // COMMAND RESULT DEBUGGING
        // ====================================================

        if (DEBUG) {
            player.message(
                "§6[Race Lock Debug] §7Bukkit dispatch result: §f" +
                dispatchedThroughBukkit
            );

            if (customNpcCommandOutput != null) {
                player.message(
                    "§6[Race Lock Debug] §7CNPC command output: §f" +
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
                dmzData
            );

            player.message(
                "§a[Race Lock] Your DMZ character was reset."
            );

            player.message(
                "§7Purchase §f" +
                requiredSkill +
                " §7before selecting §f" +
                raceDisplayName +
                " §7again."
            );

            temp.remove(
                "restricted_race_command_last_state"
            );

        } else {
            player.message(
                "§e[Race Lock] The reset command was issued, but DMZ " +
                "still reports the character as created."
            );

            if (DEBUG) {
                player.message(
                    "§e[Race Lock Debug] The script will retry after " +
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
                    "§c[Race Lock Error] §f" +
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
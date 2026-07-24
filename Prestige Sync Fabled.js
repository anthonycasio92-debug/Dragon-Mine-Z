// ============================================================
// Fabled Prestige Class -> DMZ Prestige Skill Sync
// Global Player Tick Script
//
// DMZ skill ID:
// prestige
//
// Target DMZ skill level:
// Fabled Prestige class level - 1
//
// Examples:
// Prestige class level 1 -> DMZ prestige skill level 0
// Prestige class level 2 -> DMZ prestige skill level 1
// Prestige class level 10 -> DMZ prestige skill level 9
//
// Skips sync while DMZ hasCreatedCharacter is false so a wipe
// is not undone every second by restoring the prestige skill.
// ============================================================

var TICK_INTERVAL = 20; // once per second
var DEBUG = false;

var FABLED_CLASS_NAME = "Prestige";
var DMZ_SKILL_ID = "prestige";

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();

        var tickKey = "fabled_dmz_prestige_skill_tick";
        var tickCount = temp.get(tickKey);

        if (tickCount == null) {
            tickCount = 0;
        }

        tickCount = parseInt("" + tickCount) + 1;

        if (tickCount < TICK_INTERVAL) {
            temp.put(tickKey, "" + tickCount);
            return;
        }

        temp.put(tickKey, "0");

        // ----------------------------------------------------
        // Java classes accessible directly
        // ----------------------------------------------------

        var Bukkit = Java.type("org.bukkit.Bukkit");
        var UUID = Java.type("java.util.UUID");

        var StatsProvider = Java.type(
            "com.dragonminez.common.stats.StatsProvider"
        );

        var StatsCapability = Java.type(
            "com.dragonminez.common.stats.StatsCapability"
        );

        var StatsSyncS2C = Java.type(
            "com.dragonminez.common.network.S2C.StatsSyncS2C"
        );

        var NetworkHandler = Java.type(
            "com.dragonminez.common.network.NetworkHandler"
        );

        // ----------------------------------------------------
        // Get Bukkit player
        // ----------------------------------------------------

        var bukkitPlayer = Bukkit.getPlayer(
            UUID.fromString("" + player.getUUID())
        );

        if (bukkitPlayer == null) return;

        // ----------------------------------------------------
        // Load Fabled through its own plugin class loader
        // ----------------------------------------------------

        var plugin = Bukkit.getPluginManager().getPlugin("Fabled");

        if (plugin == null || !plugin.isEnabled()) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Prestige Sync] Fabled plugin is unavailable."
                );
            }

            return;
        }

        var loader = plugin.getClass().getClassLoader();

        var fabledClass = loader.loadClass(
            "studio.magemonkey.fabled.Fabled"
        );

        // ----------------------------------------------------
        // Locate Fabled.getData(player)
        // ----------------------------------------------------

        var getDataMethod = null;
        var methods = fabledClass.getMethods();

        for (var i = 0; i < methods.length; i++) {
            var methodName = "" + methods[i].getName();
            var parameterCount =
                methods[i].getParameterTypes().length;

            if (
                methodName == "getData" &&
                parameterCount == 1
            ) {
                getDataMethod = methods[i];
                break;
            }
        }

        if (getDataMethod == null) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Prestige Sync] Could not locate Fabled.getData."
                );
            }

            return;
        }

        var fabledData = getDataMethod.invoke(
            null,
            bukkitPlayer
        );

        if (fabledData == null) return;

        // ----------------------------------------------------
        // Find the player's Prestige class
        // ----------------------------------------------------

        var prestigeClass = null;

        try {
            prestigeClass = fabledData.getClass(
                FABLED_CLASS_NAME
            );
        } catch (classLookupError) {}

        // Try lowercase internal ID
        if (prestigeClass == null) {
            try {
                prestigeClass = fabledData.getClass(
                    "prestige"
                );
            } catch (lowercaseLookupError) {}
        }

        // If direct lookup fails, search all player classes
        if (prestigeClass == null) {
            try {
                var playerClasses = fabledData.getClasses();

                if (playerClasses != null) {
                    var classIterator = playerClasses.iterator();

                    while (classIterator.hasNext()) {
                        var currentClass = classIterator.next();

                        if (currentClass == null) continue;

                        var classData = currentClass.getData();

                        if (classData == null) continue;

                        var className = "" + classData.getName();

                        if (
                            className.toLowerCase() ==
                            FABLED_CLASS_NAME.toLowerCase()
                        ) {
                            prestigeClass = currentClass;
                            break;
                        }
                    }
                }
            } catch (classSearchError) {}
        }

        // ----------------------------------------------------
        // Determine the target DMZ skill level
        // ----------------------------------------------------

        var prestigeClassLevel = 0;

        if (prestigeClass != null) {
            prestigeClassLevel = parseInt(
                "" + prestigeClass.getLevel()
            );

            if (isNaN(prestigeClassLevel)) {
                prestigeClassLevel = 0;
            }
        }

        var targetSkillLevel = prestigeClassLevel - 1;

        if (targetSkillLevel < 0) {
            targetSkillLevel = 0;
        }

        // ----------------------------------------------------
        // Get DMZ player data
        // ----------------------------------------------------

        var lazy = StatsProvider.get(
            StatsCapability.INSTANCE,
            player.getMCEntity()
        );

        if (lazy == null) return;

        var dmzData = lazy.orElse(null);

        if (dmzData == null) return;

        var dmzSkills = dmzData.getSkills();

        if (dmzSkills == null) return;

        /*
         * Fabled Prestige class survives DMZ wipe.
         * Do NOT re-register / restore the DMZ prestige skill
         * while the character is wiped — that undoes Race Lock
         * / dmzstats reset skill clears every second.
         */
        var characterCreated = false;
        try {
            var status = dmzData.getStatus();
            characterCreated =
                status != null &&
                status.isHasCreatedCharacter() === true;
        } catch (statusErr) {
            characterCreated = false;
        }

        if (!characterCreated) {
            try {
                if (dmzSkills.hasSkill(DMZ_SKILL_ID)) {
                    dmzSkills.setSkillLevel(DMZ_SKILL_ID, 0);
                }
            } catch (clearSkillErr) {}
            return;
        }

        // ----------------------------------------------------
        // Make sure the custom skill exists
        // ----------------------------------------------------

        if (!dmzSkills.hasSkill(DMZ_SKILL_ID)) {
            try {
                dmzSkills.registerDefaultSkill(
                    DMZ_SKILL_ID,
                    targetSkillLevel
                );
            } catch (registerError) {
                if (DEBUG) {
                    player.message(
                        "\u00A7c[Prestige Sync] DMZ skill '" +
                        DMZ_SKILL_ID +
                        "' was not registered."
                    );
                }

                return;
            }
        }

        var currentSkillLevel = dmzSkills.getSkillLevel(
            DMZ_SKILL_ID
        );

        // ----------------------------------------------------
        // Only update when the value is different
        // ----------------------------------------------------

        if (currentSkillLevel == targetSkillLevel) {
            return;
        }

        dmzSkills.setSkillLevel(
            DMZ_SKILL_ID,
            targetSkillLevel
        );

        // ----------------------------------------------------
        // Sync the updated DMZ data to the client
        // ----------------------------------------------------

        try {
            NetworkHandler.sendToTrackingEntityAndSelf(
                new StatsSyncS2C(player.getMCEntity()),
                player.getMCEntity()
            );
        } catch (syncError) {}

        if (DEBUG) {
            player.message(
                "\u00A7a[Prestige Sync] " +
                "Fabled Prestige class level: \u00A7e" +
                prestigeClassLevel +
                " \u00A77| \u00A7aDMZ prestige skill: \u00A7e" +
                targetSkillLevel
            );
        }

    } catch (e) {
        if (event.player != null && DEBUG) {
            event.player.message(
                "\u00A7c[Prestige Sync Error] \u00A7f" + e
            );
        }
    }
}
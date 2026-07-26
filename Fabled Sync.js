/*
============================================================
 DBZ Legacy Reborn - Fabled Sync.js
 Version: 1.0.0

 Combined from: Prestige Sync Fabled.js + Fabled Prestige Faction Sync.js + Universal Fabled Value Cleaner.js

 PLACE AS: CustomNPCs Global Player Script
 Enable: tick

 Old Prestige Sync / Faction Sync / Value Cleaner files were removed.
============================================================
*/

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
// ============================================================

var TICK_INTERVAL = 20; // once per second
var DEBUG = false;

var FABLED_CLASS_NAME = "Prestige";
var DMZ_SKILL_ID = "prestige";

function prestigeSkillSyncTick(event) {
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

var Bukkit = Java.type("org.bukkit.Bukkit");

function prestigeFactionSyncTick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var FACTION_ID = 4;
        var CLASS_NAME = "Prestige";
        var CHECK_INTERVAL_MS = 5000;
        var DEBUG = false;

        var stored = player.getStoreddata();
        var now = java.lang.System.currentTimeMillis();

        var key = "prestige_faction_lock_next";
        var next = 0;

        if (stored.has(key)) {
            try {
                next = parseInt("" + stored.get(key));
            } catch (e1) {
                next = 0;
            }
        }

        if (now < next) return;
        stored.put(key, "" + (now + CHECK_INTERVAL_MS));

        var plugin = Bukkit.getPluginManager().getPlugin("Fabled");

        if (plugin == null || !plugin.isEnabled()) {
            if (DEBUG) player.message("\u00A7cFabled plugin not found/enabled.");
            return;
        }

        var bukkitPlayer = Bukkit.getPlayer(player.getName());
        if (bukkitPlayer == null) return;

        var methods = plugin.getClass().getMethods();
        var getDataMethod = null;

        for (var i = 0; i < methods.length; i++) {
            if ("" + methods[i].getName() == "getData" && methods[i].getParameterTypes().length == 1) {
                getDataMethod = methods[i];
                break;
            }
        }

        if (getDataMethod == null) {
            if (DEBUG) player.message("\u00A7cCould not find Fabled getData method.");
            return;
        }

        var fabledData = getDataMethod.invoke(null, bukkitPlayer);

        if (fabledData == null) {
            if (DEBUG) player.message("\u00A7cFabled player data missing.");
            return;
        }

        var prestigeClass = fabledData.getClass(CLASS_NAME);

        var prestigeLevel = 0;
        if (prestigeClass != null) {
            prestigeLevel = prestigeClass.getLevel();
        }

        var targetFaction = prestigeLevel - 1;
        if (targetFaction < 0) targetFaction = 0;

        var currentFaction = 0;
        try {
            currentFaction = player.getFactionPoints(FACTION_ID);
        } catch (e2) {
            if (DEBUG) player.message("\u00A7cCould not read CNPC faction points.");
            return;
        }

        if (currentFaction != targetFaction) {
            var difference = targetFaction - currentFaction;

            player.addFactionPoints(FACTION_ID, difference);

            if (DEBUG) {
                player.message("\u00A77Faction 4 corrected: \u00A7f" + currentFaction + " \u00A77-> \u00A7f" + targetFaction);
                player.message("\u00A77Fabled Prestige level: \u00A7f" + prestigeLevel);
            }
        }

    } catch (err) {
        try {
            event.player.message("\u00A7cPrestige faction lock error: " + err);
        } catch (e3) {}
    }
}

// Universal Fabled Value Cleaner
// Cleans ALL Fabled persistent values for every player.
// Converts scientific notation into plain command-friendly numbers.

var CLEANER_TICK_INTERVAL = 20; // once per second
var ROUND_TO_WHOLE = false;
var CLEANER_DEBUG = false;

function fabledValueCleanerTick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();
        var tickKey = "fabled_all_value_cleaner_tick";
        var tickCount = temp.get(tickKey);

        if (tickCount == null) tickCount = 0;
        tickCount = parseInt("" + tickCount) + 1;

        if (tickCount < CLEANER_TICK_INTERVAL) {
            temp.put(tickKey, "" + tickCount);
            return;
        }

        temp.put(tickKey, "0");

        var Bukkit = Java.type("org.bukkit.Bukkit");
        var UUID = Java.type("java.util.UUID");
        var BigDecimal = Java.type("java.math.BigDecimal");
        var RoundingMode = Java.type("java.math.RoundingMode");

        var bukkitPlayer = Bukkit.getPlayer(UUID.fromString("" + player.getUUID()));
        if (bukkitPlayer == null) return;

        var plugin = Bukkit.getPluginManager().getPlugin("Fabled");
        if (plugin == null) return;

        var loader = plugin.getClass().getClassLoader();
        var fabledClass = loader.loadClass("studio.magemonkey.fabled.Fabled");

        var getDataMethod = null;
        var methods = fabledClass.getMethods();

        for (var i = 0; i < methods.length; i++) {
            if (methods[i].getName() == "getData" && methods[i].getParameterTypes().length == 1) {
                getDataMethod = methods[i];
                break;
            }
        }

        if (getDataMethod == null) return;

        var fabledData = getDataMethod.invoke(null, bukkitPlayer);
        if (fabledData == null) return;

        var allValues = fabledData.getAllPersistentData();
        if (allValues == null) return;

        var entries = allValues.entrySet().iterator();
        var changed = 0;

        while (entries.hasNext()) {
            var entry = entries.next();

            var key = "" + entry.getKey();
            var raw = entry.getValue();

            if (raw == null) continue;

            var rawText = "" + raw;

            // Only touch values that can actually be parsed as numbers
            try {
                var bd = new BigDecimal(rawText);

                if (ROUND_TO_WHOLE) {
                    bd = bd.setScale(0, RoundingMode.DOWN);
                }

                var clean = bd.toPlainString();

                if (clean != rawText) {
                    fabledData.setPersistentData(key, clean);
                    changed++;
                }

            } catch (parseFail) {
                // Non-number values are skipped safely
            }
        }

        if (CLEANER_DEBUG && changed > 0) {
            player.message("Cleaned " + changed + " Fabled values.");
        }

    } catch (e) {
        if (event.player != null && CLEANER_DEBUG) {
            event.player.message("Fabled value cleaner error: " + e);
        }
    }
}

function tick(event) {
    prestigeSkillSyncTick(event);
    prestigeFactionSyncTick(event);
    fabledValueCleanerTick(event);
}

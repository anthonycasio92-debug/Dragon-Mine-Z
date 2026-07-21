// ============================================================
// DMZ Race -> Fabled Class Direct Synchronization
// CNPC Global Player Tick Script
//
// - Checks the player's DMZ race every 5 seconds.
// - Finds the Fabled class with the same name.
// - Directly changes the player's Fabled class through the API.
// - Does not use commands.
// - Does not use a hardcoded valid-race list.
// - Only changes the class when it does not match the DMZ race.
// ============================================================

var CHECK_INTERVAL_MS = 5000;
var DEBUG = false;

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();

        var System = Java.type("java.lang.System");
        var now = System.currentTimeMillis();

        var nextCheck = 0;

        if (temp.has("dmzRaceNextCheck")) {
            nextCheck = parseInt(
                "" + temp.get("dmzRaceNextCheck")
            );

            if (isNaN(nextCheck)) {
                nextCheck = 0;
            }
        }

        if (now < nextCheck) return;

        temp.put(
            "dmzRaceNextCheck",
            "" + (now + CHECK_INTERVAL_MS)
        );

        // ----------------------------------------------------
        // Read the player's DMZ race
        // ----------------------------------------------------

        var dmzRaceRaw = getPlayerRace(player);

        if (
            dmzRaceRaw == null ||
            ("" + dmzRaceRaw).trim() == ""
        ) {
            return;
        }

        dmzRaceRaw = ("" + dmzRaceRaw).trim();

        // ----------------------------------------------------
        // Get Bukkit player and Fabled plugin
        // ----------------------------------------------------

        var Bukkit = Java.type("org.bukkit.Bukkit");
        var UUID = Java.type("java.util.UUID");

        var bukkitPlayer = Bukkit.getPlayer(
            UUID.fromString("" + player.getUUID())
        );

        if (bukkitPlayer == null) return;

        var plugin = Bukkit
            .getPluginManager()
            .getPlugin("Fabled");

        if (
            plugin == null ||
            !plugin.isEnabled()
        ) {
            if (DEBUG) {
                player.message(
                    "§c[Race Sync] Fabled is unavailable."
                );
            }

            return;
        }

        // ----------------------------------------------------
        // Load Fabled through its plugin class loader
        // ----------------------------------------------------

        var loader = plugin
            .getClass()
            .getClassLoader();

        var fabledClass = loader.loadClass(
            "studio.magemonkey.fabled.Fabled"
        );

        // ----------------------------------------------------
        // Find Fabled.getData(OfflinePlayer)
        // ----------------------------------------------------

        var getDataMethod = null;
        var fabledMethods = fabledClass.getMethods();

        for (var i = 0; i < fabledMethods.length; i++) {
            if (
                "" + fabledMethods[i].getName() == "getData" &&
                fabledMethods[i].getParameterTypes().length == 1
            ) {
                getDataMethod = fabledMethods[i];
                break;
            }
        }

        if (getDataMethod == null) {
            if (DEBUG) {
                player.message(
                    "§c[Race Sync] Could not find Fabled.getData."
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
        // Find Fabled.getClass(String)
        // ----------------------------------------------------

        var getClassMethod = null;

        for (var j = 0; j < fabledMethods.length; j++) {
            if (
                "" + fabledMethods[j].getName() == "getClass" &&
                fabledMethods[j].getParameterTypes().length == 1
            ) {
                getClassMethod = fabledMethods[j];
                break;
            }
        }

        if (getClassMethod == null) {
            if (DEBUG) {
                player.message(
                    "§c[Race Sync] Could not find Fabled.getClass."
                );
            }

            return;
        }

        // ----------------------------------------------------
        // Locate the class matching the DMZ race
        // ----------------------------------------------------

        var targetClass = null;

        // Try the exact DMZ race ID first
        try {
            targetClass = getClassMethod.invoke(
                null,
                dmzRaceRaw
            );
        } catch (exactLookupError) {}

        // Try a formatted version
        if (targetClass == null) {
            try {
                targetClass = getClassMethod.invoke(
                    null,
                    formatRaceName(dmzRaceRaw)
                );
            } catch (formattedLookupError) {}
        }

        // Try lowercase
        if (targetClass == null) {
            try {
                targetClass = getClassMethod.invoke(
                    null,
                    dmzRaceRaw.toLowerCase()
                );
            } catch (lowercaseLookupError) {}
        }

        // Search all registered Fabled classes by name
        if (targetClass == null) {
            var getClassesMethod = null;

            for (var k = 0; k < fabledMethods.length; k++) {
                if (
                    "" + fabledMethods[k].getName() == "getClasses" &&
                    fabledMethods[k].getParameterTypes().length == 0
                ) {
                    getClassesMethod = fabledMethods[k];
                    break;
                }
            }

            if (getClassesMethod != null) {
                try {
                    var registeredClasses =
                        getClassesMethod.invoke(null);

                    if (registeredClasses != null) {
                        var classValues =
                            registeredClasses.values();

                        var iterator =
                            classValues.iterator();

                        while (iterator.hasNext()) {
                            var registeredClass =
                                iterator.next();

                            if (registeredClass == null) {
                                continue;
                            }

                            var registeredName =
                                "" + registeredClass.getName();

                            if (
                                equalsIgnoreCase(
                                    registeredName,
                                    dmzRaceRaw
                                )
                            ) {
                                targetClass =
                                    registeredClass;

                                break;
                            }
                        }
                    }
                } catch (classSearchError) {}
            }
        }

        // The race does not have a matching Fabled class
        if (targetClass == null) {
            if (DEBUG) {
                player.message(
                    "§c[Race Sync] No Fabled class found for DMZ race: §e" +
                    dmzRaceRaw
                );
            }

            return;
        }

        var targetClassName =
            "" + targetClass.getName();

        // ----------------------------------------------------
        // Check the player's current Fabled class
        // ----------------------------------------------------

        var currentPlayerClass = null;
        var currentClassData = null;
        var currentClassName = "";

        try {
            currentPlayerClass =
                fabledData.getMainClass();
        } catch (mainClassError) {}

        if (currentPlayerClass != null) {
            try {
                currentClassData =
                    currentPlayerClass.getData();
            } catch (classDataError) {}

            if (currentClassData != null) {
                try {
                    currentClassName =
                        "" + currentClassData.getName();
                } catch (classNameError) {
                    currentClassName = "";
                }
            }
        }

        // Already synchronized
        if (
            currentClassName != "" &&
            equalsIgnoreCase(
                currentClassName,
                targetClassName
            )
        ) {
            return;
        }

        // ----------------------------------------------------
        // Directly change the player's Fabled class
        //
        // setClass(
        //     old/parent class,
        //     new class,
        //     force reset
        // )
        //
        // null is used for the old parent because this is a
        // forced race-class replacement rather than profession.
        // ----------------------------------------------------

        var changedPlayerClass = fabledData.setClass(
            null,
            targetClass,
            true
        );

        if (changedPlayerClass == null) {
            if (DEBUG) {
                player.message(
                    "§c[Race Sync] Fabled rejected class change to §e" +
                    targetClassName
                );
            }

            return;
        }

        // ----------------------------------------------------
        // Refresh Fabled player state
        // ----------------------------------------------------

        try {
            fabledData.updatePlayerStat(
                bukkitPlayer
            );
        } catch (statUpdateError) {}

        try {
            fabledData.updateHealth(
                bukkitPlayer
            );
        } catch (healthUpdateError) {}

        try {
            fabledData.updateWalkSpeed(
                bukkitPlayer
            );
        } catch (speedUpdateError) {}

        try {
            fabledData.updateScoreboard();
        } catch (scoreboardUpdateError) {}

        try {
            fabledData.startPassives(
                bukkitPlayer
            );
        } catch (passiveUpdateError) {}

        if (DEBUG) {
            player.message(
                "§a[Race Sync] DMZ race §e" +
                dmzRaceRaw +
                " §awas synchronized to Fabled class §e" +
                targetClassName +
                "§a."
            );
        }

    } catch (err) {
        if (
            event.player != null &&
            DEBUG
        ) {
            event.player.message(
                "§c[Race Sync Error] §f" + err
            );
        }
    }
}

function getPlayerRace(player) {
    try {
        var nbt = player.getEntityNbt();

        if (
            nbt == null ||
            !nbt.has("ForgeCaps")
        ) {
            return null;
        }

        var forgeCaps =
            nbt.getCompound("ForgeCaps");

        if (
            forgeCaps == null ||
            !forgeCaps.has("minecraft:dragonminez")
        ) {
            return null;
        }

        var dmz = forgeCaps.getCompound(
            "minecraft:dragonminez"
        );

        if (
            dmz == null ||
            !dmz.has("Character")
        ) {
            return null;
        }

        var character =
            dmz.getCompound("Character");

        if (
            character == null ||
            !character.has("Race")
        ) {
            return null;
        }

        return (
            "" + character.getString("Race")
        ).trim();

    } catch (error) {
        return null;
    }
}

function formatRaceName(race) {
    race = ("" + race).trim().toLowerCase();

    if (race.length == 0) {
        return "";
    }

    return (
        race.charAt(0).toUpperCase() +
        race.substring(1)
    );
}

function equalsIgnoreCase(a, b) {
    if (
        a == null ||
        b == null
    ) {
        return false;
    }

    return (
        ("" + a).trim().toLowerCase() ==
        ("" + b).trim().toLowerCase()
    );
}
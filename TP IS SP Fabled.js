// ============================================================
// DMZ Training Points -> Fabled Skill Points
// CNPC Global Player Tick Script
//
// DMZ TP is the real authoritative currency.
//
// Fabled SP displays the player's available TP, capped at the
// maximum signed Java integer:
//
// 2,147,483,647
//
// DMZ TP above that amount is NOT removed or reduced.
//
// Example:
//
// DMZ TP:    5,000,000,000
// Fabled SP: 2,147,483,647
//
// Spending 100 Fabled SP removes 100 DMZ TP:
//
// DMZ TP:    4,999,999,900
// Fabled SP: 2,147,483,647 again
//
// Fractional DMZ TP is also preserved.
// ============================================================

/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */

var TICK_INTERVAL = 5; // check four times per second
var DEBUG = false;

// Maximum value supported by a signed Java integer
var MAX_FABLED_SP = 2147483647;

// Stored-data keys
var KEY_INITIALIZED = "dmz_fabled_sp_initialized";
var KEY_LAST_DISPLAYED_SP = "dmz_fabled_sp_last_displayed";
var KEY_LAST_TP = "dmz_fabled_tp_last";

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();

        // ----------------------------------------------------
        // Tick limiter
        // ----------------------------------------------------

        var tickKey = "dmz_fabled_sp_sync_tick";
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
        // Java classes
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
        // Get Fabled through its plugin class loader
        // ----------------------------------------------------

        var plugin = Bukkit
            .getPluginManager()
            .getPlugin("Fabled");

        if (
            plugin == null ||
            !plugin.isEnabled()
        ) {
            return;
        }

        var loader = plugin
            .getClass()
            .getClassLoader();

        var fabledClass = loader.loadClass(
            "studio.magemonkey.fabled.Fabled"
        );

        // ----------------------------------------------------
        // Locate Fabled.getData(player)
        // ----------------------------------------------------

        var getDataMethod = null;
        var methods = fabledClass.getMethods();

        for (var i = 0; i < methods.length; i++) {
            if (
                "" + methods[i].getName() == "getData" &&
                methods[i].getParameterTypes().length == 1
            ) {
                getDataMethod = methods[i];
                break;
            }
        }

        if (getDataMethod == null) return;

        var fabledData = getDataMethod.invoke(
            null,
            bukkitPlayer
        );

        if (fabledData == null) return;

        // ----------------------------------------------------
        // Get DMZ resources
        // ----------------------------------------------------

        var lazy = StatsProvider.get(
            StatsCapability.INSTANCE,
            player.getMCEntity()
        );

        if (lazy == null) return;

        var dmzData = lazy.orElse(null);
        if (dmzData == null) return;

        var resources = dmzData.getResources();
        if (resources == null) return;

        // ----------------------------------------------------
        // Read current TP and SP
        // ----------------------------------------------------

        var currentTp = Number(
            resources.getTrainingPoints()
        );

        if (
            isNaN(currentTp) ||
            currentTp < 0
        ) {
            currentTp = 0;
        }

        var currentSp = parseInt(
            "" + fabledData.getPoints()
        );

        if (isNaN(currentSp)) {
            currentSp = 0;
        }

        // A negative value could indicate integer overflow or
        // another plugin changing SP incorrectly.
        if (currentSp < 0) {
            currentSp = 0;
        }

        var stored = player.getStoreddata();

        // ----------------------------------------------------
        // Determine how much SP should currently be displayed
        // ----------------------------------------------------

        var targetDisplayedSp = Math.floor(currentTp);

        if (targetDisplayedSp > MAX_FABLED_SP) {
            targetDisplayedSp = MAX_FABLED_SP;
        }

        if (targetDisplayedSp < 0) {
            targetDisplayedSp = 0;
        }

        // ----------------------------------------------------
        // First synchronization
        // ----------------------------------------------------

        if (
            !stored.has(KEY_INITIALIZED) ||
            "" + stored.get(KEY_INITIALIZED) != "true"
        ) {
            if (currentSp != targetDisplayedSp) {
                fabledData.setPoints(
                    targetDisplayedSp
                );

                currentSp = targetDisplayedSp;

                try {
                    fabledData.updateScoreboard();
                } catch (initialScoreboardError) {}
            }

            stored.put(
                KEY_INITIALIZED,
                "true"
            );

            stored.put(
                KEY_LAST_DISPLAYED_SP,
                "" + targetDisplayedSp
            );

            stored.put(
                KEY_LAST_TP,
                "" + currentTp
            );

            if (DEBUG) {
                player.message(
                    "§a[TP/SP Sync] Initialized: §e" +
                    formatNumber(currentTp) +
                    " TP §7| §e" +
                    formatNumber(targetDisplayedSp) +
                    " displayed SP"
                );
            }

            return;
        }

        // ----------------------------------------------------
        // Read previous displayed SP
        // ----------------------------------------------------

        var lastDisplayedSp = targetDisplayedSp;

        if (stored.has(KEY_LAST_DISPLAYED_SP)) {
            lastDisplayedSp = parseInt(
                "" + stored.get(KEY_LAST_DISPLAYED_SP)
            );

            if (
                isNaN(lastDisplayedSp) ||
                lastDisplayedSp < 0
            ) {
                lastDisplayedSp = targetDisplayedSp;
            }

            if (lastDisplayedSp > MAX_FABLED_SP) {
                lastDisplayedSp = MAX_FABLED_SP;
            }
        }

        // ----------------------------------------------------
        // Detect SP spending
        //
        // Fabled reduces its SP when a player buys a skill.
        //
        // We compare the current Fabled SP against the amount
        // that the previous sync placed into Fabled.
        // ----------------------------------------------------

        var spentSp = 0;

        if (currentSp < lastDisplayedSp) {
            spentSp = lastDisplayedSp - currentSp;
        }

        var tpChanged = false;
        var spChanged = false;

        // ----------------------------------------------------
        // Remove spent SP from DMZ TP
        // ----------------------------------------------------

        if (spentSp > 0) {
            var newTp = currentTp - spentSp;

            if (newTp < 0) {
                newTp = 0;
            }

            resources.setTrainingPoints(newTp);

            currentTp = newTp;
            tpChanged = true;

            if (DEBUG) {
                player.message(
                    "§e[TP/SP Sync] Spent §c" +
                    formatNumber(spentSp) +
                    " SP§e. Remaining DMZ TP: §a" +
                    formatNumber(currentTp)
                );
            }
        }

        // ----------------------------------------------------
        // Recalculate displayed SP after spending
        //
        // Only the Fabled display is capped.
        // DMZ TP remains at its complete value.
        // ----------------------------------------------------

        targetDisplayedSp = Math.floor(currentTp);

        if (targetDisplayedSp > MAX_FABLED_SP) {
            targetDisplayedSp = MAX_FABLED_SP;
        }

        if (targetDisplayedSp < 0) {
            targetDisplayedSp = 0;
        }

        // ----------------------------------------------------
        // Update Fabled SP
        // ----------------------------------------------------

        if (currentSp != targetDisplayedSp) {
            fabledData.setPoints(
                targetDisplayedSp
            );

            currentSp = targetDisplayedSp;
            spChanged = true;
        }

        // ----------------------------------------------------
        // Sync DMZ TP to the client
        // ----------------------------------------------------

        if (tpChanged) {
            try {
                NetworkHandler.sendToTrackingEntityAndSelf(
                    new StatsSyncS2C(
                        player.getMCEntity()
                    ),
                    player.getMCEntity()
                );
            } catch (dmzSyncError) {}
        }

        // ----------------------------------------------------
        // Refresh the Fabled scoreboard
        // ----------------------------------------------------

        if (spChanged) {
            try {
                fabledData.updateScoreboard();
            } catch (scoreboardError) {}
        }

        // ----------------------------------------------------
        // Store the values applied by this synchronization
        // ----------------------------------------------------

        stored.put(
            KEY_LAST_DISPLAYED_SP,
            "" + targetDisplayedSp
        );

        stored.put(
            KEY_LAST_TP,
            "" + currentTp
        );

    } catch (error) {
        if (
            event.player != null &&
            DEBUG
        ) {
            event.player.message(
                "§c[TP/SP Sync Error] §f" +
                error
            );
        }
    }
}

function formatNumber(value) {
    value = Number(value);

    if (isNaN(value)) {
        return "0";
    }

    var text = "" + Math.floor(value);
    var output = "";
    var count = 0;

    for (var i = text.length - 1; i >= 0; i--) {
        output = text.charAt(i) + output;
        count++;

        if (
            count == 3 &&
            i > 0
        ) {
            output = "," + output;
            count = 0;
        }
    }

    return output;
}
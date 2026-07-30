// Fabled Attributes -> DMZ Multiplicative Bonus Stats
// Global Player Tick Script
//
// Fabled attributes expected:
// str, skp, res, vit, pwr, ene
//
// Each 1 Fabled point gives +1% multiplier.
// 0 points = 1.00x
// 1 point  = 1.01x
// 10 points = 1.10x
//
// RES is handled with addBonusSplit("RES", ...)
// because DMZ splits RES into DEF + STM.
//
// IMPORTANT:
// Do NOT also run "Attr Fabled bonus stats.js".
// That file is a duplicate with a different bonus name and
// stacks a second prestige multiplier on top of this one.
//
// After a DMZ wipe (Race Lock / prestige / dmzstats reset),
// hasCreatedCharacter is false. This script must CLEAR bonuses
// and not re-apply Fabled multipliers until a character exists
// again ? otherwise wipe power looks like it "persists".

var TICK_INTERVAL = 20; // once per second
var DEBUG = false;

var BONUS_NAME = "\u00A76Prestige Bonus";

// Old typo name from the duplicate script ? clear it too.
var LEGACY_BONUS_NAME = "\u00A76Prestrige Bonus";

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();

        var tickKey = "fabled_dmz_bonus_stat_tick";
        var tickCount = temp.get(tickKey);

        if (tickCount == null) tickCount = 0;
        tickCount = parseInt("" + tickCount) + 1;

        if (tickCount < TICK_INTERVAL) {
            temp.put(tickKey, "" + tickCount);
            return;
        }

        temp.put(tickKey, "0");

        var Bukkit = Java.type("org.bukkit.Bukkit");
        var UUID = Java.type("java.util.UUID");

        var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
        var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
        var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
        var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");

        var bukkitPlayer = Bukkit.getPlayer(UUID.fromString("" + player.getUUID()));
        if (bukkitPlayer == null) return;

        var plugin = Bukkit.getPluginManager().getPlugin("Fabled");
        if (plugin == null || !plugin.isEnabled()) return;

        var loader = plugin.getClass().getClassLoader();
        var fabledClass = loader.loadClass("studio.magemonkey.fabled.Fabled");

        var getDataMethod = null;
        var methods = fabledClass.getMethods();

        for (var i = 0; i < methods.length; i++) {
            if (String(methods[i].getName()) == "getData" && methods[i].getParameterTypes().length == 1) {
                getDataMethod = methods[i];
                break;
            }
        }

        if (getDataMethod == null) return;

        var fabledData = getDataMethod.invoke(null, bukkitPlayer);
        if (fabledData == null) return;

        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return;

        var lazy = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer);
        if (lazy == null) return;

        var dmzData = lazy.orElse(null);
        if (dmzData == null) return;

        var bonusStats = dmzData.getBonusStats();
        if (bonusStats == null) return;

        /*
         * Fabled attribute points survive DMZ wipe.
         * Never re-apply them while the character is wiped /
         * not created, or the wipe looks like it failed.
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

        clearAllNamedBonuses(bonusStats);

        if (!characterCreated) {
            try {
                NetworkHandler.sendToTrackingEntityAndSelf(
                    new StatsSyncS2C(mcPlayer),
                    mcPlayer
                );
            } catch (syncClearErr) {}
            return;
        }

        var fStr = safeNumber(fabledData.getAttribute("str"));
        var fSkp = safeNumber(fabledData.getAttribute("skp"));
        var fRes = safeNumber(fabledData.getAttribute("res"));
        var fVit = safeNumber(fabledData.getAttribute("vit"));
        var fPwr = safeNumber(fabledData.getAttribute("pwr"));
        var fEne = safeNumber(fabledData.getAttribute("ene"));

        var changed = false;

        if (fStr > 0) {
            bonusStats.addBonus("STR", BONUS_NAME, "*", toMultiplier(fStr));
            changed = true;
        }

        if (fSkp > 0) {
            bonusStats.addBonus("SKP", BONUS_NAME, "*", toMultiplier(fSkp));
            changed = true;
        }

        if (fRes > 0) {
            bonusStats.addBonusSplit("RES", BONUS_NAME, "*", toMultiplier(fRes), false);
            changed = true;
        }

        if (fVit > 0) {
            bonusStats.addBonus("VIT", BONUS_NAME, "*", toMultiplier(fVit));
            changed = true;
        }

        if (fPwr > 0) {
            bonusStats.addBonus("PWR", BONUS_NAME, "*", toMultiplier(fPwr));
            changed = true;
        }

        if (fEne > 0) {
            bonusStats.addBonus("ENE", BONUS_NAME, "*", toMultiplier(fEne));
            changed = true;
        }

        if (changed) {
            try {
                NetworkHandler.sendToTrackingEntityAndSelf(
                    new StatsSyncS2C(mcPlayer),
                    mcPlayer
                );
            } catch (syncErr) {}
        }

        if (DEBUG && changed) {
            player.message(
                "\u00A7aFabled multiplicative bonus applied: " +
                "STR x" + toMultiplier(fStr) +
                " SKP x" + toMultiplier(fSkp) +
                " RES x" + toMultiplier(fRes) +
                " VIT x" + toMultiplier(fVit) +
                " PWR x" + toMultiplier(fPwr) +
                " ENE x" + toMultiplier(fEne)
            );
        }

    } catch (e) {
        if (event.player != null && DEBUG) {
            event.player.message(
                "\u00A7cFabled -> DMZ bonus stat error: " + e
            );
        }
    }
}

function toMultiplier(points) {
    points = safeNumber(points);
    return 1 + (points * 0.01);
}

function safeNumber(value) {
    var n = 0;

    try {
        n = Number(value);
    } catch (e) {
        n = 0;
    }

    if (isNaN(n) || n < 0) n = 0;

    return n;
}

function clearBonus(bonusStats, stat, bonusName) {
    try {
        bonusStats.removeBonus(stat, bonusName);
    } catch (e1) {}

    try {
        bonusStats.clearBonus(stat, bonusName);
    } catch (e2) {}
}

function clearAllNamedBonuses(bonusStats) {
    var stats = ["STR", "SKP", "VIT", "PWR", "ENE"];
    var names = [BONUS_NAME, LEGACY_BONUS_NAME];
    var s;
    var n;

    for (s = 0; s < stats.length; s++) {
        for (n = 0; n < names.length; n++) {
            clearBonus(bonusStats, stats[s], names[n]);
        }
    }

    for (n = 0; n < names.length; n++) {
        try {
            bonusStats.removeBonusSplit("RES", names[n]);
        } catch (resClearErr) {}
        try {
            bonusStats.clearBonusSplit("RES", names[n]);
        } catch (resClearErr2) {}
    }
}

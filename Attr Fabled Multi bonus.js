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

var TICK_INTERVAL = 20; // once per second
var DEBUG = false;

var BONUS_NAME = "\u00A76Prestige Bonus";

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

        var lazy = StatsProvider.get(StatsCapability.INSTANCE, player.getMCEntity());
        if (lazy == null) return;

        var dmzData = lazy.orElse(null);
        if (dmzData == null) return;

        var bonusStats = dmzData.getBonusStats();
        if (bonusStats == null) return;

        var fStr = safeNumber(fabledData.getAttribute("str"));
        var fSkp = safeNumber(fabledData.getAttribute("skp"));
        var fRes = safeNumber(fabledData.getAttribute("res"));
        var fVit = safeNumber(fabledData.getAttribute("vit"));
        var fPwr = safeNumber(fabledData.getAttribute("pwr"));
        var fEne = safeNumber(fabledData.getAttribute("ene"));

        clearBonus(bonusStats, "STR");
        clearBonus(bonusStats, "SKP");
        clearBonus(bonusStats, "VIT");
        clearBonus(bonusStats, "PWR");
        clearBonus(bonusStats, "ENE");

        try {
            bonusStats.removeBonusSplit("RES", BONUS_NAME);
        } catch (resClearErr) {}

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
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(player.getMCEntity()), player.getMCEntity());
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
            event.player.message("\u00A7cFabled -> DMZ bonus stat error: " + e);
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

function clearBonus(bonusStats, stat) {
    try {
        bonusStats.removeBonus(stat, BONUS_NAME);
    } catch (e1) {}

    try {
        bonusStats.clearBonus(stat, BONUS_NAME);
    } catch (e2) {}
}
/*
============================================================
 DBZ Legacy Reborn - DMZ Fabled Bridge.js
 Version: 1.0.0

 Combined from: DMZ Energy.js + DMZ Stat Screen.js

 PLACE AS: CustomNPCs Global Player Script
 Enable: tick

 Disable the old separate tabs this replaces.
============================================================
*/

// DMZ Energy <-> Fabled Mana Sync
// Works across all worlds/dimensions

var ENERGY_TICK_INTERVAL = 1;
var ENERGY_DEBUG = false;

function dmzEnergyManaSyncTick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();

        var tickKey = "dmz_fabled_mana_sync_tick";
        var tickCount = temp.get(tickKey);

        if (tickCount == null) tickCount = 0;
        tickCount = parseInt("" + tickCount) + 1;

        if (tickCount < ENERGY_TICK_INTERVAL) {
            temp.put(tickKey, "" + tickCount);
            return;
        }

        temp.put(tickKey, "0");

        var Bukkit = Java.type("org.bukkit.Bukkit");
        var UUID = Java.type("java.util.UUID");

        var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
        var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");

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

        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return;

        var lazy = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer);
        if (lazy == null) return;

        var dmzData = lazy.orElse(null);
        if (dmzData == null) return;

        var resources = dmzData.getResources();
        if (resources == null) return;

        var currentEnergy = resources.getCurrentEnergy();

        var maxEnergy = 0;
        try {
            maxEnergy = resources.getMaxEnergy();
        } catch (e1) {
            try {
                maxEnergy = dmzData.getMaxEnergy();
            } catch (e2) {
                maxEnergy = currentEnergy;
            }
        }

        if (currentEnergy < 0) currentEnergy = 0;
        if (maxEnergy < 0) maxEnergy = 0;
        if (currentEnergy > maxEnergy) currentEnergy = maxEnergy;

        var lastManaKey = "dmz_fabled_last_mana";
        var currentFabledManaBeforeSync = fabledData.getMana();
        var storedLastMana = temp.get(lastManaKey);

        if (storedLastMana != null) {
            var lastMana = parseFloat("" + storedLastMana);

            if (!isNaN(lastMana) && currentFabledManaBeforeSync < lastMana) {
                var spent = lastMana - currentFabledManaBeforeSync;

                if (spent > 0) {
                    try {
                        resources.removeEnergy(spent);
                    } catch (removeErr) {
                        resources.setCurrentEnergy(currentEnergy - spent);
                    }

                    currentEnergy = resources.getCurrentEnergy();

                    if (currentEnergy < 0) {
                        currentEnergy = 0;
                        resources.setCurrentEnergy(0);
                    }
                }
            }
        }

        if (currentEnergy > maxEnergy) currentEnergy = maxEnergy;

        var manaField = null;
        var maxManaField = null;
        var search = fabledData.getClass();

        while (search != null) {
            try {
                if (manaField == null) manaField = search.getDeclaredField("mana");
            } catch (a) {}

            try {
                if (maxManaField == null) maxManaField = search.getDeclaredField("maxMana");
            } catch (b) {}

            search = search.getSuperclass();
        }

        if (maxManaField != null) {
            maxManaField.setAccessible(true);
            maxManaField.setDouble(fabledData, maxEnergy);
        }

        if (manaField != null) {
            manaField.setAccessible(true);
            manaField.setDouble(fabledData, currentEnergy);
        }

        fabledData.setMana(currentEnergy);

        try {
            fabledData.updateScoreboard();
        } catch (scoreErr) {}

        temp.put(lastManaKey, "" + currentEnergy);

        if (ENERGY_DEBUG) {
            player.message("Mana/Ki sync: " + currentEnergy + "/" + maxEnergy);
        }

    } catch (e) {
        if (event.player != null && ENERGY_DEBUG) {
            event.player.message("Mana sync error: " + e);
        }
    }
}

// DMZ Stat Screen -> Fabled Persistent Values
// Creates/updates values:
// Damage, StrikeDamage, Stamina, Defense, Health, KiDamage, MaxKi

var STAT_TICK_INTERVAL = 5; // every 5 ticks
var STAT_DEBUG = false;

function dmzStatScreenSyncTick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();
        var tickKey = "dmz_fabled_stat_values_tick";
        var tickCount = temp.get(tickKey);

        if (tickCount == null) tickCount = 0;
        tickCount = parseInt("" + tickCount) + 1;

        if (tickCount < STAT_TICK_INTERVAL) {
            temp.put(tickKey, "" + tickCount);
            return;
        }

        temp.put(tickKey, "0");

        var Bukkit = Java.type("org.bukkit.Bukkit");
        var UUID = Java.type("java.util.UUID");
        var Double = Java.type("java.lang.Double");

        var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
        var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");

        var bukkitPlayer = Bukkit.getPlayer(UUID.fromString("" + player.getUUID()));
        if (bukkitPlayer == null) return;

        var plugin = Bukkit.getPluginManager().getPlugin("Fabled");
        if (plugin == null) return;

        var loader = plugin.getClass().getClassLoader();
        var fabledClass = loader.loadClass("studio.magemonkey.fabled.Fabled");

        var getDataMethod = null;
        var methods = fabledClass.getMethods();

        for (var i = 0; i < methods.length; i++) {
            if (
                methods[i].getName() == "getData" &&
                methods[i].getParameterTypes().length == 1
            ) {
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

        var resources = dmzData.getResources();
        if (resources == null) return;

        var damage = dmzData.getMeleeDamage();
        var strikeDamage = dmzData.getStrikeDamage();
        var stamina = dmzData.getMaxStamina();
        var defense = dmzData.getDefense();
        var health = dmzData.getMaxHealth();
        var kiDamage = dmzData.getKiDamage();
        var maxKi = dmzData.getMaxEnergy();

        fabledData.setPersistentData("Damage", Double.valueOf(damage));
        fabledData.setPersistentData("StrikeDamage", Double.valueOf(strikeDamage));
        fabledData.setPersistentData("Stamina", Double.valueOf(stamina));
        fabledData.setPersistentData("Defense", Double.valueOf(defense));
        fabledData.setPersistentData("Health", Double.valueOf(health));
        fabledData.setPersistentData("KiDamage", Double.valueOf(kiDamage));
        fabledData.setPersistentData("MaxKi", Double.valueOf(maxKi));

        if (STAT_DEBUG) {
            player.message(
                "DMZ values synced: DMG " + damage +
                " | STRIKE " + strikeDamage +
                " | STM " + stamina +
                " | DEF " + defense +
                " | HP " + health +
                " | KI DMG " + kiDamage +
                " | MAX KI " + maxKi
            );
        }

    } catch (e) {
        if (event.player != null && STAT_DEBUG) {
            event.player.message("DMZ value sync error: " + e);
        }
    }
}

function tick(event) {
    dmzEnergyManaSyncTick(event);
    dmzStatScreenSyncTick(event);
}

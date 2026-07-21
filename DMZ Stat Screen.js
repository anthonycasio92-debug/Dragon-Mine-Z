// DMZ Stat Screen -> Fabled Persistent Values
// Creates/updates values:
// Damage, StrikeDamage, Stamina, Defense, Health, KiDamage, MaxKi

var TICK_INTERVAL = 5; // once per second
var DEBUG = false;

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();
        var tickKey = "dmz_fabled_stat_values_tick";
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

        if (DEBUG) {
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
        if (event.player != null && DEBUG) {
            event.player.message("DMZ value sync error: " + e);
        }
    }
}
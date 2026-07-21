var Bukkit = Java.type("org.bukkit.Bukkit");

function tick(event) {
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
            if (DEBUG) player.message("§cFabled plugin not found/enabled.");
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
            if (DEBUG) player.message("§cCould not find Fabled getData method.");
            return;
        }

        var fabledData = getDataMethod.invoke(null, bukkitPlayer);

        if (fabledData == null) {
            if (DEBUG) player.message("§cFabled player data missing.");
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
            if (DEBUG) player.message("§cCould not read CNPC faction points.");
            return;
        }

        if (currentFaction != targetFaction) {
            var difference = targetFaction - currentFaction;

            player.addFactionPoints(FACTION_ID, difference);

            if (DEBUG) {
                player.message("§7Faction 4 corrected: §f" + currentFaction + " §7-> §f" + targetFaction);
                player.message("§7Fabled Prestige level: §f" + prestigeLevel);
            }
        }

    } catch (err) {
        try {
            event.player.message("§cPrestige faction lock error: " + err);
        } catch (e3) {}
    }
}
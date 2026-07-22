// Universal Fabled Value Cleaner
// Cleans ALL Fabled persistent values for every player.
// Converts scientific notation into plain command-friendly numbers.

/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */

var TICK_INTERVAL = 20; // once per second
var ROUND_TO_WHOLE = false;
var DEBUG = false;

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();
        var tickKey = "fabled_all_value_cleaner_tick";
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

        if (DEBUG && changed > 0) {
            player.message("Cleaned " + changed + " Fabled values.");
        }

    } catch (e) {
        if (event.player != null && DEBUG) {
            event.player.message("Fabled value cleaner error: " + e);
        }
    }
}
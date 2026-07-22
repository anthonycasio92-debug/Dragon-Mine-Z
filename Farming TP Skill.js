// Farming TP Crop Harvest Bonus
// CNPC Global Player Script
// Event: broken(event)
// Fabled skill: Farming
// Award: 10 TP per Farming level
// Only awards on mature crops.

/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */

var DEBUG = false;
var SKILL_NAME = "Farming";
var TP_PER_LEVEL = 10;
 
function broken(event) {
    try {
        var player = event.player;
        var block = event.block;

        if (player == null || block == null) return;

        var blockName = ("" + block.getName()).toLowerCase();

        var isCrop = false;

        if (
            blockName.indexOf("minecraft:wheat") !== -1 ||
            blockName.indexOf("minecraft:carrots") !== -1 ||
            blockName.indexOf("minecraft:potatoes") !== -1 ||
            blockName.indexOf("minecraft:beetroots") !== -1 ||
            blockName.indexOf("minecraft:nether_wart") !== -1 ||
            blockName.indexOf("minecraft:cocoa") !== -1 ||
            blockName.indexOf("minecraft:sweet_berry_bush") !== -1 ||
            blockName.indexOf("pamhc2crops:") !== -1 ||
            blockName.indexOf("pamhc2trees:") !== -1
        ) {
            isCrop = true;
        }

        if (!isCrop) return;

        var mature = false;
        var age = -1;

        try {
            var props = block.getProperties();

            if (props != null) {
                for (var p = 0; p < props.length; p++) {
                    var propName = "" + props[p];

                    if (propName == "age") {
                        age = parseInt("" + block.getProperty("age"));
                        break;
                    }
                }
            }
        } catch (propErr) {
            if (DEBUG) player.message("Farming prop error: " + propErr);
            return;
        }

        if (age < 0) return;

        if (
            blockName.indexOf("minecraft:beetroots") !== -1 ||
            blockName.indexOf("minecraft:nether_wart") !== -1
        ) {
            if (age >= 3) mature = true;
        } else if (blockName.indexOf("minecraft:cocoa") !== -1) {
            if (age >= 2) mature = true;
        } else if (blockName.indexOf("minecraft:sweet_berry_bush") !== -1) {
            if (age >= 3) mature = true;
        } else {
            if (age >= 7) mature = true;
        }

        if (!mature) {
            if (DEBUG) player.message("Farming: not mature. Age " + age + " | " + blockName);
            return;
        }

        var temp = player.getTempdata();
        var now = new Date().getTime();
        var posKey = "farm_last_" + block.getX() + "_" + block.getY() + "_" + block.getZ();
        var last = temp.get(posKey);

        if (last != null && now - parseInt("" + last) < 500) return;
        temp.put(posKey, "" + now);

        var skillLevel = 0;

        try {
            var File = Java.type("java.io.File");
            var Scanner = Java.type("java.util.Scanner");

            var uuid = ("" + player.getUUID()).toLowerCase();
            var file = new File("plugins/Fabled/players/" + uuid + ".yml");

            if (file.exists()) {
                var scan = new Scanner(file);
                var foundSkill = false;

                while (scan.hasNextLine()) {
                    var line = "" + scan.nextLine();
                    var trimmed = line.trim();

                    if (trimmed == SKILL_NAME + ":") {
                        foundSkill = true;
                        continue;
                    }

                    if (foundSkill && trimmed.indexOf("level:") == 0) {
                        skillLevel = parseInt(trimmed.replace("level:", "").trim());
                        if (isNaN(skillLevel)) skillLevel = 0;
                        break;
                    }
                }

                scan.close();
            }
        } catch (skillErr) {
            if (DEBUG) player.message("Farming skill read error: " + skillErr);
        }

        if (skillLevel <= 0) {
            if (DEBUG) player.message("Farming crop detected, but Farming Lv.0.");
            return;
        }

        var tpAward = skillLevel * TP_PER_LEVEL;

        var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
        var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");

        var lazy = StatsProvider.get(StatsCapability.INSTANCE, player.getMCEntity());
        if (lazy == null) return;

        var dmzData = lazy.orElse(null);
        if (dmzData == null) return;

        var resources = dmzData.getResources();
        if (resources == null) return;

        resources.addTrainingPoints(tpAward);

        if (DEBUG) {
            player.message("Farming +" + tpAward + " TP | Lv." + skillLevel + " | " + blockName + " age " + age);
        }

    } catch (e) {
        if (event.player != null) {
            event.player.message("Farming TP error: " + e);
        }
    }
}
/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");

function tick(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var ch = data.getCharacter();
        if (ch == null) return;

        var skills = data.getSkills();
        if (skills == null) return;

        var temp = player.getTempdata();

        var race = String(ch.getRace()).toLowerCase();

        var skillOne = "ki_manipulation";
        var skillTwo = "ki_control";

        var changed = false;

        if (race == "yardrat") {

            if (skills.getSkillLevel(skillOne) < 5) {
                skills.setSkillLevel(skillOne, 5);
                changed = true;
            }

            if (skills.getSkillLevel(skillTwo) < 5) {
                skills.setSkillLevel(skillTwo, 5);
                changed = true;
            }

            if (changed) {
                temp.put("yardrat_starting_ki_skills_granted", true);
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            }

        } else {

            // Only remove these starter levels if THIS script previously granted them.
            if (temp.has("yardrat_starting_ki_skills_granted")) {

                if (skills.getSkillLevel(skillOne) > 0) {
                    skills.setSkillLevel(skillOne, 0);
                    changed = true;
                }

                if (skills.getSkillLevel(skillTwo) > 0) {
                    skills.setSkillLevel(skillTwo, 0);
                    changed = true;
                }

                temp.remove("yardrat_starting_ki_skills_granted");

                if (changed) {
                    NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
                }
            }
        }

    } catch (err) {
        // Uncomment for debugging:
        // player.message("Yardrat starter skill error: " + err);
    }
}
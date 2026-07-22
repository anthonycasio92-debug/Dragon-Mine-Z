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
var System = Java.type("java.lang.System");

var sprint_SKILL = "sprint";
var MAX_LEVEL = 10;

var sprint_STRENGTH_REQUIREMENTS = {
    1: 20,
    2: 100,
    3: 250,
    4: 500,
    5: 1000,
    6: 1500,
    7: 2000,
    8: 2500,
    9: 3000,
    10: 3500
};

function tick(event) {
    var player = event.player;
    if (player == null) return;

    var temp = player.getTempdata();
    var now = System.currentTimeMillis();

    if (temp.has("sprint_skill_next_check")) {
        if (now < parseInt(temp.get("sprint_skill_next_check"))) return;
    }

    temp.put("sprint_skill_next_check", now + 1000);

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var stats = data.getStats();
        var skills = data.getSkills();

        if (stats == null || skills == null) return;

        skills.registerDefaultSkill(sprint_SKILL, MAX_LEVEL);
        skills.refreshNonFormSkillMaxLevels();

        var strength = stats.getStrength();
        var currentsprint = skills.getSkillLevel(sprint_SKILL);
        var maxsprint = skills.getMaxSkillLevel(sprint_SKILL);

        if (maxsprint <= 0) maxsprint = MAX_LEVEL;
        if (maxsprint > MAX_LEVEL) maxsprint = MAX_LEVEL;

        var targetLevel = currentsprint;

        for (var level = 1; level <= maxsprint; level++) {
            if (sprint_STRENGTH_REQUIREMENTS[level] != null && strength >= sprint_STRENGTH_REQUIREMENTS[level]) {
                targetLevel = level;
            }
        }

        if (targetLevel > currentsprint) {
            skills.setSkillLevel(sprint_SKILL, targetLevel);

            if (currentsprint < 1) {
                player.message("§a[SPRINT] Sprint unlocked at level " + targetLevel + ".");
            } else {
                player.message("§a[SPRINT] Increased to level " + targetLevel + ".");
            }

            if (targetLevel >= maxsprint) {
                player.message("§6[SPRINT] sprint is now maxed.");
            }

            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
        }

    } catch (err) {
        player.message("§4[SPRINT Script Error] " + err);
    }
}
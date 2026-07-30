/*
============================================================
 DBZ Legacy Reborn - Sprint + Jump Skills
 Version: 1.0.0

 PLACE AS:
 CustomNPCs Global Player Script
 Enable event: tick

 REPLACES:
 - Sprint.js
 - Jump.js

 Disable the old Sprint and Jump script tabs after installing
 this one so they do not double-level the same skills.
============================================================
*/

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var System = Java.type("java.lang.System");

var COLOR = "\u00A7";
var CHECK_INTERVAL_MS = 1000;
var TEMP_NEXT_CHECK = "sprintjump_skill_next_check";
var MAX_LEVEL = 10;

/*
 * Same strength thresholds as the old separate scripts.
 * Level unlocks when current STR is >= the listed amount.
 */
var STRENGTH_REQUIREMENTS = {
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

var SKILLS = [
    {
        id: "sprint",
        label: "Sprint",
        tag: "SPRINT"
    },
    {
        id: "jump",
        label: "Jump",
        tag: "Jump"
    }
];

function tick(event) {
    var player = event.player;
    if (player == null) return;

    var temp = player.getTempdata();
    var now = Number(System.currentTimeMillis());

    if (temp.has(TEMP_NEXT_CHECK)) {
        var next = parseInt("" + temp.get(TEMP_NEXT_CHECK), 10);
        if (!isNaN(next) && now < next) return;
    }

    temp.put(TEMP_NEXT_CHECK, "" + (now + CHECK_INTERVAL_MS));

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);

        if (data == null) return;

        var stats = data.getStats();
        var skills = data.getSkills();
        if (stats == null || skills == null) return;

        var strength = Number(stats.getStrength());
        if (isNaN(strength)) strength = 0;

        var changed = false;

        for (var i = 0; i < SKILLS.length; i++) {
            if (updateSkillFromStrength(player, skills, SKILLS[i], strength)) {
                changed = true;
            }
        }

        if (changed) {
            NetworkHandler.sendToTrackingEntityAndSelf(
                new StatsSyncS2C(mcPlayer),
                mcPlayer
            );
        }
    } catch (err) {
        try {
            player.message(
                COLOR + "4[SprintJump Script Error] " + COLOR + "f" + err
            );
        } catch (ignored) {}
    }
}

function updateSkillFromStrength(player, skills, skillInfo, strength) {
    var skillId = skillInfo.id;

    skills.registerDefaultSkill(skillId, MAX_LEVEL);
    skills.refreshNonFormSkillMaxLevels();

    var current = Number(skills.getSkillLevel(skillId));
    var max = Number(skills.getMaxSkillLevel(skillId));

    if (isNaN(current) || current < 0) current = 0;
    if (isNaN(max) || max <= 0) max = MAX_LEVEL;
    if (max > MAX_LEVEL) max = MAX_LEVEL;

    var target = current;

    for (var level = 1; level <= max; level++) {
        var need = STRENGTH_REQUIREMENTS[level];
        if (need != null && strength >= need) {
            target = level;
        }
    }

    if (target <= current) return false;

    skills.setSkillLevel(skillId, target);

    if (current < 1) {
        player.message(
            COLOR + "a[" + skillInfo.tag + "] " +
            skillInfo.label + " unlocked at level " + target + "."
        );
    } else {
        player.message(
            COLOR + "a[" + skillInfo.tag + "] Increased to level " +
            target + "."
        );
    }

    if (target >= max) {
        player.message(
            COLOR + "6[" + skillInfo.tag + "] " +
            skillInfo.label + " is now maxed."
        );
    }

    return true;
}

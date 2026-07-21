var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var System = Java.type("java.lang.System");

var JUMP_SKILL = "jump";
var MAX_LEVEL = 10;

var JUMP_STRENGTH_REQUIREMENTS = {
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

    if (temp.has("jump_skill_next_check")) {
        if (now < parseInt(temp.get("jump_skill_next_check"))) return;
    }

    temp.put("jump_skill_next_check", now + 1000);

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var stats = data.getStats();
        var skills = data.getSkills();

        if (stats == null || skills == null) return;

        skills.registerDefaultSkill(JUMP_SKILL, MAX_LEVEL);
        skills.refreshNonFormSkillMaxLevels();

        var strength = stats.getStrength();
        var currentJump = skills.getSkillLevel(JUMP_SKILL);
        var maxJump = skills.getMaxSkillLevel(JUMP_SKILL);

        if (maxJump <= 0) maxJump = MAX_LEVEL;
        if (maxJump > MAX_LEVEL) maxJump = MAX_LEVEL;

        var targetLevel = currentJump;

        for (var level = 1; level <= maxJump; level++) {
            if (JUMP_STRENGTH_REQUIREMENTS[level] != null && strength >= JUMP_STRENGTH_REQUIREMENTS[level]) {
                targetLevel = level;
            }
        }

        if (targetLevel > currentJump) {
            skills.setSkillLevel(JUMP_SKILL, targetLevel);

            if (currentJump < 1) {
                player.message("§a[Jump] Jump unlocked at level " + targetLevel + ".");
            } else {
                player.message("§a[Jump] Increased to level " + targetLevel + ".");
            }

            if (targetLevel >= maxJump) {
                player.message("§6[Jump] Jump is now maxed.");
            }

            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
        }

    } catch (err) {
        player.message("§4[Jump Script Error] " + err);
    }
}
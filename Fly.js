var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var System = Java.type("java.lang.System");

var FLY_SKILL = "fly";
var ENERGY_REQUIREMENT = 500;

var FLY_LEVEL_SECONDS = {
    2: 60,
    3: 300,
    4: 600,
    5: 1800,
    6: 3600,
    7: 5400,
    8: 7200,
    9: 9000,
    10: 10800
};

function tick(event) {
    var player = event.player;
    if (player == null) return;

    var temp = player.getTempdata();
    var now = System.currentTimeMillis();

    // Only run once per second.
    if (temp.has("flight_training_next_check")) {
        if (now < parseInt(temp.get("flight_training_next_check"))) return;
    }

    temp.put("flight_training_next_check", now + 1000);

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var skills = data.getSkills();
        if (skills == null) return;

        skills.registerDefaultSkill(FLY_SKILL, 10);
        skills.refreshNonFormSkillMaxLevels();

        var maxEnergy = data.getMaxEnergy();
        var currentFly = skills.getSkillLevel(FLY_SKILL);
        var maxFly = skills.getMaxSkillLevel(FLY_SKILL);

        if (maxFly <= 0) maxFly = 10;
        if (maxFly > 10) maxFly = 10;

        var stored = player.getStoreddata();
        var changed = false;

        // Flight can no longer be unlocked organically.
	// Players must unlock Flight through NPC / purchase / admin system first.
	// Once unlocked, it can still level organically by flying.
	if (currentFly < 1) {
    		return;
	}
        if (currentFly >= maxFly) {
            if (changed) {
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            }
            return;
        }

        var nextLevel = currentFly + 1;

        if (!FLY_LEVEL_SECONDS[nextLevel]) {
            if (changed) {
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            }
            return;
        }

        var isFlying = skills.isSkillActive(FLY_SKILL) && !mcPlayer.m_20096_();

        if (!isFlying) {
            if (changed) {
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            }
            return;
        }

        var progressKey = "fly_training_progress_to_level_" + nextLevel;
        var activeLevelKey = "fly_training_active_next_level";

        if (!stored.has(activeLevelKey) || parseInt(stored.get(activeLevelKey)) != nextLevel) {
            stored.put(activeLevelKey, nextLevel);

            if (!stored.has(progressKey)) {
                stored.put(progressKey, 0);
            }
        }

        var progress = stored.has(progressKey)
            ? parseInt(stored.get(progressKey))
            : 0;

        if (isNaN(progress)) progress = 0;

        var requiredSeconds = FLY_LEVEL_SECONDS[nextLevel];

        // Converts older millisecond progress into seconds if needed.
        if (progress > requiredSeconds * 100) {
            progress = Math.floor(progress / 1000);
        }

        progress += 1;

        if (progress >= requiredSeconds) {
            skills.setSkillLevel(FLY_SKILL, nextLevel);
            stored.put(progressKey, requiredSeconds);

            changed = true;

            player.message("§b[Flight] Flight increased to level " + nextLevel + ".");

            var newNextLevel = nextLevel + 1;

            if (newNextLevel <= maxFly && FLY_LEVEL_SECONDS[newNextLevel]) {
                stored.put(activeLevelKey, newNextLevel);

                var newProgressKey = "fly_training_progress_to_level_" + newNextLevel;

                if (!stored.has(newProgressKey)) {
                    stored.put(newProgressKey, 0);
                }
            }

            if (nextLevel >= maxFly) {
                player.message("§6[Flight] Flight is now maxed.");
            }

        } else {
            stored.put(progressKey, progress);
        }

        if (changed) {
            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
        }

    } catch (err) {
        player.message("§4[Flight Script Error] " + err);
    }
}
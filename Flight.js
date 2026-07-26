/*
============================================================
 DBZ Legacy Reborn - Flight.js
 Version: 1.0.0

 Combined from:
   - Fly.js (organic fly leveling)
   - ViltrumiteFly.js (race max fly grant)
   - flight suppression.js (search/combat speed caps)

 PLACE AS: CustomNPCs Global Player Script
 Enable: tick

 Old Fly / ViltrumiteFly / flight suppression files were removed.
============================================================
*/

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var System = Java.type("java.lang.System");

var FLY_TRAINING_SKILL = "fly";
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

function flyTrainingTick(event) {
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

        skills.registerDefaultSkill(FLY_TRAINING_SKILL, 10);
        skills.refreshNonFormSkillMaxLevels();

        var maxEnergy = data.getMaxEnergy();
        var currentFly = skills.getSkillLevel(FLY_TRAINING_SKILL);
        var maxFly = skills.getMaxSkillLevel(FLY_TRAINING_SKILL);

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

        var isFlying = skills.isSkillActive(FLY_TRAINING_SKILL) && !mcPlayer.m_20096_();

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
            skills.setSkillLevel(FLY_TRAINING_SKILL, nextLevel);
            stored.put(progressKey, requiredSeconds);

            changed = true;

            player.message("\u00A7b[Flight] Flight increased to level " + nextLevel + ".");

            var newNextLevel = nextLevel + 1;

            if (newNextLevel <= maxFly && FLY_LEVEL_SECONDS[newNextLevel]) {
                stored.put(activeLevelKey, newNextLevel);

                var newProgressKey = "fly_training_progress_to_level_" + newNextLevel;

                if (!stored.has(newProgressKey)) {
                    stored.put(newProgressKey, 0);
                }
            }

            if (nextLevel >= maxFly) {
                player.message("\u00A76[Flight] Flight is now maxed.");
            }

        } else {
            stored.put(progressKey, progress);
        }

        if (changed) {
            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
        }

    } catch (err) {
        player.message("\u00A74[Flight Script Error] " + err);
    }
}

function viltrumiteFlyTick(event) {
    var player = event.player;
    if (player == null) return;

    var temp = player.getTempdata();
    var now = System.currentTimeMillis();

    // Only check once per second.
    if (temp.has("viltrumite_flight_next_check")) {
        if (now < parseInt(temp.get("viltrumite_flight_next_check"))) return;
    }

    temp.put("viltrumite_flight_next_check", now + 1000);

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var ch = data.getCharacter();
        if (ch == null) return;

        var skills = data.getSkills();
        if (skills == null) return;

        var race = String(ch.getRace()).toLowerCase();
        var currentFly = skills.getSkillLevel("fly");

        if (race == "viltrumite") {
            var maxFly = skills.getMaxSkillLevel("fly");
            if (maxFly <= 0) maxFly = 10;

            if (currentFly < maxFly) {
                skills.setSkillLevel("fly", maxFly);
                temp.put("viltrumite_flight_granted", true);
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            }

        } else {
            // Only remove flight if THIS script previously granted it.
            if (temp.has("viltrumite_flight_granted")) {
                if (currentFly > 0) {
                    skills.setSkillLevel("fly", 0);
                    NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
                }

                temp.remove("viltrumite_flight_granted");
            }
        }

    } catch (err) {
        // player.message("Viltrumite fly skill error: " + err);
    }
}

var DEBUG = false;
var COLOR = "\u00A7";

var FLY_SKILL = "fly";

/*
 * Search Flight caps (blocks / tick).
 * Vanilla creative fly is about 0.05 ability speed; DMZ Search
 * can push ~0.35 motion. These caps keep Search controllable.
 */
var SEARCH_ENABLED = true;
var SEARCH_HORIZONTAL_MAX = 0.08;
var SEARCH_UP_MAX = 0.07;
var SEARCH_DOWN_MAX = 0.08;
var SEARCH_TOTAL_MAX = 0.10;
var SEARCH_ABILITY_SPEED = 0.015;

/*
 * Combat Flight caps.
 * Keeps double-tap sustain useful without infinite accel.
 * Set COMBAT_ENABLED = false to leave combat flight raw.
 */
var COMBAT_ENABLED = true;
var COMBAT_HORIZONTAL_MAX = 0.28;
var COMBAT_UP_MAX = 0.22;
var COMBAT_DOWN_MAX = 0.24;
var COMBAT_TOTAL_MAX = 0.32;

/* Ignore tiny drift so hovering does not spam motion writes. */
var MOTION_DEADZONE = 0.0015;

/*
 * Optional soft scale from fly skill level.
 * Level 1 = base caps, level 10 ~= +LEVEL_BONUS_AT_MAX.
 */
var SCALE_WITH_FLY_LEVEL = true;
var LEVEL_BONUS_AT_MAX = 0.35;

var DEFAULT_ABILITY_SPEED = 0.05;

var K_CHANGED_ABILITY = "flightSuppress.changedAbility";
var K_SAVED_ABILITY = "flightSuppress.savedAbility";

/* ========================= HELPERS ========================= */

function debug(player, text) {
    if (!DEBUG || player == null) return;
    try {
        player.message(COLOR + "8[FlightSuppress] " + COLOR + "7" + text);
    } catch (e) {}
}

function getTemp(player) {
    try {
        return player.getTempdata();
    } catch (e) {
        return null;
    }
}

function getMCPlayer(player) {
    try {
        if (player.getMCEntity) {
            return player.getMCEntity();
        }
    } catch (e) {}
    return player;
}

function getDMZData(mcPlayer) {
    try {
        return StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);
    } catch (e) {
        return null;
    }
}

function isCreativeOrSpectator(mcPlayer) {
    try {
        var abilities = getAbilities(mcPlayer);
        if (abilities == null) return false;

        if (abilities.instabuild === true) return true;
        if (abilities.f_35937_ === true) return true; // instabuild obfuscated
    } catch (e) {}

    try {
        var mode = mcPlayer.gameMode;
        if (mode != null) {
            var name = String(mode.getGameModeForPlayer());
            if (name.indexOf("CREATIVE") >= 0) return true;
            if (name.indexOf("SPECTATOR") >= 0) return true;
        }
    } catch (e2) {}

    return false;
}

function isOnGround(mcPlayer) {
    try {
        if (typeof mcPlayer.onGround == "function") {
            return mcPlayer.onGround() === true;
        }
    } catch (e) {}

    try {
        if (typeof mcPlayer.m_20096_ == "function") {
            return mcPlayer.m_20096_() === true;
        }
    } catch (e2) {}

    return false;
}

function isFlySkillActive(skills) {
    if (skills == null) return false;

    try {
        if (typeof skills.isSkillActive == "function") {
            return skills.isSkillActive(FLY_SKILL) === true;
        }
    } catch (e) {}

    try {
        var skill = skills.getSkill(FLY_SKILL);
        if (skill != null && typeof skill.isActive == "function") {
            return skill.isActive() === true;
        }
    } catch (e2) {}

    return false;
}

function getFlyLevel(skills) {
    try {
        var level = Number(skills.getSkillLevel(FLY_SKILL));
        if (isNaN(level) || level < 0) return 0;
        return level;
    } catch (e) {
        return 0;
    }
}

function getFlightMode(status) {
    if (status == null) return -1;

    try {
        if (typeof status.getFlightMode == "function") {
            return Number(status.getFlightMode());
        }
    } catch (e) {}

    try {
        if (typeof status.getFlyMode == "function") {
            return Number(status.getFlyMode());
        }
    } catch (e2) {}

    return -1;
}

function levelScale(flyLevel) {
    if (!SCALE_WITH_FLY_LEVEL) return 1.0;

    var level = Number(flyLevel);
    if (isNaN(level) || level <= 1) return 1.0;
    if (level > 10) level = 10;

    var progress = (level - 1) / 9.0;
    return 1.0 + (progress * LEVEL_BONUS_AT_MAX);
}

/* ========================= ABILITY SPEED ========================= */

function getAbilities(mcPlayer) {
    try {
        if (typeof mcPlayer.getAbilities == "function") {
            return mcPlayer.getAbilities();
        }
    } catch (e) {}

    try {
        if (typeof mcPlayer.m_150110_ == "function") {
            return mcPlayer.m_150110_();
        }
    } catch (e2) {}

    return null;
}

function readAbilitySpeed(abilities) {
    if (abilities == null) return DEFAULT_ABILITY_SPEED;

    try {
        if (abilities.flyingSpeed !== undefined) {
            return Number(abilities.flyingSpeed);
        }
    } catch (e) {}

    try {
        if (abilities.f_35939_ !== undefined) {
            return Number(abilities.f_35939_);
        }
    } catch (e2) {}

    return DEFAULT_ABILITY_SPEED;
}

function writeAbilitySpeed(abilities, speed) {
    if (abilities == null) return false;

    try {
        if (abilities.flyingSpeed !== undefined) {
            abilities.flyingSpeed = speed;
            return true;
        }
    } catch (e) {}

    try {
        abilities.f_35939_ = speed;
        return true;
    } catch (e2) {}

    return false;
}

function syncAbilities(mcPlayer) {
    try {
        if (typeof mcPlayer.onUpdateAbilities == "function") {
            mcPlayer.onUpdateAbilities();
            return;
        }
    } catch (e) {}

    try {
        if (typeof mcPlayer.m_6885_ == "function") {
            mcPlayer.m_6885_();
        }
    } catch (e2) {}
}

function setAbilitySpeedTracked(player, mcPlayer, speed) {
    var abilities = getAbilities(mcPlayer);
    if (abilities == null) return;

    var temp = getTemp(player);
    var current = readAbilitySpeed(abilities);

    if (Math.abs(current - speed) <= 0.0001) return;

    if (temp != null) {
        try {
            if (!temp.has(K_CHANGED_ABILITY)) {
                temp.put(K_SAVED_ABILITY, "" + current);
                temp.put(K_CHANGED_ABILITY, "1");
            }
        } catch (e) {}
    }

    if (writeAbilitySpeed(abilities, speed)) {
        syncAbilities(mcPlayer);
    }
}

function restoreAbilitySpeedTracked(player, mcPlayer) {
    var temp = getTemp(player);
    if (temp == null) return;

    try {
        if (!temp.has(K_CHANGED_ABILITY)) return;

        var saved = DEFAULT_ABILITY_SPEED;
        if (temp.has(K_SAVED_ABILITY)) {
            saved = Number(temp.get(K_SAVED_ABILITY));
            if (isNaN(saved)) saved = DEFAULT_ABILITY_SPEED;
        }

        var abilities = getAbilities(mcPlayer);
        if (abilities != null) {
            writeAbilitySpeed(abilities, saved);
            syncAbilities(mcPlayer);
        }

        temp.remove(K_CHANGED_ABILITY);
        temp.remove(K_SAVED_ABILITY);
    } catch (e) {}
}

/* ========================= MOTION CLAMP ========================= */

function readMotion(mcPlayer) {
    try {
        if (typeof mcPlayer.getDeltaMovement == "function") {
            return mcPlayer.getDeltaMovement();
        }
    } catch (e) {}

    try {
        if (typeof mcPlayer.m_20184_ == "function") {
            return mcPlayer.m_20184_();
        }
    } catch (e2) {}

    return null;
}

function writeMotion(mcPlayer, x, y, z) {
    try {
        if (typeof mcPlayer.setDeltaMovement == "function") {
            mcPlayer.setDeltaMovement(x, y, z);
            return true;
        }
    } catch (e) {}

    try {
        if (typeof mcPlayer.m_20334_ == "function") {
            mcPlayer.m_20334_(x, y, z);
            return true;
        }
    } catch (e2) {}

    return false;
}

function markMotionDirty(mcPlayer) {
    try {
        mcPlayer.hurtMarked = true;
        return;
    } catch (e) {}

    try {
        mcPlayer.f_19812_ = true; // hurtMarked obfuscated fallback
    } catch (e2) {}
}

function clampMotion(mcPlayer, horizontalMax, upMax, downMax, totalMax) {
    try {
        if (isOnGround(mcPlayer)) return;

        var motion = readMotion(mcPlayer);
        if (motion == null) return;

        var x = Number(motion.x);
        var y = Number(motion.y);
        var z = Number(motion.z);
        if (isNaN(x) || isNaN(y) || isNaN(z)) return;

        var speedNow = Math.sqrt((x * x) + (y * y) + (z * z));
        if (speedNow < MOTION_DEADZONE) return;

        var changed = false;

        var horizontal = Math.sqrt((x * x) + (z * z));
        if (horizontal > horizontalMax && horizontal > 0) {
            var hScale = horizontalMax / horizontal;
            x *= hScale;
            z *= hScale;
            changed = true;
        }

        if (y > upMax) {
            y = upMax;
            changed = true;
        } else if (y < -downMax) {
            y = -downMax;
            changed = true;
        }

        var total = Math.sqrt((x * x) + (y * y) + (z * z));
        if (total > totalMax && total > 0) {
            var tScale = totalMax / total;
            x *= tScale;
            y *= tScale;
            z *= tScale;
            changed = true;
        }

        if (!changed) return;

        if (writeMotion(mcPlayer, x, y, z)) {
            markMotionDirty(mcPlayer);
        }
    } catch (e) {}
}

/* ========================= MAIN ========================= */

function flightSuppressionTick(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var mcPlayer = getMCPlayer(player);
        if (mcPlayer == null) return;

        if (isCreativeOrSpectator(mcPlayer)) {
            restoreAbilitySpeedTracked(player, mcPlayer);
            return;
        }

        var data = getDMZData(mcPlayer);
        if (data == null) {
            restoreAbilitySpeedTracked(player, mcPlayer);
            return;
        }

        var skills = null;
        var status = null;
        try { skills = data.getSkills(); } catch (e1) {}
        try { status = data.getStatus(); } catch (e2) {}

        if (!isFlySkillActive(skills)) {
            restoreAbilitySpeedTracked(player, mcPlayer);
            return;
        }

        /*
         * Landed players can still briefly report fly-active.
         * Do not keep ability speed suppressed on the ground.
         */
        if (isOnGround(mcPlayer)) {
            restoreAbilitySpeedTracked(player, mcPlayer);
            return;
        }

        var mode = getFlightMode(status);
        var flyLevel = getFlyLevel(skills);
        var scale = levelScale(flyLevel);

        if (mode == 1) {
            if (!COMBAT_ENABLED) {
                restoreAbilitySpeedTracked(player, mcPlayer);
                return;
            }

            restoreAbilitySpeedTracked(player, mcPlayer);
            clampMotion(
                mcPlayer,
                COMBAT_HORIZONTAL_MAX * scale,
                COMBAT_UP_MAX * scale,
                COMBAT_DOWN_MAX * scale,
                COMBAT_TOTAL_MAX * scale
            );
            return;
        }

        /*
         * Mode 0 = Search Flight.
         * Unknown / missing mode also uses Search caps as the safe default
         * while the fly skill is active in the air.
         */
        if (!SEARCH_ENABLED) {
            restoreAbilitySpeedTracked(player, mcPlayer);
            return;
        }

        setAbilitySpeedTracked(player, mcPlayer, SEARCH_ABILITY_SPEED);
        clampMotion(
            mcPlayer,
            SEARCH_HORIZONTAL_MAX * scale,
            SEARCH_UP_MAX * scale,
            SEARCH_DOWN_MAX * scale,
            SEARCH_TOTAL_MAX * scale
        );

    } catch (err) {
        debug(player, "tick error: " + err);
    }
}
function tick(event) {
    // Suppression every tick; training / viltrumite throttle themselves.
    flightSuppressionTick(event);
    flyTrainingTick(event);
    viltrumiteFlyTick(event);
}

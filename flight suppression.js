/*
============================================================
 DBZ Legacy Reborn - Flight Suppression
 Version: 2.0.0

 PLACE AS:
 CustomNPCs Global Player Script
 Enable event: tick

 PURPOSE:
 Soft-cap DragonMineZ fly skill speed so Search Flight stays
 travel-useful and Combat Flight cannot runaway from the
 2.1.3 sustained double-tap acceleration.

 DMZ 2.1.3 flight modes:
   0 = Search Flight
   1 = Combat Flight

 NOTES:
 - Search Flight also pushes velocity from the client, so this
   script clamps server motion every tick AND lowers ability
   flyingSpeed as a secondary brake.
 - Ability speed is only restored if THIS script changed it.
 - Creative / Spectator players are never touched.
============================================================
*/

var StatsProvider = Java.type(
    "com.dragonminez.common.stats.StatsProvider"
);
var StatsCapability = Java.type(
    "com.dragonminez.common.stats.StatsCapability"
);

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

function tick(event) {
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

/*
 * DragonMineZ 2.1.3 Flight Balance
 * CustomNPCs player tick script
 *
 * Verified 2.1.3 flight modes:
 *   0 = Search Flight
 *   1 = Combat Flight
 *
 * 2.1.3 Search Flight directly applies velocity client-side, so changing
 * Abilities flyingSpeed alone no longer limits it. This script clamps the
 * actual Search Flight motion while leaving Combat Flight untouched.
 */

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");

// Search Flight limits in blocks per tick.
// 2.1.3 applies about 0.35 motion directly. These values reduce Search Flight
// to roughly 13-14% of that speed while keeping it controllable.
var SEARCH_HORIZONTAL_MAX = 0.045;
var SEARCH_UP_MAX = 0.04;
var SEARCH_DOWN_MAX = 0.04;
var SEARCH_TOTAL_MAX = 0.05;

// Combat Flight / Infinite Acceleration limit.
// DMZ 2.1.3 applies a 1.6x sustained-direction multiplier after a double tap.
// This ceiling keeps the mechanic useful without allowing runaway speed.
var COMBAT_HORIZONTAL_MAX = 0.22;
var COMBAT_UP_MAX = 0.18;
var COMBAT_DOWN_MAX = 0.18;
var COMBAT_TOTAL_MAX = 0.24;

// Vanilla ability value retained as a secondary restriction.
var SEARCH_ABILITY_SPEED = 0.01;
var DEFAULT_ABILITY_SPEED = 0.05;

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return;

        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var skills = data.getSkills();
        var status = data.getStatus();
        if (skills == null || status == null) return;

        var flySkill = null;
        try {
            flySkill = skills.getSkill("fly");
        } catch (ignored1) {}

        var flyActive = false;
        if (flySkill != null) {
            try {
                flyActive = flySkill.isActive();
            } catch (ignored2) {}
        }

        if (!flyActive) {
            restoreAbilitySpeed(mcPlayer);
            return;
        }

        var flightMode;
        try {
            flightMode = status.getFlightMode();
        } catch (ignored3) {
            return;
        }

        if (flightMode == 1) {
            // Combat Flight: retain normal combat movement, but cap the
            // sustained double-tap acceleration added by DMZ 2.1.3.
            restoreAbilitySpeed(mcPlayer);
            clampMotion(mcPlayer, COMBAT_HORIZONTAL_MAX, COMBAT_UP_MAX,
                COMBAT_DOWN_MAX, COMBAT_TOTAL_MAX);
            return;
        }

        // Mode 0 is Search Flight.
        setAbilitySpeed(mcPlayer, SEARCH_ABILITY_SPEED);
        clampMotion(mcPlayer, SEARCH_HORIZONTAL_MAX, SEARCH_UP_MAX,
            SEARCH_DOWN_MAX, SEARCH_TOTAL_MAX);

    } catch (err) {
        // Uncomment temporarily only when debugging:
        // event.player.message("§cFlight suppression error: " + err);
    }
}

function clampMotion(mcPlayer, horizontalMax, upMax, downMax, totalMax) {
    try {
        if (mcPlayer.onGround()) return;

        var motion = mcPlayer.getDeltaMovement();
        if (motion == null) return;

        var x = motion.x;
        var y = motion.y;
        var z = motion.z;
        var changed = false;

        var horizontal = Math.sqrt((x * x) + (z * z));
        if (horizontal > horizontalMax && horizontal > 0.0) {
            var scale = horizontalMax / horizontal;
            x *= scale;
            z *= scale;
            changed = true;
        }

        if (y > upMax) {
            y = upMax;
            changed = true;
        } else if (y < -downMax) {
            y = -downMax;
            changed = true;
        }

        var totalSpeed = Math.sqrt((x * x) + (y * y) + (z * z));
        if (totalSpeed > totalMax && totalSpeed > 0.0) {
            var totalScale = totalMax / totalSpeed;
            x *= totalScale;
            y *= totalScale;
            z *= totalScale;
            changed = true;
        }

        if (changed) {
            mcPlayer.setDeltaMovement(x, y, z);
            mcPlayer.hurtMarked = true;
        }
    } catch (ignored) {}
}

function setAbilitySpeed(mcPlayer, speed) {
    try {
        var abilities = mcPlayer.m_150110_();
        if (abilities == null) return;

        if (Math.abs(abilities.f_35939_ - speed) > 0.0001) {
            abilities.f_35939_ = speed;
            mcPlayer.m_6885_();
        }
    } catch (ignored) {}
}

function restoreAbilitySpeed(mcPlayer) {
    setAbilitySpeed(mcPlayer, DEFAULT_ABILITY_SPEED);
}
/*
============================================================
 DBZ Legacy Reborn - Sparring TP System
 Version: 2.0.0

 Changelog:
 - Added complete persistent sparring statistics for command displays.
 - Added total sessions, rewarded sparring time, best payout, perfect payouts,
   highest combo, current streak, and best streak tracking.
 - Added separate command-handler script for reliable /noppes triggers.
 - Added daily Training Streaks requiring one continuous 5-minute session.
 - Streak bonus increases by 2% per day and caps at x1.25.
 - Added late-session Combo tiers beginning at 5 minutes.
 - Combo tier messages only appear when reaching a new tier.
 - No title or chat-prefix system was added.
 - Fixed Android/high-BP partners massively inflating sparring TP.
 - BP rewards now use the weaker fighter's BP instead of the pair average.
 - Fixed weight multiplier using the wrong maximum setting.
 - Replaced tiered BP rewards with smooth logarithmic interpolation.
 - Removed sudden TP jumps when crossing Battle Power thresholds.
 - Battle Power above 100T continues scaling instead of hard-capping.
 - Steepened Battle Power TP scaling for end-game progression.
 - High BP players can now earn 100k+ TP per payout before additional bonuses.
 - Added long-session TP scaling: +10% per full minute, capped at 2x.
 - Added persistent top-10 sparring TP leaderboard.
 - Leaderboard also records each player's longest active session.
 - Use trigger ID 72 to display the leaderboard.
 - Base TP increased to 750.
 - Removed minimum TP floor system.
 - Fixed reward messages using the correct SHOW_TP_MESSAGES setting.
 - Replaced fragile section-sign characters with a safe color helper.
 - Added visible error messages when DMZ data, calculation, or payout fails.
 - Fixed minimum TP handling: calculations stay unchanged and the 750 minimum is applied only when TP is awarded.
 - Cleaned reward messages and restored Minecraft section-sign colors.
 - Added functional 3-second recovery grace period.
 - Added Perfect Training x2 bonus.
 - Perfect Training requires matching gravity/weight, 200% release,
   and Battle Power within 10%.
 - Gravity, weight and Limit Release now recalculate live.
 - Changing gravity, weight or release no longer ends a session.
 - Increased hit, movement, start and distance allowances.
 - Minimum TP reward raised to 750.

 PLACE AS:
 CustomNPCs Global Player Script

 COMMAND DISPLAY:
 Use the separate Sparring_Command_Handler_v2.0.0.js file.

 REQUIRED EVENTS:
 - tick
 - damagedEntity
 - logout
 - died

 IMPORTANT:
 - Directly awards DMZ Training Points. No commands.
 - Only exchanged player-vs-player melee hits start sparring.
============================================================
*/

/* ========================= JAVA TYPES ========================= */

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var AbstractKiProjectile = Java.type("com.dragonminez.common.init.entities.ki.AbstractKiProjectile");
var GravityLogic = Java.type("com.dragonminez.server.util.GravityLogic");
var MCPlayerClass = Java.type("net.minecraft.world.entity.player.Player");
var Bukkit = Java.type("org.bukkit.Bukkit");
var System = Java.type("java.lang.System");
var LocalDate = Java.type("java.time.LocalDate");

/* ========================= CONFIGURATION ========================= */

var DEBUG = false;
var COLOR_CODE = String.fromCharCode(167);

/* TP is paid once per active interval. */
var BASE_TP_PER_INTERVAL = 1500;

var AWARD_INTERVAL_MS = 5000;

/*
 * Long-session TP bonus:
 * +10% for every completed minute, capped at 2x after 10 minutes.
 */
var DURATION_BONUS_INTERVAL_MS = 60000;
var DURATION_BONUS_PER_INTERVAL = 0.10;
var MAX_DURATION_MULTIPLIER = 2.0;

/*
 * Late-session Combo bonus.
 * Combos do not begin until the session reaches five minutes.
 */
var ENABLE_COMBO_BONUS = true;
var COMBO_TIME_MS = [
    300000,   // 5 minutes
    420000,   // 7 minutes
    600000,   // 10 minutes
    900000,   // 15 minutes
    1200000,  // 20 minutes
    1800000,  // 30 minutes
    2700000   // 45 minutes
];
var COMBO_MULTIPLIERS = [
    1.05,
    1.10,
    1.20,
    1.35,
    1.50,
    1.75,
    2.00
];
var SHOW_COMBO_MESSAGES = true;

/*
 * Daily Training Streak.
 * One uninterrupted five-minute sparring session secures the day.
 */
var ENABLE_TRAINING_STREAK = true;
var STREAK_MIN_SESSION_MS = 300000;
var STREAK_BONUS_PER_DAY = 0.02;
var MAX_STREAK_DAYS_FOR_BONUS = 14;
var MAX_STREAK_MULTIPLIER = 1.25;
var SHOW_STREAK_MESSAGES = true;

/* Persistent sparring leaderboard. */
var ENABLE_SPARRING_LEADERBOARD = true;
var LEADERBOARD_TRIGGER_ID = 72;
var LEADERBOARD_SIZE = 10;


/* Both players must exchange melee hits within this time. */
var HIT_ACTIVITY_WINDOW_MS = 5000;

/* Initial reciprocal hit required within this time. */
var SESSION_START_WINDOW_MS = 15000;

/* Both players must move this far to refresh movement activity. */
var MIN_MOVEMENT_DISTANCE = 1.5;
var MOVEMENT_ACTIVITY_WINDOW_MS = 8000;

/* Maximum distance between sparring partners. */
var MAX_SPAR_DISTANCE = 30.0;

/* Prevent instant re-pairing after a session ends. */
var PAIR_RESTART_COOLDOWN_MS = 3000;


/* Recoverable failures must remain invalid this long before the session ends. */
var SESSION_GRACE_PERIOD_MS = 3000;
var DISTANCE_GRACE_PERIOD_MS = 4000;
var SHOW_GRACE_WARNING = true;

/* Perfect Training bonus. */
var ENABLE_PERFECT_TRAINING = true;
var PERFECT_TRAINING_MULTIPLIER = 2.0;
var PERFECT_BP_DIFFERENCE = 0.10;       // Maximum 10% BP difference.
var PERFECT_RELEASE_PERCENT = 200.0;     // Both fighters must be at 200%.
var PERFECT_RELEASE_TOLERANCE = 0.5;
var PERFECT_GRAVITY_TOLERANCE = 0.01;
var PERFECT_WEIGHT_TOLERANCE = 1.0;

/* Snapshot comparison tolerances. */
var BP_CHANGE_TOLERANCE_PERCENT = 0.02;
var RELEASE_CHANGE_TOLERANCE = 0.01;
var GRAVITY_CHANGE_TOLERANCE = 0.01;
var WEIGHT_CHANGE_TOLERANCE = 1.0;

/* Safety cap for malformed or abnormally large DMZ Battle Power values. */
var MAX_BP_MULTIPLIER = 600.0;

/* Rival multiplier cap. */
var MAX_RIVAL_MULTIPLIER = 3.0;

/* Gravity: 1G = 1x, 1000G = 5x. */
var MAX_GRAVITY = 1000.0;
var MAX_GRAVITY_MULTIPLIER = 5.0;

/* Effective weight: 0 = 1x, 1000 = 2x. */
var MAX_EFFECTIVE_WEIGHT = 1000.0;
var MAX_WEIGHT_MULTIPLIER = 2.0;

/* Limit Release: 100% = 1x, 200% = 2x. */
var MIN_RELEASE_PERCENT = 100.0;
var MAX_RELEASE_PERCENT = 200.0;
var MAX_RELEASE_MULTIPLIER = 2.0;

/* Prestige: +10% per Prestige, capped at Prestige 10. */
var FABLED_PRESTIGE_CLASS_NAME = "Prestige";
var FABLED_PRESTIGE_LEVEL_OFFSET = 1;
var MAX_PRESTIGE_LEVEL = 10;
var PRESTIGE_MULTIPLIER_PER_LEVEL = 0.10;

/* Player-facing messages. */
var SHOW_SESSION_MESSAGES = true;
var SHOW_TP_MESSAGES = true;
var SHOW_MULTIPLIER_BREAKDOWN = false;
var MESSAGE_COOLDOWN_MS = 5000;

/* ========================= DATA KEYS ========================= */

var K_PARTNER = "spar.partner";
var K_SESSION_ACTIVE = "spar.active";
var K_SESSION_START = "spar.start";
var K_NEXT_AWARD = "spar.nextAward";
var K_COOLDOWN = "spar.restartCooldown";
var K_GRACE_UNTIL = "spar.grace.until";
var K_GRACE_REASON = "spar.grace.reason";
var K_GRACE_WARNED = "spar.grace.warned";

var LB_NAMES_KEY = "spar.leaderboard.names";
var LB_TP_PREFIX = "spar.leaderboard.tp.";
var LB_LONGEST_PREFIX = "spar.leaderboard.longest.";
var LB_BEST_PAYOUT_PREFIX = "spar.leaderboard.bestPayout.";
var LB_TOTAL_TIME_PREFIX = "spar.leaderboard.totalTime.";
var LB_SESSIONS_PREFIX = "spar.leaderboard.sessions.";
var LB_PERFECT_PREFIX = "spar.leaderboard.perfectPayouts.";
var LB_HIGHEST_COMBO_PREFIX = "spar.leaderboard.highestCombo.";
var LB_STREAK_PREFIX = "spar.leaderboard.currentStreak.";
var LB_BEST_STREAK_PREFIX = "spar.leaderboard.bestStreak.";


var K_LAST_OUT_PARTNER = "spar.lastOut.partner";
var K_LAST_OUT_TIME = "spar.lastOut.time";
var K_LAST_IN_PARTNER = "spar.lastIn.partner";
var K_LAST_IN_TIME = "spar.lastIn.time";

var K_MOVE_X = "spar.move.x";
var K_MOVE_Y = "spar.move.y";
var K_MOVE_Z = "spar.move.z";
var K_MOVE_VALID_UNTIL = "spar.move.validUntil";

var K_SNAP_BP = "spar.snapshot.bp";
var K_SNAP_RELEASE = "spar.snapshot.release";
var K_SNAP_GRAVITY = "spar.snapshot.gravity";
var K_SNAP_WEIGHT = "spar.snapshot.weight";
var K_SNAP_PRESTIGE = "spar.snapshot.prestige";

var K_MESSAGE_NEXT = "spar.message.next";
var K_TICK_NEXT = "spar.tick.next";
var K_COMBO_TIER = "spar.combo.tier";

var S_STREAK_CURRENT = "spar.streak.current";
var S_STREAK_BEST = "spar.streak.best";
var S_STREAK_LAST_DAY = "spar.streak.lastDay";

/* ========================= BASIC HELPERS ========================= */

function nowMs() {
    return Number(System.currentTimeMillis());
}

function readNumber(data, key, fallback) {
    try {
        if (data != null && data.has(key)) {
            var value = Number("" + data.get(key));
            if (!isNaN(value)) return value;
        }
    } catch (e) {}
    return fallback;
}

function readString(data, key, fallback) {
    try {
        if (data != null && data.has(key)) {
            return String(data.get(key));
        }
    } catch (e) {}
    return fallback;
}

function putNumber(data, key, value) {
    try {
        data.put(key, "" + value);
    } catch (e) {}
}

function putString(data, key, value) {
    try {
        data.put(key, "" + value);
    } catch (e) {}
}

function clamp(value, minimum, maximum) {
    value = Number(value);
    if (isNaN(value)) return minimum;
    if (value < minimum) return minimum;
    if (value > maximum) return maximum;
    return value;
}

function nearlyEqual(a, b, tolerance) {
    return Math.abs(Number(a) - Number(b)) <= Number(tolerance);
}

function percentDifference(a, b) {
    a = Math.abs(Number(a));
    b = Math.abs(Number(b));
    var largest = Math.max(a, b);
    if (largest <= 0) return 0;
    return Math.abs(a - b) / largest;
}

function getPlayerName(player) {
    try {
        return String(player.getName());
    } catch (e) {
        return "";
    }
}

function getPlayerByName(player, name) {
    try {
        var world = player.getWorld();
        if (world != null) {
            var found = world.getPlayer(String(name));
            if (found != null) return found;
        }
    } catch (e) {}

    try {
        var bukkitPlayer = Bukkit.getPlayerExact(String(name));
        if (bukkitPlayer == null) return null;

        /*
         * CustomNPCs wrappers are normally available through the
         * current player's world. This fallback only confirms online.
         */
    } catch (e2) {}

    return null;
}

function isAlive(player) {
    try {
        return player != null && player.getHealth() > 0;
    } catch (e) {
        return false;
    }
}

function distanceBetween(a, b) {
    try {
        var dx = Number(a.getX()) - Number(b.getX());
        var dy = Number(a.getY()) - Number(b.getY());
        var dz = Number(a.getZ()) - Number(b.getZ());
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (e) {
        return 999999;
    }
}

function sendMessage(player, text) {
    try {
        player.message(text);
    } catch (e) {}
}

function debug(player, text) {
    if (!DEBUG) return;
    sendMessage(player, "§8[Spar Debug] §7" + text);
}

/* ========================= DMZ DATA ========================= */

function getDMZData(player) {
    try {
        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return null;

        return StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);
    } catch (e) {
        return null;
    }
}

function invokeNumberNoArgs(object, methodNames, fallback) {
    if (object == null) return fallback;

    for (var i = 0; i < methodNames.length; i++) {
        try {
            var method = object.getClass().getMethod(methodNames[i]);
            var value = Number(method.invoke(object));
            if (!isNaN(value)) return value;
        } catch (e) {}

        try {
            var direct = object[methodNames[i]];
            if (typeof direct == "function") {
                var directValue = Number(direct.call(object));
                if (!isNaN(directValue)) return directValue;
            }
        } catch (e2) {}
    }

    return fallback;
}

/*
 * DMZ builds have used different public names for Battle Power.
 * The first available method is used.
 */
function getCurrentBattlePower(playerData) {
    if (playerData == null) return 0;

    var direct = invokeNumberNoArgs(
        playerData,
        [
            "getCurrentBattlePower",
            "getBattlePower",
            "getCurrentPower",
            "getPowerLevel",
            "getPower"
        ],
        -1
    );

    if (direct >= 0) return direct;

    try {
        var stats = playerData.getStats();
        var fromStats = invokeNumberNoArgs(
            stats,
            [
                "getCurrentBattlePower",
                "getBattlePower",
                "getCurrentPower",
                "getPowerLevel",
                "getPower"
            ],
            -1
        );
        if (fromStats >= 0) return fromStats;
    } catch (e) {}

    try {
        var status = playerData.getStatus();
        var fromStatus = invokeNumberNoArgs(
            status,
            [
                "getCurrentBattlePower",
                "getBattlePower",
                "getCurrentPower",
                "getPowerLevel",
                "getPower"
            ],
            -1
        );
        if (fromStatus >= 0) return fromStatus;
    } catch (e2) {}

    return 0;
}

/*
 * Reads actual Limit Release from DMZ.
 * Handles either 1.0-2.0 or 100-200 storage.
 */
function getReleasePercent(playerData) {
    if (playerData == null) return 100.0;

    var release = invokeNumberNoArgs(
        playerData,
        ["getRelease", "getPowerRelease", "getReleaseLimit"],
        -1
    );

    if (release < 0) {
        try {
            release = invokeNumberNoArgs(
                playerData.getStatus(),
                ["getRelease", "getPowerRelease", "getReleaseLimit"],
                -1
            );
        } catch (e) {}
    }

    if (release < 0) return 100.0;

    if (release > 0 && release <= 3.0) {
        release *= 100.0;
    }

    return clamp(release, 0.0, MAX_RELEASE_PERCENT);
}

function getNetGravity(mcPlayer) {
    try {
        var value = Number(GravityLogic.getNetGravity(mcPlayer));
        if (!isNaN(value) && value > 0) return value;
    } catch (e) {}

    try {
        var multiplier = Number(
            GravityLogic.getTrainingGravityMultiplier(mcPlayer)
        );
        if (!isNaN(multiplier) && multiplier > 0) return multiplier;
    } catch (e2) {}

    return 1.0;
}

function getEffectiveWeight(mcPlayer) {
    try {
        var value = Number(GravityLogic.getEffectiveWeight(mcPlayer));
        if (!isNaN(value) && value > 0) return value;
    } catch (e) {}

    try {
        var total = Number(GravityLogic.getTotalWeight(mcPlayer));
        if (!isNaN(total) && total > 0) return total;
    } catch (e2) {}

    return 0.0;
}

function getFabledPrestigeLevel(player) {
    try {
        var plugin = Bukkit.getPluginManager().getPlugin("Fabled");
        if (plugin == null || !plugin.isEnabled()) return 0;

        var bukkitPlayer = Bukkit.getPlayerExact(getPlayerName(player));
        if (bukkitPlayer == null) return 0;

        var methods = plugin.getClass().getMethods();
        var getDataMethod = null;

        for (var i = 0; i < methods.length; i++) {
            if (
                String(methods[i].getName()) == "getData" &&
                methods[i].getParameterTypes().length == 1
            ) {
                getDataMethod = methods[i];
                break;
            }
        }

        if (getDataMethod == null) return 0;

        var fabledData = getDataMethod.invoke(null, bukkitPlayer);
        if (fabledData == null) return 0;

        var prestigeClass = fabledData.getClass(
            FABLED_PRESTIGE_CLASS_NAME
        );
        if (prestigeClass == null) return 0;

        var level = Number(prestigeClass.getLevel());
        if (isNaN(level)) return 0;

        return Math.floor(
            clamp(
                level - FABLED_PRESTIGE_LEVEL_OFFSET,
                0,
                MAX_PRESTIGE_LEVEL
            )
        );
    } catch (e) {
        return 0;
    }
}

function awardTrainingPoints(player, playerData, amount) {
    try {
        amount = Math.floor(Number(amount));
        if (isNaN(amount) || amount <= 0) return false;

        var resources = playerData.getResources();
        if (resources == null) return false;

        resources.addTrainingPoints(amount);

        var mcPlayer = player.getMCEntity();
        NetworkHandler.sendToTrackingEntityAndSelf(
            new StatsSyncS2C(mcPlayer),
            mcPlayer
        );

        return true;
    } catch (e) {
        sendMessage(
            player,
            "§c[Sparring] Failed to award TP: " + e
        );
        return false;
    }
}

/* ========================= MULTIPLIERS ========================= */

/*
 * Piecewise logarithmic-style curve:
 *
 * 100K = 1.0x
 * 1M   = 1.3x
 * 10M  = 1.7x
 * 100M = 2.2x
 * 1B   = 2.8x
 * 10B  = 3.5x
 * 100B = 4.2x
 * 1T   = 5.0x
 */
function getBattlePowerMultiplier(bp) {
    /*
     * Smooth logarithmic interpolation between progression anchors.
     *
     * This removes sudden reward jumps at exact BP thresholds while
     * preserving the intended early-, mid-, and end-game scaling.
     */
    var battlePower = Math.max(1, Number(bp));

    var bpAnchors = [
        1,
        100000,
        1000000,
        10000000,
        100000000,
        1000000000,
        10000000000,
        100000000000,
        1000000000000,
        10000000000000,
        100000000000000
    ];

    var multiplierAnchors = [
        1.0,
        2.0,
        5.0,
        12.0,
        25.0,
        50.0,
        100.0,
        150.0,
        250.0,
        400.0,
        600.0
    ];

    if (battlePower <= bpAnchors[0]) {
        return multiplierAnchors[0];
    }

    for (var i = 0; i < bpAnchors.length - 1; i++) {
        var lowerBP = bpAnchors[i];
        var upperBP = bpAnchors[i + 1];

        if (battlePower <= upperBP) {
            var lowerMultiplier = multiplierAnchors[i];
            var upperMultiplier = multiplierAnchors[i + 1];

            var lowerLog = Math.log(lowerBP) / Math.log(10);
            var upperLog = Math.log(upperBP) / Math.log(10);
            var currentLog = Math.log(battlePower) / Math.log(10);

            var progress =
                (currentLog - lowerLog) /
                (upperLog - lowerLog);

            return lowerMultiplier +
                (upperMultiplier - lowerMultiplier) *
                progress;
        }
    }

    /*
     * Continue scaling smoothly beyond 100T BP rather than hard-capping.
     * Each additional 10x BP adds another 200x multiplier.
     */
    var finalBP =
        bpAnchors[bpAnchors.length - 1];

    var finalMultiplier =
        multiplierAnchors[multiplierAnchors.length - 1];

    var extraDecades =
        (Math.log(battlePower) - Math.log(finalBP)) /
        Math.log(10);

    return Math.min(
        MAX_BP_MULTIPLIER,
        finalMultiplier + extraDecades * 200.0
    );
}

function getRivalMultiplier(bpA, bpB) {
    bpA = Math.max(0, Number(bpA));
    bpB = Math.max(0, Number(bpB));

    var highest = Math.max(bpA, bpB);
    if (highest <= 0) return 1.0;

    var ratio = Math.min(bpA, bpB) / highest;

    if (ratio >= 0.90) return Math.min(3.0, MAX_RIVAL_MULTIPLIER);
    if (ratio >= 0.75) return Math.min(2.5, MAX_RIVAL_MULTIPLIER);
    if (ratio >= 0.50) return Math.min(2.0, MAX_RIVAL_MULTIPLIER);
    if (ratio >= 0.25) return Math.min(1.5, MAX_RIVAL_MULTIPLIER);
    return 1.0;
}

function getReleaseMultiplier(releasePercent) {
    var release = clamp(
        Number(releasePercent),
        MIN_RELEASE_PERCENT,
        MAX_RELEASE_PERCENT
    );

    var progress =
        (release - MIN_RELEASE_PERCENT) /
        (MAX_RELEASE_PERCENT - MIN_RELEASE_PERCENT);

    return clamp(
        1.0 + progress * (MAX_RELEASE_MULTIPLIER - 1.0),
        1.0,
        MAX_RELEASE_MULTIPLIER
    );
}

function getGravityMultiplier(gravity) {
    var g = clamp(Number(gravity), 1.0, MAX_GRAVITY);
    var progress = (g - 1.0) / (MAX_GRAVITY - 1.0);

    return clamp(
        1.0 + progress * (MAX_GRAVITY_MULTIPLIER - 1.0),
        1.0,
        MAX_GRAVITY_MULTIPLIER
    );
}

function getWeightMultiplier(weight) {
    var w = clamp(Number(weight), 0.0, MAX_EFFECTIVE_WEIGHT);
    var progress = w / MAX_EFFECTIVE_WEIGHT;

    return clamp(
        1.0 + progress * (MAX_WEIGHT_MULTIPLIER - 1.0),
        1.0,
        MAX_WEIGHT_MULTIPLIER
    );
}

function getPrestigeMultiplier(prestige) {
    prestige = clamp(
        Math.floor(Number(prestige)),
        0,
        MAX_PRESTIGE_LEVEL
    );

    return 1.0 + prestige * PRESTIGE_MULTIPLIER_PER_LEVEL;
}

/* ========================= MOVEMENT ========================= */

function updateMovement(player) {
    try {
        var temp = player.getTempdata();
        var now = nowMs();

        var x = Number(player.getX());
        var y = Number(player.getY());
        var z = Number(player.getZ());

        if (
            !temp.has(K_MOVE_X) ||
            !temp.has(K_MOVE_Y) ||
            !temp.has(K_MOVE_Z)
        ) {
            putNumber(temp, K_MOVE_X, x);
            putNumber(temp, K_MOVE_Y, y);
            putNumber(temp, K_MOVE_Z, z);
            return;
        }

        var oldX = readNumber(temp, K_MOVE_X, x);
        var oldY = readNumber(temp, K_MOVE_Y, y);
        var oldZ = readNumber(temp, K_MOVE_Z, z);

        var dx = x - oldX;
        var dy = y - oldY;
        var dz = z - oldZ;
        var moved = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (moved >= MIN_MOVEMENT_DISTANCE) {
            putNumber(
                temp,
                K_MOVE_VALID_UNTIL,
                now + MOVEMENT_ACTIVITY_WINDOW_MS
            );
            putNumber(temp, K_MOVE_X, x);
            putNumber(temp, K_MOVE_Y, y);
            putNumber(temp, K_MOVE_Z, z);
        }
    } catch (e) {}
}

function hasRecentMovement(player) {
    try {
        return nowMs() <
            readNumber(
                player.getTempdata(),
                K_MOVE_VALID_UNTIL,
                0
            );
    } catch (e) {
        return false;
    }
}

/* ========================= SESSION DATA ========================= */

function isSessionActive(player) {
    try {
        return readString(
            player.getTempdata(),
            K_SESSION_ACTIVE,
            "0"
        ) == "1";
    } catch (e) {
        return false;
    }
}

function getPartnerName(player) {
    try {
        return readString(
            player.getTempdata(),
            K_PARTNER,
            ""
        );
    } catch (e) {
        return "";
    }
}

function clearSessionData(player) {
    try {
        var temp = player.getTempdata();

        temp.remove(K_PARTNER);
        temp.remove(K_SESSION_ACTIVE);
        temp.remove(K_SESSION_START);
        temp.remove(K_NEXT_AWARD);
        temp.remove(K_GRACE_UNTIL);
        temp.remove(K_GRACE_REASON);
        temp.remove(K_GRACE_WARNED);
        temp.remove(K_COMBO_TIER);

        temp.remove(K_SNAP_BP);
        temp.remove(K_SNAP_RELEASE);
        temp.remove(K_SNAP_GRAVITY);
        temp.remove(K_SNAP_WEIGHT);
        temp.remove(K_SNAP_PRESTIGE);
    } catch (e) {}
}

function snapshotPlayer(player) {
    var data = getDMZData(player);
    if (data == null) return false;

    try {
        var mc = player.getMCEntity();
        var temp = player.getTempdata();

        putNumber(temp, K_SNAP_BP, getCurrentBattlePower(data));
        putNumber(temp, K_SNAP_RELEASE, getReleasePercent(data));
        putNumber(temp, K_SNAP_GRAVITY, getNetGravity(mc));
        putNumber(temp, K_SNAP_WEIGHT, getEffectiveWeight(mc));
        putNumber(temp, K_SNAP_PRESTIGE, getFabledPrestigeLevel(player));

        return true;
    } catch (e) {
        return false;
    }
}

function startSession(a, b) {
    if (a == null || b == null) return false;

    var now = nowMs();
    var aTemp = a.getTempdata();
    var bTemp = b.getTempdata();

    if (
        now < readNumber(aTemp, K_COOLDOWN, 0) ||
        now < readNumber(bTemp, K_COOLDOWN, 0)
    ) {
        return false;
    }

    if (!snapshotPlayer(a) || !snapshotPlayer(b)) {
        return false;
    }

    var aName = getPlayerName(a);
    var bName = getPlayerName(b);

    putString(aTemp, K_PARTNER, bName);
    putString(bTemp, K_PARTNER, aName);

    putString(aTemp, K_SESSION_ACTIVE, "1");
    putString(bTemp, K_SESSION_ACTIVE, "1");

    putNumber(aTemp, K_SESSION_START, now);
    putNumber(bTemp, K_SESSION_START, now);

    putNumber(aTemp, K_NEXT_AWARD, now + AWARD_INTERVAL_MS);
    putNumber(bTemp, K_NEXT_AWARD, now + AWARD_INTERVAL_MS);
    putNumber(aTemp, K_COMBO_TIER, 0);
    putNumber(bTemp, K_COMBO_TIER, 0);

    recordSparringSessionStarted(a);
    recordSparringSessionStarted(b);

    if (SHOW_SESSION_MESSAGES) {
        sendMessage(
            a,
            "§6[Sparring] §eTraining session started with §f" +
            bName +
            "§e."
        );
        sendMessage(
            b,
            "§6[Sparring] §eTraining session started with §f" +
            aName +
            "§e."
        );
    }

    return true;
}

function endSession(player, partner, reason) {
    var now = nowMs();

    try {
        putNumber(
            player.getTempdata(),
            K_COOLDOWN,
            now + PAIR_RESTART_COOLDOWN_MS
        );
        clearSessionData(player);
    } catch (e) {}

    if (partner != null) {
        try {
            putNumber(
                partner.getTempdata(),
                K_COOLDOWN,
                now + PAIR_RESTART_COOLDOWN_MS
            );
            clearSessionData(partner);
        } catch (e2) {}
    }

    if (SHOW_SESSION_MESSAGES && reason != null && reason != "") {
        sendMessage(
            player,
            "§6[Sparring] §eSession ended: §f" +
            reason +
            "§e."
        );

        if (partner != null) {
            sendMessage(
                partner,
                "§6[Sparring] §eSession ended: §f" +
                reason +
                "§e."
            );
        }
    }
}

/* ========================= HIT TRACKING ========================= */

function isKiAttack(event) {
    try {
        var immediate =
            event.damageSource != null
                ? event.damageSource.getImmediateSource()
                : null;

        var immediateMC =
            immediate != null
                ? immediate.getMCEntity()
                : null;

        return (
            immediateMC != null &&
            AbstractKiProjectile.class.isInstance(immediateMC)
        );
    } catch (e) {
        return false;
    }
}

function recordMeleeHit(attacker, target) {
    var now = nowMs();
    var attackerName = getPlayerName(attacker);
    var targetName = getPlayerName(target);

    var attackerTemp = attacker.getTempdata();
    var targetTemp = target.getTempdata();

    putString(attackerTemp, K_LAST_OUT_PARTNER, targetName);
    putNumber(attackerTemp, K_LAST_OUT_TIME, now);

    putString(targetTemp, K_LAST_IN_PARTNER, attackerName);
    putNumber(targetTemp, K_LAST_IN_TIME, now);

    /*
     * Start only after the target has recently hit the attacker.
     */
    var reciprocalName = readString(
        targetTemp,
        K_LAST_OUT_PARTNER,
        ""
    );
    var reciprocalTime = readNumber(
        targetTemp,
        K_LAST_OUT_TIME,
        0
    );

    if (
        reciprocalName == attackerName &&
        now - reciprocalTime <= SESSION_START_WINDOW_MS
    ) {
        if (
            !isSessionActive(attacker) &&
            !isSessionActive(target)
        ) {
            startSession(attacker, target);
        }
    }
}

function hasRecentOutgoingHit(player, partnerName) {
    try {
        var temp = player.getTempdata();

        return (
            readString(temp, K_LAST_OUT_PARTNER, "") == partnerName &&
            nowMs() - readNumber(temp, K_LAST_OUT_TIME, 0)
                <= HIT_ACTIVITY_WINDOW_MS
        );
    } catch (e) {
        return false;
    }
}

/* ========================= SNAPSHOT VALIDATION ========================= */

function validateSnapshot(player) {
    var data = getDMZData(player);
    if (data == null) return "DMZ data unavailable";

    try {
        var temp = player.getTempdata();

        var oldBP = readNumber(temp, K_SNAP_BP, 0);
        var oldPrestige = readNumber(temp, K_SNAP_PRESTIGE, 0);

        var newBP = getCurrentBattlePower(data);
        var newPrestige = getFabledPrestigeLevel(player);

        /*
         * A significant BP change normally means a form or major power
         * state changed, so the matchup must be restarted.
         *
         * Release, gravity and weight are intentionally live values.
         * Changing those no longer ends the session.
         */
        if (
            percentDifference(oldBP, newBP) >
            BP_CHANGE_TOLERANCE_PERCENT
        ) {
            return "Battle Power changed";
        }

        if (Math.floor(oldPrestige) != Math.floor(newPrestige)) {
            return "Prestige changed";
        }

        return "";
    } catch (e) {
        return "snapshot validation failed";
    }
}

function getLiveTrainingValues(player) {
    var data = getDMZData(player);
    if (data == null) return null;

    try {
        var mc = player.getMCEntity();

        return {
            bp: getCurrentBattlePower(data),
            release: getReleasePercent(data),
            gravity: getNetGravity(mc),
            weight: getEffectiveWeight(mc),
            prestige: getFabledPrestigeLevel(player)
        };
    } catch (e) {
        return null;
    }
}

function isPerfectTraining(valuesA, valuesB) {
    if (!ENABLE_PERFECT_TRAINING) return false;
    if (valuesA == null || valuesB == null) return false;

    if (
        percentDifference(valuesA.bp, valuesB.bp) >
        PERFECT_BP_DIFFERENCE
    ) {
        return false;
    }

    if (
        Math.abs(valuesA.release - PERFECT_RELEASE_PERCENT) >
            PERFECT_RELEASE_TOLERANCE ||
        Math.abs(valuesB.release - PERFECT_RELEASE_PERCENT) >
            PERFECT_RELEASE_TOLERANCE
    ) {
        return false;
    }

    if (
        !nearlyEqual(
            valuesA.gravity,
            valuesB.gravity,
            PERFECT_GRAVITY_TOLERANCE
        )
    ) {
        return false;
    }

    if (
        !nearlyEqual(
            valuesA.weight,
            valuesB.weight,
            PERFECT_WEIGHT_TOLERANCE
        )
    ) {
        return false;
    }

    return true;
}

/* ========================= TP CALCULATION ========================= */

function getSessionDurationMs(player) {
    try {
        var started = readNumber(
            player.getTempdata(),
            K_SESSION_START,
            nowMs()
        );

        return Math.max(0, nowMs() - started);
    } catch (e) {
        return 0;
    }
}

function getDurationMultiplier(player) {
    var completedIntervals = Math.floor(
        getSessionDurationMs(player) /
        DURATION_BONUS_INTERVAL_MS
    );

    var multiplier =
        1.0 +
        completedIntervals *
        DURATION_BONUS_PER_INTERVAL;

    return clamp(
        multiplier,
        1.0,
        MAX_DURATION_MULTIPLIER
    );
}

function getComboTier(player) {
    if (!ENABLE_COMBO_BONUS) return 0;

    var duration = getSessionDurationMs(player);
    var tier = 0;

    for (var i = 0; i < COMBO_TIME_MS.length; i++) {
        if (duration >= COMBO_TIME_MS[i]) {
            tier = i + 1;
        } else {
            break;
        }
    }

    return tier;
}

function getComboMultiplier(player) {
    var tier = getComboTier(player);
    if (tier <= 0) return 1.0;

    var index = tier - 1;
    if (index >= COMBO_MULTIPLIERS.length) {
        index = COMBO_MULTIPLIERS.length - 1;
    }

    return Number(COMBO_MULTIPLIERS[index]);
}

function announceComboTier(player) {
    if (!ENABLE_COMBO_BONUS || !SHOW_COMBO_MESSAGES) return;

    var tier = getComboTier(player);
    var temp = player.getTempdata();
    var announced = readNumber(temp, K_COMBO_TIER, 0);

    if (tier <= announced) return;

    putNumber(temp, K_COMBO_TIER, tier);

    sendMessage(
        player,
        COLOR_CODE + "6[Sparring] " +
        COLOR_CODE + "eCombo " + tier +
        COLOR_CODE + "7 reached! " +
        COLOR_CODE + "a" +
        formatMultiplier(getComboMultiplier(player)) +
        COLOR_CODE + "7 TP."
    );
}

function getTodayEpochDay() {
    try {
        return Number(LocalDate.now().toEpochDay());
    } catch (e) {
        return Math.floor(nowMs() / 86400000);
    }
}

function getStreakStoreddata(player) {
    try {
        return player.getStoreddata();
    } catch (e) {
        return null;
    }
}

function getCurrentTrainingStreak(player) {
    if (!ENABLE_TRAINING_STREAK) return 0;

    var stored = getStreakStoreddata(player);
    if (stored == null) return 0;

    var current = Math.floor(
        readNumber(stored, S_STREAK_CURRENT, 0)
    );
    var lastDay = Math.floor(
        readNumber(stored, S_STREAK_LAST_DAY, -999999)
    );
    var today = getTodayEpochDay();

    /*
     * The bonus remains valid today and the following day.
     * It resets only after a full calendar day was missed.
     */
    if (lastDay >= 0 && today - lastDay > 1) {
        return 0;
    }

    return Math.max(0, current);
}

function getTrainingStreakMultiplier(player) {
    if (!ENABLE_TRAINING_STREAK) return 1.0;

    var streak = getCurrentTrainingStreak(player);
    if (streak <= 0) return 1.0;

    var bonusDays = Math.min(
        streak,
        MAX_STREAK_DAYS_FOR_BONUS
    );

    return clamp(
        1.0 + bonusDays * STREAK_BONUS_PER_DAY,
        1.0,
        MAX_STREAK_MULTIPLIER
    );
}

function qualifyDailyTrainingStreak(player) {
    if (!ENABLE_TRAINING_STREAK) return;

    if (getSessionDurationMs(player) < STREAK_MIN_SESSION_MS) {
        return;
    }

    var stored = getStreakStoreddata(player);
    if (stored == null) return;

    var today = getTodayEpochDay();
    var lastDay = Math.floor(
        readNumber(stored, S_STREAK_LAST_DAY, -999999)
    );

    /*
     * Already secured for this calendar day.
     */
    if (lastDay == today) return;

    var previous = Math.floor(
        readNumber(stored, S_STREAK_CURRENT, 0)
    );
    var nextStreak;
    var reset = false;

    if (lastDay == today - 1) {
        nextStreak = previous + 1;
    } else {
        nextStreak = 1;
        reset = previous > 0;
    }

    var best = Math.floor(
        readNumber(stored, S_STREAK_BEST, 0)
    );

    putNumber(stored, S_STREAK_CURRENT, nextStreak);
    putNumber(stored, S_STREAK_LAST_DAY, today);

    if (nextStreak > best) {
        best = nextStreak;
        putNumber(stored, S_STREAK_BEST, nextStreak);
    }

    mirrorTrainingStreakStats(player, nextStreak, best);

    if (!SHOW_STREAK_MESSAGES) return;

    if (reset) {
        sendMessage(
            player,
            COLOR_CODE + "6[Sparring] " +
            COLOR_CODE + "eYour previous training streak ended. " +
            COLOR_CODE + "fA new streak has begun!"
        );
    }

    sendMessage(
        player,
        COLOR_CODE + "6[Sparring] " +
        COLOR_CODE + "aDaily training completed! " +
        COLOR_CODE + "eStreak: " +
        nextStreak +
        " day" +
        (nextStreak == 1 ? "" : "s") +
        COLOR_CODE + "7 (" +
        formatMultiplier(getTrainingStreakMultiplier(player)) +
        ")"
    );
}

function calculateReward(player, partner) {
    var valuesA = getLiveTrainingValues(player);
    var valuesB = getLiveTrainingValues(partner);

    if (valuesA == null || valuesB == null) return null;

    /*
     * Use the weaker fighter's BP for the shared training reward.
     *
     * Some races, especially Androids, can report extremely high effective
     * Battle Power. Averaging both fighters allowed that value to multiply
     * the reward for the entire pair. Using the lower BP prevents one fighter
     * from inflating both payouts while high-BP vs high-BP sessions still
     * receive their intended end-game scaling.
     */
    var trainingBP = Math.min(valuesA.bp, valuesB.bp);
    var averageRelease = (valuesA.release + valuesB.release) / 2.0;
    var averageGravity = (valuesA.gravity + valuesB.gravity) / 2.0;
    var averageWeight = (valuesA.weight + valuesB.weight) / 2.0;

    var bpMult = getBattlePowerMultiplier(trainingBP);
    var rivalMult = getRivalMultiplier(valuesA.bp, valuesB.bp);
    var releaseMult = getReleaseMultiplier(averageRelease);
    var gravityMult = getGravityMultiplier(averageGravity);
    var weightMult = getWeightMultiplier(averageWeight);
    var prestigeMult = getPrestigeMultiplier(valuesA.prestige);
    var durationMult = getDurationMultiplier(player);
    var comboMult = getComboMultiplier(player);
    var streakMult = getTrainingStreakMultiplier(player);

    var perfect = isPerfectTraining(valuesA, valuesB);
    var perfectMult = perfect ? PERFECT_TRAINING_MULTIPLIER : 1.0;

    var reward =
        BASE_TP_PER_INTERVAL *
        bpMult *
        rivalMult *
        releaseMult *
        gravityMult *
        weightMult *
        prestigeMult *
        durationMult *
        comboMult *
        streakMult *
        perfectMult;

    return {
        amount: Math.floor(reward),
        bp: bpMult,
        rival: rivalMult,
        release: releaseMult,
        gravity: gravityMult,
        weight: weightMult,
        prestige: prestigeMult,
        duration: durationMult,
        combo: comboMult,
        comboTier: getComboTier(player),
        streak: streakMult,
        streakDays: getCurrentTrainingStreak(player),
        sessionDurationMs: getSessionDurationMs(player),
        perfect: perfect,
        perfectMultiplier: perfectMult
    };
}

function getLeaderboardStore(player) {
    try {
        return player.world.getStoreddata();
    } catch (e) {
        try {
            return player.getWorld().getStoreddata();
        } catch (e2) {
            return null;
        }
    }
}

function leaderboardSafeName(name) {
    return String(name)
        .replace(/[^A-Za-z0-9_\-]/g, "_")
        .toLowerCase();
}

function readLeaderboardNames(store) {
    if (store == null) return [];

    var raw = readString(store, LB_NAMES_KEY, "");
    if (raw == "") return [];

    var split = raw.split(",");
    var result = [];

    for (var i = 0; i < split.length; i++) {
        var name = String(split[i]).trim();
        if (name != "") result.push(name);
    }

    return result;
}

function writeLeaderboardNames(store, names) {
    if (store == null) return;
    putString(store, LB_NAMES_KEY, names.join(","));
}

function ensureLeaderboardName(store, playerName) {
    var names = readLeaderboardNames(store);
    var lower = String(playerName).toLowerCase();

    for (var i = 0; i < names.length; i++) {
        if (String(names[i]).toLowerCase() == lower) {
            return;
        }
    }

    names.push(playerName);
    writeLeaderboardNames(store, names);
}

function ensureSparringProfile(player) {
    if (!ENABLE_SPARRING_LEADERBOARD || player == null) return null;

    var store = getLeaderboardStore(player);
    if (store == null) return null;

    var name = getPlayerName(player);
    ensureLeaderboardName(store, name);

    return {
        store: store,
        name: name,
        safe: leaderboardSafeName(name)
    };
}

function recordSparringSessionStarted(player) {
    var profile = ensureSparringProfile(player);
    if (profile == null) return;

    var key = LB_SESSIONS_PREFIX + profile.safe;
    putNumber(
        profile.store,
        key,
        readNumber(profile.store, key, 0) + 1
    );
}

function mirrorTrainingStreakStats(player, current, best) {
    var profile = ensureSparringProfile(player);
    if (profile == null) return;

    putNumber(
        profile.store,
        LB_STREAK_PREFIX + profile.safe,
        Math.max(0, Number(current))
    );
    putNumber(
        profile.store,
        LB_BEST_STREAK_PREFIX + profile.safe,
        Math.max(0, Number(best))
    );
}

function updateSparringLeaderboard(
    player,
    tpAmount,
    sessionDurationMs,
    perfect,
    comboTier
) {
    if (!ENABLE_SPARRING_LEADERBOARD) return;

    var profile = ensureSparringProfile(player);
    if (profile == null) return;

    var store = profile.store;
    var safe = profile.safe;

    var tpKey = LB_TP_PREFIX + safe;
    var longestKey = LB_LONGEST_PREFIX + safe;
    var payoutKey = LB_BEST_PAYOUT_PREFIX + safe;
    var timeKey = LB_TOTAL_TIME_PREFIX + safe;
    var perfectKey = LB_PERFECT_PREFIX + safe;
    var comboKey = LB_HIGHEST_COMBO_PREFIX + safe;

    putNumber(
        store,
        tpKey,
        readNumber(store, tpKey, 0) + Number(tpAmount)
    );

    if (Number(sessionDurationMs) > readNumber(store, longestKey, 0)) {
        putNumber(store, longestKey, Number(sessionDurationMs));
    }

    if (Number(tpAmount) > readNumber(store, payoutKey, 0)) {
        putNumber(store, payoutKey, Number(tpAmount));
    }

    /*
     * Count only successfully rewarded active time.
     */
    putNumber(
        store,
        timeKey,
        readNumber(store, timeKey, 0) + AWARD_INTERVAL_MS
    );

    if (perfect) {
        putNumber(
            store,
            perfectKey,
            readNumber(store, perfectKey, 0) + 1
        );
    }

    if (Number(comboTier) > readNumber(store, comboKey, 0)) {
        putNumber(store, comboKey, Number(comboTier));
    }
}

function formatWholeNumber(value) {
    var number = Math.floor(Number(value));
    var textValue = String(number);
    var output = "";

    while (textValue.length > 3) {
        output = "," +
            textValue.substring(textValue.length - 3) +
            output;
        textValue = textValue.substring(
            0,
            textValue.length - 3
        );
    }

    return textValue + output;
}

function formatDuration(durationMs) {
    var totalSeconds = Math.floor(
        Number(durationMs) / 1000
    );
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;

    return minutes + "m " + seconds + "s";
}

function getLeaderboardEntries(player) {
    var store = getLeaderboardStore(player);
    if (store == null) return [];

    var names = readLeaderboardNames(store);
    var entries = [];

    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var safe = leaderboardSafeName(name);

        entries.push({
            name: name,
            tp: readNumber(
                store,
                LB_TP_PREFIX + safe,
                0
            ),
            longest: readNumber(
                store,
                LB_LONGEST_PREFIX + safe,
                0
            )
        });
    }

    entries.sort(function(a, b) {
        if (b.tp != a.tp) return b.tp - a.tp;
        return b.longest - a.longest;
    });

    return entries;
}

function showSparringLeaderboard(player) {
    var entries = getLeaderboardEntries(player);

    sendMessage(
        player,
        COLOR_CODE + "6" +
        "===== Sparring TP Leaderboard ====="
    );

    if (entries.length == 0) {
        sendMessage(
            player,
            COLOR_CODE + "7No sparring TP has been recorded yet."
        );
        return;
    }

    var limit = Math.min(
        LEADERBOARD_SIZE,
        entries.length
    );

    for (var i = 0; i < limit; i++) {
        var entry = entries[i];

        sendMessage(
            player,
            COLOR_CODE + "e#" + (i + 1) +
            COLOR_CODE + "f " + entry.name +
            COLOR_CODE + "7 - " +
            COLOR_CODE + "a" +
            formatWholeNumber(entry.tp) + " TP" +
            COLOR_CODE + "8 | Longest: " +
            COLOR_CODE + "b" +
            formatDuration(entry.longest)
        );
    }
}

function formatMultiplier(value) {
    return Number(value).toFixed(2) + "x";
}

function awardSparTP(player, partner) {
    qualifyDailyTrainingStreak(player);
    announceComboTier(player);

    var data = getDMZData(player);

    if (data == null) {
        sendMessage(
            player,
            COLOR_CODE + "c[Sparring] DMZ data could not be read."
        );
        return;
    }

    var reward = calculateReward(player, partner);

    if (reward == null) {
        sendMessage(
            player,
            COLOR_CODE + "c[Sparring] TP calculation failed."
        );
        return;
    }

    /*
     * Keep the true calculated reward untouched.
     * The 750 minimum is applied only to the final payout.
     */
    var tpToAward = Math.floor(reward.amount);

    if (!awardTrainingPoints(player, data, tpToAward)) {
        sendMessage(
            player,
            COLOR_CODE + "c[Sparring] TP award failed."
        );
        return;
    }

    updateSparringLeaderboard(
        player,
        tpToAward,
        reward.sessionDurationMs,
        reward.perfect,
        reward.comboTier
    );

    if (!SHOW_TP_MESSAGES) return;

    if (reward.perfect) {
        sendMessage(
            player,
            COLOR_CODE + "6" +
            String.fromCharCode(9733) +
            " PERFECT TRAINING " +
            String.fromCharCode(9733)
        );
    }

    sendMessage(
        player,
        COLOR_CODE + "6[Sparring] " +
        COLOR_CODE + "a+" +
        tpToAward +
        " TP " +
        COLOR_CODE + "7(Duration " +
        formatMultiplier(reward.duration) +
        ", Combo " + formatMultiplier(reward.combo) +
        ", Streak " + formatMultiplier(reward.streak) + ")"
    );

    if (SHOW_MULTIPLIER_BREAKDOWN) {
        sendMessage(
            player,
            COLOR_CODE + "7BP " +
            formatMultiplier(reward.bp) +
            COLOR_CODE + "7 | Rival " +
            formatMultiplier(reward.rival) +
            COLOR_CODE + "7 | Release " +
            formatMultiplier(reward.release) +
            COLOR_CODE + "7 | Gravity " +
            formatMultiplier(reward.gravity) +
            COLOR_CODE + "7 | Weight " +
            formatMultiplier(reward.weight) +
            COLOR_CODE + "7 | Prestige " +
            formatMultiplier(reward.prestige) +
            COLOR_CODE + "7 | Duration " +
            formatMultiplier(reward.duration) +
            COLOR_CODE + "7 | Combo " +
            formatMultiplier(reward.combo) +
            COLOR_CODE + "7 | Streak " +
            formatMultiplier(reward.streak) +
            COLOR_CODE + "7 | Perfect " +
            formatMultiplier(reward.perfectMultiplier)
        );
    }
}

function clearGraceState(player, partner) {
    try {
        var temp = player.getTempdata();
        temp.remove(K_GRACE_UNTIL);
        temp.remove(K_GRACE_REASON);
        temp.remove(K_GRACE_WARNED);
    } catch (e) {}

    if (partner != null) {
        try {
            var partnerTemp = partner.getTempdata();
            partnerTemp.remove(K_GRACE_UNTIL);
            partnerTemp.remove(K_GRACE_REASON);
            partnerTemp.remove(K_GRACE_WARNED);
        } catch (e2) {}
    }
}

/*
 * Returns true while the session is inside its recovery grace period.
 * Returns false after the grace period expires and ends the session.
 */
function handleRecoverableFailure(player, partner, reason) {
    var now = nowMs();
    var temp = player.getTempdata();
    var partnerTemp = partner.getTempdata();

    var graceUntil = Math.max(
        readNumber(temp, K_GRACE_UNTIL, 0),
        readNumber(partnerTemp, K_GRACE_UNTIL, 0)
    );

    if (graceUntil <= 0) {
        graceUntil = now + SESSION_GRACE_PERIOD_MS;

        putNumber(temp, K_GRACE_UNTIL, graceUntil);
        putNumber(partnerTemp, K_GRACE_UNTIL, graceUntil);
        putString(temp, K_GRACE_REASON, reason);
        putString(partnerTemp, K_GRACE_REASON, reason);

        if (SHOW_GRACE_WARNING) {
            sendMessage(
                player,
                "§6[Sparring] §eRecover within " +
                Math.floor(SESSION_GRACE_PERIOD_MS / 1000) +
                " seconds: §f" + reason + "§e."
            );
            sendMessage(
                partner,
                "§6[Sparring] §eRecover within " +
                Math.floor(SESSION_GRACE_PERIOD_MS / 1000) +
                " seconds: §f" + reason + "§e."
            );
        }

        return true;
    }

    if (now < graceUntil) return true;

    endSession(player, partner, reason);
    return false;
}

/* ========================= SESSION PROCESSING ========================= */

function processSession(player) {
    if (!isSessionActive(player)) return;

    var partnerName = getPartnerName(player);
    if (partnerName == "") {
        clearSessionData(player);
        return;
    }

    var partner = getPlayerByName(player, partnerName);
    if (partner == null) {
        endSession(player, null, "partner left or changed worlds");
        return;
    }

    /*
     * Death, corrupt pairing and major BP/Prestige changes remain
     * immediate failures. Normal combat interruptions use grace.
     */
    if (!isAlive(player) || !isAlive(partner)) {
        endSession(player, partner, "a fighter was defeated");
        return;
    }

    if (
        getPartnerName(partner) != getPlayerName(player) ||
        !isSessionActive(partner)
    ) {
        endSession(player, partner, "session data no longer matched");
        return;
    }

    var ownSnapshotError = validateSnapshot(player);
    if (ownSnapshotError != "") {
        endSession(player, partner, ownSnapshotError);
        return;
    }

    var partnerSnapshotError = validateSnapshot(partner);
    if (partnerSnapshotError != "") {
        endSession(player, partner, partnerSnapshotError);
        return;
    }

    var failureReason = "";

    if (distanceBetween(player, partner) > MAX_SPAR_DISTANCE) {
        failureReason = "fighters moved too far apart";
    } else if (
        !hasRecentOutgoingHit(player, partnerName) ||
        !hasRecentOutgoingHit(partner, getPlayerName(player))
    ) {
        failureReason = "both fighters must resume exchanging melee hits";
    } else if (
        !hasRecentMovement(player) ||
        !hasRecentMovement(partner)
    ) {
        failureReason = "both fighters must resume moving";
    }

    if (failureReason != "") {
        handleRecoverableFailure(
            player,
            partner,
            failureReason
        );
        return;
    }

    /*
     * Conditions recovered before the timer expired.
     */
    clearGraceState(player, partner);

    var temp = player.getTempdata();
    var now = nowMs();
    var nextAward = readNumber(temp, K_NEXT_AWARD, 0);

    if (now < nextAward) return;

    /*
     * Each player's tick awards only that player's TP.
     * This prevents double-awarding either fighter.
     */
    putNumber(temp, K_NEXT_AWARD, now + AWARD_INTERVAL_MS);
    awardSparTP(player, partner);
}

/* ========================= CUSTOMNPCS EVENTS ========================= */

function tick(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var temp = player.getTempdata();
        var now = nowMs();

        /*
         * Run movement/session work 5 times per second rather than
         * every game tick.
         */
        var nextTick = readNumber(temp, K_TICK_NEXT, 0);
        if (now < nextTick) return;

        putNumber(temp, K_TICK_NEXT, now + 200);

        updateMovement(player);
        processSession(player);
    } catch (e) {
        debug(player, "tick error: " + e);
    }
}

function damagedEntity(event) {
    var attacker = event.player;
    if (attacker == null) return;

    try {
        var target = event.target;
        if (target == null) return;

        var targetMC = target.getMCEntity();
        if (
            targetMC == null ||
            !MCPlayerClass.class.isInstance(targetMC)
        ) {
            return;
        }

        /*
         * Ki projectiles never count as sparring activity.
         */
        if (isKiAttack(event)) return;

        recordMeleeHit(attacker, target);
    } catch (e) {
        debug(attacker, "damagedEntity error: " + e);
    }
}

function logout(event) {
    var player = event.player;
    if (player == null) return;

    try {
        if (isSessionActive(player)) {
            var partner = getPlayerByName(
                player,
                getPartnerName(player)
            );
            endSession(player, partner, "a fighter logged out");
        } else {
            clearSessionData(player);
        }
    } catch (e) {}
}

function died(event) {
    var player = event.player;
    if (player == null) return;

    try {
        if (isSessionActive(player)) {
            var partner = getPlayerByName(
                player,
                getPartnerName(player)
            );
            endSession(player, partner, "a fighter was defeated");
        } else {
            clearSessionData(player);
        }
    } catch (e) {}
}


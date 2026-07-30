/*
============================================================
 DBZ Legacy Reborn - Sparring TP System
 Version: 3.2.4

 Combat-Based Training (Sparring v3)

 Philosophy:
  TP comes from real combat actions, not a standing timer.
  Melee, ki, blocks, clashes, and active fighting drive
  progression. Fair rivals and skilled combos pay more.
  Battle Power is the primary scaler (v2 curve): low BP earns
  less, high BP earns more so progression stays demanding.

 Changelog:
  - Restored v2-style BP curve as the main TP scaler. Hits use a
    fixed action base × damage quality × BP mult (not raw damage),
    so low BP is not overpaid and high BP is not flatlined.
  - Prefer getBattlePowerExact; raise/scale post-BP action caps.
  - Ki detection via MainDamageTypes.isKiblastDamage.
  - Beam clashes via BeamClashManager.isClashing(UUID).
  - Style labels use style IDs; damage-weighted specialists.
  - /spar command cards match Rival System layout.
  - v3.1.0: movement AFK gate no longer refreshed by hits/blocks;
    same-dimension required; Fabled prestige via plugin classloader;
    overworld leaderboard store; sessions counted on end; wave ki
    typed as beam before explosive.
  - v3.1.1: spar TP / session damage use HP actually lost after DMZ
    defense (same approach as Rival challenges). CNPC event.damage is
    LivingHurt pre-mitigation and is no longer used for payouts.
  - v3.1.2: fully disable sparring during active Rival challenges
    (no session start, TP, or chat spam while fighting).
  - v3.1.3: /spar help no longer advertises .spar / !spar / ./spar
    (those chat prefixes are unreliable and confuse players).
  - v3.1.4: ki hits score again — queue HP received from damagedEntity
    (owner-attributed kiblast LivingHurt) as well as victim damaged;
    never demote a pending ki hit to melee; credit a small floor when
    a landed ki hit is fully mitigated (HP drop ~0).
  - v3.2.0: Mentor Bond (/spar mentor|apprentice); global spar TP +50%;
    Friendly Fist knockdown during a spar fully heals the partner.
  - v3.2.1: charging / preparing a ki attack holds the spar activity
    timer (hit + movement gates), so sessions no longer end mid-charge.
  - v3.2.2: audit fixes — mentor reconcile; Friendly Fist heal flag only
    after success; no partner fallback for non-PvP damage; third-party
    hits no longer poison spar timers; block TP only from spar partner;
    Command Handler ignores non-spar trigger ids.
  - v3.2.3: /spar mentor works via Command Handler (CMI path); /spar help
    and /spar stats show current Mentor Bond status.
  - v3.2.4: Friendly Fist spar heal rewritten — detect KD or ~1 HP, heal
    from either fighter's tick, mark pending on FF hits, and do not require
    Java boolean === true (Rhino-safe).

 PLACE AS:
  CustomNPCs Global Player Script

 COMMANDS:
  Native (no CMI required):
    /spar ...   (Bukkit preprocess hook)
  Optional CMI aliases (Aliases-Sparring.yml) -> trigger 70
  Optional: Sparring Command Handler.js in a player script-slot

 REQUIRED EVENTS:
  - init
  - tick
  - damagedEntity
  - damaged
  - logout
  - died
  - chat
  - trigger   (70, 72-79)

 Detection notes:
  FULL: melee, ki via MainDamageTypes.isKiblastDamage + projectile,
        blocking, release/gravity/weight/BP,
        beam clash via BeamClashManager.isClashing
  BEST-EFFORT: ki subtype (laser vs blast), knockback recovery proxy,
               clash fallback if BeamClashManager is unavailable
  STUB/LIMITED: vanish, perfect block (no DMZ API yet)
============================================================
*/

/* ========================= JAVA TYPES ========================= */

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var GravityLogic = Java.type("com.dragonminez.server.util.GravityLogic");
var MCPlayerClass = Java.type("net.minecraft.world.entity.player.Player");
var Bukkit = Java.type("org.bukkit.Bukkit");
var System = Java.type("java.lang.System");
var LocalDate = Java.type("java.time.LocalDate");

var AbstractKiProjectile = null;
var KiLaserEntity = null;
var KiBlastEntity = null;
var BeamClashManager = null;
var MainDamageTypes = null;
var JavaUUID = null;
try { AbstractKiProjectile = Java.type("com.dragonminez.common.init.entities.ki.AbstractKiProjectile"); } catch (eA) {}
try { KiLaserEntity = Java.type("com.dragonminez.common.init.entities.ki.KiLaserEntity"); } catch (eL) {}
try { KiBlastEntity = Java.type("com.dragonminez.common.init.entities.ki.KiBlastEntity"); } catch (eB) {}
try { BeamClashManager = Java.type("com.dragonminez.common.combat.clash.BeamClashManager"); } catch (eC) {}
try { MainDamageTypes = Java.type("com.dragonminez.common.init.MainDamageTypes"); } catch (eD) {}
try { JavaUUID = Java.type("java.util.UUID"); } catch (eU) {}

/* ========================= CONFIGURATION ========================= */

var DEBUG = false;
var COLOR_CODE = "\u00A7";

/*
 * ---- Combat TP rates (BP-first, like Sparring v2) ----
 *
 * v2 paid: BASE_TP_PER_INTERVAL (1500) × BP curve every 5s.
 * v3 pays on combat actions, but BP must still dominate.
 * Raw damage already rises with BP, so using damage as the base
 * flattens rewards (too much early, too little late).
 *
 * Formula per scored hit:
 *   base = BASE_TP_PER_HIT × damageQuality × ki/melee efficiency
 *   final = base × BP(curve) × rival × release × gravity × ...
 */
var BASE_TP_PER_HIT = 280;             // fixed action value before BP curve
var DAMAGE_QUALITY_REF = 800;          // damage that yields ~1.0x quality
var MIN_DAMAGE_QUALITY = 0.35;         // weak taps still count a little
var MAX_DAMAGE_QUALITY = 1.80;         // big hits help, but don't replace BP
var MAX_BASE_TP_PER_HIT = 700;         // softcap BEFORE BP (keep modest)
var MAX_TP_PER_ACTION = 250000;        // safety ceiling after BP (was 35k — crushed high BP)
var MAX_TP_PER_ACTION_BP_SCALE = 4.0;  // also allow up to BASE*BP*this
/* Global sparring TP buff applied to every combat award. */
var GLOBAL_TP_GAIN_MULT = 1.50;
var BLOCK_TP_BASE = 40;                // defensive TP before BP curve
var PERFECT_BLOCK_TP_BONUS = 22;       // stub bonus (reserved; needs DMZ API)
var BLOCK_BREAKS_COMBO = true;         // blocking resets attacker's combo / Momentum
var SHOW_COMBO_BREAK_MESSAGES = true;
var COMBO_BREAK_MSG_COOLDOWN_MS = 1500;
var K_COMBO_BREAK_MSG = "spar.combo.breakMsg";
var KNOCKBACK_RECOVERY_TP = 45;        // small bonus when hitting after heavy motion
var VANISH_CHAIN_TP = 55;              // stub / reserved
var BEAM_CLASH_TP_PER_TICK = 35;       // clash drip before BP curve
/*
 * Clash sustain:
 * Damage events often pause once beams lock. Do not require a fresh
 * hit every few seconds — hold the clash while both stay engaged.
 */
var BEAM_CLASH_START_WINDOW_MS = 8000; // mutual recent beam/ki to enter clash
var BEAM_CLASH_HOLD_MS = 4000;         // keep clash alive without new hits
var BEAM_CLASH_TICK_MS = 500;
var RELEASE_CONTROL_TP_PER_SEC = 4;    // passive while fighting at high release
var HIGH_RELEASE_THRESHOLD = 180.0;

/*
 * Mentor Bond:
 *  one mentor + one apprentice per player (mutual accept)
 *  apprentice bonus only while sparring with their mentor
 *  mentor share from apprentice spar TP (online mentor only)
 */
var MENTOR_SHARE_PCT = 0.15;           // mid of 10-20%
var MENTOR_SPAR_BONUS_PCT = 0.18;      // mid of 10-25%, mentor-pair only
var MENTOR_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
var MENTOR_INVITE_MS = 120000;
var K_MENTOR_SHARE_MSG = "spar.mentor.shareMsg";
var MENTOR_SHARE_MSG_COOLDOWN_MS = 4000;
var K_FF_KD_HEALED = "spar.ff.kdHealed";
var K_FF_HEAL_MSG = "spar.ff.healMsg";

/* Ki type efficiency (unknown types use OTHER) */
var KI_EFF = {
    basic: 1.00,
    charge: 1.10,
    scatter: 1.20,
    beam: 1.30,
    explosive: 0.75,
    barrage: 0.90,
    other: 0.95
};
var MELEE_EFF = 1.00;

/* Session / activity */
var MAX_SPAR_DISTANCE = 30.0;
var HIT_ACTIVITY_WINDOW_MS = 10000;    // was 6s — too short for charged ki
var SESSION_START_WINDOW_MS = 15000;
var PAIR_RESTART_COOLDOWN_MS = 3000;
var SESSION_GRACE_PERIOD_MS = 4000;
var DISTANCE_GRACE_PERIOD_MS = 4000;
var SHOW_GRACE_WARNING = true;
var MOVEMENT_ACTIVITY_WINDOW_MS = 10000;
var MIN_MOVEMENT_DISTANCE = 0.35;
var MIN_MOTION_SPEED = 0.08;
var HEAVY_MOTION_SPEED = 0.55;         // for knockback-recovery proxy

/* Combo / Momentum */
var COMBO_TIMEOUT_MS = 2500;
var MOMENTUM_DURATION_MS = 10000;
var MOMENTUM_THRESHOLDS = [5, 10, 15, 20, 30, 40];
var MOMENTUM_MULTIPLIERS = [1.05, 1.10, 1.20, 1.35, 1.50, 2.00];

/* Long session bonus: +5%/min, max +50% */
var SESSION_BONUS_PER_MINUTE = 0.05;
var MAX_SESSION_BONUS = 0.50;

/* Perfect Training */
var ENABLE_PERFECT_TRAINING = true;
var PERFECT_TRAINING_MULTIPLIER = 2.0;
var PERFECT_BP_DIFFERENCE = 0.10;
var PERFECT_RELEASE_MIN = 180.0;
var PERFECT_RELEASE_MAX = 200.0;
var PERFECT_GRAVITY_TOLERANCE = 0.01;
var PERFECT_WEIGHT_TOLERANCE = 1.0;
var PERFECT_ACTIONBAR_MS = 2500;

/* Daily streak */
var ENABLE_TRAINING_STREAK = true;
var STREAK_MIN_SESSION_MS = 300000;
var MIN_COUNTED_SESSION_MS = 30000;   // leaderboard session increment
var STREAK_BONUS_PER_DAY = 0.02;
var MAX_STREAK_DAYS_FOR_BONUS = 14;
var MAX_STREAK_MULTIPLIER = 1.25;

/* Combat style bonuses (small) — values may match; never reverse-map from them */
var STYLE_BONUS = {
    melee: 1.08,
    ki: 1.08,
    balanced: 1.12,
    beam: 1.10,
    guardian: 1.06,
    speed: 1.05,
    none: 1.00
};
var STYLE_NAMES = {
    melee: "Melee Specialist",
    ki: "Ki Specialist",
    balanced: "Balanced Fighter",
    beam: "Beam Specialist",
    guardian: "Guardian",
    speed: "Speed Fighter",
    none: "Developing"
};
var STYLE_SAMPLE_DAMAGE = 200;         // classify after this much scored damage/actions

/* Rival quality */
var MAX_RIVAL_MULTIPLIER = 3.0;

/* Gravity / weight / release / prestige / BP */
var MAX_BP_MULTIPLIER = 600.0;
var MAX_GRAVITY = 1000.0;
var MAX_GRAVITY_MULTIPLIER = 5.0;
var MAX_EFFECTIVE_WEIGHT = 1000.0;
var MAX_WEIGHT_MULTIPLIER = 2.0;
var MIN_RELEASE_PERCENT = 100.0;
var MAX_RELEASE_PERCENT = 200.0;
var MAX_RELEASE_MULTIPLIER = 2.0;
var FABLED_PRESTIGE_CLASS_NAME = "Prestige";
var FABLED_PRESTIGE_LEVEL_OFFSET = 1;
var MAX_PRESTIGE_LEVEL = 10;
var PRESTIGE_MULTIPLIER_PER_LEVEL = 0.10;
var ANDROID_FAKE_BP_THRESHOLD = 1.0e30;

/* Messaging */
var SHOW_SESSION_MESSAGES = true;
var SHOW_TP_MESSAGES = true;
var SHOW_MOMENTUM_MESSAGES = true;
var SHOW_END_REPORT = true;
var TP_MESSAGE_COOLDOWN_MS = 2000;
var MESSAGE_COOLDOWN_MS = 4000;

/* Leaderboard */
var ENABLE_SPARRING_LEADERBOARD = true;
var LEADERBOARD_TRIGGER_ID = 72;
var LEADERBOARD_SIZE = 10;

/* ========================= DATA KEYS ========================= */

var K_PARTNER = "spar.partner";
var K_SESSION_ACTIVE = "spar.active";
var K_SESSION_START = "spar.start";
var K_COOLDOWN = "spar.restartCooldown";
var K_GRACE_UNTIL = "spar.grace.until";
var K_GRACE_REASON = "spar.grace.reason";
var K_GRACE_WARNED = "spar.grace.warned";
var K_LAST_OUT_PARTNER = "spar.lastOut.partner";
var K_LAST_OUT_TIME = "spar.lastOut.time";
var K_LAST_IN_PARTNER = "spar.lastIn.partner";
var K_LAST_IN_TIME = "spar.lastIn.time";
var K_LAST_KI_OUT = "spar.lastKiOut.time";
var K_LAST_LASER_OUT = "spar.lastLaserOut.time";
var K_CLASH_UNTIL = "spar.clash.until";
/*
 * CNPC damaged/damagedEntity fire on LivingHurt with pre-mitigation
 * DMZ attack damage. Score sparring from real HP/absorption lost.
 */
var K_HP_SAMPLE = "spar.hp.pool";
var K_PENDING_SAMPLE = "spar.hp.pendingSample";
var K_PENDING_ATK = "spar.hp.pendingAtk";
var K_PENDING_KI = "spar.hp.pendingKi";
var K_PENDING_KI_KIND = "spar.hp.pendingKiKind";
var K_PENDING_UNTIL = "spar.hp.pendingUntil";
var PENDING_HP_RESOLVE_MS = 75;
/*
 * Fully mitigated kiblasts often cancel LivingDamage (0 HP lost) while
 * LivingHurt still fired. Credit a token received amount so the action
 * still pays at MIN_DAMAGE_QUALITY instead of disappearing.
 */
var KI_FULL_MIT_FLOOR = 12;
var K_MOVE_X = "spar.move.x";
var K_MOVE_Y = "spar.move.y";
var K_MOVE_Z = "spar.move.z";
var K_MOVE_VALID_UNTIL = "spar.move.validUntil";
var K_HEAVY_MOTION_UNTIL = "spar.move.heavyUntil";
var K_COMBO = "spar.combo.count";
var K_COMBO_UNTIL = "spar.combo.until";
var K_MOMENTUM = "spar.momentum.tier";
var K_MOMENTUM_UNTIL = "spar.momentum.until";
var K_SESSION_TP = "spar.session.tp";
var K_SESSION_MELEE = "spar.session.melee";
var K_SESSION_KI = "spar.session.ki";
var K_SESSION_DMG = "spar.session.dmg";
var K_SESSION_TAKEN = "spar.session.taken";
var K_SESSION_BLOCKS = "spar.session.blocks";
var K_SESSION_PBLOCKS = "spar.session.pblocks";
var K_SESSION_CLASH_MS = "spar.session.clashMs";
var K_SESSION_VANISH = "spar.session.vanish";
var K_SESSION_KB = "spar.session.kb";
var K_SESSION_MAX_COMBO = "spar.session.maxCombo";
var K_SESSION_MAX_MOM = "spar.session.maxMom";
var K_SESSION_PERFECT = "spar.session.perfect";
var K_TP_MSG_NEXT = "spar.tpmsg.next";
var K_TP_PENDING = "spar.tpmsg.pending";
var K_TP_PENDING_MELEE = "spar.tpmsg.pendingMelee";
var K_TP_PENDING_KI = "spar.tpmsg.pendingKi";
var K_TP_PENDING_CLASH = "spar.tpmsg.pendingClash";
var K_LAST_HIT_KIND = "spar.lastHit.kind";
var K_MSG_NEXT = "spar.message.next";
var K_TICK_NEXT = "spar.tick.next";
var K_PERFECT_NEXT = "spar.perfect.nextMsg";
var K_STYLE_MELEE = "spar.style.melee";
var K_STYLE_KI = "spar.style.ki";
var K_STYLE_BEAM = "spar.style.beam";
var K_STYLE_BLOCK = "spar.style.block";
var K_STYLE_MOVE = "spar.style.move";
var K_RELEASE_CTRL_NEXT = "spar.releaseCtrl.next";
var K_CLASH_NEXT = "spar.clash.next";

var S_STREAK_CURRENT = "spar.streak.current";
var S_STREAK_BEST = "spar.streak.best";
var S_STREAK_LAST_DAY = "spar.streak.lastDay";

/* Mentor Bond (player storeddata) */
var S_MENTOR_NAME = "spar.bond.mentorName";
var S_APPRENTICE_NAME = "spar.bond.apprenticeName";
var S_MENTOR_CD_UNTIL = "spar.bond.mentorChangeReadyAt";
var S_APPRENTICE_CD_UNTIL = "spar.bond.apprenticeChangeReadyAt";
var S_BOND_INVITE_FROM = "spar.bond.inviteFrom";
var S_BOND_INVITE_KIND = "spar.bond.inviteKind";
var S_BOND_INVITE_UNTIL = "spar.bond.inviteUntil";

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
var LB_MELEE_PREFIX = "spar.leaderboard.melee.";
var LB_KI_PREFIX = "spar.leaderboard.ki.";
var LB_CLASH_PREFIX = "spar.leaderboard.clash.";
var LB_BLOCKS_PREFIX = "spar.leaderboard.blocks.";
var LB_MOMENTUM_PREFIX = "spar.leaderboard.momentum.";

/* ========================= BASIC HELPERS ========================= */

function nowMs() {
    try { return Number(System.currentTimeMillis()); } catch (e) { return Number(new Date().getTime()); }
}

function readNumber(data, key, fallback) {
    try {
        if (data != null && data.has(key)) {
            var value = Number(String(data.get(key)));
            if (!isNaN(value) && isFinite(value)) return value;
        }
    } catch (e) {}
    return fallback;
}

function readString(data, key, fallback) {
    try {
        if (data != null && data.has(key)) return String(data.get(key));
    } catch (e) {}
    return fallback;
}

function putNumber(data, key, value) {
    try { data.put(key, String(value)); } catch (e) {}
}

function putString(data, key, value) {
    try { data.put(key, String(value)); } catch (e) {}
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
    a = Math.max(0, Number(a));
    b = Math.max(0, Number(b));
    var highest = Math.max(a, b);
    if (highest <= 0) return 0;
    return Math.abs(a - b) / highest;
}

function getPlayerName(player) {
    try { return String(player.getName()); } catch (e) { return ""; }
}

function getPlayerUUID(player) {
    try { return String(player.getUUID()); } catch (e) { return ""; }
}

function isSamePlayer(a, b) {
    if (a == null || b == null) return false;
    var ua = getPlayerUUID(a);
    var ub = getPlayerUUID(b);
    if (ua != "" && ub != "" && ua == ub) return true;
    return getPlayerName(a).toLowerCase() == getPlayerName(b).toLowerCase();
}

function getPlayerByName(player, name) {
    if (name == null || String(name) == "") return null;
    var wanted = String(name).toLowerCase();
    try {
        var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                var players = worlds[i].getAllPlayers();
                for (var p = 0; p < players.length; p++) {
                    try {
                        if (String(players[p].getName()).toLowerCase() == wanted) return players[p];
                    } catch (e1) {}
                }
            } catch (e2) {}
        }
    } catch (e) {}
    return null;
}

function isAlive(player) {
    try { return player.isAlive() === true || Number(player.getHealth()) > 0; } catch (e) {
        try { return Number(player.getHealth()) > 0; } catch (e2) { return false; }
    }
}

function distanceBetween(a, b) {
    try {
        var dx = Number(a.getX()) - Number(b.getX());
        var dy = Number(a.getY()) - Number(b.getY());
        var dz = Number(a.getZ()) - Number(b.getZ());
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (e) { return 999999; }
}

function getWorldKey(player) {
    if (player == null) return "";
    try {
        var world = null;
        try { world = player.getWorld(); } catch (e1) {
            try { world = player.world; } catch (e2) {}
        }
        if (world == null) return "";
        try {
            if (typeof world.getDimensionName == "function") {
                var dim = String(world.getDimensionName());
                if (dim != "") return dim.toLowerCase();
            }
        } catch (e3) {}
        try {
            if (typeof world.getName == "function") {
                var name = String(world.getName());
                if (name != "") return name.toLowerCase();
            }
        } catch (e4) {}
    } catch (e) {}
    return "";
}

function sameWorld(a, b) {
    var ka = getWorldKey(a);
    var kb = getWorldKey(b);
    if (ka == "" || kb == "") return false;
    return ka == kb;
}

function sendMessage(player, text) {
    try { if (player != null) player.message(text); } catch (e) {}
}

function sparColor(code) { return COLOR_CODE + String(code); }

function sparText() {
    var out = "";
    for (var i = 0; i < arguments.length; i++) out += String(arguments[i]);
    return out;
}

function debug(player, text) {
    if (!DEBUG) return;
    sendMessage(player, sparText(sparColor("8"), "[SparDebug] ", text));
}

function formatWholeNumber(value) {
    value = Math.floor(Number(value));
    if (isNaN(value)) return "0";
    var s = String(value);
    var out = "";
    var count = 0;
    for (var i = s.length - 1; i >= 0; i--) {
        out = s.charAt(i) + out;
        count++;
        if (count == 3 && i > 0) { out = "," + out; count = 0; }
    }
    return out;
}

function formatDuration(durationMs) {
    var total = Math.max(0, Math.floor(Number(durationMs) / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    if (m <= 0) return s + "s";
    return m + "m " + s + "s";
}

function throttleMessage(player, key, cooldown, text) {
    var temp = player.getTempdata();
    var now = nowMs();
    if (now < readNumber(temp, key, 0)) return false;
    putNumber(temp, key, now + cooldown);
    sendMessage(player, text);
    return true;
}

/* ========================= DMZ DATA ========================= */

function getDMZData(player) {
    try {
        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return null;
        return StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
    } catch (e) { return null; }
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

function isAndroidUpgraded(playerData) {
    if (playerData == null) return false;
    try {
        var status = playerData.getStatus();
        return status != null && status.isAndroidUpgraded() === true;
    } catch (err) { return false; }
}

function safeStatBonus(bonusStats, stat, base, multiplicable) {
    if (bonusStats == null) return 0;
    try {
        var value = Number(bonusStats.calculateBonus(stat, Math.round(base), multiplicable === true));
        if (isNaN(value)) return 0;
        return value;
    } catch (err) { return 0; }
}

function safeScaling(playerData, stat) {
    try {
        var value = Number(playerData.getStatScaling(stat));
        if (isNaN(value) || value <= 0) return 1.0;
        return value;
    } catch (err) { return 1.0; }
}

function safeTotalMultiplier(playerData, stat) {
    try {
        var value = Number(playerData.getTotalMultiplier(stat));
        if (isNaN(value) || value <= 0) return 1.0;
        return value;
    } catch (err) { return 1.0; }
}

function computeBattlePowerFromStats(playerData) {
    if (playerData == null) return 0;
    try {
        var stats = playerData.getStats();
        if (stats == null) return 0;
        var bonusStats = null;
        try { bonusStats = playerData.getBonusStats(); } catch (bonusErr) {}

        var str = Number(stats.getStrength()); if (isNaN(str)) str = 0;
        var skp = Number(stats.getStrikePower()); if (isNaN(skp)) skp = 0;
        var res = Number(stats.getResistance()); if (isNaN(res)) res = 0;
        var vit = Number(stats.getVitality()); if (isNaN(vit)) vit = 0;
        var pwr = Number(stats.getKiPower()); if (isNaN(pwr)) pwr = 0;
        var ene = Number(stats.getEnergy()); if (isNaN(ene)) ene = 0;

        var multBonusStr = safeStatBonus(bonusStats, "STR", str, true);
        var flatBonusStr = safeStatBonus(bonusStats, "STR", str, false);
        var multBonusSkp = safeStatBonus(bonusStats, "SKP", skp, true);
        var flatBonusSkp = safeStatBonus(bonusStats, "SKP", skp, false);
        var multBonusDef = safeStatBonus(bonusStats, "DEF", res, true);
        var flatBonusDef = safeStatBonus(bonusStats, "DEF", res, false);
        var multBonusVit = safeStatBonus(bonusStats, "VIT", vit, true);
        var flatBonusVit = safeStatBonus(bonusStats, "VIT", vit, false);
        var multBonusPwr = safeStatBonus(bonusStats, "PWR", pwr, true);
        var flatBonusPwr = safeStatBonus(bonusStats, "PWR", pwr, false);
        var multBonusEne = safeStatBonus(bonusStats, "ENE", ene, true);
        var flatBonusEne = safeStatBonus(bonusStats, "ENE", ene, false);

        var rawPower =
            (str + multBonusStr) * safeScaling(playerData, "STR") * safeTotalMultiplier(playerData, "STR") +
            flatBonusStr * safeScaling(playerData, "STR") +
            (skp + multBonusSkp) * safeScaling(playerData, "SKP") * safeTotalMultiplier(playerData, "SKP") +
            flatBonusSkp * safeScaling(playerData, "SKP") +
            (res + multBonusDef) * safeScaling(playerData, "DEF") * safeTotalMultiplier(playerData, "RES") +
            flatBonusDef * safeScaling(playerData, "DEF") +
            (pwr + multBonusPwr) * safeScaling(playerData, "PWR") * safeTotalMultiplier(playerData, "PWR") +
            flatBonusPwr * safeScaling(playerData, "PWR");

        rawPower += 0.5 * (
            (vit + multBonusVit) * safeScaling(playerData, "VIT") * safeTotalMultiplier(playerData, "VIT") +
            flatBonusVit * safeScaling(playerData, "VIT") +
            (ene + multBonusEne) * safeScaling(playerData, "ENE") * safeTotalMultiplier(playerData, "ENE") +
            flatBonusEne * safeScaling(playerData, "ENE")
        );

        if (isNaN(rawPower) || rawPower <= 0.0) return 0;

        var releaseMultiplier = 1.0;
        try {
            var resources = playerData.getResources();
            if (resources != null) releaseMultiplier = Number(resources.getPowerRelease()) / 100.0;
        } catch (releaseErr) { releaseMultiplier = 1.0; }
        if (isNaN(releaseMultiplier) || releaseMultiplier < 0) releaseMultiplier = 1.0;

        var bp = 1200.0 * Math.pow(rawPower / 100.0, 1.2) * releaseMultiplier;
        if (isNaN(bp) || bp <= 0.0) return 0;
        return bp;
    } catch (err) { return 0; }
}

function getCurrentBattlePower(playerData) {
    if (playerData == null) return 0;
    if (isAndroidUpgraded(playerData)) return computeBattlePowerFromStats(playerData);

    /*
     * Prefer Exact (double). getBattlePower() is float and can lose
     * precision / saturate at high end, which flattens the TP curve.
     */
    var direct = invokeNumberNoArgs(playerData, [
        "getBattlePowerExact",
        "getCurrentBattlePower",
        "getBattlePower",
        "getCurrentPower",
        "getPowerLevel",
        "getPower"
    ], -1);
    if (direct >= ANDROID_FAKE_BP_THRESHOLD) return computeBattlePowerFromStats(playerData);
    if (direct > 0) return direct;

    try {
        var stats = playerData.getStats();
        var fromStats = invokeNumberNoArgs(stats, [
            "getBattlePowerExact",
            "getCurrentBattlePower",
            "getBattlePower",
            "getCurrentPower",
            "getPowerLevel",
            "getPower"
        ], -1);
        if (fromStats >= ANDROID_FAKE_BP_THRESHOLD) return computeBattlePowerFromStats(playerData);
        if (fromStats > 0) return fromStats;
    } catch (e) {}

    /* Last resort: rebuild from stats (same formula DMZ uses). */
    var computed = computeBattlePowerFromStats(playerData);
    return computed > 0 ? computed : 0;
}

function getReleasePercent(playerData) {
    if (playerData == null) return 100.0;
    var release = -1;
    try {
        var resources = playerData.getResources();
        if (resources != null) release = Number(resources.getPowerRelease());
    } catch (e) {}
    if (isNaN(release) || release < 0) {
        release = invokeNumberNoArgs(playerData, ["getRelease", "getPowerRelease", "getReleaseLimit"], -1);
    }
    if (release < 0) return 100.0;
    if (release > 0 && release <= 3.0) release *= 100.0;
    return clamp(release, 0.0, MAX_RELEASE_PERCENT);
}

function getNetGravity(mcPlayer) {
    try {
        var value = Number(GravityLogic.getNetGravity(mcPlayer));
        if (!isNaN(value) && value > 0) return value;
    } catch (e) {}
    return 1.0;
}

function getEffectiveWeight(mcPlayer) {
    try {
        var value = Number(GravityLogic.getEffectiveWeight(mcPlayer));
        if (!isNaN(value) && value >= 0) return value;
    } catch (e) {}
    return 0.0;
}

function getFabledPrestigeLevel(player) {
    try {
        var plugin = Bukkit.getPluginManager().getPlugin("Fabled");
        if (plugin == null || !plugin.isEnabled()) return 0;
        var bukkitPlayer = Bukkit.getPlayerExact(getPlayerName(player));
        if (bukkitPlayer == null) return 0;

        /* Load Fabled through its plugin classloader (Arclight / hybrid). */
        var loader = plugin.getClass().getClassLoader();
        var fabledClass = loader.loadClass("studio.magemonkey.fabled.Fabled");
        var methods = fabledClass.getMethods();
        var getDataMethod = null;
        for (var i = 0; i < methods.length; i++) {
            if (String(methods[i].getName()) == "getData" &&
                methods[i].getParameterTypes().length == 1) {
                getDataMethod = methods[i];
                break;
            }
        }
        if (getDataMethod == null) return 0;
        var fabledData = getDataMethod.invoke(null, bukkitPlayer);
        if (fabledData == null) return 0;

        var prestigeClass = null;
        try { prestigeClass = fabledData.getClass(FABLED_PRESTIGE_CLASS_NAME); } catch (e1) {}
        if (prestigeClass == null) {
            try { prestigeClass = fabledData.getClass("prestige"); } catch (e2) {}
        }
        if (prestigeClass == null) {
            try {
                var playerClasses = fabledData.getClasses();
                if (playerClasses != null) {
                    var it = playerClasses.iterator();
                    while (it.hasNext()) {
                        var current = it.next();
                        if (current == null) continue;
                        var classData = null;
                        try { classData = current.getData(); } catch (e3) {}
                        var label = "";
                        try {
                            if (classData != null && typeof classData.getName == "function") {
                                label = String(classData.getName());
                            }
                        } catch (e4) {}
                        if (label == "") {
                            try { label = String(current); } catch (e5) {}
                        }
                        if (String(label).toLowerCase().indexOf("prestige") >= 0) {
                            prestigeClass = current;
                            break;
                        }
                    }
                }
            } catch (eScan) {}
        }
        if (prestigeClass == null) return 0;
        var level = Number(prestigeClass.getLevel());
        if (isNaN(level)) return 0;
        return Math.floor(clamp(level - FABLED_PRESTIGE_LEVEL_OFFSET, 0, MAX_PRESTIGE_LEVEL));
    } catch (e) { return 0; }
}

function isPlayerBlocking(player) {
    try {
        var data = getDMZData(player);
        if (data == null) return false;
        var status = data.getStatus();
        return status != null && status.isBlocking() === true;
    } catch (e) { return false; }
}

function isPlayerChargingKi(player) {
    try {
        var data = getDMZData(player);
        if (data == null) return false;
        var status = data.getStatus();
        if (status == null) return false;
        try {
            if (status.isChargingKi() === true) return true;
        } catch (e1) {}
        try {
            if (status.isActionCharging() === true) return true;
        } catch (e2) {}
        try {
            var techniques = data.getTechniques();
            if (techniques != null && techniques.isTechniqueCharging() === true) return true;
        } catch (e3) {}
    } catch (e) {}
    return false;
}

/*
 * True while either fighter is charging / winding up a ki technique.
 * Standing still mid-charge must not trip AFK or hit-activity gates.
 */
function isEitherPreparingKi(player, partner) {
    return isPlayerChargingKi(player) || isPlayerChargingKi(partner);
}

function holdSparForKiCharge(player, partner) {
    if (player == null || partner == null) return false;
    if (!isEitherPreparingKi(player, partner)) return false;
    refreshClashCombatActivity(player, partner);
    try { refreshMovementActivity(player); } catch (e1) {}
    try { refreshMovementActivity(partner); } catch (e2) {}
    return true;
}

function awardTrainingPoints(player, playerData, amount) {
    try {
        amount = Math.floor(Number(amount));
        if (isNaN(amount) || amount <= 0) return false;
        var resources = playerData.getResources();
        if (resources == null) return false;
        resources.addTrainingPoints(amount);
        var mcPlayer = player.getMCEntity();
        NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
        return true;
    } catch (e) {
        sendMessage(player, sparText(sparColor("c"), "[Sparring] Failed to award TP: ", e));
        return false;
    }
}

/* ========================= MULTIPLIERS ========================= */

/*
 * Piecewise log curve (same anchors as Sparring v2):
 *  100K=2x  1M=5x  10M=12x  100M=25x  1B=50x
 *  10B=100x 100B=150x  1T=250x  10T=400x  100T=600x
 */
function getBattlePowerMultiplier(bp) {
    var battlePower = Math.max(1, Number(bp));
    if (isNaN(battlePower) || battlePower < 1) battlePower = 1;

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
    var multiplierAnchors = [1.0, 2.0, 5.0, 12.0, 25.0, 50.0, 100.0, 150.0, 250.0, 400.0, 600.0];

    if (battlePower <= bpAnchors[0]) return multiplierAnchors[0];
    for (var i = 0; i < bpAnchors.length - 1; i++) {
        if (battlePower <= bpAnchors[i + 1]) {
            var lowerLog = Math.log(bpAnchors[i]) / Math.log(10);
            var upperLog = Math.log(bpAnchors[i + 1]) / Math.log(10);
            var currentLog = Math.log(battlePower) / Math.log(10);
            var progress = (currentLog - lowerLog) / Math.max(0.0001, upperLog - lowerLog);
            return multiplierAnchors[i] + (multiplierAnchors[i + 1] - multiplierAnchors[i]) * progress;
        }
    }
    var finalBP = bpAnchors[bpAnchors.length - 1];
    var finalMultiplier = multiplierAnchors[multiplierAnchors.length - 1];
    var extraDecades = (Math.log(battlePower) - Math.log(finalBP)) / Math.log(10);
    return Math.min(MAX_BP_MULTIPLIER, finalMultiplier + extraDecades * 200.0);
}

/* Soft damage quality — influences hit value without replacing BP. */
function getDamageQuality(damage) {
    damage = Math.max(0, Number(damage));
    if (!(damage > 0) || !(DAMAGE_QUALITY_REF > 0)) return MIN_DAMAGE_QUALITY;
    var quality = Math.sqrt(damage / DAMAGE_QUALITY_REF);
    return clamp(quality, MIN_DAMAGE_QUALITY, MAX_DAMAGE_QUALITY);
}

function getMaxTpForAction(bpMult) {
    var scaled = Math.floor(BASE_TP_PER_HIT * Math.max(1, Number(bpMult)) * MAX_TP_PER_ACTION_BP_SCALE);
    if (isNaN(scaled) || scaled < 1) scaled = MAX_TP_PER_ACTION;
    return Math.min(MAX_TP_PER_ACTION, Math.max(BASE_TP_PER_HIT, scaled));
}

function getRivalMultiplier(bpA, bpB) {
    bpA = Math.max(0, Number(bpA));
    bpB = Math.max(0, Number(bpB));
    var highest = Math.max(bpA, bpB);
    if (highest <= 0) return 1.0;
    var ratio = Math.min(bpA, bpB) / highest;
    if (ratio >= 0.90) return Math.min(3.0, MAX_RIVAL_MULTIPLIER);
    if (ratio >= 0.80) return Math.min(2.5, MAX_RIVAL_MULTIPLIER);
    if (ratio >= 0.50) return Math.min(2.0, MAX_RIVAL_MULTIPLIER);
    if (ratio >= 0.25) return Math.min(1.5, MAX_RIVAL_MULTIPLIER);
    return 1.0;
}

function getReleaseMultiplier(releasePercent) {
    var release = clamp(Number(releasePercent), MIN_RELEASE_PERCENT, MAX_RELEASE_PERCENT);
    var progress = (release - MIN_RELEASE_PERCENT) / (MAX_RELEASE_PERCENT - MIN_RELEASE_PERCENT);
    return clamp(1.0 + progress * (MAX_RELEASE_MULTIPLIER - 1.0), 1.0, MAX_RELEASE_MULTIPLIER);
}

function getGravityMultiplier(gravity) {
    var g = clamp(Number(gravity), 1.0, MAX_GRAVITY);
    var progress = (g - 1.0) / (MAX_GRAVITY - 1.0);
    return clamp(1.0 + progress * (MAX_GRAVITY_MULTIPLIER - 1.0), 1.0, MAX_GRAVITY_MULTIPLIER);
}

function getWeightMultiplier(weight) {
    var w = clamp(Number(weight), 0.0, MAX_EFFECTIVE_WEIGHT);
    var progress = w / MAX_EFFECTIVE_WEIGHT;
    return clamp(1.0 + progress * (MAX_WEIGHT_MULTIPLIER - 1.0), 1.0, MAX_WEIGHT_MULTIPLIER);
}

function getPrestigeMultiplier(prestige) {
    prestige = clamp(Math.floor(Number(prestige)), 0, MAX_PRESTIGE_LEVEL);
    return 1.0 + prestige * PRESTIGE_MULTIPLIER_PER_LEVEL;
}

function getSessionBonusMultiplier(player) {
    var start = readNumber(player.getTempdata(), K_SESSION_START, 0);
    if (start <= 0) return 1.0;
    var minutes = Math.floor(Math.max(0, nowMs() - start) / 60000);
    var bonus = Math.min(MAX_SESSION_BONUS, minutes * SESSION_BONUS_PER_MINUTE);
    return 1.0 + bonus;
}

function getLiveTrainingValues(player) {
    var data = getDMZData(player);
    if (data == null) return null;
    var mc = null;
    try { mc = player.getMCEntity(); } catch (e) {}
    return {
        bp: getCurrentBattlePower(data),
        release: getReleasePercent(data),
        gravity: getNetGravity(mc),
        weight: getEffectiveWeight(mc),
        prestige: getFabledPrestigeLevel(player),
        data: data
    };
}

function isPerfectTraining(valuesA, valuesB) {
    if (!ENABLE_PERFECT_TRAINING || valuesA == null || valuesB == null) return false;
    if (percentDifference(valuesA.bp, valuesB.bp) > PERFECT_BP_DIFFERENCE) return false;
    if (valuesA.release < PERFECT_RELEASE_MIN || valuesA.release > PERFECT_RELEASE_MAX) return false;
    if (valuesB.release < PERFECT_RELEASE_MIN || valuesB.release > PERFECT_RELEASE_MAX) return false;
    if (!nearlyEqual(valuesA.gravity, valuesB.gravity, PERFECT_GRAVITY_TOLERANCE)) return false;
    if (!nearlyEqual(valuesA.weight, valuesB.weight, PERFECT_WEIGHT_TOLERANCE)) return false;
    return true;
}

/* ========================= STREAK ========================= */

function getTodayEpochDay() {
    try { return Number(LocalDate.now().toEpochDay()); } catch (e) { return Math.floor(nowMs() / 86400000); }
}

function getCurrentTrainingStreak(player) {
    var stored = player.getStoreddata();
    var current = Math.floor(readNumber(stored, S_STREAK_CURRENT, 0));
    var last = Math.floor(readNumber(stored, S_STREAK_LAST_DAY, -999999));
    if (last >= 0 && getTodayEpochDay() - last > 1) return 0;
    return Math.max(0, current);
}

function getTrainingStreakMultiplier(player) {
    if (!ENABLE_TRAINING_STREAK) return 1.0;
    var days = Math.min(MAX_STREAK_DAYS_FOR_BONUS, getCurrentTrainingStreak(player));
    return Math.min(MAX_STREAK_MULTIPLIER, 1.0 + days * STREAK_BONUS_PER_DAY);
}

function qualifyDailyTrainingStreak(player) {
    if (!ENABLE_TRAINING_STREAK) return;
    var stored = player.getStoreddata();
    var today = getTodayEpochDay();
    var last = Math.floor(readNumber(stored, S_STREAK_LAST_DAY, -999999));
    if (last == today) return;
    var current = Math.floor(readNumber(stored, S_STREAK_CURRENT, 0));
    if (last == today - 1) current += 1;
    else current = 1;
    var best = Math.max(current, Math.floor(readNumber(stored, S_STREAK_BEST, 0)));
    putNumber(stored, S_STREAK_CURRENT, current);
    putNumber(stored, S_STREAK_BEST, best);
    putNumber(stored, S_STREAK_LAST_DAY, today);
    if (SHOW_SESSION_MESSAGES) {
        sendMessage(player, sparText(
            sparColor("6"), "[Sparring] ",
            sparColor("a"), "Daily training secured! ",
            sparColor("e"), "Streak ", current, " day", (current == 1 ? "" : "s")
        ));
    }
}

/* ========================= MENTOR BOND ========================= */

function bondStored(player) {
    try { return player.getStoreddata(); } catch (e) { return null; }
}

function getBondMentorName(player) {
    var stored = bondStored(player);
    if (stored == null) return "";
    return readString(stored, S_MENTOR_NAME, "");
}

function getBondApprenticeName(player) {
    var stored = bondStored(player);
    if (stored == null) return "";
    return readString(stored, S_APPRENTICE_NAME, "");
}

function clearBondInvite(player) {
    var stored = bondStored(player);
    if (stored == null) return;
    putString(stored, S_BOND_INVITE_FROM, "");
    putString(stored, S_BOND_INVITE_KIND, "");
    putNumber(stored, S_BOND_INVITE_UNTIL, 0);
}

function readBondInvite(player) {
    var stored = bondStored(player);
    if (stored == null) return null;
    var until = readNumber(stored, S_BOND_INVITE_UNTIL, 0);
    var from = readString(stored, S_BOND_INVITE_FROM, "");
    var kind = readString(stored, S_BOND_INVITE_KIND, "");
    if (from == "" || kind == "" || nowMs() > until) {
        if (from != "" || kind != "") clearBondInvite(player);
        return null;
    }
    return { from: from, kind: kind, until: until };
}

function setBondInvite(target, fromName, kind) {
    var stored = bondStored(target);
    if (stored == null) return false;
    putString(stored, S_BOND_INVITE_FROM, fromName);
    putString(stored, S_BOND_INVITE_KIND, kind);
    putNumber(stored, S_BOND_INVITE_UNTIL, nowMs() + MENTOR_INVITE_MS);
    return true;
}

function bondCooldownLeft(player, key) {
    var stored = bondStored(player);
    if (stored == null) return 0;
    return Math.max(0, readNumber(stored, key, 0) - nowMs());
}

function setBondCooldown(player, key) {
    var stored = bondStored(player);
    if (stored == null) return;
    putNumber(stored, key, nowMs() + MENTOR_CHANGE_COOLDOWN_MS);
}

function namesMatch(a, b) {
    return String(a || "").toLowerCase() == String(b || "").toLowerCase() && String(a || "") != "";
}

function isMentorOf(mentor, apprentice) {
    if (mentor == null || apprentice == null) return false;
    return namesMatch(getBondApprenticeName(mentor), getPlayerName(apprentice)) &&
        namesMatch(getBondMentorName(apprentice), getPlayerName(mentor));
}

function reconcileMentorBond(player) {
    if (player == null) return;
    var stored = bondStored(player);
    if (stored == null) return;
    var self = getPlayerName(player);

    var app = getBondApprenticeName(player);
    if (app != "") {
        var ap = getPlayerByName(player, app);
        if (ap != null && !namesMatch(getBondMentorName(ap), self)) {
            putString(stored, S_APPRENTICE_NAME, "");
        }
    }

    var ment = getBondMentorName(player);
    if (ment != "") {
        var m = getPlayerByName(player, ment);
        if (m != null && !namesMatch(getBondApprenticeName(m), self)) {
            putString(stored, S_MENTOR_NAME, "");
        }
    }
}

function isSparringWithOwnMentor(player, partner) {
    if (player == null || partner == null) return false;
    return isMentorOf(partner, player);
}

function clearMentorLink(apprentice, mentor, applyCooldown) {
    if (apprentice != null) {
        var aStore = bondStored(apprentice);
        if (aStore != null) {
            putString(aStore, S_MENTOR_NAME, "");
            if (applyCooldown === true) setBondCooldown(apprentice, S_MENTOR_CD_UNTIL);
        }
    }
    if (mentor != null) {
        var mStore = bondStored(mentor);
        if (mStore != null) {
            putString(mStore, S_APPRENTICE_NAME, "");
            if (applyCooldown === true) setBondCooldown(mentor, S_APPRENTICE_CD_UNTIL);
        }
    }
}

function bindMentorApprentice(mentor, apprentice) {
    var mStore = bondStored(mentor);
    var aStore = bondStored(apprentice);
    if (mStore == null || aStore == null) return false;
    putString(mStore, S_APPRENTICE_NAME, getPlayerName(apprentice));
    putString(aStore, S_MENTOR_NAME, getPlayerName(mentor));
    clearBondInvite(mentor);
    clearBondInvite(apprentice);
    return true;
}

function shareTpWithMentor(apprentice, amount) {
    amount = Math.floor(Number(amount));
    if (!(amount > 0)) return;
    var mentorName = getBondMentorName(apprentice);
    if (mentorName == "") return;
    var mentor = getPlayerByName(apprentice, mentorName);
    if (mentor == null || !isMentorOf(mentor, apprentice)) return;

    var share = Math.floor(amount * MENTOR_SHARE_PCT);
    if (share <= 0) return;
    var data = getDMZData(mentor);
    if (data == null) return;
    if (!awardTrainingPoints(mentor, data, share)) return;

    if (isSessionActive(mentor)) {
        try {
            putNumber(mentor.getTempdata(), K_SESSION_TP,
                readNumber(mentor.getTempdata(), K_SESSION_TP, 0) + share);
        } catch (eS) {}
    }

    throttleMessage(
        mentor,
        K_MENTOR_SHARE_MSG,
        MENTOR_SHARE_MSG_COOLDOWN_MS,
        sparText(
            sparColor("6"), "[Mentor Bond] ",
            sparColor("a"), "+", formatWholeNumber(share), " TP ",
            sparColor("7"), "from apprentice ",
            sparColor("f"), getPlayerName(apprentice)
        )
    );
}

function sparCmdBondStatus(player) {
    try { reconcileMentorBond(player); } catch (eR) {}
    uiHead(player, "MENTOR BOND");
    var mentor = getBondMentorName(player);
    var apprentice = getBondApprenticeName(player);
    uiProp(player, "Mentor", mentor != "" ? sparColor("f") + mentor : sparColor("8") + "none");
    uiProp(player, "Apprentice", apprentice != "" ? sparColor("f") + apprentice : sparColor("8") + "none");
    uiBlank(player);
    uiProp(player, "Share", sparColor("7") + "Mentor receives " +
        sparColor("a") + Math.floor(MENTOR_SHARE_PCT * 100) + "%" +
        sparColor("7") + " of apprentice spar TP");
    uiProp(player, "Bonus", sparColor("7") + "Apprentice +" +
        sparColor("a") + Math.floor(MENTOR_SPAR_BONUS_PCT * 100) + "%" +
        sparColor("7") + " TP while sparring with mentor");
    var mCd = bondCooldownLeft(player, S_MENTOR_CD_UNTIL);
    var aCd = bondCooldownLeft(player, S_APPRENTICE_CD_UNTIL);
    if (mCd > 0) {
        uiProp(player, "Mentor CD", sparColor("c") + formatDuration(mCd));
    }
    if (aCd > 0) {
        uiProp(player, "Apprentice CD", sparColor("c") + formatDuration(aCd));
    }
    var invite = readBondInvite(player);
    if (invite != null) {
        uiBlank(player);
        if (invite.kind == "mentor") {
            sendMessage(player, sparColor("e") + invite.from + sparColor("7") +
                " wants you as their Mentor.");
        } else {
            sendMessage(player, sparColor("e") + invite.from + sparColor("7") +
                " wants you as their Apprentice.");
        }
        sendMessage(player, sparColor("8") + "Use  " + sparColor("e") + "/spar mentor accept" +
            sparColor("8") + "  or  " + sparColor("e") + "/spar mentor deny");
    }
    uiBlank(player);
    uiSection(player, "Commands");
    uiCmd(player, "/spar mentor <player>", "ask them to mentor you");
    uiCmd(player, "/spar apprentice <player>", "ask them to be your apprentice");
    uiCmd(player, "/spar mentor accept | deny", "respond to an invite");
    uiCmd(player, "/spar mentor clear", "leave your mentor (7d cooldown)");
    uiCmd(player, "/spar apprentice clear", "release your apprentice (7d cooldown)");
    uiFoot(player);
}

function sparCmdAskMentor(player, targetName) {
    targetName = String(targetName || "").replace(/^\s+|\s+$/g, "");
    if (targetName == "") {
        sparCmdBondStatus(player);
        return;
    }
    if (namesMatch(targetName, getPlayerName(player))) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "You cannot mentor yourself.");
        return;
    }
    if (getBondMentorName(player) != "") {
        uiBanner(player, "Mentor Bond", sparColor("c") + "You already have a mentor (" +
            getBondMentorName(player) + "). Clear them first.");
        return;
    }
    var cd = bondCooldownLeft(player, S_MENTOR_CD_UNTIL);
    if (cd > 0) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "Mentor change cooldown: " + formatDuration(cd));
        return;
    }
    var target = getPlayerByName(player, targetName);
    if (target == null) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "Player not online.");
        return;
    }
    if (getBondApprenticeName(target) != "") {
        uiBanner(player, "Mentor Bond", sparColor("c") + getPlayerName(target) +
            " already has an apprentice.");
        return;
    }
    var tCd = bondCooldownLeft(target, S_APPRENTICE_CD_UNTIL);
    if (tCd > 0) {
        uiBanner(player, "Mentor Bond", sparColor("c") + getPlayerName(target) +
            " cannot take an apprentice yet (" + formatDuration(tCd) + ").");
        return;
    }
    if (!setBondInvite(target, getPlayerName(player), "mentor")) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "Could not send invite.");
        return;
    }
    uiBanner(player, "Mentor Bond", sparColor("a") + "Invite sent to " +
        sparColor("f") + getPlayerName(target) + sparColor("a") + ".");
    sendMessage(target, sparText(
        sparColor("6"), "[Mentor Bond] ",
        sparColor("f"), getPlayerName(player),
        sparColor("e"), " wants you as their Mentor."
    ));
    sendMessage(target, sparColor("8") + "/spar mentor accept  " + sparColor("7") + "or  " +
        sparColor("8") + "/spar mentor deny");
}

function sparCmdAskApprentice(player, targetName) {
    targetName = String(targetName || "").replace(/^\s+|\s+$/g, "");
    if (targetName == "") {
        sparCmdBondStatus(player);
        return;
    }
    if (namesMatch(targetName, getPlayerName(player))) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "You cannot apprentice yourself.");
        return;
    }
    if (getBondApprenticeName(player) != "") {
        uiBanner(player, "Mentor Bond", sparColor("c") + "You already have an apprentice (" +
            getBondApprenticeName(player) + "). Clear them first.");
        return;
    }
    var cd = bondCooldownLeft(player, S_APPRENTICE_CD_UNTIL);
    if (cd > 0) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "Apprentice change cooldown: " + formatDuration(cd));
        return;
    }
    var target = getPlayerByName(player, targetName);
    if (target == null) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "Player not online.");
        return;
    }
    if (getBondMentorName(target) != "") {
        uiBanner(player, "Mentor Bond", sparColor("c") + getPlayerName(target) +
            " already has a mentor.");
        return;
    }
    var tCd = bondCooldownLeft(target, S_MENTOR_CD_UNTIL);
    if (tCd > 0) {
        uiBanner(player, "Mentor Bond", sparColor("c") + getPlayerName(target) +
            " cannot change mentors yet (" + formatDuration(tCd) + ").");
        return;
    }
    if (!setBondInvite(target, getPlayerName(player), "apprentice")) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "Could not send invite.");
        return;
    }
    uiBanner(player, "Mentor Bond", sparColor("a") + "Invite sent to " +
        sparColor("f") + getPlayerName(target) + sparColor("a") + ".");
    sendMessage(target, sparText(
        sparColor("6"), "[Mentor Bond] ",
        sparColor("f"), getPlayerName(player),
        sparColor("e"), " wants you as their Apprentice."
    ));
    sendMessage(target, sparColor("8") + "/spar mentor accept  " + sparColor("7") + "or  " +
        sparColor("8") + "/spar mentor deny");
}

function sparCmdBondAccept(player) {
    var invite = readBondInvite(player);
    if (invite == null) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "No pending invite.");
        return;
    }
    var other = getPlayerByName(player, invite.from);
    if (other == null) {
        clearBondInvite(player);
        uiBanner(player, "Mentor Bond", sparColor("c") + "Inviter is no longer online.");
        return;
    }

    var mentor = null;
    var apprentice = null;
    if (invite.kind == "mentor") {
        mentor = player;
        apprentice = other;
    } else if (invite.kind == "apprentice") {
        mentor = other;
        apprentice = player;
    } else {
        clearBondInvite(player);
        uiBanner(player, "Mentor Bond", sparColor("c") + "Invalid invite.");
        return;
    }

    if (getBondApprenticeName(mentor) != "" &&
        !namesMatch(getBondApprenticeName(mentor), getPlayerName(apprentice))) {
        clearBondInvite(player);
        uiBanner(player, "Mentor Bond", sparColor("c") + "Mentor already has an apprentice.");
        return;
    }
    if (getBondMentorName(apprentice) != "" &&
        !namesMatch(getBondMentorName(apprentice), getPlayerName(mentor))) {
        clearBondInvite(player);
        uiBanner(player, "Mentor Bond", sparColor("c") + "Apprentice already has a mentor.");
        return;
    }

    if (!bindMentorApprentice(mentor, apprentice)) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "Could not create bond.");
        return;
    }

    sendMessage(mentor, sparText(
        sparColor("6"), "[Mentor Bond] ",
        sparColor("a"), "You are now mentoring ",
        sparColor("f"), getPlayerName(apprentice), sparColor("a"), "."
    ));
    sendMessage(apprentice, sparText(
        sparColor("6"), "[Mentor Bond] ",
        sparColor("a"), "Your mentor is now ",
        sparColor("f"), getPlayerName(mentor), sparColor("a"), "."
    ));
}

function sparCmdBondDeny(player) {
    var invite = readBondInvite(player);
    if (invite == null) {
        uiBanner(player, "Mentor Bond", sparColor("c") + "No pending invite.");
        return;
    }
    var fromName = invite.from;
    clearBondInvite(player);
    uiBanner(player, "Mentor Bond", sparColor("7") + "Invite denied.");
    var other = getPlayerByName(player, fromName);
    if (other != null) {
        sendMessage(other, sparText(
            sparColor("6"), "[Mentor Bond] ",
            sparColor("f"), getPlayerName(player),
            sparColor("c"), " denied your invite."
        ));
    }
}

function sparCmdClearMentor(player) {
    var mentorName = getBondMentorName(player);
    if (mentorName == "") {
        uiBanner(player, "Mentor Bond", sparColor("c") + "You have no mentor.");
        return;
    }
    var mentor = getPlayerByName(player, mentorName);
    clearMentorLink(player, mentor, true);
    if (mentor == null) {
        var stored = bondStored(player);
        if (stored != null) putString(stored, S_MENTOR_NAME, "");
        setBondCooldown(player, S_MENTOR_CD_UNTIL);
    }
    uiBanner(player, "Mentor Bond", sparColor("7") + "Left mentor " + sparColor("f") + mentorName +
        sparColor("7") + ". 7-day cooldown started.");
    if (mentor != null) {
        sendMessage(mentor, sparText(
            sparColor("6"), "[Mentor Bond] ",
            sparColor("f"), getPlayerName(player),
            sparColor("7"), " is no longer your apprentice."
        ));
    }
}

function sparCmdClearApprentice(player) {
    var apprenticeName = getBondApprenticeName(player);
    if (apprenticeName == "") {
        uiBanner(player, "Mentor Bond", sparColor("c") + "You have no apprentice.");
        return;
    }
    var apprentice = getPlayerByName(player, apprenticeName);
    clearMentorLink(apprentice, player, true);
    if (apprentice == null) {
        var stored = bondStored(player);
        if (stored != null) putString(stored, S_APPRENTICE_NAME, "");
        setBondCooldown(player, S_APPRENTICE_CD_UNTIL);
    }
    uiBanner(player, "Mentor Bond", sparColor("7") + "Released apprentice " +
        sparColor("f") + apprenticeName + sparColor("7") + ". 7-day cooldown started.");
    if (apprentice != null) {
        sendMessage(apprentice, sparText(
            sparColor("6"), "[Mentor Bond] ",
            sparColor("f"), getPlayerName(player),
            sparColor("7"), " is no longer your mentor."
        ));
    }
}

function sparCmdRouteBond(player, parts) {
    var sub = parts.length > 0 ? String(parts[0]).toLowerCase() : "";
    var arg = parts.length > 1 ? parts[1] : "";
    var arg2 = parts.length > 2 ? parts[2] : "";

    if (sub == "mentor" || sub == "mentors" || sub == "bond") {
        var action = String(arg || "").toLowerCase();
        if (action == "" || action == "status" || action == "info") {
            sparCmdBondStatus(player);
        } else if (action == "accept" || action == "yes") {
            sparCmdBondAccept(player);
        } else if (action == "deny" || action == "decline" || action == "no") {
            sparCmdBondDeny(player);
        } else if (action == "clear" || action == "remove" || action == "leave") {
            sparCmdClearMentor(player);
        } else if (action == "ask") {
            sparCmdAskMentor(player, arg2);
        } else {
            sparCmdAskMentor(player, arg);
        }
        return true;
    }

    if (sub == "apprentice" || sub == "app" || sub == "student") {
        var aAction = String(arg || "").toLowerCase();
        if (aAction == "" || aAction == "status" || aAction == "info") {
            sparCmdBondStatus(player);
        } else if (aAction == "clear" || aAction == "remove" || aAction == "release") {
            sparCmdClearApprentice(player);
        } else if (aAction == "ask" || aAction == "take") {
            sparCmdAskApprentice(player, arg2);
        } else {
            sparCmdAskApprentice(player, arg);
        }
        return true;
    }

    return false;
}

/* ========================= FRIENDLY FIST SPAR HEAL ========================= */

/*
 * Rhino/Nashorn can box Java booleans so `=== true` fails.
 * Accept any truthy Java/JS boolean-like value.
 */
function javaFlagTrue(value) {
    if (value === true) return true;
    if (value === false || value == null) return false;
    try {
        if (value == true) return true;
    } catch (e1) {}
    try {
        if (String(value).toLowerCase() == "true") return true;
    } catch (e2) {}
    return false;
}

function isFriendlyFistOn(player) {
    try {
        var data = getDMZData(player);
        if (data == null) return false;
        var status = data.getStatus();
        if (status == null) return false;
        return javaFlagTrue(status.isFriendlyFistEnabled());
    } catch (e) { return false; }
}

function isPlayerKnockedDown(player) {
    try {
        var data = getDMZData(player);
        if (data == null) return false;
        var status = data.getStatus();
        if (status == null) return false;
        return javaFlagTrue(status.isKnockedDown());
    } catch (e) { return false; }
}

/*
 * Friendly Fist lethal hits leave the victim at ~1 HP + knocked down.
 * Detect either signal so heal still fires if the KD flag is late/stale.
 */
function needsFriendlyFistHeal(player) {
    if (player == null) return false;
    if (isPlayerKnockedDown(player)) return true;
    try {
        var health = Number(player.getHealth());
        if (isNaN(health) || health <= 0) {
            try { health = Number(player.getMCEntity().getHealth()); } catch (e1) { health = 0; }
        }
        if (health > 0 && health <= 1.5) return true;
    } catch (e) {}
    return false;
}

function healSparPlayerFull(player) {
    if (player == null) return false;
    try {
        var maxH = 0;
        var mc = null;
        try { mc = player.getMCEntity(); } catch (e0) { mc = null; }
        try { maxH = Number(player.getMaxHealth()); } catch (e1) { maxH = 0; }
        if (!(maxH > 0) && mc != null) {
            try { maxH = Number(mc.getMaxHealth()); } catch (e2) {}
        }
        if (!(maxH > 0)) maxH = 20;

        /* Restore vanilla health first. */
        try { player.setHealth(maxH); } catch (e3) {}
        if (mc != null) {
            try { mc.setHealth(mc.getMaxHealth()); } catch (e4) {}
            try { mc.m_21153_(mc.m_21233_()); } catch (e5) {} /* LivingEntity#setHealth */
            try { mc.m_5634_(maxH); } catch (e6) {} /* heal */
        }

        var data = getDMZData(player);
        if (data != null) {
            try { data.getStatus().setKnockedDown(false); } catch (e7) {}
            try { data.getCooldowns().removeCooldown("KnockdownDuration"); } catch (e8) {}
            try { data.getCooldowns().setCooldown("KnockdownDuration", 0); } catch (e9) {}
            try {
                NetworkHandler.sendToTrackingEntityAndSelf(
                    new StatsSyncS2C(mc != null ? mc : player.getMCEntity()),
                    mc != null ? mc : player.getMCEntity()
                );
            } catch (e10) {}
        }
        sampleHealthPool(player);

        var nowH = 0;
        try { nowH = Number(player.getHealth()); } catch (e11) {}
        if (!(nowH > 0) && mc != null) {
            try { nowH = Number(mc.getHealth()); } catch (e12) {}
        }
        /*
         * Success if HP is restored OR knockdown cleared.
         * Do not require both — DMZ KD clear can lag a tick behind.
         */
        return nowH >= Math.max(2, maxH * 0.5) || !isPlayerKnockedDown(player);
    } catch (e) {
        return false;
    }
}

function markFriendlyFistHealPending(victim) {
    if (victim == null) return;
    try {
        putNumber(victim.getTempdata(), "spar.ff.healPendingUntil", nowMs() + 500);
    } catch (e) {}
}

function hasFriendlyFistHealPending(victim) {
    if (victim == null) return false;
    try {
        return nowMs() <= readNumber(victim.getTempdata(), "spar.ff.healPendingUntil", 0);
    } catch (e) {
        return false;
    }
}

function finishFriendlyFistHeal(healer, target) {
    if (healer == null || target == null) return false;
    var tTemp = target.getTempdata();
    if (readString(tTemp, K_FF_KD_HEALED, "0") == "1") return false;

    if (!healSparPlayerFull(target)) {
        /* Still mark pending so we retry next ticks while KD/low HP lasts. */
        markFriendlyFistHealPending(target);
        return false;
    }

    putString(tTemp, K_FF_KD_HEALED, "1");
    try { putNumber(tTemp, "spar.ff.healPendingUntil", 0); } catch (e0) {}

    try {
        refreshMovementActivity(healer);
        refreshMovementActivity(target);
        var now = nowMs();
        putString(healer.getTempdata(), K_LAST_OUT_PARTNER, getPlayerName(target));
        putNumber(healer.getTempdata(), K_LAST_OUT_TIME, now);
        putString(target.getTempdata(), K_LAST_OUT_PARTNER, getPlayerName(healer));
        putNumber(target.getTempdata(), K_LAST_OUT_TIME, now);
        clearGraceState(healer, target);
    } catch (eKeep) {}

    sendMessage(healer, sparText(
        sparColor("6"), "[Sparring] ",
        sparColor("a"), "Friendly Fist ",
        sparColor("7"), "knockdown — healed ",
        sparColor("f"), getPlayerName(target), sparColor("7"), "."
    ));
    sendMessage(target, sparText(
        sparColor("6"), "[Sparring] ",
        sparColor("a"), "Friendly Fist ",
        sparColor("7"), "heal from ",
        sparColor("f"), getPlayerName(healer), sparColor("7"), "."
    ));
    return true;
}

function processFriendlyFistKnockdownHeal(player, partner) {
    if (player == null || partner == null) return;
    if (!isSessionActive(player) || !isSessionActive(partner)) return;

    var pTemp = partner.getTempdata();
    var aTemp = player.getTempdata();

    /* Reset heal latch once they are back on their feet / healthy. */
    if (!needsFriendlyFistHeal(partner) && !hasFriendlyFistHealPending(partner)) {
        putString(pTemp, K_FF_KD_HEALED, "0");
    }
    if (!needsFriendlyFistHeal(player) && !hasFriendlyFistHealPending(player)) {
        putString(aTemp, K_FF_KD_HEALED, "0");
    }

    /*
     * Either fighter can drive the heal:
     *  - I have Friendly Fist and partner is KD / ~1 HP
     *  - Partner has Friendly Fist and I am KD / ~1 HP
     */
    if ((needsFriendlyFistHeal(partner) || hasFriendlyFistHealPending(partner)) &&
        isFriendlyFistOn(player)) {
        finishFriendlyFistHeal(player, partner);
    }
    if ((needsFriendlyFistHeal(player) || hasFriendlyFistHealPending(player)) &&
        isFriendlyFistOn(partner)) {
        finishFriendlyFistHeal(partner, player);
    }
}

/* ========================= MOVEMENT ========================= */

function refreshMovementActivity(player) {
    try {
        var temp = player.getTempdata();
        putNumber(temp, K_MOVE_X, Number(player.getX()));
        putNumber(temp, K_MOVE_Y, Number(player.getY()));
        putNumber(temp, K_MOVE_Z, Number(player.getZ()));
        putNumber(temp, K_MOVE_VALID_UNTIL, nowMs() + MOVEMENT_ACTIVITY_WINDOW_MS);
    } catch (e) {}
}

function readPlayerMotionSpeed(player) {
    try {
        var mc = player.getMCEntity();
        if (mc == null) return 0;
        var motion = null;
        try { motion = mc.getDeltaMovement(); } catch (e1) {
            try { motion = mc.m_20184_(); } catch (e2) {}
        }
        if (motion == null) return 0;
        var x = 0, y = 0, z = 0;
        try { x = Number(motion.x()); } catch (e3) { try { x = Number(motion.x); } catch (e4) {} }
        try { y = Number(motion.y()); } catch (e5) { try { y = Number(motion.y); } catch (e6) {} }
        try { z = Number(motion.z()); } catch (e7) { try { z = Number(motion.z); } catch (e8) {} }
        if (isNaN(x)) x = 0; if (isNaN(y)) y = 0; if (isNaN(z)) z = 0;
        return Math.sqrt(x * x + y * y + z * z);
    } catch (e) { return 0; }
}

function updateMovement(player) {
    var temp = player.getTempdata();
    var now = nowMs();
    var x = Number(player.getX());
    var y = Number(player.getY());
    var z = Number(player.getZ());
    var lx = readNumber(temp, K_MOVE_X, x);
    var ly = readNumber(temp, K_MOVE_Y, y);
    var lz = readNumber(temp, K_MOVE_Z, z);
    var dist = Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly) + (z - lz) * (z - lz));
    var speed = readPlayerMotionSpeed(player);
    putNumber(temp, K_MOVE_X, x);
    putNumber(temp, K_MOVE_Y, y);
    putNumber(temp, K_MOVE_Z, z);
    if (dist >= MIN_MOVEMENT_DISTANCE || speed >= MIN_MOTION_SPEED) {
        putNumber(temp, K_MOVE_VALID_UNTIL, now + MOVEMENT_ACTIVITY_WINDOW_MS);
        putNumber(temp, K_STYLE_MOVE, readNumber(temp, K_STYLE_MOVE, 0) + 1);
    }
    if (speed >= HEAVY_MOTION_SPEED) {
        putNumber(temp, K_HEAVY_MOTION_UNTIL, now + 2500);
    }
}

function hasRecentMovement(player) {
    return nowMs() <= readNumber(player.getTempdata(), K_MOVE_VALID_UNTIL, 0);
}

/* ========================= COMBAT CLASSIFY ========================= */

function unwrapMcEntity(entity) {
    if (entity == null) return null;
    try {
        if (typeof entity.getMCEntity == "function") {
            var mc = entity.getMCEntity();
            if (mc != null) return mc;
        }
    } catch (e) {}
    return entity;
}

function getDamageSource(event) {
    if (event == null) return null;
    try { if (event.damageSource != null) return event.damageSource; } catch (e1) {}
    try { if (event.source != null) return event.source; } catch (e2) {}
    return null;
}

/* Raw Forge DamageSource when CNPC wraps it. */
function getMcDamageSource(event) {
    var source = getDamageSource(event);
    if (source == null) return null;
    try {
        if (typeof source.getMCDamageSource == "function") {
            var mc = source.getMCDamageSource();
            if (mc != null) return mc;
        }
    } catch (e1) {}
    /* Already a Forge DamageSource */
    try {
        if (typeof source.m_269150_ == "function") return source;
    } catch (e2) {}
    return source;
}

function javaTypeIsInstance(typeObj, mc) {
    if (typeObj == null || mc == null) return false;
    try {
        if (typeof typeObj.isInstance == "function" && typeObj.isInstance(mc)) return true;
    } catch (e1) {}
    try {
        if (typeObj.class != null && typeObj.class.isInstance(mc)) return true;
    } catch (e2) {}
    return false;
}

/*
 * Collect possible damage-type strings the way KiWeapons / Rival do.
 * 1.20.1 may expose getType(), msg id, or obfuscated m_19385_().
 */
function getDamageTypeStrings(event) {
    var out = [];
    var source = getDamageSource(event);
    var mcSource = getMcDamageSource(event);

    function pushType(value) {
        if (value == null) return;
        var s = String(value).toLowerCase();
        if (s == "" || s == "null" || s == "undefined") return;
        out.push(s);
    }

    if (source != null) {
        try { if (source.getType != null) pushType(source.getType()); } catch (e1) {}
        try { if (source.getMsgId != null) pushType(source.getMsgId()); } catch (e2) {}
        try { pushType(source.m_19385_()); } catch (e3) {}
        try { if (source.type != null) pushType(source.type); } catch (e4) {}
        try {
            if (source.typeHolder != null) {
                var holder = source.typeHolder();
                if (holder != null) pushType(holder);
            }
        } catch (e5) {}
        try { pushType(source); } catch (e6) {}
    }

    if (mcSource != null && mcSource !== source) {
        try { pushType(mcSource.m_19385_()); } catch (e7) {}
        try { pushType(mcSource.getMsgId()); } catch (e8) {}
        try { pushType(mcSource); } catch (e9) {}
        try {
            var typeHolder = mcSource.m_269150_();
            if (typeHolder != null) {
                try { pushType(typeHolder.m_135782_()); } catch (e10) {}
                try { pushType(typeHolder.unwrapKey().get().m_135782_()); } catch (e11) {}
            }
        } catch (e12) {}
    }

    return out;
}

function damageTypeLooksLikeKi(typeStr) {
    if (typeStr == null || typeStr == "") return false;
    var t = String(typeStr).toLowerCase();
    /* KiWeapons exact matches */
    if (t == "kiblast" || t == "dragonminez:kiblast") return true;
    if (t == "kilaser" || t == "dragonminez:kilaser") return true;
    /* DMZ message ids: kiblast.small_ball, kiblast.wave, ... */
    if (t.indexOf("kiblast") >= 0) return true;
    if (t.indexOf("kilaser") >= 0) return true;
    if (t.indexOf("dragonminez") >= 0 && t.indexOf("ki") >= 0) return true;
    if (t.indexOf("ki_blast") >= 0 || t.indexOf("ki-blast") >= 0) return true;
    if (t.indexOf("energy") >= 0 && t.indexOf("player") < 0) return true;
    /* bare "ki" token / path segment */
    if (/(^|[:/_\\.])ki($|[:/_\\.])/.test(t)) return true;
    if (t.indexOf("beam") >= 0 || t.indexOf("laser") >= 0) return true;
    return false;
}

function getSourceEntities(event) {
    var list = [];
    var seen = {};

    function pushEnt(ent) {
        if (ent == null) return;
        try {
            var key = String(ent);
            if (seen[key]) return;
            seen[key] = true;
        } catch (eKey) {}
        list.push(ent);
    }

    var source = getDamageSource(event);
    var mcSource = getMcDamageSource(event);

    var getters = [
        "getImmediateSource",
        "getDirectEntity",
        "getTrueSource",
        "getEntity",
        "getSourceEntity"
    ];

    function pullFrom(obj) {
        if (obj == null) return;
        for (var i = 0; i < getters.length; i++) {
            try {
                var fn = obj[getters[i]];
                if (typeof fn == "function") pushEnt(fn.call(obj));
            } catch (e) {}
        }
        /* Forge obfuscated: direct / causing */
        try { pushEnt(obj.m_7640_()); } catch (eD) {}
        try { pushEnt(obj.m_7639_()); } catch (eC) {}
    }

    pullFrom(source);
    if (mcSource !== source) pullFrom(mcSource);
    return list;
}

function entityIsKiProjectile(entity) {
    if (entity == null) return false;
    var mc = unwrapMcEntity(entity);
    if (mc == null) return false;

    if (javaTypeIsInstance(AbstractKiProjectile, mc)) return true;
    if (javaTypeIsInstance(KiLaserEntity, mc)) return true;
    if (javaTypeIsInstance(KiBlastEntity, mc)) return true;

    /* Class-name fallback if Java.type bindings differ by DMZ build. */
    try {
        var cn = String(mc.getClass().getName()).toLowerCase();
        if (cn.indexOf("abstractkiprojectile") >= 0) return true;
        if (cn.indexOf("kiprojectile") >= 0) return true;
        if (cn.indexOf("kiblast") >= 0 || cn.indexOf("kilaser") >= 0) return true;
        if (cn.indexOf("kiwave") >= 0 || cn.indexOf("kidisk") >= 0) return true;
        if (cn.indexOf(".ki.") >= 0 && cn.indexOf("entity") >= 0) return true;
    } catch (e4) {}

    return false;
}

function isKiblastDamageSource(event) {
    if (MainDamageTypes == null) return false;
    try {
        var mcSource = getMcDamageSource(event);
        if (mcSource == null) return false;
        return MainDamageTypes.isKiblastDamage(mcSource) === true;
    } catch (e) {
        return false;
    }
}

function isKiAttack(event) {
    try {
        /* 1) Authoritative DMZ damage-type check */
        if (isKiblastDamageSource(event)) return true;

        /* 2) Immediate / direct entity is a ki projectile */
        var ents = getSourceEntities(event);
        for (var i = 0; i < ents.length; i++) {
            if (entityIsKiProjectile(ents[i])) return true;
        }

        /* 3) Type / message-id strings (KiWeapons style) */
        var types = getDamageTypeStrings(event);
        for (var t = 0; t < types.length; t++) {
            if (damageTypeLooksLikeKi(types[t])) return true;
        }

        /* 4) CNPC projectile flag + non-player type */
        try {
            var source = getDamageSource(event);
            if (source != null && typeof source.isProjectile == "function" && source.isProjectile()) {
                var typeStr = "";
                try { typeStr = String(source.getType()).toLowerCase(); } catch (eT) {}
                if (typeStr != "player" && typeStr != "minecraft:player" && typeStr.indexOf("player") < 0) {
                    if (typeStr.indexOf("mob") < 0 && typeStr != "generic" && typeStr != "") {
                        /* only accept if it still looks energy-ish */
                        if (damageTypeLooksLikeKi(typeStr)) return true;
                    }
                }
            }
        } catch (eP) {}
    } catch (e) {}
    return false;
}

function classifyKiType(event) {
    try {
        var ents = getSourceEntities(event);
        for (var i = 0; i < ents.length; i++) {
            var mc = unwrapMcEntity(ents[i]);
            if (mc == null) continue;
            if (javaTypeIsInstance(KiLaserEntity, mc)) return "beam";
            if (javaTypeIsInstance(KiBlastEntity, mc)) return "basic";
            try {
                var cn = String(mc.getClass().getName()).toLowerCase();
                if (cn.indexOf("laser") >= 0 || cn.indexOf("beam") >= 0 || cn.indexOf("kiwave") >= 0) return "beam";
                if (cn.indexOf("blast") >= 0) return "basic";
                if (cn.indexOf("disk") >= 0) return "scatter";
            } catch (eC) {}
            try {
                if (typeof mc.getKiType == "function") {
                    var kt = String(mc.getKiType()).toLowerCase();
                    if (kt.indexOf("beam") >= 0 || kt.indexOf("wave") >= 0) return "beam";
                    if (kt.indexOf("blast") >= 0 || kt.indexOf("ball") >= 0) return "basic";
                    if (kt.indexOf("disk") >= 0) return "scatter";
                }
            } catch (eK) {}
        }

        var types = getDamageTypeStrings(event);
        for (var t = 0; t < types.length; t++) {
            var type = types[t];
            if (type.indexOf("scatter") >= 0 || type.indexOf("disk") >= 0) return "scatter";
            if (type.indexOf("charge") >= 0) return "charge";
            /* Wave/beam before explosive — "kiwave" must not underpay as explosive. */
            if (type.indexOf("laser") >= 0 || type.indexOf("beam") >= 0 || type.indexOf("wave") >= 0) return "beam";
            if (type.indexOf("explosive") >= 0) return "explosive";
            if (type.indexOf("barrage") >= 0 || type.indexOf("rapid") >= 0) return "barrage";
            if (type.indexOf("kiblast") >= 0 || type.indexOf("blast") >= 0) return "basic";
        }
    } catch (e2) {}
    return "other";
}

function kiEfficiency(kind) {
    if (KI_EFF[kind] != null) return KI_EFF[kind];
    return KI_EFF.other;
}

/* ========================= SESSION ========================= */

function isSessionActive(player) {
    return readString(player.getTempdata(), K_SESSION_ACTIVE, "") == "1";
}

/* Rival challenge DB key — keep in sync with Rival System.js */
var RIVAL_CHALLENGE_DB_KEY = "dlr.rivalry.v4.challenges";

function getOverworldStoreddata() {
    try {
        var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
        var names = ["minecraft:overworld", "overworld"];
        for (var i = 0; i < names.length; i++) {
            try {
                var world = NpcAPI.Instance().getIWorld(names[i]);
                if (world != null) return world.getStoreddata();
            } catch (e1) {}
        }
    } catch (e) {}
    return null;
}

function isInRivalChallenge(player) {
    if (player == null) return false;
    try {
        var stored = getOverworldStoreddata();
        if (stored == null || !stored.has(RIVAL_CHALLENGE_DB_KEY)) return false;
        var ch = JSON.parse(String(stored.get(RIVAL_CHALLENGE_DB_KEY)));
        if (ch == null || ch.playerSessions == null || ch.sessions == null) return false;
        var sid = ch.playerSessions[getPlayerUUID(player)];
        if (sid == null || sid === undefined) return false;
        var session = ch.sessions[String(sid)];
        if (session == null) return false;
        var st = String(session.state || "");
        return st == "active" || st == "countdown";
    } catch (e) {
        return false;
    }
}

/* Soft-stop any open spar when a Rival challenge is running (no chat). */
function suppressSparringForChallenge(player) {
    if (player == null || !isInRivalChallenge(player)) return false;
    if (isSessionActive(player)) {
        var partner = null;
        try { partner = getPlayerByName(player, getPartnerName(player)); } catch (e1) {}
        clearSessionData(player);
        clearSelfHitTracking(player);
        if (partner != null && isSessionActive(partner)) {
            clearSessionData(partner);
            clearSelfHitTracking(partner);
        }
    } else {
        clearSelfHitTracking(player);
        clearPendingHpSample(player);
    }
    return true;
}

function getPartnerName(player) {
    return readString(player.getTempdata(), K_PARTNER, "");
}

function clearPendingHpSample(player) {
    if (player == null) return;
    var temp = player.getTempdata();
    var keys = [
        K_HP_SAMPLE, K_PENDING_SAMPLE, K_PENDING_ATK,
        K_PENDING_KI, K_PENDING_KI_KIND, K_PENDING_UNTIL
    ];
    for (var i = 0; i < keys.length; i++) {
        try { if (temp.has(keys[i])) temp.remove(keys[i]); } catch (e) {
            try { temp.put(keys[i], ""); } catch (e2) {}
        }
    }
}

function clearSessionData(player) {
    if (player == null) return;
    var temp = player.getTempdata();
    var keys = [
        K_PARTNER, K_SESSION_ACTIVE, K_SESSION_START, K_GRACE_UNTIL, K_GRACE_REASON, K_GRACE_WARNED,
        K_COMBO, K_COMBO_UNTIL, K_MOMENTUM, K_MOMENTUM_UNTIL,
        K_SESSION_TP, K_SESSION_MELEE, K_SESSION_KI, K_SESSION_DMG, K_SESSION_TAKEN,
        K_SESSION_BLOCKS, K_SESSION_PBLOCKS, K_SESSION_CLASH_MS, K_SESSION_VANISH, K_SESSION_KB,
        K_SESSION_MAX_COMBO, K_SESSION_MAX_MOM, K_SESSION_PERFECT, K_CLASH_UNTIL,
        K_TP_PENDING, K_TP_PENDING_MELEE, K_TP_PENDING_KI, K_TP_PENDING_CLASH, K_LAST_HIT_KIND,
        K_STYLE_MELEE, K_STYLE_KI, K_STYLE_BEAM, K_STYLE_BLOCK, K_STYLE_MOVE,
        K_HP_SAMPLE, K_PENDING_SAMPLE, K_PENDING_ATK, K_PENDING_KI, K_PENDING_KI_KIND, K_PENDING_UNTIL,
        K_FF_KD_HEALED
    ];
    for (var i = 0; i < keys.length; i++) {
        try { if (temp.has(keys[i])) temp.remove(keys[i]); } catch (e) {
            try { temp.put(keys[i], ""); } catch (e2) {}
        }
    }
}

function clearSelfHitTracking(player) {
    if (player == null) return;
    var temp = player.getTempdata();
    try { temp.put(K_LAST_OUT_PARTNER, ""); } catch (e) {}
    try { temp.put(K_LAST_IN_PARTNER, ""); } catch (e) {}
    putNumber(temp, K_LAST_OUT_TIME, 0);
    putNumber(temp, K_LAST_IN_TIME, 0);
}

function startSession(a, b) {
    if (a == null || b == null || isSamePlayer(a, b)) {
        clearSelfHitTracking(a);
        clearSelfHitTracking(b);
        return false;
    }
    if (isInRivalChallenge(a) || isInRivalChallenge(b)) {
        clearSelfHitTracking(a);
        clearSelfHitTracking(b);
        return false;
    }
    var now = nowMs();
    var aTemp = a.getTempdata();
    var bTemp = b.getTempdata();
    if (now < readNumber(aTemp, K_COOLDOWN, 0) || now < readNumber(bTemp, K_COOLDOWN, 0)) return false;

    var aName = getPlayerName(a);
    var bName = getPlayerName(b);
    if (aName == "" || bName == "" || aName.toLowerCase() == bName.toLowerCase()) return false;

    putString(aTemp, K_PARTNER, bName);
    putString(bTemp, K_PARTNER, aName);
    putString(aTemp, K_SESSION_ACTIVE, "1");
    putString(bTemp, K_SESSION_ACTIVE, "1");
    putNumber(aTemp, K_SESSION_START, now);
    putNumber(bTemp, K_SESSION_START, now);

    var zeroKeys = [
        K_SESSION_TP, K_SESSION_MELEE, K_SESSION_KI, K_SESSION_DMG, K_SESSION_TAKEN,
        K_SESSION_BLOCKS, K_SESSION_PBLOCKS, K_SESSION_CLASH_MS, K_SESSION_VANISH, K_SESSION_KB,
        K_SESSION_MAX_COMBO, K_SESSION_MAX_MOM, K_SESSION_PERFECT, K_COMBO, K_MOMENTUM,
        K_STYLE_MELEE, K_STYLE_KI, K_STYLE_BEAM, K_STYLE_BLOCK, K_STYLE_MOVE,
        K_TP_PENDING, K_TP_PENDING_MELEE, K_TP_PENDING_KI, K_TP_PENDING_CLASH
    ];
    for (var i = 0; i < zeroKeys.length; i++) {
        putNumber(aTemp, zeroKeys[i], 0);
        putNumber(bTemp, zeroKeys[i], 0);
    }

    /* Seed movement window only — hits/blocks must not refresh AFK gate. */
    refreshMovementActivity(a);
    refreshMovementActivity(b);
    sampleHealthPool(a);
    sampleHealthPool(b);

    if (SHOW_SESSION_MESSAGES) {
        sendMessage(a, sparText(sparColor("6"), "[Sparring] ", sparColor("e"), "Combat training started with ", sparColor("f"), bName, sparColor("e"), "."));
        sendMessage(b, sparText(sparColor("6"), "[Sparring] ", sparColor("e"), "Combat training started with ", sparColor("f"), aName, sparColor("e"), "."));
        sendMessage(a, sparText(sparColor("8"), "TP is earned from real combat actions."));
        sendMessage(b, sparText(sparColor("8"), "TP is earned from real combat actions."));
        if (isMentorOf(a, b) || isMentorOf(b, a)) {
            var apprentice = isMentorOf(a, b) ? b : a;
            var mentor = isMentorOf(a, b) ? a : b;
            sendMessage(apprentice, sparText(
                sparColor("6"), "[Mentor Bond] ",
                sparColor("a"), "+", Math.floor(MENTOR_SPAR_BONUS_PCT * 100),
                "% TP bonus while training with your mentor."
            ));
            sendMessage(mentor, sparText(
                sparColor("6"), "[Mentor Bond] ",
                sparColor("7"), "Training your apprentice — you earn ",
                sparColor("a"), Math.floor(MENTOR_SHARE_PCT * 100), "%",
                sparColor("7"), " of their spar TP."
            ));
        }
    }
    return true;
}

function showEndReport(player, reason) {
    if (!SHOW_END_REPORT || player == null) return;
    var temp = player.getTempdata();
    var duration = Math.max(0, nowMs() - readNumber(temp, K_SESSION_START, nowMs()));
    var partner = readString(temp, K_PARTNER, "Unknown");
    sendMessage(player, sparColor("8") + "--------------------------------");
    sendMessage(player, sparColor("6") + sparColor("l") + " Training Complete " + sparColor("r"));
    sendMessage(player, sparColor("8") + "--------------------------------");
    sendMessage(player, sparColor("8") + "Partner  " + sparColor("f") + partner);
    sendMessage(player, sparColor("8") + "Duration  " + sparColor("f") + formatDuration(duration));
    sendMessage(player, sparColor("8") + "via  " + sparColor("7") + String(reason || "ended"));
    sendMessage(player, " ");
    sendMessage(player, sparColor("8") + "Damage Dealt  " + sparColor("f") + formatWholeNumber(readNumber(temp, K_SESSION_DMG, 0)));
    sendMessage(player, sparColor("8") + "Damage Taken  " + sparColor("f") + formatWholeNumber(readNumber(temp, K_SESSION_TAKEN, 0)));
    sendMessage(player, sparColor("8") + "Melee  " + sparColor("f") + formatWholeNumber(readNumber(temp, K_SESSION_MELEE, 0)) +
        sparColor("8") + "   Ki  " + sparColor("f") + formatWholeNumber(readNumber(temp, K_SESSION_KI, 0)));
    sendMessage(player, sparColor("8") + "Highest Combo  " + sparColor("f") + Math.floor(readNumber(temp, K_SESSION_MAX_COMBO, 0)) +
        sparColor("8") + "   Momentum  " + sparColor("f") + Math.floor(readNumber(temp, K_SESSION_MAX_MOM, 0)));
    sendMessage(player, sparColor("8") + "Blocks  " + sparColor("f") + Math.floor(readNumber(temp, K_SESSION_BLOCKS, 0)) +
        sparColor("8") + "   Clash  " + sparColor("f") + formatDuration(readNumber(temp, K_SESSION_CLASH_MS, 0)));
    sendMessage(player, sparColor("8") + "Style  " + sparColor("e") + styleName(player));
    var perfect = readNumber(temp, K_SESSION_PERFECT, 0) > 0;
    sendMessage(player, sparColor("8") + "Perfect Training  " + (perfect ? sparColor("a") + "Yes" : sparColor("7") + "No"));
    try {
        var partnerObj = (partner != "" && partner != "Unknown") ? getPlayerByName(player, partner) : null;
        var selfVals = getLiveTrainingValues(player);
        var partnerVals = partnerObj != null ? getLiveTrainingValues(partnerObj) : null;
        if (selfVals != null) {
            var reportBP = selfVals.bp;
            if (partnerVals != null && partnerVals.bp > 0) reportBP = Math.min(selfVals.bp, partnerVals.bp);
            if (!(reportBP > 0)) reportBP = selfVals.bp;
            sendMessage(player, sparColor("8") + "BP Scale  " + sparColor("f") + formatWholeNumber(reportBP) +
                sparColor("8") + "  (" + sparColor("e") + formatMult(getBattlePowerMultiplier(reportBP)) + sparColor("8") + ")");
        }
    } catch (eBp) {}
    sendMessage(player, sparColor("8") + "Total TP Earned  " + sparColor("a") + formatWholeNumber(readNumber(temp, K_SESSION_TP, 0)));
    sendMessage(player, sparColor("8") + "--------------------------------");
}

function endSession(player, partner, reason) {
    var wasActive = false;
    try {
        wasActive = isSessionActive(player) || (partner != null && isSessionActive(partner));
    } catch (e) {}
    if (!wasActive) {
        clearSessionData(player);
        if (partner != null) clearSessionData(partner);
        return;
    }

    /* Only one side should announce / report / streak-qualify */
    var announce = false;
    try {
        if (isSessionActive(player)) announce = true;
    } catch (e2) {}

    var duration = 0;
    try { duration = Math.max(0, nowMs() - readNumber(player.getTempdata(), K_SESSION_START, nowMs())); } catch (e3) {}

    if (announce) {
        flushPendingTpMessage(player);
        if (partner != null) flushPendingTpMessage(partner);
        showEndReport(player, reason);
        if (partner != null) showEndReport(partner, reason);
        if (duration >= STREAK_MIN_SESSION_MS) {
            qualifyDailyTrainingStreak(player);
            if (partner != null) qualifyDailyTrainingStreak(partner);
        }
        if (duration >= MIN_COUNTED_SESSION_MS) {
            recordSparringSessionCompleted(player);
            if (partner != null) recordSparringSessionCompleted(partner);
        }
        updateSparringLeaderboard(player);
        if (partner != null) updateSparringLeaderboard(partner);
        if (SHOW_SESSION_MESSAGES) {
            sendMessage(player, sparText(sparColor("6"), "[Sparring] ", sparColor("c"), "Session ended", sparColor("8"), " - ", reason));
            if (partner != null) {
                sendMessage(partner, sparText(sparColor("6"), "[Sparring] ", sparColor("c"), "Session ended", sparColor("8"), " - ", reason));
            }
        }
    }

    var now = nowMs();
    putNumber(player.getTempdata(), K_COOLDOWN, now + PAIR_RESTART_COOLDOWN_MS);
    if (partner != null) putNumber(partner.getTempdata(), K_COOLDOWN, now + PAIR_RESTART_COOLDOWN_MS);

    clearSessionData(player);
    if (partner != null) clearSessionData(partner);
    clearSelfHitTracking(player);
    if (partner != null) clearSelfHitTracking(partner);
}

/* ========================= COMBO / MOMENTUM ========================= */

function getMomentumMultiplier(player) {
    var temp = player.getTempdata();
    var now = nowMs();
    if (now > readNumber(temp, K_MOMENTUM_UNTIL, 0)) {
        putNumber(temp, K_MOMENTUM, 0);
        return 1.0;
    }
    var tier = Math.floor(readNumber(temp, K_MOMENTUM, 0));
    if (tier <= 0) return 1.0;
    if (tier > MOMENTUM_MULTIPLIERS.length) tier = MOMENTUM_MULTIPLIERS.length;
    return MOMENTUM_MULTIPLIERS[tier - 1];
}

function registerCombatHit(player) {
    var temp = player.getTempdata();
    var now = nowMs();
    var combo = Math.floor(readNumber(temp, K_COMBO, 0));
    if (now > readNumber(temp, K_COMBO_UNTIL, 0)) combo = 0;
    combo += 1;
    putNumber(temp, K_COMBO, combo);
    putNumber(temp, K_COMBO_UNTIL, now + COMBO_TIMEOUT_MS);
    putNumber(temp, K_MOMENTUM_UNTIL, now + MOMENTUM_DURATION_MS);

    var maxCombo = Math.floor(readNumber(temp, K_SESSION_MAX_COMBO, 0));
    if (combo > maxCombo) putNumber(temp, K_SESSION_MAX_COMBO, combo);

    var oldTier = Math.floor(readNumber(temp, K_MOMENTUM, 0));
    var newTier = 0;
    for (var i = 0; i < MOMENTUM_THRESHOLDS.length; i++) {
        if (combo >= MOMENTUM_THRESHOLDS[i]) newTier = i + 1;
    }
    putNumber(temp, K_MOMENTUM, newTier);
    var maxMom = Math.floor(readNumber(temp, K_SESSION_MAX_MOM, 0));
    if (newTier > maxMom) putNumber(temp, K_SESSION_MAX_MOM, newTier);

    if (SHOW_MOMENTUM_MESSAGES && newTier > oldTier && newTier > 0) {
        sendMessage(player, sparText(
            sparColor("6"), "[Sparring] ",
            sparColor("e"), "Momentum ", roman(newTier),
            sparColor("7"), "  (", formatMult(MOMENTUM_MULTIPLIERS[newTier - 1]), " TP)"
        ));
    }
}

/*
 * Reset combo + Momentum (e.g. attack was blocked).
 * Returns true if there was something to break.
 */
function breakCombo(player, reason) {
    if (player == null || BLOCK_BREAKS_COMBO !== true) return false;
    var temp = player.getTempdata();
    var combo = Math.floor(readNumber(temp, K_COMBO, 0));
    var momentum = Math.floor(readNumber(temp, K_MOMENTUM, 0));
    var hadCombo = combo > 0 || momentum > 0 ||
        nowMs() <= readNumber(temp, K_COMBO_UNTIL, 0) ||
        nowMs() <= readNumber(temp, K_MOMENTUM_UNTIL, 0);

    putNumber(temp, K_COMBO, 0);
    putNumber(temp, K_COMBO_UNTIL, 0);
    putNumber(temp, K_MOMENTUM, 0);
    putNumber(temp, K_MOMENTUM_UNTIL, 0);

    if (!hadCombo) return false;

    if (SHOW_COMBO_BREAK_MESSAGES === true) {
        var now = nowMs();
        if (now >= readNumber(temp, K_COMBO_BREAK_MSG, 0)) {
            putNumber(temp, K_COMBO_BREAK_MSG, now + COMBO_BREAK_MSG_COOLDOWN_MS);
            var note = reason ? String(reason) : "combo broken";
            sendMessage(player, sparText(
                sparColor("6"), "[Sparring] ",
                sparColor("c"), "Combo broken",
                sparColor("8"), " - ", note
            ));
        }
    }
    return true;
}

function roman(n) {
    var r = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
    if (n >= 1 && n <= r.length) return r[n - 1];
    return String(n);
}

function formatMult(v) {
    return (Math.round(Number(v) * 100) / 100).toFixed(2) + "x";
}

/* ========================= STYLE ========================= */

function getStyleId(player) {
    var temp = player.getTempdata();
    var melee = readNumber(temp, K_STYLE_MELEE, 0);
    var ki = readNumber(temp, K_STYLE_KI, 0);
    var beam = readNumber(temp, K_STYLE_BEAM, 0);
    var blocks = readNumber(temp, K_STYLE_BLOCK, 0);
    var move = readNumber(temp, K_STYLE_MOVE, 0);
    var total = melee + ki;
    if (total < STYLE_SAMPLE_DAMAGE) return "none";

    var meleeRatio = melee / Math.max(1, total);
    var kiRatio = ki / Math.max(1, total);
    /* Beam share is measured against ki damage (beam ticks add to beam counter). */
    var beamRatio = beam / Math.max(1, Math.max(ki, total));
    var blockRatio = blocks / Math.max(1, total + blocks);

    if (beamRatio >= 0.35 && kiRatio >= 0.50) return "beam";
    if (blockRatio >= 0.35) return "guardian";
    if (meleeRatio >= 0.80) return "melee";
    if (kiRatio >= 0.80) return "ki";
    if (meleeRatio >= 0.35 && kiRatio >= 0.35) return "balanced";
    if (move > total) return "speed";
    return "none";
}

function getStyleMultiplier(player) {
    var id = getStyleId(player);
    if (STYLE_BONUS[id] != null) return STYLE_BONUS[id];
    return STYLE_BONUS.none;
}

function styleName(player) {
    var id = getStyleId(player);
    if (STYLE_NAMES[id] != null) return STYLE_NAMES[id];
    return STYLE_NAMES.none;
}

/* ========================= TP AWARD FROM COMBAT ========================= */

function flushPendingTpMessage(player) {
    if (!SHOW_TP_MESSAGES || player == null) return;
    var temp = player.getTempdata();
    var pending = Math.floor(readNumber(temp, K_TP_PENDING, 0));
    if (pending <= 0) return;
    var pendingMelee = Math.floor(readNumber(temp, K_TP_PENDING_MELEE, 0));
    var pendingKi = Math.floor(readNumber(temp, K_TP_PENDING_KI, 0));
    var pendingClash = Math.floor(readNumber(temp, K_TP_PENDING_CLASH, 0));
    putNumber(temp, K_TP_PENDING, 0);
    putNumber(temp, K_TP_PENDING_MELEE, 0);
    putNumber(temp, K_TP_PENDING_KI, 0);
    putNumber(temp, K_TP_PENDING_CLASH, 0);

    /*
     * Label from THIS TP burst's source first. Never show
     * "Melee Specialist" on a pure-ki payout (or the reverse).
     */
    var styleId = getStyleId(player);
    var label = "Combat";
    var pureClash = pendingClash > 0 && pendingMelee <= 0 && pendingKi <= 0;
    var pureKi = pendingKi > 0 && pendingMelee <= 0 && pendingClash <= 0;
    var pureMelee = pendingMelee > 0 && pendingKi <= 0 && pendingClash <= 0;

    if (pureClash) {
        label = styleId == "beam" ? STYLE_NAMES.beam : "Beam Clash";
    } else if (pureKi) {
        if (styleId == "ki") label = STYLE_NAMES.ki;
        else if (styleId == "beam") label = STYLE_NAMES.beam;
        else label = "Ki";
    } else if (pureMelee) {
        label = styleId == "melee" ? STYLE_NAMES.melee : "Melee";
    } else if (pendingKi > 0 && pendingMelee > 0) {
        if (styleId == "balanced") label = STYLE_NAMES.balanced;
        else if (styleId == "ki" || styleId == "beam") label = STYLE_NAMES[styleId];
        else if (styleId == "melee") label = STYLE_NAMES.melee;
        else label = "Mixed";
    } else if (styleId != "none" && STYLE_NAMES[styleId] != null) {
        label = STYLE_NAMES[styleId];
    }

    sendMessage(player, sparText(
        sparColor("6"), "[Sparring] ",
        sparColor("a"), "+", formatWholeNumber(pending), " TP",
        sparColor("8"), "  (", label, ")"
    ));
}

function queueTpMessage(player, amount, hitKind) {
    if (!SHOW_TP_MESSAGES) return;
    var temp = player.getTempdata();
    putNumber(temp, K_TP_PENDING, readNumber(temp, K_TP_PENDING, 0) + amount);
    var kind = hitKind ? String(hitKind).toLowerCase() : "";
    if (kind == "melee") {
        putNumber(temp, K_TP_PENDING_MELEE, readNumber(temp, K_TP_PENDING_MELEE, 0) + amount);
        putString(temp, K_LAST_HIT_KIND, "melee");
    } else if (kind == "beam" || kind == "clash" || kind == "beam-clash") {
        putNumber(temp, K_TP_PENDING_CLASH, readNumber(temp, K_TP_PENDING_CLASH, 0) + amount);
        putString(temp, K_LAST_HIT_KIND, "clash");
    } else if (kind != "") {
        putNumber(temp, K_TP_PENDING_KI, readNumber(temp, K_TP_PENDING_KI, 0) + amount);
        putString(temp, K_LAST_HIT_KIND, "ki");
    }
    var now = nowMs();
    if (now >= readNumber(temp, K_TP_MSG_NEXT, 0)) {
        putNumber(temp, K_TP_MSG_NEXT, now + TP_MESSAGE_COOLDOWN_MS);
        flushPendingTpMessage(player);
    }
}

function buildCombatMultiplier(player, partner) {
    var valuesA = getLiveTrainingValues(player);
    var valuesB = getLiveTrainingValues(partner);
    if (valuesA == null || valuesB == null) return null;

    /*
     * Weaker fighter's BP drives the shared training scale (v2).
     * Stops high-BP players from farming low-BP partners for huge TP,
     * while equal high-BP spars keep end-game payouts.
     */
    var trainingBP = Math.min(valuesA.bp, valuesB.bp);
    if (!(trainingBP > 0)) trainingBP = Math.max(valuesA.bp, valuesB.bp, 1);

    var averageRelease = (valuesA.release + valuesB.release) / 2.0;
    var averageGravity = (valuesA.gravity + valuesB.gravity) / 2.0;
    var averageWeight = (valuesA.weight + valuesB.weight) / 2.0;
    var perfect = isPerfectTraining(valuesA, valuesB);
    var bpMult = getBattlePowerMultiplier(trainingBP);

    return {
        valuesA: valuesA,
        valuesB: valuesB,
        perfect: perfect,
        trainingBP: trainingBP,
        bpMult: bpMult,
        total:
            bpMult *
            getRivalMultiplier(valuesA.bp, valuesB.bp) *
            getReleaseMultiplier(averageRelease) *
            getGravityMultiplier(averageGravity) *
            getWeightMultiplier(averageWeight) *
            getPrestigeMultiplier(valuesA.prestige) *
            getMomentumMultiplier(player) *
            getSessionBonusMultiplier(player) *
            getTrainingStreakMultiplier(player) *
            getStyleMultiplier(player) *
            (perfect ? PERFECT_TRAINING_MULTIPLIER : 1.0)
    };
}

function awardCombatTp(player, partner, baseAmount, reason, hitKind) {
    if (player == null || partner == null || !isSessionActive(player)) return 0;
    if (isInRivalChallenge(player) || isInRivalChallenge(partner)) return 0;
    baseAmount = Number(baseAmount);
    if (isNaN(baseAmount) || baseAmount <= 0) return 0;
    baseAmount = Math.min(MAX_BASE_TP_PER_HIT, baseAmount);

    var built = buildCombatMultiplier(player, partner);
    if (built == null) return 0;

    var amount = Math.floor(baseAmount * built.total * GLOBAL_TP_GAIN_MULT);
    if (amount <= 0) return 0;

    /* Apprentice bonus only while sparring with their single mentor. */
    if (isSparringWithOwnMentor(player, partner)) {
        amount = Math.floor(amount * (1.0 + MENTOR_SPAR_BONUS_PCT));
    }

    var actionCap = Math.floor(getMaxTpForAction(built.bpMult) * GLOBAL_TP_GAIN_MULT);
    if (isSparringWithOwnMentor(player, partner)) {
        actionCap = Math.floor(actionCap * (1.0 + MENTOR_SPAR_BONUS_PCT));
    }
    if (amount > actionCap) amount = actionCap;
    if (amount <= 0) return 0;

    if (!awardTrainingPoints(player, built.valuesA.data, amount)) return 0;

    var temp = player.getTempdata();
    putNumber(temp, K_SESSION_TP, readNumber(temp, K_SESSION_TP, 0) + amount);
    if (built.perfect) putNumber(temp, K_SESSION_PERFECT, 1);

    var kind = hitKind ? String(hitKind) : "";
    if (kind == "" && reason) {
        var r = String(reason).toLowerCase();
        if (r.indexOf("ki") == 0 || r.indexOf("beam") >= 0) kind = "ki";
        else if (r == "melee") kind = "melee";
    }
    queueTpMessage(player, amount, kind);
    shareTpWithMentor(player, amount);
    debug(player, reason + " +" + amount +
        " (base " + Math.floor(baseAmount) +
        " bp " + formatWholeNumber(built.trainingBP) +
        " x" + formatMult(built.bpMult) + ")");
    return amount;
}

function awardDamageTp(attacker, victim, damage, isKi, kiKind) {
    if (!isSessionActive(attacker) || !isSessionActive(victim)) return;
    if (getPartnerName(attacker).toLowerCase() != getPlayerName(victim).toLowerCase()) return;

    damage = Math.max(0, Number(damage));
    if (damage <= 0) return;

    var temp = attacker.getTempdata();
    putNumber(temp, K_SESSION_DMG, readNumber(temp, K_SESSION_DMG, 0) + damage);
    if (isKi) {
        putNumber(temp, K_SESSION_KI, readNumber(temp, K_SESSION_KI, 0) + damage);
        /* Damage-weighted style so "ki damage dealt" drives Ki Specialist. */
        putNumber(temp, K_STYLE_KI, readNumber(temp, K_STYLE_KI, 0) + damage);
        if (kiKind == "beam") {
            putNumber(temp, K_STYLE_BEAM, readNumber(temp, K_STYLE_BEAM, 0) + damage);
        }
    } else {
        putNumber(temp, K_SESSION_MELEE, readNumber(temp, K_SESSION_MELEE, 0) + damage);
        putNumber(temp, K_STYLE_MELEE, readNumber(temp, K_STYLE_MELEE, 0) + damage);
    }

    /* Blocked attacks break combo / Momentum instead of extending them. */
    if (isPlayerBlocking(victim)) {
        breakCombo(attacker, "attack blocked");
        return;
    }

    registerCombatHit(attacker);

    /* Knockback recovery proxy: hit shortly after heavy motion */
    var now = nowMs();
    if (now <= readNumber(temp, K_HEAVY_MOTION_UNTIL, 0)) {
        putNumber(temp, K_SESSION_KB, readNumber(temp, K_SESSION_KB, 0) + 1);
        awardCombatTp(attacker, victim, KNOCKBACK_RECOVERY_TP, "kb-recovery");
        putNumber(temp, K_HEAVY_MOTION_UNTIL, 0);
    }

    /*
     * BP-first payout (v2 curve):
     * fixed hit base × mild damage quality × efficiency × BP mult...
     * Damage no longer drives the bulk of the reward.
     */
    var eff = isKi ? kiEfficiency(kiKind) : MELEE_EFF;
    var base = BASE_TP_PER_HIT * getDamageQuality(damage) * eff;
    awardCombatTp(
        attacker,
        victim,
        base,
        isKi ? ("ki:" + kiKind) : "melee",
        isKi ? "ki" : "melee"
    );
}

/* ========================= HIT TRACKING / START ========================= */

function recordCombatExchange(attacker, target, isKi, kiKind) {
    if (attacker == null || target == null || isSamePlayer(attacker, target)) return;
    if (isInRivalChallenge(attacker) || isInRivalChallenge(target)) return;

    var now = nowMs();
    var aTemp = attacker.getTempdata();
    var tTemp = target.getTempdata();
    var aName = getPlayerName(attacker);
    var tName = getPlayerName(target);

    /*
     * While already sparring, only refresh outgoing hit activity toward
     * the spar partner. Hitting a third party must not poison the timer
     * and end the session.
     */
    var attackerSparring = isSessionActive(attacker);
    var stampOut = !attackerSparring ||
        namesMatch(getPartnerName(attacker), tName);

    if (stampOut) {
        putString(aTemp, K_LAST_OUT_PARTNER, tName);
        putNumber(aTemp, K_LAST_OUT_TIME, now);
        putString(tTemp, K_LAST_IN_PARTNER, aName);
        putNumber(tTemp, K_LAST_IN_TIME, now);

        if (isKi) {
            putNumber(aTemp, K_LAST_KI_OUT, now);
            /*
             * Beams often classify as "beam" or "other". Stamp laser time for
             * beam/charge and any ki so clash sustain can start from mutual ki.
             */
            if (kiKind == "beam" || kiKind == "charge" || kiKind == "other" || kiKind == "basic") {
                putNumber(aTemp, K_LAST_LASER_OUT, now);
            }
        }
    }

    if (isSessionActive(attacker) && isSessionActive(target)) return;
    if (isSessionActive(attacker) || isSessionActive(target)) return;

    /* Need reciprocal damage within start window */
    var outPartner = readString(tTemp, K_LAST_OUT_PARTNER, "");
    var outTime = readNumber(tTemp, K_LAST_OUT_TIME, 0);
    if (outPartner.toLowerCase() != aName.toLowerCase()) return;
    if (now - outTime > SESSION_START_WINDOW_MS) return;
    if (!sameWorld(attacker, target)) return;
    if (distanceBetween(attacker, target) > MAX_SPAR_DISTANCE) return;

    startSession(attacker, target);
}

function hasRecentOutgoingHit(player, partnerName) {
    var temp = player.getTempdata();
    if (readString(temp, K_LAST_OUT_PARTNER, "").toLowerCase() != String(partnerName).toLowerCase()) return false;
    return (nowMs() - readNumber(temp, K_LAST_OUT_TIME, 0)) <= HIT_ACTIVITY_WINDOW_MS;
}

/* ========================= LEADERBOARD / PROFILE ========================= */

function getLeaderboardStore(player) {
    /* Always pin to overworld so End/Nether sessions share one board. */
    try {
        var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
        var names = ["minecraft:overworld", "overworld"];
        for (var i = 0; i < names.length; i++) {
            try {
                var world = NpcAPI.Instance().getIWorld(names[i]);
                if (world != null) return world.getStoreddata();
            } catch (e1) {}
        }
    } catch (e) {}
    try { return player.world.getStoreddata(); } catch (e2) {
        try { return player.getWorld().getStoreddata(); } catch (e3) { return null; }
    }
}

function leaderboardSafeName(name) {
    return String(name).replace(/[^A-Za-z0-9_\-]/g, "_").toLowerCase();
}

function readLeaderboardNames(store) {
    if (store == null) return [];
    var raw = readString(store, LB_NAMES_KEY, "");
    if (raw == "") return [];
    var split = raw.split(",");
    var names = [];
    for (var i = 0; i < split.length; i++) {
        var n = String(split[i]).replace(/^\s+|\s+$/g, "");
        if (n != "") names.push(n);
    }
    return names;
}

function writeLeaderboardNames(store, names) {
    try { store.put(LB_NAMES_KEY, names.join(",")); } catch (e) {}
}

function ensureLeaderboardName(store, playerName) {
    var names = readLeaderboardNames(store);
    var lower = playerName.toLowerCase();
    for (var i = 0; i < names.length; i++) {
        if (String(names[i]).toLowerCase() == lower) return;
    }
    names.push(playerName);
    writeLeaderboardNames(store, names);
}

function recordSparringSessionCompleted(player) {
    var store = getLeaderboardStore(player);
    if (store == null) return;
    var name = getPlayerName(player);
    ensureLeaderboardName(store, name);
    var safe = leaderboardSafeName(name);
    putNumber(store, LB_SESSIONS_PREFIX + safe, readNumber(store, LB_SESSIONS_PREFIX + safe, 0) + 1);
}

function updateSparringLeaderboard(player) {
    if (!ENABLE_SPARRING_LEADERBOARD || player == null) return;
    var store = getLeaderboardStore(player);
    if (store == null) return;
    var temp = player.getTempdata();
    var name = getPlayerName(player);
    var safe = leaderboardSafeName(name);
    ensureLeaderboardName(store, name);

    var sessionTp = readNumber(temp, K_SESSION_TP, 0);
    var duration = Math.max(0, nowMs() - readNumber(temp, K_SESSION_START, nowMs()));

    putNumber(store, LB_TP_PREFIX + safe, readNumber(store, LB_TP_PREFIX + safe, 0) + sessionTp);
    putNumber(store, LB_TOTAL_TIME_PREFIX + safe, readNumber(store, LB_TOTAL_TIME_PREFIX + safe, 0) + duration);
    putNumber(store, LB_MELEE_PREFIX + safe, readNumber(store, LB_MELEE_PREFIX + safe, 0) + readNumber(temp, K_SESSION_MELEE, 0));
    putNumber(store, LB_KI_PREFIX + safe, readNumber(store, LB_KI_PREFIX + safe, 0) + readNumber(temp, K_SESSION_KI, 0));
    putNumber(store, LB_CLASH_PREFIX + safe, readNumber(store, LB_CLASH_PREFIX + safe, 0) + readNumber(temp, K_SESSION_CLASH_MS, 0));
    putNumber(store, LB_BLOCKS_PREFIX + safe, readNumber(store, LB_BLOCKS_PREFIX + safe, 0) + readNumber(temp, K_SESSION_BLOCKS, 0));

    var longest = readNumber(store, LB_LONGEST_PREFIX + safe, 0);
    if (duration > longest) putNumber(store, LB_LONGEST_PREFIX + safe, duration);

    var best = readNumber(store, LB_BEST_PAYOUT_PREFIX + safe, 0);
    if (sessionTp > best) putNumber(store, LB_BEST_PAYOUT_PREFIX + safe, sessionTp);

    var combo = readNumber(temp, K_SESSION_MAX_COMBO, 0);
    if (combo > readNumber(store, LB_HIGHEST_COMBO_PREFIX + safe, 0)) {
        putNumber(store, LB_HIGHEST_COMBO_PREFIX + safe, combo);
    }
    var mom = readNumber(temp, K_SESSION_MAX_MOM, 0);
    if (mom > readNumber(store, LB_MOMENTUM_PREFIX + safe, 0)) {
        putNumber(store, LB_MOMENTUM_PREFIX + safe, mom);
    }
    if (readNumber(temp, K_SESSION_PERFECT, 0) > 0) {
        putNumber(store, LB_PERFECT_PREFIX + safe, readNumber(store, LB_PERFECT_PREFIX + safe, 0) + 1);
    }

    var streak = getCurrentTrainingStreak(player);
    putNumber(store, LB_STREAK_PREFIX + safe, streak);
    var bestStreak = Math.max(streak, readNumber(store, LB_BEST_STREAK_PREFIX + safe, 0));
    putNumber(store, LB_BEST_STREAK_PREFIX + safe, bestStreak);
}

function showSparringLeaderboard(player) {
    /* Same Rival-style ranked card as /spar top */
    sparCmdShowTop(player, "tp");
}

/* ========================= SESSION TICK ========================= */

function clearGraceState(player, partner) {
    try {
        var t = player.getTempdata();
        putNumber(t, K_GRACE_UNTIL, 0);
        putString(t, K_GRACE_REASON, "");
        putNumber(t, K_GRACE_WARNED, 0);
    } catch (e) {}
    if (partner != null) {
        try {
            var t2 = partner.getTempdata();
            putNumber(t2, K_GRACE_UNTIL, 0);
            putString(t2, K_GRACE_REASON, "");
            putNumber(t2, K_GRACE_WARNED, 0);
        } catch (e2) {}
    }
}

function gracePeriodMsForReason(reason) {
    if (String(reason).indexOf("far") >= 0) return DISTANCE_GRACE_PERIOD_MS;
    return SESSION_GRACE_PERIOD_MS;
}

function handleRecoverableFailure(player, partner, reason) {
    var temp = player.getTempdata();
    var now = nowMs();
    var until = readNumber(temp, K_GRACE_UNTIL, 0);
    if (until <= 0) {
        until = now + gracePeriodMsForReason(reason);
        putNumber(temp, K_GRACE_UNTIL, until);
        putString(temp, K_GRACE_REASON, reason);
        putNumber(temp, K_GRACE_WARNED, 0);
        if (partner != null) {
            putNumber(partner.getTempdata(), K_GRACE_UNTIL, until);
            putString(partner.getTempdata(), K_GRACE_REASON, reason);
        }
    }
    if (SHOW_GRACE_WARNING && readNumber(temp, K_GRACE_WARNED, 0) <= 0) {
        putNumber(temp, K_GRACE_WARNED, 1);
        var left = Math.max(1, Math.ceil((until - now) / 1000));
        var msg = sparText(sparColor("6"), "[Sparring] ", sparColor("e"), "Recover within ", left, "s", sparColor("8"), " - ", reason);
        throttleMessage(player, K_MSG_NEXT, MESSAGE_COOLDOWN_MS, msg);
        if (partner != null) throttleMessage(partner, K_MSG_NEXT, MESSAGE_COOLDOWN_MS, msg);
    }
    if (now >= until) endSession(player, partner, reason);
}

function hasRecentBeamOrKi(player, windowMs) {
    var temp = player.getTempdata();
    var now = nowMs();
    var laserAge = now - readNumber(temp, K_LAST_LASER_OUT, 0);
    var kiAge = now - readNumber(temp, K_LAST_KI_OUT, 0);
    return laserAge <= windowMs || kiAge <= windowMs;
}

function refreshClashCombatActivity(player, partner) {
    if (player == null || partner == null) return;
    var now = nowMs();
    var aTemp = player.getTempdata();
    var bTemp = partner.getTempdata();
    var aName = getPlayerName(player);
    var bName = getPlayerName(partner);

    /* Keep hit-activity alive so the session timer cannot expire mid-clash.
       Do not refresh movement — clash path already skips the move gate. */
    putString(aTemp, K_LAST_OUT_PARTNER, bName);
    putNumber(aTemp, K_LAST_OUT_TIME, now);
    putString(bTemp, K_LAST_OUT_PARTNER, aName);
    putNumber(bTemp, K_LAST_OUT_TIME, now);
}

/* Resolve a CNPC player into a java.util.UUID for DMZ clash APIs. */
function getJavaUUID(player) {
    if (player == null) return null;
    try {
        var mc = null;
        try { mc = player.getMCEntity(); } catch (eMc) { mc = null; }
        if (mc != null) {
            /* Prefer Forge UUID object used by BeamClashManager.CLASHING_OWNERS */
            try {
                var forgeId = mc.m_20148_();
                if (forgeId != null) return forgeId;
            } catch (eForge) {}
            try {
                var uuid = mc.getUUID();
                if (uuid != null && typeof uuid !== "string") return uuid;
            } catch (eGet) {}
        }
    } catch (e1) {}
    if (JavaUUID == null) return null;
    try {
        var raw = getPlayerUUID(player);
        if (raw == null || raw == "") return null;
        return JavaUUID.fromString("" + raw);
    } catch (e2) {
        return null;
    }
}

function canQueryModClash(player, partner) {
    return BeamClashManager != null &&
        getJavaUUID(player) != null &&
        getJavaUUID(partner) != null;
}

/*
 * Real DMZ clash detection.
 * BeamClashManager cancels LivingAttackEvent while clashing, so damage
 * timestamps go stale. Query the mod's active clash set instead.
 */
function isPlayerBeamClashing(player) {
    if (player == null || BeamClashManager == null) return false;
    try {
        var id = getJavaUUID(player);
        if (id == null) return false;
        return BeamClashManager.isClashing(id) === true;
    } catch (e) {
        return false;
    }
}

/* True when both spar partners are in a real DMZ beam clash. */
function isModBeamClashActive(player, partner) {
    return isPlayerBeamClashing(player) && isPlayerBeamClashing(partner);
}

/*
 * Fallback when BeamClashManager / UUID lookup is unavailable.
 * Real clashes cancel damage, so this is best-effort only.
 */
function updateBeamClashFallback(player, partner) {
    if (player == null || partner == null) return false;

    var now = nowMs();
    var aTemp = player.getTempdata();
    var bTemp = partner.getTempdata();
    var until = Math.max(
        readNumber(aTemp, K_CLASH_UNTIL, 0),
        readNumber(bTemp, K_CLASH_UNTIL, 0)
    );
    var active = now <= until;

    var mutualRecent =
        hasRecentBeamOrKi(player, BEAM_CLASH_START_WINDOW_MS) &&
        hasRecentBeamOrKi(partner, BEAM_CLASH_START_WINDOW_MS);

    var aCharge = isPlayerChargingKi(player);
    var bCharge = isPlayerChargingKi(partner);
    var bothCharging = aCharge && bCharge;
    var eitherCharging = aCharge || bCharge;
    var eitherRecent =
        hasRecentBeamOrKi(player, BEAM_CLASH_START_WINDOW_MS) ||
        hasRecentBeamOrKi(partner, BEAM_CLASH_START_WINDOW_MS);

    var shouldHold = false;
    if (mutualRecent) shouldHold = true;
    else if (active && bothCharging) shouldHold = true;
    else if (active && eitherCharging && eitherRecent) shouldHold = true;
    else if (active && eitherRecent) shouldHold = true;

    if (shouldHold) {
        until = now + BEAM_CLASH_HOLD_MS;
        putNumber(aTemp, K_CLASH_UNTIL, until);
        putNumber(bTemp, K_CLASH_UNTIL, until);
        return true;
    }
    return now <= until;
}

function updateBeamClashState(player, partner) {
    if (player == null || partner == null) return false;

    /* Prefer the real mod clash state when UUID lookup works. */
    if (canQueryModClash(player, partner)) {
        if (isModBeamClashActive(player, partner)) {
            var now = nowMs();
            var holdUntil = now + BEAM_CLASH_HOLD_MS;
            putNumber(player.getTempdata(), K_CLASH_UNTIL, holdUntil);
            putNumber(partner.getTempdata(), K_CLASH_UNTIL, holdUntil);
            return true;
        }
        /* Soft linger right after a mod clash ends. */
        var linger = nowMs();
        return linger <= readNumber(player.getTempdata(), K_CLASH_UNTIL, 0) ||
            linger <= readNumber(partner.getTempdata(), K_CLASH_UNTIL, 0);
    }

    return updateBeamClashFallback(player, partner);
}

function isBeamClashActive(player, partner) {
    if (player == null || partner == null) return false;
    if (isModBeamClashActive(player, partner)) return true;
    var now = nowMs();
    return now <= readNumber(player.getTempdata(), K_CLASH_UNTIL, 0) ||
        now <= readNumber(partner.getTempdata(), K_CLASH_UNTIL, 0);
}

function processBeamClash(player, partner) {
    var active = updateBeamClashState(player, partner) || isBeamClashActive(player, partner);
    if (!active) return false;

    refreshClashCombatActivity(player, partner);

    /*
     * Only drip TP / style while the mod reports an active clash
     * (or the classpath fallback hold). Soft linger after a lock
     * ends keeps the session alive without padding payouts.
     */
    var paying = isModBeamClashActive(player, partner) ||
        (!canQueryModClash(player, partner) && updateBeamClashFallback(player, partner));
    if (!paying) return true;

    var now = nowMs();
    var next = readNumber(player.getTempdata(), K_CLASH_NEXT, 0);
    if (now < next) return true;
    putNumber(player.getTempdata(), K_CLASH_NEXT, now + BEAM_CLASH_TICK_MS);

    putNumber(player.getTempdata(), K_SESSION_CLASH_MS,
        readNumber(player.getTempdata(), K_SESSION_CLASH_MS, 0) + BEAM_CLASH_TICK_MS);
    putNumber(player.getTempdata(), K_STYLE_BEAM,
        readNumber(player.getTempdata(), K_STYLE_BEAM, 0) + 1);

    awardCombatTp(player, partner, BEAM_CLASH_TP_PER_TICK, "beam-clash", "beam");
    return true;
}

function processReleaseControl(player, partner) {
    var values = getLiveTrainingValues(player);
    if (values == null || values.release < HIGH_RELEASE_THRESHOLD) return;
    if (!hasRecentOutgoingHit(player, getPartnerName(player)) &&
        !isBeamClashActive(player, partner)) return;

    var now = nowMs();
    var next = readNumber(player.getTempdata(), K_RELEASE_CTRL_NEXT, 0);
    if (now < next) return;
    putNumber(player.getTempdata(), K_RELEASE_CTRL_NEXT, now + 1000);
    awardCombatTp(player, partner, RELEASE_CONTROL_TP_PER_SEC, "release-control");
}

function processPerfectBanner(player, partner) {
    var valuesA = getLiveTrainingValues(player);
    var valuesB = getLiveTrainingValues(partner);
    if (!isPerfectTraining(valuesA, valuesB)) return;
    putNumber(player.getTempdata(), K_SESSION_PERFECT, 1);
    var now = nowMs();
    if (now < readNumber(player.getTempdata(), K_PERFECT_NEXT, 0)) return;
    putNumber(player.getTempdata(), K_PERFECT_NEXT, now + PERFECT_ACTIONBAR_MS);
    /* CNPC has no reliable action bar API; use a compact chat pulse. */
    sendMessage(player, sparText(sparColor("6"), sparColor("l"), "PERFECT TRAINING ACTIVE", sparColor("r")));
}

function processSession(player) {
    if (!isSessionActive(player)) return;
    if (suppressSparringForChallenge(player)) return;

    var partnerName = getPartnerName(player);
    if (partnerName == "" || partnerName.toLowerCase() == getPlayerName(player).toLowerCase()) {
        clearSelfHitTracking(player);
        clearSessionData(player);
        return;
    }

    var partner = getPlayerByName(player, partnerName);
    if (partner == null) {
        endSession(player, null, "partner left or changed worlds");
        return;
    }
    if (isSamePlayer(player, partner)) {
        clearSessionData(player);
        return;
    }
    if (!sameWorld(player, partner)) {
        endSession(player, partner, "fighters changed dimensions");
        return;
    }

    /*
     * Friendly Fist heal before alive/activity checks.
     * DMZ leaves the victim at 1 HP + knocked down; heal them immediately
     * so the spar does not end as a defeat.
     */
    try { processFriendlyFistKnockdownHeal(player, partner); } catch (eFf) {}

    if (!isAlive(player) || !isAlive(partner)) {
        /*
         * If Friendly Fist should have saved them, retry once more before
         * treating this as a real defeat.
         */
        try { processFriendlyFistKnockdownHeal(player, partner); } catch (eFf2) {}
        if (!isAlive(player) || !isAlive(partner)) {
            if (!(isFriendlyFistOn(player) || isFriendlyFistOn(partner))) {
                endSession(player, partner, "a fighter was defeated");
                return;
            }
            /* FF on — keep session for another tick while heal retries. */
            if (isAlive(player)) markFriendlyFistHealPending(partner);
            if (isAlive(partner)) markFriendlyFistHealPending(player);
            return;
        }
    }
    if (getPartnerName(partner).toLowerCase() != getPlayerName(player).toLowerCase() ||
        !isSessionActive(partner)) {
        endSession(player, partner, "session data no longer matched");
        return;
    }

    updateMovement(player);

    /*
     * Clash first: beam locks often stop damage ticks, which used to trip
     * the hit-activity timer and end the spar before the clash finished.
     * Ki charge holds the same way — fighters stand still while winding up.
     */
    var inClash = processBeamClash(player, partner);
    var inKiCharge = false;
    try { inKiCharge = holdSparForKiCharge(player, partner); } catch (eKiHold) {}

    var failureReason = "";
    if (distanceBetween(player, partner) > MAX_SPAR_DISTANCE) {
        failureReason = "fighters moved too far apart";
    } else if (!inClash && !inKiCharge) {
        if (
            !hasRecentOutgoingHit(player, partnerName) ||
            !hasRecentOutgoingHit(partner, getPlayerName(player))
        ) {
            failureReason = "both fighters must resume exchanging damage";
        } else if (!hasRecentMovement(player) || !hasRecentMovement(partner)) {
            failureReason = "both fighters must resume moving";
        }
    }

    if (failureReason != "") {
        handleRecoverableFailure(player, partner, failureReason);
        return;
    }

    clearGraceState(player, partner);

    /* Expire momentum visually */
    getMomentumMultiplier(player);

    processReleaseControl(player, partner);
    processPerfectBanner(player, partner);

    /* Flush batched TP chat if due */
    var now = nowMs();
    if (now >= readNumber(player.getTempdata(), K_TP_MSG_NEXT, 0)) {
        if (readNumber(player.getTempdata(), K_TP_PENDING, 0) > 0) {
            putNumber(player.getTempdata(), K_TP_MSG_NEXT, now + TP_MESSAGE_COOLDOWN_MS);
            flushPendingTpMessage(player);
        }
    }
}

/* ========================= HP RECEIVED (post-mitigation) ========================= */

function getHealthPool(player) {
    var health = 0;
    var absorption = 0;
    if (player == null) return 0;
    try { health = Number(player.getHealth()); } catch (e1) { health = 0; }
    try {
        if (typeof player.getAbsorptionAmount == "function") {
            absorption = Number(player.getAbsorptionAmount());
        } else if (typeof player.getAbsorption == "function") {
            absorption = Number(player.getAbsorption());
        }
    } catch (e2) {}
    try {
        var mc = player.getMCEntity();
        if (mc != null) {
            if (!(absorption > 0)) {
                try { absorption = Number(mc.getAbsorptionAmount()); } catch (e3) {}
            }
            if (!(health > 0)) {
                try { health = Number(mc.getHealth()); } catch (e4) {}
            }
        }
    } catch (e5) {}
    if (isNaN(health) || health < 0) health = 0;
    if (isNaN(absorption) || absorption < 0) absorption = 0;
    return health + absorption;
}

function sampleHealthPool(player) {
    if (player == null) return;
    try {
        putNumber(player.getTempdata(), K_HP_SAMPLE, getHealthPool(player));
    } catch (e) {}
}

/*
 * LivingHurt has not applied mitigation yet. Snapshot the pool and
 * measure the drop on the next tick (same pattern as Rival challenges).
 *
 * Queue from BOTH:
 *  - victim damaged (melee-friendly)
 *  - attacker damagedEntity (kiblast owner attribution — required for ki)
 * Never demote an already-pending ki hit to melee if a later event
 * fails isKiAttack.
 */
function queueReceivedHit(victim, attacker, isKi, kiKind) {
    if (victim == null || attacker == null) return;
    try {
        var temp = victim.getTempdata();
        var pool = getHealthPool(victim);
        if (!temp.has(K_PENDING_SAMPLE) || readNumber(temp, K_PENDING_SAMPLE, -1) < 0) {
            putNumber(temp, K_PENDING_SAMPLE, pool);
        }
        putString(temp, K_PENDING_ATK, getPlayerName(attacker));

        var alreadyKi = readString(temp, K_PENDING_KI, "0") == "1";
        if (isKi === true || alreadyKi) {
            putString(temp, K_PENDING_KI, "1");
            if (isKi === true) {
                putString(temp, K_PENDING_KI_KIND, String(kiKind || "other"));
            } else {
                var prevKind = readString(temp, K_PENDING_KI_KIND, "");
                if (prevKind == "" || prevKind == "melee") {
                    putString(temp, K_PENDING_KI_KIND, "other");
                }
            }
        } else {
            putString(temp, K_PENDING_KI, "0");
            putString(temp, K_PENDING_KI_KIND, "melee");
        }

        putNumber(temp, K_PENDING_UNTIL, nowMs() + PENDING_HP_RESOLVE_MS);
    } catch (e) {}
}

function resolvePendingReceived(player) {
    if (player == null || !isSessionActive(player)) return false;
    var temp = null;
    try { temp = player.getTempdata(); } catch (e0) { return false; }
    if (temp == null || !temp.has(K_PENDING_UNTIL)) return false;

    var until = readNumber(temp, K_PENDING_UNTIL, 0);
    if (nowMs() < until) return false;

    var sample = readNumber(temp, K_PENDING_SAMPLE, -1);
    var atkName = readString(temp, K_PENDING_ATK, "");
    var isKi = readString(temp, K_PENDING_KI, "0") == "1";
    var kiKind = readString(temp, K_PENDING_KI_KIND, isKi ? "other" : "melee");

    clearPendingHpSample(player);

    if (sample < 0 || atkName == "") {
        sampleHealthPool(player);
        return false;
    }

    var nowPool = getHealthPool(player);
    var received = sample - nowPool;
    sampleHealthPool(player);

    /*
     * Prefer real HP/absorption lost. If a kiblast LivingHurt landed but
     * DMZ fully negated LivingDamage, still credit a token floor so ki
     * training registers (beam clash already drips separately).
     */
    if (!(received > 0.01)) {
        if (isKi === true) received = KI_FULL_MIT_FLOOR;
        else return false;
    }

    var partnerName = getPartnerName(player);
    if (partnerName == "" || partnerName.toLowerCase() != atkName.toLowerCase()) return false;

    var attacker = getPlayerByName(player, atkName);
    if (attacker == null || !isSessionActive(attacker)) return false;
    if (!sameWorld(player, attacker)) return false;

    putNumber(temp, K_SESSION_TAKEN, readNumber(temp, K_SESSION_TAKEN, 0) + received);
    awardDamageTp(attacker, player, received, isKi, kiKind);
    return true;
}

function resolveAttackerFromDamaged(event, victim) {
    var source = null;
    try { source = event.source; } catch (e1) {}
    if (source != null) {
        try { if (Number(source.getType()) === 1) return source; } catch (e2) {}
    }
    try {
        var ds = null;
        try { ds = event.damageSource; } catch (e3) { ds = null; }
        if (ds == null) {
            try { ds = event.source; } catch (e4) {}
        }
        if (ds != null) {
            var cand = null;
            try { if (typeof ds.getTrueSource == "function") cand = ds.getTrueSource(); } catch (e5) {}
            if (cand == null) {
                try { if (typeof ds.getSourceEntity == "function") cand = ds.getSourceEntity(); } catch (e6) {}
            }
            if (cand == null) {
                try { if (typeof ds.getImmediateSource == "function") cand = ds.getImmediateSource(); } catch (e7) {}
            }
            if (cand != null) {
                try { if (Number(cand.getType()) === 1) return cand; } catch (e8) {}
            }
        }
    } catch (e9) {}
    /*
     * Do NOT fall back to the spar partner. Fall/fire/mob/DoT would then
     * score as partner hits. damagedEntity already queues partner kiblasts.
     */
    return null;
}

/* ========================= EVENTS ========================= */

function tick(event) {
    var player = event.player;
    if (player == null) return;
    try {
        if (suppressSparringForChallenge(player)) return;

        /*
         * Resolve received HP loss before the 250ms session throttle so
         * post-mitigation samples land on the first tick after the hit.
         */
        try {
            if (resolvePendingReceived(player)) {
                /* scored */
            } else if (isSessionActive(player)) {
                var t0 = player.getTempdata();
                if (!t0.has(K_PENDING_UNTIL)) sampleHealthPool(player);
            }
        } catch (eHp) {}

        var temp = player.getTempdata();
        var now = nowMs();
        if (now < readNumber(temp, K_TICK_NEXT, 0)) return;
        putNumber(temp, K_TICK_NEXT, now + 250);
        processSession(player);
    } catch (e) {
        try { print("[Sparring v3] tick " + e); } catch (x) {}
    }
}

function damagedEntity(event) {
    try {
        var attacker = event.player;
        var target = event.target;
        if (attacker == null || target == null) return;
        try { if (Number(target.getType()) !== 1) return; } catch (eType) { return; }
        if (isSamePlayer(attacker, target)) return;
        if (suppressSparringForChallenge(attacker) || isInRivalChallenge(target)) return;

        /*
         * Do NOT award from event.damage (LivingHurt pre-mitigation).
         * Still queue an HP-received sample here: kiblast LivingHurt is
         * owner-attributed on damagedEntity, while victim damaged often
         * misses projectile sources — that is why ki stopped scoring.
         */
        var ki = isKiAttack(event);
        var kiKind = ki ? classifyKiType(event) : "melee";

        recordCombatExchange(attacker, target, ki, kiKind);

        if (isSessionActive(attacker) && isSessionActive(target)) {
            if (getPartnerName(attacker).toLowerCase() == getPlayerName(target).toLowerCase()) {
                queueReceivedHit(target, attacker, ki, kiKind);
                if (isFriendlyFistOn(attacker)) {
                    markFriendlyFistHealPending(target);
                }
            }
            if (ki) {
                try { updateBeamClashState(attacker, target); } catch (eClash) {}
            }
        }
    } catch (error) {
        try { print("[Sparring v3] damagedEntity " + error); } catch (x) {}
    }
}

function damaged(event) {
    try {
        var victim = event.player;
        if (victim == null) return;
        if (suppressSparringForChallenge(victim)) return;
        if (!isSessionActive(victim)) return;

        var partnerName = getPartnerName(victim);
        if (partnerName == "") return;
        var partner = getPlayerByName(victim, partnerName);
        if (partner == null) return;

        var attacker = resolveAttackerFromDamaged(event, victim);
        if (attacker != null &&
            getPlayerName(attacker).toLowerCase() == partnerName.toLowerCase()) {
            var ki = isKiAttack(event);
            var kiKind = ki ? classifyKiType(event) : "melee";
            /* Snapshot pool now; tick awards from real HP/absorption lost. */
            queueReceivedHit(victim, attacker, ki, kiKind);
            if (isFriendlyFistOn(attacker)) {
                markFriendlyFistHealPending(victim);
            }

            if (isPlayerBlocking(victim)) {
                var temp = victim.getTempdata();
                putNumber(temp, K_SESSION_BLOCKS, readNumber(temp, K_SESSION_BLOCKS, 0) + 1);
                putNumber(temp, K_STYLE_BLOCK, readNumber(temp, K_STYLE_BLOCK, 0) + 1);
                awardCombatTp(victim, partner, BLOCK_TP_BASE, "block");

                /* Successful block snaps the attacker's combo / Momentum. */
                if (breakCombo(partner, "attack blocked")) {
                    if (SHOW_COMBO_BREAK_MESSAGES === true) {
                        throttleMessage(
                            victim,
                            K_COMBO_BREAK_MSG,
                            COMBO_BREAK_MSG_COOLDOWN_MS,
                            sparText(
                                sparColor("6"), "[Sparring] ",
                                sparColor("a"), "Block! ",
                                sparColor("7"), "Opponent combo broken"
                            )
                        );
                    }
                }
            }
        }

        /*
         * Perfect block: no DMZ API available yet.
         * Reserved hook — enable when status exposes a perfect-block flag.
         */
    } catch (error) {
        try { print("[Sparring v3] damaged " + error); } catch (x) {}
    }
}

function logout(event) {
    try {
        var player = event.player;
        if (player == null || !isSessionActive(player)) return;
        var partner = getPlayerByName(player, getPartnerName(player));
        endSession(player, partner, "a fighter logged out");
    } catch (e) {}
}

function died(event) {
    try {
        var player = event.player;
        if (player == null || !isSessionActive(player)) return;
        var partner = getPlayerByName(player, getPartnerName(player));
        /*
         * Friendly Fist should prevent true death (KD at 1 HP). If died
         * still fires, try the spar heal instead of ending the session.
         */
        if (partner != null && (isFriendlyFistOn(partner) || isFriendlyFistOn(player))) {
            markFriendlyFistHealPending(player);
            try { processFriendlyFistKnockdownHeal(partner, player); } catch (eFf) {}
            if (isAlive(player) || needsFriendlyFistHeal(player) || isPlayerKnockedDown(player)) {
                return;
            }
        }
        endSession(player, partner, "a fighter was defeated");
    } catch (e) {}
}

/* ========================= /spar COMMANDS (trigger) ========================= */

function sparCmdArgAt(event, index) {
    try {
        if (event != null && event.arguments != null && event.arguments.length > index) {
            var value = String(event.arguments[index]).replace(/^\s+|\s+$/g, "");
            if (value == "" || value.toLowerCase() == "null") return "";
            return value;
        }
    } catch (e) {}
    return "";
}

function sparCmdArgsFrom(event, start) {
    var out = [];
    try {
        if (event.arguments != null) {
            for (var i = start; i < event.arguments.length; i++) {
                var piece = String(event.arguments[i]).replace(/^\s+|\s+$/g, "");
                if (piece == "" || piece.toLowerCase() == "null") continue;
                out.push(piece);
            }
        }
    } catch (e) {}
    return out;
}

/*
 * ScriptTriggerEvent often has event.entity / arguments[0], not event.player.
 * CMI asFakeOp can also make event.player a fake player — prefer name lookup.
 */
function resolveSparCommandPlayer(event) {
    var arg0 = sparCmdArgAt(event, 0);
    if (arg0 != "") {
        var byName = getPlayerByName(null, arg0);
        if (byName != null) return byName;
        try {
            var bp = Bukkit.getPlayerExact(arg0);
            if (bp == null) bp = Bukkit.getPlayer(arg0);
            if (bp != null) {
                var found = getPlayerByName(null, String(bp.getName()));
                if (found != null) return found;
            }
        } catch (eBukkit) {}
    }

    try { if (event.player != null) return event.player; } catch (e1) {}
    try { if (event.entity != null) return event.entity; } catch (e2) {}
    return null;
}

/* Rival-style command cards */
function uiLine(player) {
    sendMessage(player, sparColor("8") + "--------------------------------");
}
function uiBlank(player) {
    sendMessage(player, " ");
}
function uiHead(player, title) {
    uiLine(player);
    sendMessage(player, sparColor("6") + sparColor("l") + " " + title + " " + sparColor("r"));
    uiLine(player);
}
function uiFoot(player) {
    uiLine(player);
}
function uiSection(player, title) {
    sendMessage(player, sparColor("6") + title);
}
function uiProp(player, label, value) {
    sendMessage(player, sparColor("8") + label + "  " + value);
}
function uiCmd(player, cmd, desc) {
    if (desc != null && desc != "") {
        sendMessage(player, sparColor("e") + "  " + cmd + sparColor("8") + "  " + desc);
    } else {
        sendMessage(player, sparColor("e") + "  " + cmd);
    }
}
function uiBanner(player, tag, text) {
    sendMessage(player, sparColor("6") + "[" + tag + "] " + text);
}

function sparCmdHelp(player) {
    uiHead(player, "SPARRING SYSTEM");
    uiProp(player, "Train", sparColor("7") + "Fight each other " + sparColor("8") + "(" +
        sparColor("f") + "melee" + sparColor("8") + " or " + sparColor("f") + "ki" + sparColor("8") + ") to start");
    uiProp(player, "Pay", sparColor("7") + "TP from combat actions" + sparColor("8") + "  |  " +
        sparColor("a") + "+50%" + sparColor("7") + " global");
    uiProp(player, "Bonus", sparColor("7") + "Momentum" + sparColor("8") + "  |  " +
        sparColor("7") + "Session" + sparColor("8") + "  |  " +
        sparColor("7") + "Streak" + sparColor("8") + "  |  " +
        sparColor("7") + "Perfect" + sparColor("8") + "  |  " +
        sparColor("7") + "Style" + sparColor("8") + "  |  " +
        sparColor("7") + "Mentor");
    uiBlank(player);
    uiSection(player, "Training");
    uiCmd(player, "/spar", "this help menu");
    uiCmd(player, "/spar stats [player]", "personal sparring record");
    uiCmd(player, "/spar top [tp|streak|session|payout|perfect|time|combo|clash]", "");
    uiBlank(player);
    uiSection(player, "Your Mentor Bond");
    try { reconcileMentorBond(player); } catch (eR) {}
    var helpMentor = getBondMentorName(player);
    var helpApp = getBondApprenticeName(player);
    uiProp(player, "Mentor", helpMentor != "" ? sparColor("f") + helpMentor : sparColor("8") + "none");
    uiProp(player, "Apprentice", helpApp != "" ? sparColor("f") + helpApp : sparColor("8") + "none");
    var helpInvite = readBondInvite(player);
    if (helpInvite != null) {
        if (helpInvite.kind == "mentor") {
            sendMessage(player, sparColor("e") + helpInvite.from + sparColor("7") +
                " wants you as their Mentor.");
        } else {
            sendMessage(player, sparColor("e") + helpInvite.from + sparColor("7") +
                " wants you as their Apprentice.");
        }
        sendMessage(player, sparColor("8") + "Use  " + sparColor("e") + "/spar mentor accept" +
            sparColor("8") + "  or  " + sparColor("e") + "/spar mentor deny");
    }
    uiBlank(player);
    uiSection(player, "Mentor Commands");
    uiCmd(player, "/spar mentor", "bond status");
    uiCmd(player, "/spar mentor <player>", "ask them to mentor you");
    uiCmd(player, "/spar apprentice <player>", "ask them to be your apprentice");
    uiCmd(player, "/spar mentor accept | deny | clear", "");
    uiCmd(player, "/spar apprentice clear", "release your apprentice");
    uiBlank(player);
    uiSection(player, "Shortcuts");
    uiCmd(player, "/sparstats", "same as /spar stats");
    uiCmd(player, "/spartop", "same as /spar top");
    uiCmd(player, "/sparmentor | /sparapprentice | /sparbond", "mentor shortcuts");
    uiCmd(player, "/sparstreak | /sparsession | /sparpayout", "");
    uiCmd(player, "/sparperfect | /spartime | /sparhelp", "");
    uiBlank(player);
    sendMessage(player, sparColor("8") + "Stay active: trade damage, move, and keep the fight going.");
    sendMessage(player, sparColor("8") + "Friendly Fist knockdowns during a spar heal your partner.");
    uiFoot(player);
}

function sparCmdLoadProfile(store, playerName) {
    var safe = leaderboardSafeName(playerName);
    return {
        name: playerName,
        totalTP: readNumber(store, LB_TP_PREFIX + safe, 0),
        sessions: readNumber(store, LB_SESSIONS_PREFIX + safe, 0),
        totalTime: readNumber(store, LB_TOTAL_TIME_PREFIX + safe, 0),
        longest: readNumber(store, LB_LONGEST_PREFIX + safe, 0),
        bestPayout: readNumber(store, LB_BEST_PAYOUT_PREFIX + safe, 0),
        perfect: readNumber(store, LB_PERFECT_PREFIX + safe, 0),
        combo: readNumber(store, LB_HIGHEST_COMBO_PREFIX + safe, 0),
        momentum: readNumber(store, LB_MOMENTUM_PREFIX + safe, 0),
        clash: readNumber(store, LB_CLASH_PREFIX + safe, 0),
        melee: readNumber(store, LB_MELEE_PREFIX + safe, 0),
        ki: readNumber(store, LB_KI_PREFIX + safe, 0),
        blocks: readNumber(store, LB_BLOCKS_PREFIX + safe, 0),
        currentStreak: readNumber(store, LB_STREAK_PREFIX + safe, 0),
        bestStreak: readNumber(store, LB_BEST_STREAK_PREFIX + safe, 0)
    };
}

function sparCmdShowPersonal(player, targetName) {
    var store = getLeaderboardStore(player);
    if (store == null) {
        uiBanner(player, "Sparring", sparColor("c") + "Could not access stored data.");
        return;
    }
    var wanted = String(targetName || "").replace(/^\s+|\s+$/g, "");
    if (wanted == "") wanted = getPlayerName(player);
    var online = getPlayerByName(player, wanted);
    var displayName = online != null ? getPlayerName(online) : wanted;
    var profile = sparCmdLoadProfile(store, displayName);
    var streakCurrent = online != null ? getCurrentTrainingStreak(online) : Math.max(0, profile.currentStreak);
    var streakBest = Math.max(profile.bestStreak, streakCurrent);

    if (
        profile.totalTP <= 0 && profile.sessions <= 0 && profile.totalTime <= 0 &&
        streakCurrent <= 0 && streakBest <= 0
    ) {
        uiBanner(player, "Sparring", sparColor("c") + "No record for " + displayName);
        sendMessage(player, sparColor("8") + "Start a session by fighting another player (melee or ki).");
        return;
    }

    uiHead(player, "SPARRING STATS");
    uiProp(player, "Player", sparColor("f") + displayName);
    uiProp(player, "Total TP", sparColor("a") + formatWholeNumber(profile.totalTP) +
        sparColor("8") + "  Best  " + sparColor("a") + formatWholeNumber(profile.bestPayout) + " TP");
    uiBlank(player);
    uiProp(player, "Sessions", sparColor("f") + formatWholeNumber(profile.sessions));
    uiProp(player, "Time", sparColor("b") + formatDuration(profile.totalTime) +
        sparColor("8") + "   Longest  " + sparColor("b") + formatDuration(profile.longest));
    uiProp(player, "Damage", sparColor("f") + formatWholeNumber(profile.melee) + sparColor("7") + " melee" +
        sparColor("8") + "  " + sparColor("b") + formatWholeNumber(profile.ki) + sparColor("7") + " ki");
    uiProp(player, "Defense", sparColor("7") + formatWholeNumber(profile.blocks) + " blocks" +
        sparColor("8") + "   Clash  " + sparColor("d") + formatDuration(profile.clash));
    uiProp(player, "Perfect", sparColor("d") + formatWholeNumber(profile.perfect) +
        sparColor("8") + "   Combo  " + sparColor("e") + formatWholeNumber(profile.combo) +
        sparColor("8") + "   Momentum  " + sparColor("e") + formatWholeNumber(profile.momentum));
    uiProp(player, "Streak", sparColor("6") + formatWholeNumber(streakCurrent) + " days" +
        sparColor("8") + "   Best  " + sparColor("6") + formatWholeNumber(streakBest) + " days");
    if (online != null) {
        uiBlank(player);
        uiSection(player, "Mentor Bond");
        try { reconcileMentorBond(online); } catch (eR2) {}
        var stMentor = getBondMentorName(online);
        var stApp = getBondApprenticeName(online);
        uiProp(player, "Mentor", stMentor != "" ? sparColor("f") + stMentor : sparColor("8") + "none");
        uiProp(player, "Apprentice", stApp != "" ? sparColor("f") + stApp : sparColor("8") + "none");
    }
    uiFoot(player);
}

function sparCmdTopInfo(category) {
    var cat = String(category || "tp").toLowerCase();
    if (cat == "streak" || cat == "streaks" || cat == "days") {
        return { key: LB_STREAK_PREFIX, title: "TOP TRAINING STREAKS", kind: "days" };
    }
    if (cat == "session" || cat == "sessions" || cat == "longest" || cat == "long") {
        return { key: LB_LONGEST_PREFIX, title: "LONGEST SPARRING SESSIONS", kind: "time" };
    }
    if (cat == "payout" || cat == "payouts" || cat == "best" || cat == "hit") {
        return { key: LB_BEST_PAYOUT_PREFIX, title: "HIGHEST SPARRING PAYOUTS", kind: "tp" };
    }
    if (cat == "perfect" || cat == "perfects") {
        return { key: LB_PERFECT_PREFIX, title: "PERFECT TRAINING SESSIONS", kind: "count" };
    }
    if (cat == "time" || cat == "total" || cat == "duration" || cat == "hours") {
        return { key: LB_TOTAL_TIME_PREFIX, title: "TOTAL SPARRING TIME", kind: "time" };
    }
    if (cat == "combo" || cat == "combos" || cat == "hits") {
        return { key: LB_HIGHEST_COMBO_PREFIX, title: "HIGHEST COMBOS", kind: "count" };
    }
    if (cat == "clash" || cat == "beam" || cat == "beams") {
        return { key: LB_CLASH_PREFIX, title: "MOST BEAM CLASH TIME", kind: "time" };
    }
    if (cat == "momentum" || cat == "mom") {
        return { key: LB_MOMENTUM_PREFIX, title: "HIGHEST MOMENTUM", kind: "count" };
    }
    return { key: LB_TP_PREFIX, title: "TOP SPARRING TP", kind: "tp" };
}

function sparCmdShowTop(player, category) {
    var store = getLeaderboardStore(player);
    if (store == null) {
        uiBanner(player, "Sparring", sparColor("c") + "Could not access stored data.");
        return;
    }
    var info = sparCmdTopInfo(category);
    var names = readLeaderboardNames(store);
    var rows = [];
    for (var i = 0; i < names.length; i++) {
        var safe = leaderboardSafeName(names[i]);
        rows.push({
            name: names[i],
            value: readNumber(store, info.key + safe, 0)
        });
    }
    rows.sort(function (a, b) { return b.value - a.value; });

    uiHead(player, info.title);

    if (rows.length == 0 || rows[0].value <= 0) {
        sendMessage(player, sparColor("8") + "No records have been saved yet.");
        uiFoot(player);
        return;
    }

    var shown = 0;
    for (var r = 0; r < rows.length && shown < LEADERBOARD_SIZE; r++) {
        if (rows[r].value <= 0) continue;
        shown++;
        var placeColor = shown == 1 ? "6" : (shown == 2 ? "7" : (shown == 3 ? "e" : "8"));
        var valueText = "";
        if (info.kind == "time") valueText = formatDuration(rows[r].value);
        else if (info.kind == "days") valueText = formatWholeNumber(rows[r].value) + " days";
        else if (info.kind == "tp") valueText = formatWholeNumber(rows[r].value) + " TP";
        else valueText = formatWholeNumber(rows[r].value);

        sendMessage(player,
            sparColor(placeColor) + "#" + shown +
            sparColor("f") + "  " + rows[r].name +
            sparColor("8") + "  ........  " +
            sparColor("a") + valueText
        );
    }
    uiFoot(player);
}

function claimSparCommand(player) {
    if (player == null) return false;
    try {
        var temp = player.getTempdata();
        var now = nowMs();
        if (now - readNumber(temp, "spar.cmd.handledAt", 0) < 750) return false;
        putNumber(temp, "spar.cmd.handledAt", now);
        return true;
    } catch (e) {
        return true;
    }
}

function sparCmdRouteParts(player, parts) {
    if (parts == null || parts.length == 0) {
        sparCmdHelp(player);
        return;
    }
    var sub = String(parts[0]).toLowerCase();
    var arg = parts.length > 1 ? parts[1] : "";

    if (sparCmdRouteBond(player, parts)) {
        return;
    }

    if (sub == "help" || sub == "?" || sub == "commands") {
        sparCmdHelp(player);
    } else if (sub == "stats" || sub == "stat" || sub == "me" || sub == "record") {
        sparCmdShowPersonal(player, arg);
    } else if (sub == "top" || sub == "leaderboard" || sub == "lb") {
        sparCmdShowTop(player, arg == "" ? "tp" : arg);
    } else if (
        sub == "streak" || sub == "streaks" || sub == "session" || sub == "sessions" ||
        sub == "longest" || sub == "payout" || sub == "payouts" || sub == "perfect" ||
        sub == "perfects" || sub == "time" || sub == "combo" || sub == "combos" ||
        sub == "clash" || sub == "beam" || sub == "momentum" || sub == "tp"
    ) {
        sparCmdShowTop(player, sub);
    } else {
        uiBanner(player, "Sparring", sparColor("c") + "Unknown command.");
        sendMessage(player, sparColor("8") + "Use  " + sparColor("e") + "/spar help");
    }
}

function sparCmdRoute(player, event) {
    sparCmdRouteParts(player, sparCmdArgsFrom(event, 1));
}

/*
 * Parse "/spar help", "./spar stats", ".spar top tp", "!spar", "sparhelp".
 * Returns parts after the spar keyword, or null if not a spar command.
 */
function parseSparCommandLine(line) {
    if (line == null) return null;
    var text = String(line).replace(/^\s+/, "").replace(/\s+$/, "");
    if (text == "") return null;

    /* Normalize ./spar, /.spar, /spar, .spar, !spar */
    text = text.replace(/^\.\//, "").replace(/^\/\./, "").replace(/^[\/.\!]+/, "");
    var lower = text.toLowerCase();

    if (lower == "spar" || lower.indexOf("spar ") == 0) {
        var rest = text.length > 4 ? text.substring(4).replace(/^\s+/, "") : "";
        if (rest == "") return [];
        return rest.split(/\s+/);
    }

    if (lower == "sparhelp" || lower.indexOf("sparhelp ") == 0) return ["help"];
    if (lower == "sparstats" || lower.indexOf("sparstats ") == 0) {
        var sRest = text.length > 9 ? text.substring(9).replace(/^\s+/, "") : "";
        if (sRest == "") return ["stats"];
        return ["stats"].concat(sRest.split(/\s+/));
    }
    if (lower == "spartop" || lower.indexOf("spartop ") == 0) {
        var tRest = text.length > 7 ? text.substring(7).replace(/^\s+/, "") : "";
        if (tRest == "") return ["top"];
        return ["top"].concat(tRest.split(/\s+/));
    }
    if (lower == "sparstreak") return ["top", "streak"];
    if (lower == "sparsession" || lower == "sparlongest") return ["top", "session"];
    if (lower == "sparpayout") return ["top", "payout"];
    if (lower == "sparperfect") return ["top", "perfect"];
    if (lower == "spartime") return ["top", "time"];
    if (lower == "sparmentor" || lower.indexOf("sparmentor ") == 0) {
        var mRest = text.length > 10 ? text.substring(10).replace(/^\s+/, "") : "";
        if (mRest == "") return ["mentor"];
        return ["mentor"].concat(mRest.split(/\s+/));
    }
    if (lower == "sparbond" || lower.indexOf("sparbond ") == 0) {
        var bRest = text.length > 8 ? text.substring(8).replace(/^\s+/, "") : "";
        if (bRest == "") return ["mentor"];
        return ["mentor"].concat(bRest.split(/\s+/));
    }
    if (lower == "sparapprentice" || lower.indexOf("sparapprentice ") == 0) {
        var aRest = text.length > 14 ? text.substring(14).replace(/^\s+/, "") : "";
        if (aRest == "") return ["apprentice"];
        return ["apprentice"].concat(aRest.split(/\s+/));
    }

    return null;
}

function handleSparCommandLine(player, line) {
    if (player == null) return false;
    var parts = parseSparCommandLine(line);
    if (parts == null) return false;
    if (!claimSparCommand(player)) return true;
    try {
        sparCmdRouteParts(player, parts);
    } catch (err) {
        sendMessage(player, sparText(sparColor("c"), "[Sparring Command Error] ", err));
    }
    return true;
}

function cnpcPlayerFromBukkit(bukkitPlayer) {
    if (bukkitPlayer == null) return null;
    try {
        return getPlayerByName(null, String(bukkitPlayer.getName()));
    } catch (e) {
        return null;
    }
}

function getSparHookStore() {
    try {
        var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
        var world = NpcAPI.Instance().getIWorld("minecraft:overworld");
        if (world == null) world = NpcAPI.Instance().getIWorld("overworld");
        if (world != null) return world.getStoreddata();
    } catch (e) {}
    return null;
}

function findHookPlugin() {
    var names = ["CustomNPCs", "CustomNPC", "customnpcs", "CMI", "LuckPerms"];
    for (var i = 0; i < names.length; i++) {
        try {
            var plugin = Bukkit.getPluginManager().getPlugin(names[i]);
            if (plugin != null && plugin.isEnabled()) return plugin;
        } catch (e) {}
    }
    try {
        var all = Bukkit.getPluginManager().getPlugins();
        if (all != null && all.length > 0) return all[0];
    } catch (e2) {}
    return null;
}

/* In-memory only so script reload re-registers cleanly. */
var SPAR_SLASH_HOOK_READY = false;

function isSparSlashMessage(msg) {
    var lower = String(msg || "").toLowerCase();
    return (
        lower == "/spar" ||
        lower.indexOf("/spar ") == 0 ||
        lower == "/./spar" ||
        lower.indexOf("/./spar ") == 0 ||
        lower == "./spar" ||
        lower.indexOf("./spar ") == 0 ||
        lower == "/sparhelp" ||
        lower.indexOf("/sparhelp ") == 0 ||
        lower == "/sparstats" ||
        lower.indexOf("/sparstats ") == 0 ||
        lower == "/spartop" ||
        lower.indexOf("/spartop ") == 0 ||
        lower == "/sparstreak" ||
        lower == "/sparsession" ||
        lower == "/sparlongest" ||
        lower == "/sparpayout" ||
        lower == "/sparperfect" ||
        lower == "/spartime" ||
        lower == "/sparmentor" ||
        lower.indexOf("/sparmentor ") == 0 ||
        lower == "/sparapprentice" ||
        lower.indexOf("/sparapprentice ") == 0 ||
        lower == "/sparbond" ||
        lower.indexOf("/sparbond ") == 0
    );
}

/*
 * Intercept /spar before Bukkit prints "Unknown command".
 */
function registerSparSlashCommandHook() {
    if (SPAR_SLASH_HOOK_READY === true) return;

    try {
        var plugin = findHookPlugin();
        if (plugin == null) {
            try { print("[Sparring v3] slash hook: no host plugin found"); } catch (e0) {}
            return;
        }

        var Listener = Java.type("org.bukkit.event.Listener");
        var EventPriority = Java.type("org.bukkit.event.EventPriority");
        var Preprocess = Java.type("org.bukkit.event.player.PlayerCommandPreprocessEvent");
        var EventExecutor = Java.type("org.bukkit.plugin.EventExecutor");

        var listener;
        var executor;
        try {
            listener = new JavaAdapter(Listener, {});
            executor = new JavaAdapter(EventExecutor, {
                execute: function (l, event) {
                    try {
                        if (event == null) return;
                        var msg = "";
                        try { msg = String(event.getMessage()); } catch (e1) { return; }
                        if (!isSparSlashMessage(msg)) return;

                        var bp = null;
                        try { bp = event.getPlayer(); } catch (e2) { return; }
                        var player = cnpcPlayerFromBukkit(bp);
                        if (player == null) return;

                        if (handleSparCommandLine(player, msg)) {
                            try { event.setCancelled(true); } catch (e3) {
                                try { event.setCanceled(true); } catch (e4) {}
                            }
                        }
                    } catch (err) {
                        try { print("[Sparring v3] slash hook " + err); } catch (e5) {}
                    }
                }
            });
        } catch (adapterErr) {
            /* Older engines: ScriptObjectMirror / interface implementation */
            listener = {};
            executor = {
                execute: function (l, event) {
                    try {
                        if (event == null) return;
                        var msg = String(event.getMessage());
                        if (!isSparSlashMessage(msg)) return;
                        var player = cnpcPlayerFromBukkit(event.getPlayer());
                        if (player == null) return;
                        if (handleSparCommandLine(player, msg)) {
                            try { event.setCancelled(true); } catch (e3) {}
                        }
                    } catch (err2) {}
                }
            };
            listener = new Listener(listener);
            executor = new EventExecutor(executor);
        }

        Bukkit.getPluginManager().registerEvent(
            Preprocess.class,
            listener,
            EventPriority.NORMAL,
            executor,
            plugin,
            false
        );

        SPAR_SLASH_HOOK_READY = true;
        try { print("[Sparring v3] /spar slash command hook registered via " + plugin.getName()); } catch (eLog) {}
    } catch (err) {
        try { print("[Sparring v3] slash hook register failed: " + err); } catch (e2) {}
    }
}

function init(event) {
    try {
        registerSparSlashCommandHook();
        try {
            print("[Sparring v3.2.4] FF heal fix + Mentor Bond | BeamClashManager=" +
                (BeamClashManager != null ? "hooked" : "MISSING") +
                " MainDamageTypes=" + (MainDamageTypes != null ? "hooked" : "MISSING") +
                " AbstractKiProjectile=" + (AbstractKiProjectile != null ? "ok" : "MISSING"));
        } catch (eLog) {}
    } catch (e) {
        try { print("[Sparring v3] init " + e); } catch (x) {}
    }
}

function chat(event) {
    try {
        var player = event.player;
        if (player == null) return;
        var message = "";
        try { message = String(event.message); } catch (e1) {
            try { message = String(event.getMessage()); } catch (e2) { return; }
        }
        if (message == "") return;

        var lower = message.toLowerCase().replace(/^\s+/, "");
        /*
         * Chat fallbacks when slash aliases are missing:
         * .spar / !spar / ./spar  (and bare shortcuts)
         */
        if (!(
            lower.indexOf(".spar") == 0 ||
            lower.indexOf("!spar") == 0 ||
            lower.indexOf("./spar") == 0 ||
            lower == "spar" ||
            lower.indexOf("spar ") == 0 ||
            lower.indexOf("sparhelp") == 0 ||
            lower.indexOf("sparstats") == 0 ||
            lower.indexOf("spartop") == 0 ||
            lower.indexOf("sparmentor") == 0 ||
            lower.indexOf("sparapprentice") == 0 ||
            lower.indexOf("sparbond") == 0
        )) {
            return;
        }

        if (handleSparCommandLine(player, message)) {
            try { event.setCanceled(true); } catch (e3) {
                try { event.setCancelled(true); } catch (e4) {}
            }
        }
    } catch (err) {
        try { print("[Sparring v3] chat " + err); } catch (x) {}
    }
}

function trigger(event) {
    try {
        var id = 0;
        try { id = Number(event.id); } catch (e) {
            try { id = Number(event.getId()); } catch (e2) {}
        }

        /* Only claim spar command / leaderboard trigger ids. */
        if (!(id == 70 || id == 72 || id == 73 || id == 74 || id == 75 ||
              id == 76 || id == 77 || id == 78 || id == 79)) {
            return;
        }

        var player = resolveSparCommandPlayer(event);
        if (player == null) {
            try {
                print("[Sparring v3] trigger " + id + " could not resolve player arg0=" + sparCmdArgAt(event, 0));
            } catch (ePrint) {}
            return;
        }

        /* Dedupe if Command Handler script-slot is also installed. */
        if (!claimSparCommand(player)) return;

        if (id == 70) {
            sparCmdRoute(player, event);
        } else if (id == 72 || id == 74) {
            var topArg = sparCmdArgAt(event, 1);
            sparCmdShowTop(player, topArg == "" ? "tp" : topArg);
        } else if (id == 73) {
            var a1 = sparCmdArgAt(event, 1);
            if (a1 != "") sparCmdRoute(player, event);
            else sparCmdShowPersonal(player, "");
        } else if (id == 75) {
            sparCmdShowTop(player, "streak");
        } else if (id == 76) {
            sparCmdShowTop(player, "session");
        } else if (id == 77) {
            sparCmdShowTop(player, "payout");
        } else if (id == 78) {
            sparCmdShowTop(player, "perfect");
        } else if (id == 79) {
            sparCmdShowTop(player, "time");
        }
    } catch (err) {
        try {
            var p = resolveSparCommandPlayer(event);
            if (p != null) {
                sendMessage(p, sparText(sparColor("c"), "[Sparring Command Error] ", err));
            }
        } catch (e2) {
            try { print("[Sparring v3] trigger error " + err); } catch (e3) {}
        }
    }
}

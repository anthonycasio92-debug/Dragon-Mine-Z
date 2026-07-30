/*
============================================================
 DBZ Legacy Reborn - Sparring Command Handler
 Version: 3.1.2

 PLACE THIS SCRIPT IN THE SAME CUSTOMNPCS SCRIPT LOCATION
 AS YOUR WORKING SkillCheckCommand.js / Rival Command Handler.

 DO NOT place this in the Global Player Script slot.

 NOTE (v3.1.2+):
  Command cards match Rival System layout (uiHead / uiProp /
  uiSection / uiCmd / ranked tops).
  Help lists /spar only (no .spar / !spar / ./spar).
  Mentor Bond commands work here too (same storeddata keys).
  Non-spar trigger ids are ignored (do not claim dedupe lock).
  Sparring Tp System.js (Global Player) also handles /spar
  triggers 70 / 72-79. This script-slot handler is OPTIONAL.
  If both are installed, responses are deduped.

 Sparring v3: combat-based TP (melee/ki/blocks/momentum).
 No standing timer payouts.

 PRIMARY SYNTAX:
   /spar
   /spar help
   /spar stats [player]
   /spar top [tp|streak|session|payout|perfect|time|combo|clash]
   /spar mentor ...
   /spar apprentice ...

 TRIGGERS:
 70 = /spar router (help + subcommands via $1-)
 72 = Top total TP (legacy)
 73 = Personal sparring statistics
 74 = Top total TP
 75 = Top current streak
 76 = Top longest session
 77 = Top highest payout
 78 = Top perfect-training sessions
 79 = Top total sparring time

 COMMAND FORMAT:
 noppes script trigger <id> <playerName>
 noppes script trigger <id> <playerName> <args...>

 CMI aliases should inject [playerName] as argument 0
 and pass remaining typed args with $1- (same as /rival).
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var LocalDate = Java.type("java.time.LocalDate");

/*
 Color codes use \u00A7 escapes (same as Rival / SkillCheck) so chat
 formatting stays reliable. Player-facing text is ASCII-only.
*/
var C = "\u00A7";
var C_RESET = "\u00A7r";
var C_BOLD = "\u00A7l";
var TOP_SIZE = 10;

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
var LB_CLASH_PREFIX = "spar.leaderboard.clash.";
var LB_MOMENTUM_PREFIX = "spar.leaderboard.momentum.";
var LB_MELEE_PREFIX = "spar.leaderboard.melee.";
var LB_KI_PREFIX = "spar.leaderboard.ki.";
var LB_BLOCKS_PREFIX = "spar.leaderboard.blocks.";

var S_STREAK_CURRENT = "spar.streak.current";
var S_STREAK_BEST = "spar.streak.best";
var S_STREAK_LAST_DAY = "spar.streak.lastDay";

var S_MENTOR_NAME = "spar.bond.mentorName";
var S_APPRENTICE_NAME = "spar.bond.apprenticeName";
var S_MENTOR_CD_UNTIL = "spar.bond.mentorChangeReadyAt";
var S_APPRENTICE_CD_UNTIL = "spar.bond.apprenticeChangeReadyAt";
var S_BOND_INVITE_FROM = "spar.bond.inviteFrom";
var S_BOND_INVITE_KIND = "spar.bond.inviteKind";
var S_BOND_INVITE_UNTIL = "spar.bond.inviteUntil";
var MENTOR_SHARE_PCT = 0.15;
var MENTOR_SPAR_BONUS_PCT = 0.18;
var MENTOR_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
var MENTOR_INVITE_MS = 120000;

/* ========================= BASIC HELPERS ========================= */

function str(v) {
    return v == null ? "" : String(v);
}

function num(v, f) {
    var n = Number(v);
    return isNaN(n) || !isFinite(n) ? f : n;
}

function lower(v) {
    return str(v).toLowerCase();
}

function msg(player, text) {
    try {
        if (player != null) player.message(text);
    } catch (e) {}
}

function readNumber(store, key, fallback) {
    try {
        if (store != null && store.has(key)) {
            var value = Number(String(store.get(key)));
            if (!isNaN(value) && isFinite(value)) return value;
        }
    } catch (e) {}
    return fallback;
}

function readString(store, key, fallback) {
    try {
        if (store != null && store.has(key)) {
            return String(store.get(key));
        }
    } catch (e) {}
    return fallback;
}

function safeName(name) {
    return String(name)
        .replace(/[^A-Za-z0-9_\-]/g, "_")
        .toLowerCase();
}

function nameOf(player) {
    try {
        return str(player.getName());
    } catch (e) {
        return "Unknown";
    }
}

function api() {
    return NpcAPI.Instance();
}

function getOnlinePlayerByName(name) {
    var wanted = str(name);
    if (wanted == "") return null;

    var worlds = api().getIWorlds();
    for (var i = 0; i < worlds.length; i++) {
        try {
            var players = worlds[i].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                try {
                    if (String(players[p].getName()).equalsIgnoreCase(wanted)) {
                        return players[p];
                    }
                } catch (e1) {
                    if (lower(players[p].getName()) == lower(wanted)) {
                        return players[p];
                    }
                }
            }
        } catch (e) {}
    }

    return null;
}

function getWorldStore(player) {
    try {
        return player.world.getStoreddata();
    } catch (e) {
        try {
            return player.getWorld().getStoreddata();
        } catch (e2) {
            try {
                var world = api().getIWorld("minecraft:overworld");
                if (world != null) return world.getStoreddata();
            } catch (e3) {}
        }
    }
    return null;
}

function getNames(store) {
    var raw = readString(store, LB_NAMES_KEY, "");
    if (raw == "") return [];

    var split = raw.split(",");
    var names = [];

    for (var i = 0; i < split.length; i++) {
        var name = String(split[i]).trim();
        if (name != "") names.push(name);
    }

    return names;
}

function commas(value) {
    var number = Math.floor(num(value, 0));
    var raw = String(number);
    var out = "";

    while (raw.length > 3) {
        out = "," + raw.substring(raw.length - 3) + out;
        raw = raw.substring(0, raw.length - 3);
    }

    return raw + out;
}

function compact(value) {
    var number = num(value, 0);

    var units = [
        { value: 1e15, suffix: "Q" },
        { value: 1e12, suffix: "T" },
        { value: 1e9, suffix: "B" },
        { value: 1e6, suffix: "M" },
        { value: 1e3, suffix: "K" }
    ];

    for (var i = 0; i < units.length; i++) {
        if (Math.abs(number) >= units[i].value) {
            var scaled = number / units[i].value;
            return scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)
                .replace(/\.0+$/, "")
                .replace(/(\.\d*[1-9])0+$/, "$1") +
                units[i].suffix;
        }
    }

    return commas(number);
}

function duration(ms) {
    var seconds = Math.max(0, Math.floor(num(ms, 0) / 1000));
    var days = Math.floor(seconds / 86400);
    seconds %= 86400;
    var hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    var minutes = Math.floor(seconds / 60);
    seconds %= 60;

    var parts = [];
    if (days > 0) parts.push(days + "d");
    if (hours > 0) parts.push(hours + "h");
    if (minutes > 0) parts.push(minutes + "m");
    if (parts.length == 0 || seconds > 0) parts.push(seconds + "s");

    return parts.join(" ");
}

function todayEpochDay() {
    try {
        return Number(LocalDate.now().toEpochDay());
    } catch (e) {
        return Math.floor(
            Java.type("java.lang.System").currentTimeMillis() / 86400000
        );
    }
}

function currentStreakFromPlayer(player) {
    var stored = player.getStoreddata();
    var current = Math.floor(readNumber(stored, S_STREAK_CURRENT, 0));
    var last = Math.floor(readNumber(stored, S_STREAK_LAST_DAY, -999999));

    if (last >= 0 && todayEpochDay() - last > 1) {
        return 0;
    }

    return Math.max(0, current);
}

/* ========================= UI (same card layout as Rival) ========================= */

function uiLine(player) {
    msg(player, C + "8--------------------------------" + C_RESET);
}

function uiBlank(player) {
    msg(player, " ");
}

function uiHead(player, title) {
    uiLine(player);
    msg(player, C + "6" + C_BOLD + " " + title + " " + C_RESET);
    uiLine(player);
}

function uiFoot(player) {
    uiLine(player);
}

function uiSection(player, title) {
    msg(player, C + "6" + title + C_RESET);
}

function uiProp(player, label, value) {
    msg(player, C + "8" + label + C_RESET + "  " + value);
}

function uiCmd(player, cmd, desc) {
    if (desc != null && desc != "") {
        msg(player, C + "e  " + cmd + C_RESET + C + "8  " + desc);
    } else {
        msg(player, C + "e  " + cmd);
    }
}

function uiBanner(player, tag, text) {
    msg(player, C + "6[" + tag + "] " + C_RESET + text);
}

/* ========================= DATA LOOKUPS ========================= */

function loadProfile(store, playerName) {
    var safe = safeName(playerName);
    return {
        name: playerName,
        safe: safe,
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

function resolveStreak(profile, onlinePlayer) {
    if (onlinePlayer != null) {
        return {
            current: currentStreakFromPlayer(onlinePlayer),
            best: Math.max(
                profile.bestStreak,
                Math.floor(
                    readNumber(
                        onlinePlayer.getStoreddata(),
                        S_STREAK_BEST,
                        0
                    )
                )
            )
        };
    }

    return {
        current: Math.max(0, profile.currentStreak),
        best: Math.max(0, profile.bestStreak)
    };
}

function entries(player, keyPrefix) {
    var store = getWorldStore(player);
    if (store == null) return [];

    var names = getNames(store);
    var result = [];

    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        result.push({
            name: name,
            value: readNumber(store, keyPrefix + safeName(name), 0)
        });
    }

    result.sort(function (a, b) {
        return b.value - a.value;
    });

    return result;
}

function topCategory(category) {
    var cat = lower(category || "tp");

    if (cat == "streak" || cat == "streaks" || cat == "days") {
        return {
            key: LB_STREAK_PREFIX,
            title: "TOP TRAINING STREAKS",
            formatter: commas,
            suffix: "days"
        };
    }

    if (
        cat == "session" ||
        cat == "sessions" ||
        cat == "longest" ||
        cat == "long"
    ) {
        return {
            key: LB_LONGEST_PREFIX,
            title: "LONGEST SPARRING SESSIONS",
            formatter: duration,
            suffix: ""
        };
    }

    if (
        cat == "payout" ||
        cat == "payouts" ||
        cat == "best" ||
        cat == "hit"
    ) {
        return {
            key: LB_BEST_PAYOUT_PREFIX,
            title: "HIGHEST SPARRING PAYOUTS",
            formatter: compact,
            suffix: "TP"
        };
    }

    if (cat == "perfect" || cat == "perfects") {
        return {
            key: LB_PERFECT_PREFIX,
            title: "PERFECT TRAINING SESSIONS",
            formatter: commas,
            suffix: "sessions"
        };
    }

    if (
        cat == "time" ||
        cat == "total" ||
        cat == "duration" ||
        cat == "hours"
    ) {
        return {
            key: LB_TOTAL_TIME_PREFIX,
            title: "TOTAL SPARRING TIME",
            formatter: duration,
            suffix: ""
        };
    }

    if (cat == "combo" || cat == "combos" || cat == "hits") {
        return {
            key: LB_HIGHEST_COMBO_PREFIX,
            title: "HIGHEST COMBOS",
            formatter: commas,
            suffix: "hits"
        };
    }

    if (cat == "clash" || cat == "beam" || cat == "beams") {
        return {
            key: LB_CLASH_PREFIX,
            title: "MOST BEAM CLASH TIME",
            formatter: duration,
            suffix: ""
        };
    }

    if (cat == "momentum" || cat == "mom") {
        return {
            key: LB_MOMENTUM_PREFIX,
            title: "HIGHEST MOMENTUM",
            formatter: commas,
            suffix: "tier"
        };
    }

    return {
        key: LB_TP_PREFIX,
        title: "TOP SPARRING TP",
        formatter: compact,
        suffix: "TP"
    };
}


/* ========================= MENTOR BOND ========================= */

function nowMs() {
    try { return Number(Java.type("java.lang.System").currentTimeMillis()); } catch (e) {
        return Number(new Date().getTime());
    }
}

function putNumber(store, key, value) {
    try { store.put(key, String(Math.floor(Number(value)))); } catch (e) {
        try { store.put(key, Math.floor(Number(value))); } catch (e2) {}
    }
}

function putString(store, key, value) {
    try { store.put(key, String(value == null ? "" : value)); } catch (e) {}
}

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
    return lower(a) == lower(b) && str(a) != "";
}

function reconcileMentorBond(player) {
    if (player == null) return;
    var stored = bondStored(player);
    if (stored == null) return;
    var self = nameOf(player);
    var app = getBondApprenticeName(player);
    if (app != "") {
        var ap = getOnlinePlayerByName(app);
        if (ap != null && !namesMatch(getBondMentorName(ap), self)) {
            putString(stored, S_APPRENTICE_NAME, "");
        }
    }
    var ment = getBondMentorName(player);
    if (ment != "") {
        var m = getOnlinePlayerByName(ment);
        if (m != null && !namesMatch(getBondApprenticeName(m), self)) {
            putString(stored, S_MENTOR_NAME, "");
        }
    }
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
    putString(mStore, S_APPRENTICE_NAME, nameOf(apprentice));
    putString(aStore, S_MENTOR_NAME, nameOf(mentor));
    clearBondInvite(mentor);
    clearBondInvite(apprentice);
    return true;
}

function showBondOnCard(player) {
    try { reconcileMentorBond(player); } catch (e) {}
    var mentor = getBondMentorName(player);
    var apprentice = getBondApprenticeName(player);
    uiProp(player, "Mentor", mentor != "" ? C + "f" + mentor : C + "8none");
    uiProp(player, "Apprentice", apprentice != "" ? C + "f" + apprentice : C + "8none");
    var invite = readBondInvite(player);
    if (invite != null) {
        if (invite.kind == "mentor") {
            msg(player, C + "e" + invite.from + C + "7 wants you as their Mentor.");
        } else {
            msg(player, C + "e" + invite.from + C + "7 wants you as their Apprentice.");
        }
        msg(player, C + "8Use  " + C + "e/spar mentor accept" + C + "8  or  " + C + "e/spar mentor deny");
    }
}

function cmdBondStatus(player) {
    uiHead(player, "MENTOR BOND");
    showBondOnCard(player);
    uiBlank(player);
    uiProp(player, "Share", C + "7Mentor receives " + C + "a" + Math.floor(MENTOR_SHARE_PCT * 100) + "%" +
        C + "7 of apprentice spar TP");
    uiProp(player, "Bonus", C + "7Apprentice +" + C + "a" + Math.floor(MENTOR_SPAR_BONUS_PCT * 100) + "%" +
        C + "7 TP while sparring with mentor");
    var mCd = bondCooldownLeft(player, S_MENTOR_CD_UNTIL);
    var aCd = bondCooldownLeft(player, S_APPRENTICE_CD_UNTIL);
    if (mCd > 0) uiProp(player, "Mentor CD", C + "c" + duration(mCd));
    if (aCd > 0) uiProp(player, "Apprentice CD", C + "c" + duration(aCd));
    uiBlank(player);
    uiSection(player, "Commands");
    uiCmd(player, "/spar mentor <player>", "ask them to mentor you");
    uiCmd(player, "/spar apprentice <player>", "ask them to be your apprentice");
    uiCmd(player, "/spar mentor accept | deny", "respond to an invite");
    uiCmd(player, "/spar mentor clear", "leave your mentor (7d cooldown)");
    uiCmd(player, "/spar apprentice clear", "release your apprentice (7d cooldown)");
    uiFoot(player);
}

function cmdAskMentor(player, targetName) {
    targetName = str(targetName).replace(/^\s+|\s+$/g, "");
    if (targetName == "") { cmdBondStatus(player); return; }
    if (namesMatch(targetName, nameOf(player))) {
        uiBanner(player, "Mentor Bond", C + "cYou cannot mentor yourself.");
        return;
    }
    if (getBondMentorName(player) != "") {
        uiBanner(player, "Mentor Bond", C + "cYou already have a mentor (" + getBondMentorName(player) + "). Clear them first.");
        return;
    }
    var cd = bondCooldownLeft(player, S_MENTOR_CD_UNTIL);
    if (cd > 0) {
        uiBanner(player, "Mentor Bond", C + "cMentor change cooldown: " + duration(cd));
        return;
    }
    var target = getOnlinePlayerByName(targetName);
    if (target == null) {
        uiBanner(player, "Mentor Bond", C + "cPlayer not online.");
        return;
    }
    if (getBondApprenticeName(target) != "") {
        uiBanner(player, "Mentor Bond", C + "c" + nameOf(target) + " already has an apprentice.");
        return;
    }
    var tCd = bondCooldownLeft(target, S_APPRENTICE_CD_UNTIL);
    if (tCd > 0) {
        uiBanner(player, "Mentor Bond", C + "c" + nameOf(target) + " cannot take an apprentice yet (" + duration(tCd) + ").");
        return;
    }
    if (!setBondInvite(target, nameOf(player), "mentor")) {
        uiBanner(player, "Mentor Bond", C + "cCould not send invite.");
        return;
    }
    uiBanner(player, "Mentor Bond", C + "aInvite sent to " + C + "f" + nameOf(target) + C + "a.");
    msg(target, C + "6[Mentor Bond] " + C + "f" + nameOf(player) + C + "e wants you as their Mentor.");
    msg(target, C + "8/spar mentor accept  " + C + "7or  " + C + "8/spar mentor deny");
}

function cmdAskApprentice(player, targetName) {
    targetName = str(targetName).replace(/^\s+|\s+$/g, "");
    if (targetName == "") { cmdBondStatus(player); return; }
    if (namesMatch(targetName, nameOf(player))) {
        uiBanner(player, "Mentor Bond", C + "cYou cannot apprentice yourself.");
        return;
    }
    if (getBondApprenticeName(player) != "") {
        uiBanner(player, "Mentor Bond", C + "cYou already have an apprentice (" + getBondApprenticeName(player) + "). Clear them first.");
        return;
    }
    var cd = bondCooldownLeft(player, S_APPRENTICE_CD_UNTIL);
    if (cd > 0) {
        uiBanner(player, "Mentor Bond", C + "cApprentice change cooldown: " + duration(cd));
        return;
    }
    var target = getOnlinePlayerByName(targetName);
    if (target == null) {
        uiBanner(player, "Mentor Bond", C + "cPlayer not online.");
        return;
    }
    if (getBondMentorName(target) != "") {
        uiBanner(player, "Mentor Bond", C + "c" + nameOf(target) + " already has a mentor.");
        return;
    }
    var tCd = bondCooldownLeft(target, S_MENTOR_CD_UNTIL);
    if (tCd > 0) {
        uiBanner(player, "Mentor Bond", C + "c" + nameOf(target) + " cannot change mentors yet (" + duration(tCd) + ").");
        return;
    }
    if (!setBondInvite(target, nameOf(player), "apprentice")) {
        uiBanner(player, "Mentor Bond", C + "cCould not send invite.");
        return;
    }
    uiBanner(player, "Mentor Bond", C + "aInvite sent to " + C + "f" + nameOf(target) + C + "a.");
    msg(target, C + "6[Mentor Bond] " + C + "f" + nameOf(player) + C + "e wants you as their Apprentice.");
    msg(target, C + "8/spar mentor accept  " + C + "7or  " + C + "8/spar mentor deny");
}

function cmdBondAccept(player) {
    var invite = readBondInvite(player);
    if (invite == null) {
        uiBanner(player, "Mentor Bond", C + "cNo pending invite.");
        return;
    }
    var other = getOnlinePlayerByName(invite.from);
    if (other == null) {
        clearBondInvite(player);
        uiBanner(player, "Mentor Bond", C + "cInviter is no longer online.");
        return;
    }
    var mentor = null;
    var apprentice = null;
    if (invite.kind == "mentor") { mentor = player; apprentice = other; }
    else if (invite.kind == "apprentice") { mentor = other; apprentice = player; }
    else {
        clearBondInvite(player);
        uiBanner(player, "Mentor Bond", C + "cInvalid invite.");
        return;
    }
    if (getBondApprenticeName(mentor) != "" && !namesMatch(getBondApprenticeName(mentor), nameOf(apprentice))) {
        clearBondInvite(player);
        uiBanner(player, "Mentor Bond", C + "cMentor already has an apprentice.");
        return;
    }
    if (getBondMentorName(apprentice) != "" && !namesMatch(getBondMentorName(apprentice), nameOf(mentor))) {
        clearBondInvite(player);
        uiBanner(player, "Mentor Bond", C + "cApprentice already has a mentor.");
        return;
    }
    if (!bindMentorApprentice(mentor, apprentice)) {
        uiBanner(player, "Mentor Bond", C + "cCould not create bond.");
        return;
    }
    msg(mentor, C + "6[Mentor Bond] " + C + "aYou are now mentoring " + C + "f" + nameOf(apprentice) + C + "a.");
    msg(apprentice, C + "6[Mentor Bond] " + C + "aYour mentor is now " + C + "f" + nameOf(mentor) + C + "a.");
}

function cmdBondDeny(player) {
    var invite = readBondInvite(player);
    if (invite == null) {
        uiBanner(player, "Mentor Bond", C + "cNo pending invite.");
        return;
    }
    var fromName = invite.from;
    clearBondInvite(player);
    uiBanner(player, "Mentor Bond", C + "7Invite denied.");
    var other = getOnlinePlayerByName(fromName);
    if (other != null) {
        msg(other, C + "6[Mentor Bond] " + C + "f" + nameOf(player) + C + "c denied your invite.");
    }
}

function cmdClearMentor(player) {
    var mentorName = getBondMentorName(player);
    if (mentorName == "") {
        uiBanner(player, "Mentor Bond", C + "cYou have no mentor.");
        return;
    }
    var mentor = getOnlinePlayerByName(mentorName);
    clearMentorLink(player, mentor, true);
    if (mentor == null) {
        var stored = bondStored(player);
        if (stored != null) putString(stored, S_MENTOR_NAME, "");
        setBondCooldown(player, S_MENTOR_CD_UNTIL);
    }
    uiBanner(player, "Mentor Bond", C + "7Left mentor " + C + "f" + mentorName + C + "7. 7-day cooldown started.");
    if (mentor != null) {
        msg(mentor, C + "6[Mentor Bond] " + C + "f" + nameOf(player) + C + "7 is no longer your apprentice.");
    }
}

function cmdClearApprentice(player) {
    var apprenticeName = getBondApprenticeName(player);
    if (apprenticeName == "") {
        uiBanner(player, "Mentor Bond", C + "cYou have no apprentice.");
        return;
    }
    var apprentice = getOnlinePlayerByName(apprenticeName);
    clearMentorLink(apprentice, player, true);
    if (apprentice == null) {
        var stored = bondStored(player);
        if (stored != null) putString(stored, S_APPRENTICE_NAME, "");
        setBondCooldown(player, S_APPRENTICE_CD_UNTIL);
    }
    uiBanner(player, "Mentor Bond", C + "7Released apprentice " + C + "f" + apprenticeName + C + "7. 7-day cooldown started.");
    if (apprentice != null) {
        msg(apprentice, C + "6[Mentor Bond] " + C + "f" + nameOf(player) + C + "7 is no longer your mentor.");
    }
}

function routeBond(player, parts) {
    var sub = parts.length > 0 ? lower(parts[0]) : "";
    var arg = parts.length > 1 ? parts[1] : "";
    var arg2 = parts.length > 2 ? parts[2] : "";

    if (sub == "mentor" || sub == "mentors" || sub == "bond") {
        var action = lower(arg);
        if (action == "" || action == "status" || action == "info") cmdBondStatus(player);
        else if (action == "accept" || action == "yes") cmdBondAccept(player);
        else if (action == "deny" || action == "decline" || action == "no") cmdBondDeny(player);
        else if (action == "clear" || action == "remove" || action == "leave") cmdClearMentor(player);
        else if (action == "ask") cmdAskMentor(player, arg2);
        else cmdAskMentor(player, arg);
        return true;
    }
    if (sub == "apprentice" || sub == "app" || sub == "student") {
        var aAction = lower(arg);
        if (aAction == "" || aAction == "status" || aAction == "info") cmdBondStatus(player);
        else if (aAction == "clear" || aAction == "remove" || aAction == "release") cmdClearApprentice(player);
        else if (aAction == "ask" || aAction == "take") cmdAskApprentice(player, arg2);
        else cmdAskApprentice(player, arg);
        return true;
    }
    return false;
}


/* ========================= COMMANDS ========================= */

function cmdHelp(player) {
    uiHead(player, "SPARRING SYSTEM");
    uiProp(player, "Train", C + "7Fight each other " + C + "8(" +
        C + "fmelee" + C + "8 or " + C + "fki" + C + "8) to start");
    uiProp(player, "Pay", C + "7TP from combat actions" + C + "8  |  " +
        C + "a+50%" + C + "7 global");
    uiProp(
        player,
        "Bonus",
        C + "7Momentum" + C + "8  |  " +
        C + "7Session" + C + "8  |  " +
        C + "7Streak" + C + "8  |  " +
        C + "7Perfect" + C + "8  |  " +
        C + "7Style" + C + "8  |  " +
        C + "7Mentor"
    );
    uiBlank(player);
    uiSection(player, "Training");
    uiCmd(player, "/spar", "this help menu");
    uiCmd(player, "/spar stats [player]", "personal sparring record");
    uiCmd(player, "/spar top [tp|streak|session|payout|perfect|time|combo|clash]", "");
    uiBlank(player);
    uiSection(player, "Your Mentor Bond");
    showBondOnCard(player);
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
    msg(player, C + "8Stay active: trade damage, move, and keep the fight going.");
    msg(player, C + "8Friendly Fist knockdowns during a spar heal your partner.");
    uiFoot(player);
}

function showPersonal(player, targetName) {
    var store = getWorldStore(player);
    if (store == null) {
        uiBanner(player, "Sparring", C + "cCould not access stored data.");
        return;
    }

    var wanted = str(targetName).replace(/^\s+|\s+$/g, "");
    if (wanted == "") wanted = nameOf(player);

    var online = getOnlinePlayerByName(wanted);
    var displayName = online != null ? nameOf(online) : wanted;
    var profile = loadProfile(store, displayName);
    var streak = resolveStreak(profile, online);

    var hasAny =
        profile.totalTP > 0 ||
        profile.sessions > 0 ||
        profile.totalTime > 0 ||
        profile.longest > 0 ||
        streak.current > 0 ||
        streak.best > 0;

    if (!hasAny) {
        uiBanner(player, "Sparring", C + "cNo record for " + displayName);
        msg(player, C + "8Start a session by fighting another player (melee or ki).");
        return;
    }

    uiHead(player, "SPARRING STATS");
    uiProp(player, "Player", C + "f" + displayName);
    uiProp(player, "Total TP", C + "a" + commas(profile.totalTP) +
        C + "8  Best  " + C + "a" + commas(profile.bestPayout) + " TP");
    uiBlank(player);
    uiProp(player, "Sessions", C + "f" + commas(profile.sessions));
    uiProp(player, "Time", C + "b" + duration(profile.totalTime) +
        C + "8   Longest  " + C + "b" + duration(profile.longest));
    uiProp(player, "Damage", C + "f" + commas(profile.melee) + C + "7 melee" +
        C + "8  " + C + "b" + commas(profile.ki) + C + "7 ki");
    uiProp(player, "Defense", C + "7" + commas(profile.blocks) + " blocks" +
        C + "8   Clash  " + C + "d" + duration(profile.clash));
    uiProp(player, "Perfect", C + "d" + commas(profile.perfect) +
        C + "8   Combo  " + C + "e" + commas(profile.combo) +
        C + "8   Momentum  " + C + "e" + commas(profile.momentum));
    uiProp(
        player,
        "Streak",
        C + "6" + commas(streak.current) + " days" +
        C + "8   Best  " +
        C + "6" + commas(streak.best) + " days"
    );
    if (online != null) {
        uiBlank(player);
        uiSection(player, "Mentor Bond");
        showBondOnCard(online);
    }
    uiFoot(player);
}

function showTop(player, category) {
    var info = topCategory(category);
    var list = entries(player, info.key);

    uiHead(player, info.title);

    if (list.length == 0 || list[0].value <= 0) {
        msg(player, C + "8No records have been saved yet.");
        uiFoot(player);
        return;
    }

    var shown = 0;

    for (var i = 0; i < list.length && shown < TOP_SIZE; i++) {
        if (list[i].value <= 0) continue;
        shown++;

        var placeColor =
            shown == 1 ? "6" : (shown == 2 ? "7" : (shown == 3 ? "e" : "8"));

        var valueText = info.formatter(list[i].value);
        if (info.suffix != "") {
            valueText += " " + info.suffix;
        }

        msg(
            player,
            C + placeColor + "#" + shown + C_RESET +
            C + "f  " + list[i].name +
            C + "8  ........  " +
            C + "a" + valueText
        );
    }

    uiFoot(player);
}

/* ========================= ROUTER ========================= */

function argAt(event, index) {
    try {
        if (
            event != null &&
            event.arguments != null &&
            event.arguments.length > index
        ) {
            var piece = str(event.arguments[index]).replace(/^\s+|\s+$/g, "");
            if (piece == "" || lower(piece) == "null") return "";
            return piece;
        }
    } catch (e) {}
    return "";
}

function argsFrom(event, start) {
    var out = [];
    try {
        if (event.arguments != null) {
            for (var i = start; i < event.arguments.length; i++) {
                var piece = str(event.arguments[i]).replace(/^\s+|\s+$/g, "");
                if (piece == "" || lower(piece) == "null") continue;
                out.push(piece);
            }
        }
    } catch (e) {}
    return out;
}

/*
 /spar stats Steve     => trigger 70 <player> stats Steve
 /sparstats            => trigger 70 <player> stats
 /spar top streak      => trigger 70 <player> top streak
*/
function routeSparSub(player, event) {
    var parts = argsFrom(event, 1);

    if (parts.length == 0) {
        cmdHelp(player);
        return;
    }

    var sub = lower(parts[0]);
    var arg = parts.length > 1 ? parts[1] : "";

    if (routeBond(player, parts)) {
        return;
    }

    if (sub == "help" || sub == "?" || sub == "commands") {
        cmdHelp(player);
    } else if (
        sub == "stats" ||
        sub == "stat" ||
        sub == "me" ||
        sub == "record"
    ) {
        showPersonal(player, arg);
    } else if (sub == "top" || sub == "leaderboard" || sub == "lb") {
        showTop(player, arg == "" ? "tp" : arg);
    } else if (
        sub == "streak" ||
        sub == "streaks" ||
        sub == "session" ||
        sub == "sessions" ||
        sub == "longest" ||
        sub == "payout" ||
        sub == "payouts" ||
        sub == "perfect" ||
        sub == "perfects" ||
        sub == "time" ||
        sub == "combo" ||
        sub == "combos" ||
        sub == "clash" ||
        sub == "beam" ||
        sub == "momentum" ||
        sub == "tp"
    ) {
        /*
         Allow /spar streak as a short form of /spar top streak.
         */
        showTop(player, sub);
    } else {
        uiBanner(player, "Sparring", C + "cUnknown command.");
        msg(player, C + "8Use  " + C + "e/spar help");
    }
}

function resolveCommandPlayer(event) {
    var arg0 = argAt(event, 0);
    if (arg0 != "") {
        var byName = getOnlinePlayerByName(arg0);
        if (byName != null) return byName;
        try {
            var Bukkit = Java.type("org.bukkit.Bukkit");
            var bp = Bukkit.getPlayerExact(arg0);
            if (bp == null) bp = Bukkit.getPlayer(arg0);
            if (bp != null) {
                var found = getOnlinePlayerByName(String(bp.getName()));
                if (found != null) return found;
            }
        } catch (eBukkit) {}
    }
    try { if (event.player != null) return event.player; } catch (e1) {}
    try { if (event.entity != null) return event.entity; } catch (e2) {}
    return null;
}

function claimSparCommand(player) {
    if (player == null) return false;
    try {
        var temp = player.getTempdata();
        var now = Number(new Date().getTime());
        var last = 0;
        try {
            if (temp.has("spar.cmd.handledAt")) last = Number(temp.get("spar.cmd.handledAt"));
        } catch (e) {}
        if (isNaN(last)) last = 0;
        if (now - last < 750) return false;
        temp.put("spar.cmd.handledAt", String(now));
        return true;
    } catch (e2) {
        return true;
    }
}

function trigger(event) {
    var arg0 = argAt(event, 0);
    var player = null;

    try {
        player = resolveCommandPlayer(event);
    } catch (e) {}

    if (player == null) {
        try {
            print(
                "[SparringCommand] No online player for trigger " +
                event.id +
                " arg0=" +
                arg0
            );
        } catch (e2) {}
        return;
    }

    /* Dedupe with Global Player Sparring Tp System v3.0.4+ */
    var id = Number(event.id);
    if (!(id == 70 || id == 72 || id == 73 || id == 74 ||
          id == 75 || id == 76 || id == 77 || id == 78 || id == 79)) {
        return;
    }

    if (!claimSparCommand(player)) return;

    try {
        var arg1 = argAt(event, 1);

        if (id == 70) {
            routeSparSub(player, event);
        } else if (id == 72 || id == 74) {
            showTop(player, arg1 == "" ? "tp" : arg1);
        } else if (id == 73) {
            if (arg1 != "") {
                routeSparSub(player, event);
            } else {
                showPersonal(player, "");
            }
        } else if (id == 75) {
            showTop(player, "streak");
        } else if (id == 76) {
            showTop(player, "session");
        } else if (id == 77) {
            showTop(player, "payout");
        } else if (id == 78) {
            showTop(player, "perfect");
        } else if (id == 79) {
            showTop(player, "time");
        }
    } catch (err) {
        msg(player, C + "c[Sparring Command Error] " + err);
    }
}
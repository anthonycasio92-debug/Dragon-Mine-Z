/*
============================================================
 DBZ Legacy Reborn - Sparring Command Handler
 Version: 2.0.0

 PLACE THIS SCRIPT IN THE SAME CUSTOMNPCS SCRIPT LOCATION
 AS YOUR WORKING SkillCheckCommand.js TRIGGER SCRIPT.

 DO NOT place this in the Global Player Script slot.

 TRIGGERS:
 73 = Personal sparring statistics
 74 = Top total TP
 75 = Top current streak
 76 = Top longest session
 77 = Top highest payout
 78 = Top perfect-training payouts
 79 = Top total rewarded sparring time

 COMMAND FORMAT:
 noppes script trigger <id> <playerName>
============================================================
*/

/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 *
 * PAIR WARNING: Keep "Sparring Tp System.js" in a SEPARATE tab (leaderboard helpers collide if merged).
 */
var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var LocalDate = Java.type("java.time.LocalDate");

var C = String.fromCharCode(167);
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

var S_STREAK_CURRENT = "spar.streak.current";
var S_STREAK_BEST = "spar.streak.best";
var S_STREAK_LAST_DAY = "spar.streak.lastDay";

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

function getOnlinePlayerByName(name) {
    var worlds = NpcAPI.Instance().getIWorlds();

    for (var i = 0; i < worlds.length; i++) {
        try {
            var players = worlds[i].getAllPlayers();

            for (var p = 0; p < players.length; p++) {
                if (
                    String(players[p].getName())
                        .equalsIgnoreCase(String(name))
                ) {
                    return players[p];
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
            return null;
        }
    }
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
    var number = Math.floor(Number(value));
    if (isNaN(number)) number = 0;

    var raw = String(number);
    var out = "";

    while (raw.length > 3) {
        out = "," + raw.substring(raw.length - 3) + out;
        raw = raw.substring(0, raw.length - 3);
    }

    return raw + out;
}

function compact(value) {
    var number = Number(value);
    if (!isFinite(number)) number = 0;

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
    var seconds = Math.max(0, Math.floor(Number(ms) / 1000));
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
            java.lang.System.currentTimeMillis() / 86400000
        );
    }
}

function currentStreakFromPlayer(player) {
    var stored = player.getStoreddata();
    var current = Math.floor(
        readNumber(stored, S_STREAK_CURRENT, 0)
    );
    var last = Math.floor(
        readNumber(stored, S_STREAK_LAST_DAY, -999999)
    );

    if (last >= 0 && todayEpochDay() - last > 1) {
        return 0;
    }

    return Math.max(0, current);
}

function message(player, text) {
    player.message(text);
}

function line(player) {
    message(player, C + "8" + "--------------------------------");
}

function showPersonal(player) {
    var store = getWorldStore(player);
    if (store == null) {
        message(player, C + "c[Sparring] Could not access stored data.");
        return;
    }

    var name = String(player.getName());
    var safe = safeName(name);
    var pStore = player.getStoreddata();

    var totalTP = readNumber(store, LB_TP_PREFIX + safe, 0);
    var sessions = readNumber(store, LB_SESSIONS_PREFIX + safe, 0);
    var totalTime = readNumber(store, LB_TOTAL_TIME_PREFIX + safe, 0);
    var longest = readNumber(store, LB_LONGEST_PREFIX + safe, 0);
    var bestPayout = readNumber(store, LB_BEST_PAYOUT_PREFIX + safe, 0);
    var perfect = readNumber(store, LB_PERFECT_PREFIX + safe, 0);
    var combo = readNumber(store, LB_HIGHEST_COMBO_PREFIX + safe, 0);
    var currentStreak = currentStreakFromPlayer(player);
    var bestStreak = readNumber(pStore, S_STREAK_BEST, 0);

    line(player);
    message(player, C + "6" + C + "lSparring Statistics");
    message(player, C + "7Player: " + C + "f" + name);
    line(player);
    message(player, C + "7Total Sparring TP: " + C + "a" + commas(totalTP));
    message(player, C + "7Highest TP Payout: " + C + "a" + commas(bestPayout));
    message(player, C + "7Total Sessions: " + C + "f" + commas(sessions));
    message(player, C + "7Rewarded Sparring Time: " + C + "b" + duration(totalTime));
    message(player, C + "7Longest Session: " + C + "b" + duration(longest));
    message(player, C + "7Perfect Training Payouts: " + C + "d" + commas(perfect));
    message(player, C + "7Highest Combo Tier: " + C + "e" + commas(combo));
    message(player, C + "7Current Training Streak: " + C + "6" + commas(currentStreak) + " days");
    message(player, C + "7Best Training Streak: " + C + "6" + commas(bestStreak) + " days");
    line(player);
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

    result.sort(function(a, b) {
        return b.value - a.value;
    });

    return result;
}

function showTop(player, title, keyPrefix, formatter, suffix) {
    var list = entries(player, keyPrefix);

    line(player);
    message(player, C + "6" + C + "l" + title);
    line(player);

    if (list.length == 0 || list[0].value <= 0) {
        message(player, C + "7No records have been saved yet.");
        line(player);
        return;
    }

    var shown = 0;

    for (var i = 0; i < list.length && shown < TOP_SIZE; i++) {
        if (list[i].value <= 0) continue;
        shown++;

        message(
            player,
            C + "e#" + shown +
            C + "f " + list[i].name +
            C + "7 - " +
            C + "a" + formatter(list[i].value) +
            (suffix == "" ? "" : C + "7 " + suffix)
        );
    }

    line(player);
}

function trigger(event) {
    var player = null;

    try {
        if (
            event.arguments != null &&
            event.arguments.length > 0
        ) {
            player = getOnlinePlayerByName(
                String(event.arguments[0])
            );
        }
    } catch (e) {}

    if (player == null) return;

    try {
        var id = Number(event.id);

        if (id == 73) {
            showPersonal(player);
        } else if (id == 74) {
            showTop(
                player,
                "Top Sparring TP",
                LB_TP_PREFIX,
                compact,
                "TP"
            );
        } else if (id == 75) {
            showTop(
                player,
                "Top Training Streaks",
                LB_STREAK_PREFIX,
                commas,
                "days"
            );
        } else if (id == 76) {
            showTop(
                player,
                "Longest Sparring Sessions",
                LB_LONGEST_PREFIX,
                duration,
                ""
            );
        } else if (id == 77) {
            showTop(
                player,
                "Highest Sparring Payouts",
                LB_BEST_PAYOUT_PREFIX,
                compact,
                "TP"
            );
        } else if (id == 78) {
            showTop(
                player,
                "Perfect Training Payouts",
                LB_PERFECT_PREFIX,
                commas,
                "payouts"
            );
        } else if (id == 79) {
            showTop(
                player,
                "Total Sparring Time",
                LB_TOTAL_TIME_PREFIX,
                duration,
                ""
            );
        }
    } catch (err) {
        message(
            player,
            C + "c[Sparring Command Error] " + err
        );
    }
}
/*
============================================================
 DBZ Legacy Reborn - Rival Commands V4
 Version: 4.0.0

 Display / leaderboard helper. Place like Sparring Command Handler.

 PLACE THIS SCRIPT IN THE SAME CUSTOMNPCS SCRIPT LOCATION
 AS SkillCheckCommand.js / Sparring Command Handler.

 DO NOT place this in the Global Player Script slot.

 TRIGGERS:
 200 = help
 206 = stats [player]
 220 = top RP leaderboard

 COMMAND FORMAT:
 noppes script trigger <id> <playerName> [args...]

 Core actions 201-205 / 210-213 are handled by Global Player scripts.
 You can also wire those IDs here as pass-through reminders.
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var System = Java.type("java.lang.System");

var C = String.fromCharCode(167);
var DB_KEY = "dlr.rivalry.v4.database";
var TOP_SIZE = 10;

var TIERS = [
    { min: 0,     name: "Acquaintance",  color: "7" },
    { min: 100,   name: "Competitor",    color: "a" },
    { min: 300,   name: "Adversary",     color: "2" },
    { min: 700,   name: "Rival",         color: "e" },
    { min: 1500,  name: "Nemesis",       color: "6" },
    { min: 3000,  name: "Legendary",     color: "c" },
    { min: 5000,  name: "Arch Rival",    color: "d" },
    { min: 7500,  name: "Mortal Enemy",  color: "5" },
    { min: 10000, name: "Eternal Rival", color: "b" },
    { min: 15000, name: "Mythic Rival",  color: "4" }
];

function readString(store, key, fallback) {
    try {
        if (store != null && store.has(key)) return String(store.get(key));
    } catch (e) {}
    return fallback;
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

function getTier(points) {
    var rp = Math.max(0, Number(points) || 0);
    var tier = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) {
        if (rp >= TIERS[i].min) tier = TIERS[i];
    }
    return tier;
}

function getOnlinePlayerByName(name) {
    var worlds = NpcAPI.Instance().getIWorlds();
    for (var i = 0; i < worlds.length; i++) {
        try {
            var players = worlds[i].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                if (String(players[p].getName()).equalsIgnoreCase(String(name))) {
                    return players[p];
                }
            }
        } catch (e) {}
    }
    return null;
}

function getWorldStore() {
    try {
        var world = NpcAPI.Instance().getIWorld("minecraft:overworld");
        if (world != null) return world.getStoreddata();
    } catch (e) {}
    return null;
}

function loadDatabase() {
    var store = getWorldStore();
    if (store == null) return null;
    var raw = readString(store, DB_KEY, "");
    if (raw == "") return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function findRecord(database, name) {
    if (database == null || database.players == null) return null;
    var wanted = String(name).toLowerCase();
    for (var uuid in database.players) {
        if (!database.players.hasOwnProperty(uuid)) continue;
        var record = database.players[uuid];
        if (String(record.name).toLowerCase() == wanted) return record;
    }
    return null;
}

function msg(player, text) {
    try { player.message(text); } catch (e) {}
}

function showHelp(player) {
    msg(player, C + "6===== Rival System V4 =====");
    msg(player, C + "e/rival <player> " + C + "7- Declare a rival");
    msg(player, C + "e/rival accept|decline|remove <player>");
    msg(player, C + "e/rival list " + C + "7- Your rivals");
    msg(player, C + "e/rival stats [player] " + C + "7- Career stats");
    msg(player, C + "e/rival top " + C + "7- RP leaderboard");
    msg(player, C + "e/challenge rival <player> " + C + "7- 60s damage contest");
    msg(player, C + "e/challenge accept|decline|cancel");
    msg(player, C + "7Near rivals for offensive bonuses, kill TP, and RP growth.");
}

function showStats(player, targetName) {
    var database = loadDatabase();
    if (database == null) {
        msg(player, C + "cNo rivalry data found yet.");
        return;
    }

    var name = targetName != null && String(targetName) != ""
        ? String(targetName)
        : String(player.getName());

    var record = findRecord(database, name);
    if (record == null) {
        msg(player, C + "cNo rivalry record for " + name + ".");
        return;
    }

    var career = record.career || {};
    var totalRp = Number(career.rivalPointsTotal) || 0;
    var tier = getTier(totalRp);
    var wins = Number(career.officialWins) || 0;
    var losses = Number(career.officialLosses) || 0;
    var played = wins + losses + (Number(career.officialDraws) || 0);
    var winPct = played > 0 ? ((wins / played) * 100).toFixed(1) : "0.0";

    msg(player, C + "6━━━━━━━━━━━━━━━━━━━━━━");
    msg(player, C + "eRival Stats: " + C + "f" + record.name);
    msg(player, C + "7Rank: " + C + tier.color + tier.name + C + "7 (" + commas(totalRp) + " RP)");
    msg(player, C + "7Record: " + C + "a" + wins + C + "7-" + C + "c" + losses +
        C + "7-" + C + "e" + (Number(career.officialDraws) || 0) +
        C + "8 (" + winPct + "% win)");
    msg(player, C + "7Streak: " + C + "f" + (Number(career.currentStreak) || 0) +
        C + "7  Best: " + C + "f" + (Number(career.bestStreak) || 0));
    msg(player, C + "7Knockouts: " + C + "f" + (Number(career.knockouts) || 0));
    msg(player, C + "7Damage Dealt: " + C + "f" + commas(career.damageDealt || 0));
    msg(player, C + "7Biggest Hit: " + C + "f" + commas(career.biggestHit || 0) +
        C + "7  Best Combo: " + C + "f" + (Number(career.highestCombo) || 0));
    msg(player, C + "7Challenges: " + C + "f" + (Number(career.challengesPlayed) || 0));
    msg(player, C + "7Kills Near Rival: " + C + "f" + (Number(career.killsNearRival) || 0));
    msg(player, C + "7Surpass Awards: " + C + "f" + (Number(career.surpassAwards) || 0));
    msg(player, C + "6━━━━━━━━━━━━━━━━━━━━━━");
}

function showTop(player) {
    var database = loadDatabase();
    if (database == null) {
        msg(player, C + "cNo rivalry data found yet.");
        return;
    }

    var rows = [];
    if (database.leaderboard != null) {
        for (var uuid in database.leaderboard) {
            if (!database.leaderboard.hasOwnProperty(uuid)) continue;
            rows.push(database.leaderboard[uuid]);
        }
    }

    if (rows.length == 0 && database.players != null) {
        for (var id in database.players) {
            if (!database.players.hasOwnProperty(id)) continue;
            var rec = database.players[id];
            rows.push({
                name: rec.name,
                rp: (rec.career && rec.career.rivalPointsTotal) || 0,
                wins: (rec.career && rec.career.officialWins) || 0,
                streak: (rec.career && rec.career.bestStreak) || 0
            });
        }
    }

    rows.sort(function (a, b) {
        return (Number(b.rp) || 0) - (Number(a.rp) || 0);
    });

    msg(player, C + "6===== Rival RP Leaderboard =====");
    if (rows.length == 0) {
        msg(player, C + "8No entries yet.");
        return;
    }

    for (var i = 0; i < rows.length && i < TOP_SIZE; i++) {
        var row = rows[i];
        var tier = getTier(row.rp);
        msg(
            player,
            C + "e#" + (i + 1) + " " + C + "f" + row.name +
            C + "7 - " + C + tier.color + commas(row.rp) + " RP" +
            C + "8 [" + tier.name + "]" +
            C + "7  W:" + C + "a" + (Number(row.wins) || 0)
        );
    }
}

function trigger(event) {
    try {
        var id = Number(event.id);
        var args = [];
        if (event.arguments != null) {
            for (var i = 0; i < event.arguments.length; i++) {
                args.push(String(event.arguments[i]));
            }
        }

        /*
         First argument from noppes script trigger is usually the player name.
         Remaining args are command arguments.
        */
        var playerName = args.length > 0 ? args[0] : "";
        var player = event.player != null ? event.player : getOnlinePlayerByName(playerName);
        if (player == null) return;

        var cmdArgs = [];
        for (var a = 1; a < args.length; a++) cmdArgs.push(args[a]);

        if (id == 200) {
            showHelp(player);
            return;
        }
        if (id == 206) {
            showStats(player, cmdArgs.length > 0 ? cmdArgs[0] : "");
            return;
        }
        if (id == 220) {
            showTop(player);
            return;
        }
    } catch (error) {
        try {
            if (event.player != null) event.player.message(C + "c[RivalCommands] " + error);
        } catch (e2) {}
    }
}

/*
============================================================
 DBZ Legacy Reborn - Rival Router V4
 Version: 4.1.0

 Script-slot command router for CMI asConsole! aliases.
 Same placement pattern as SkillCheckCommand / Sparring Command Handler.

 DO NOT place in Global Player Script slot.

 CMI alias format:
   asConsole! noppes script trigger <id> [playerName] [args...]

 TRIGGERS:
 200 help
 201 declare <player>
 202 accept <player>
 203 decline <player>
 204 remove <player>
 205 list
 206 stats [player]
 210 challenge <player>
 211 accept challenge
 212 decline challenge
 213 cancel/forfeit
 220 top [category]
 221 title / perks
 222 journal [player]
 223 season
 224 quests
 225 achievements
 226 hall of fame
 230 spectate <player>
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var Bukkit = Java.type("org.bukkit.Bukkit");

var C = String.fromCharCode(167);
var DB_KEY = "dlr.rivalry.v4.database";
var DB_BACKUP = "dlr.rivalry.v4.database.backup";
var CH_KEY = "dlr.rivalry.v4.challenges";
var PROG_KEY = "dlr.rivalry.v4.progression";

var TIERS = [
    { min: 0,     name: "Acquaintance",  color: "7", perk: "None" },
    { min: 100,   name: "Competitor",    color: "a", perk: "Sense farther" },
    { min: 300,   name: "Adversary",     color: "2", perk: "Better battle reports" },
    { min: 700,   name: "Rival",         color: "e", perk: "Rival notifications" },
    { min: 1500,  name: "Nemesis",       color: "6", perk: "Rival tracker" },
    { min: 3000,  name: "Legendary",     color: "c", perk: "Custom aura flag" },
    { min: 5000,  name: "Arch Rival",    color: "d", perk: "Entrance animation flag" },
    { min: 7500,  name: "Mortal Enemy",  color: "5", perk: "Priority alerts" },
    { min: 10000, name: "Eternal Rival", color: "b", perk: "Unique title" },
    { min: 15000, name: "Mythic Rival",  color: "4", perk: "Mythic title + max perks" }
];

var SPECIAL_TITLES = {
    world_rival: "World Rival",
    universe_rival: "Universe Rival",
    god_slayer: "God Slayer",
    legend_killer: "Legend Killer"
};

function now() {
    try { return Number(new Date().getTime()); }
    catch (e) { return Number(Java.type("java.lang.System").currentTimeMillis()); }
}

function str(v) { return v == null ? "" : String(v); }
function num(v, f) { var n = Number(v); return isNaN(n) || !isFinite(n) ? f : n; }
function lower(v) { return str(v).toLowerCase(); }
function msg(p, t) { try { p.message(t); } catch (e) {} }

function commas(v) {
    var n = Math.floor(num(v, 0));
    var raw = String(n);
    var out = "";
    while (raw.length > 3) {
        out = "," + raw.substring(raw.length - 3) + out;
        raw = raw.substring(0, raw.length - 3);
    }
    return raw + out;
}

function getTier(points) {
    var rp = Math.max(0, num(points, 0));
    var tier = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) if (rp >= TIERS[i].min) tier = TIERS[i];
    return tier;
}

function api() { return NpcAPI.Instance(); }

function worldStore() {
    var names = ["minecraft:overworld", "overworld"];
    for (var i = 0; i < names.length; i++) {
        try {
            var w = api().getIWorld(names[i]);
            if (w != null) return w.getStoreddata();
        } catch (e) {}
    }
    return null;
}

function loadJson(key) {
    var store = worldStore();
    if (store == null || !store.has(key)) return null;
    try { return JSON.parse(str(store.get(key))); } catch (e) { return null; }
}

function saveJson(key, backup, obj) {
    var store = worldStore();
    if (store == null) return;
    try {
        if (store.has(key)) store.put(backup, str(store.get(key)));
        obj.updatedAt = now();
        store.put(key, JSON.stringify(obj));
    } catch (e) {}
}

function onlineByName(name) {
    var worlds = api().getIWorlds();
    for (var i = 0; i < worlds.length; i++) {
        try {
            var players = worlds[i].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                if (lower(players[p].getName()) == lower(name)) return players[p];
            }
        } catch (e) {}
    }
    return null;
}

function findRecord(db, name) {
    if (db == null || db.players == null) return null;
    var wanted = lower(name);
    for (var uuid in db.players) {
        if (!db.players.hasOwnProperty(uuid)) continue;
        if (lower(db.players[uuid].name) == wanted) return db.players[uuid];
    }
    return null;
}

function syncCmiTitle(playerName, title) {
    try {
        var safe = str(title).replace(/[^A-Za-z0-9 _\-]/g, "");
        Bukkit.dispatchCommand(
            Bukkit.getConsoleSender(),
            "cmi usermeta " + playerName + " set rival_title " + safe
        );
        Bukkit.dispatchCommand(
            Bukkit.getConsoleSender(),
            "cmi usermeta " + playerName + " set rival_rank " + safe.replace(/ /g, "_")
        );
    } catch (e) {}
}

function ensureProg() {
    var prog = loadJson(PROG_KEY);
    if (prog == null || typeof prog != "object") {
        prog = {
            version: 4,
            season: {
                id: 1,
                name: "Season 1",
                startedAt: now(),
                endsAt: now() + (75 * 24 * 60 * 60 * 1000),
                leaderboard: {}
            },
            achievements: {},
            quests: {},
            journal: {},
            hallOfFame: {},
            specialTitles: {},
            updatedAt: now()
        };
    }
    if (prog.season == null) prog.season = { id: 1, name: "Season 1", startedAt: now(), endsAt: now() + (75 * 86400000), leaderboard: {} };
    if (prog.achievements == null) prog.achievements = {};
    if (prog.quests == null) prog.quests = {};
    if (prog.journal == null) prog.journal = {};
    if (prog.hallOfFame == null) prog.hallOfFame = {};
    if (prog.specialTitles == null) prog.specialTitles = {};
    return prog;
}

function weekKey() {
    return String(Math.floor(now() / (7 * 24 * 60 * 60 * 1000)));
}

function ensureQuests(prog, uuid) {
    var key = weekKey();
    if (prog.quests[uuid] == null || prog.quests[uuid].week != key) {
        prog.quests[uuid] = {
            week: key,
            list: [
                { id: "defeat_rival", name: "Defeat your rival", goal: 1, progress: 0, reward: 40 },
                { id: "melee_hits", name: "Land 50 melee hits in challenges", goal: 50, progress: 0, reward: 25 },
                { id: "ki_damage", name: "Deal 20,000 Ki damage in challenges", goal: 20000, progress: 0, reward: 25 },
                { id: "three_battles", name: "Fight 3 official battles", goal: 3, progress: 0, reward: 30 },
                { id: "long_battle", name: "Battle for over 60 seconds", goal: 1, progress: 0, reward: 20 }
            ]
        };
    }
    return prog.quests[uuid];
}

function showHelp(player) {
    msg(player, C + "6===== Rival System V4 =====");
    msg(player, C + "e/rival declare <player> " + C + "7Declare rival");
    msg(player, C + "e/rivalaccept|rivaldecline|rivalremove <player>");
    msg(player, C + "e/rivallist " + C + "7Your rivals");
    msg(player, C + "e/rivalstats [player] " + C + "7Career stats");
    msg(player, C + "e/rivaltop [rp|wins|streak|damage|combo|hit]");
    msg(player, C + "e/rivaltitle " + C + "7Title + perks");
    msg(player, C + "e/rivaljournal [player] " + C + "7Rival history journal");
    msg(player, C + "e/rivalseason " + C + "7Season standing");
    msg(player, C + "e/rivalquests " + C + "7Weekly quests");
    msg(player, C + "e/rivalachievements");
    msg(player, C + "e/rivalhof " + C + "7Hall of Fame");
    msg(player, C + "e/challenge <player> " + C + "7Official 60s battle");
    msg(player, C + "e/challengeaccept|challengedecline|challengecancel");
    msg(player, C + "e/spectaterival <player>");
}

function showStats(player, targetName) {
    var db = loadJson(DB_KEY);
    if (db == null) { msg(player, C + "cNo rivalry data yet."); return; }
    var name = targetName != "" ? targetName : str(player.getName());
    var record = findRecord(db, name);
    if (record == null) { msg(player, C + "cNo record for " + name); return; }
    var career = record.career || {};
    var rp = num(career.rivalPointsTotal, 0);
    var tier = getTier(rp);
    var wins = num(career.officialWins, 0);
    var losses = num(career.officialLosses, 0);
    var draws = num(career.officialDraws, 0);
    var played = wins + losses + draws;
    var pct = played > 0 ? ((wins / played) * 100).toFixed(1) : "0.0";

    msg(player, C + "6━━━━━━━━━━━━━━━━━━━━━━");
    msg(player, C + "eRival Stats: " + C + "f" + record.name);
    msg(player, C + "7Rank: " + C + tier.color + tier.name + C + "7 (" + commas(rp) + " RP)");
    msg(player, C + "7Record: " + C + "a" + wins + C + "7-" + C + "c" + losses + C + "7-" + C + "e" + draws + C + "8 (" + pct + "%)");
    msg(player, C + "7Streak: " + C + "f" + num(career.currentStreak, 0) + C + "7  Best: " + C + "f" + num(career.bestStreak, 0));
    msg(player, C + "7Knockouts: " + C + "f" + num(career.knockouts, 0));
    msg(player, C + "7Damage: " + C + "f" + commas(career.damageDealt) + C + "7 dealt / " + C + "f" + commas(career.damageTaken) + C + "7 taken");
    msg(player, C + "7Best Hit: " + C + "f" + commas(career.biggestHit) + C + "7  Combo: " + C + "f" + num(career.highestCombo, 0));
    msg(player, C + "7Fastest Win: " + C + "f" + (num(career.fastestWinMs, 0) > 0 ? Math.ceil(career.fastestWinMs / 1000) + "s" : "-"));
    msg(player, C + "7Longest Battle: " + C + "f" + (num(career.longestBattleMs, 0) > 0 ? Math.ceil(career.longestBattleMs / 1000) + "s" : "-"));
    msg(player, C + "7Challenges: " + C + "f" + num(career.challengesPlayed, 0));
    msg(player, C + "6━━━━━━━━━━━━━━━━━━━━━━");
}

function showTop(player, category) {
    var db = loadJson(DB_KEY);
    if (db == null) { msg(player, C + "cNo rivalry data yet."); return; }
    var cat = lower(category || "rp");
    var rows = [];
    for (var uuid in db.players) {
        if (!db.players.hasOwnProperty(uuid)) continue;
        var rec = db.players[uuid];
        var career = rec.career || {};
        rows.push({
            name: rec.name,
            rp: num(career.rivalPointsTotal, 0),
            wins: num(career.officialWins, 0),
            streak: num(career.bestStreak, 0),
            damage: num(career.damageDealt, 0),
            combo: num(career.highestCombo, 0),
            hit: num(career.biggestHit, 0),
            battles: num(career.challengesPlayed, 0)
        });
    }
    var key = "rp";
    if (cat == "wins") key = "wins";
    else if (cat == "streak") key = "streak";
    else if (cat == "damage") key = "damage";
    else if (cat == "combo") key = "combo";
    else if (cat == "hit") key = "hit";
    else if (cat == "battles") key = "battles";
    else key = "rp";

    rows.sort(function (a, b) { return num(b[key], 0) - num(a[key], 0); });
    msg(player, C + "6===== Rival Top (" + key + ") =====");
    if (rows.length == 0) { msg(player, C + "8No entries."); return; }
    for (var i = 0; i < rows.length && i < 10; i++) {
        var r = rows[i];
        msg(player, C + "e#" + (i + 1) + " " + C + "f" + r.name + C + "7 - " + C + "a" + commas(r[key]));
    }
}

function showTitle(player) {
    var db = loadJson(DB_KEY);
    var prog = ensureProg();
    if (db == null) { msg(player, C + "cNo rivalry data yet."); return; }
    var record = findRecord(db, player.getName());
    if (record == null) { msg(player, C + "cNo record."); return; }
    var rp = num((record.career || {}).rivalPointsTotal, 0);
    var tier = getTier(rp);
    var special = prog.specialTitles[str(player.getUUID())];
    var title = special != null ? SPECIAL_TITLES[special] || special : tier.name;
    syncCmiTitle(str(player.getName()), title);

    msg(player, C + "6===== Rival Title =====");
    msg(player, C + "7Title: " + C + tier.color + title);
    msg(player, C + "7RP: " + C + "f" + commas(rp));
    msg(player, C + "7Perk: " + C + "e" + tier.perk);
    msg(player, C + "8Synced to CMI usermeta rival_title / rival_rank");
    msg(player, C + "8Placeholder idea: %cmi_user_meta_rival_title%");
}

function showJournal(player, targetName) {
    var db = loadJson(DB_KEY);
    var prog = ensureProg();
    if (db == null) { msg(player, C + "cNo rivalry data yet."); return; }
    var name = targetName != "" ? targetName : str(player.getName());
    var record = findRecord(db, name);
    if (record == null) { msg(player, C + "cNo record for " + name); return; }

    msg(player, C + "6===== Rival Journal: " + record.name + " =====");
    var count = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        var link = record.rivals[uuid];
        count++;
        var jKey = record.uuid + ">" + uuid;
        var j = prog.journal[jKey] || {};
        msg(player, C + "e" + link.name + C + "7 | " + getTier(link.points).name + " (" + commas(link.points) + " RP)");
        msg(player, C + "8  W/L " + num(link.wins, 0) + "/" + num(link.losses, 0) +
            " | First: " + (j.firstBattleAt ? "yes" : "no") +
            " | Biggest win dmg: " + commas(j.biggestWinDamage || 0));
    }
    if (count == 0) msg(player, C + "8No rival entries.");
}

function showSeason(player) {
    var db = loadJson(DB_KEY);
    var prog = ensureProg();
    saveJson(PROG_KEY, PROG_KEY + ".backup", prog);
    var season = prog.season;
    var left = Math.max(0, num(season.endsAt, 0) - now());
    var days = Math.ceil(left / 86400000);
    msg(player, C + "6===== " + season.name + " =====");
    msg(player, C + "7Season ID: " + C + "f" + season.id + C + "7  Ends in: " + C + "f" + days + "d");

    var record = db != null ? findRecord(db, player.getName()) : null;
    var uuid = record != null ? record.uuid : str(player.getUUID());
    var entry = season.leaderboard[uuid] || { rp: 0, wins: 0 };
    msg(player, C + "7Your Season RP: " + C + "f" + commas(entry.rp));
    msg(player, C + "7Your Season Wins: " + C + "f" + commas(entry.wins));

    var rows = [];
    for (var id in season.leaderboard) {
        if (!season.leaderboard.hasOwnProperty(id)) continue;
        rows.push(season.leaderboard[id]);
    }
    rows.sort(function (a, b) { return num(b.rp, 0) - num(a.rp, 0); });
    msg(player, C + "6--- Season Top 5 ---");
    for (var i = 0; i < rows.length && i < 5; i++) {
        msg(player, C + "e#" + (i + 1) + " " + C + "f" + rows[i].name + C + "7 - " + commas(rows[i].rp) + " SRP");
    }
}

function showQuests(player) {
    var prog = ensureProg();
    var q = ensureQuests(prog, str(player.getUUID()));
    saveJson(PROG_KEY, PROG_KEY + ".backup", prog);
    msg(player, C + "6===== Weekly Rival Quests =====");
    for (var i = 0; i < q.list.length; i++) {
        var item = q.list[i];
        var done = num(item.progress, 0) >= num(item.goal, 1);
        msg(player, (done ? C + "a✔ " : C + "7• ") + C + "f" + item.name +
            C + "8 (" + Math.min(num(item.progress, 0), item.goal) + "/" + item.goal + ")" +
            C + "7 +" + item.rp + " RP");
    }
}

function showAchievements(player) {
    var prog = ensureProg();
    var list = prog.achievements[str(player.getUUID())] || {};
    var defs = [
        ["first_blood", "First Blood"],
        ["nemesis", "Nemesis"],
        ["unbreakable", "Unbreakable"],
        ["comeback_king", "Comeback King"],
        ["legend_killer", "Legend Killer"],
        ["perfect_victory", "Perfect Victory"],
        ["untouchable", "Untouchable"],
        ["combo_master", "Combo Master"],
        ["ki_dominator", "Ki Dominator"],
        ["battle_hardened", "Battle Hardened"],
        ["god_rival", "God Rival"]
    ];
    msg(player, C + "6===== Rival Achievements =====");
    for (var i = 0; i < defs.length; i++) {
        var unlocked = list[defs[i][0]] === true;
        msg(player, (unlocked ? C + "a✔ " : C + "8□ ") + C + "f" + defs[i][1]);
    }
}

function showHof(player) {
    var prog = ensureProg();
    var hof = prog.hallOfFame;
    msg(player, C + "6===== Rival Hall of Fame =====");
    msg(player, C + "7Season Champion: " + C + "f" + (hof.seasonChampion || "-"));
    msg(player, C + "7Highest RP: " + C + "f" + (hof.highestRp || "-"));
    msg(player, C + "7Longest Win Streak: " + C + "f" + (hof.longestStreak || "-"));
    msg(player, C + "7Greatest Comeback: " + C + "f" + (hof.greatestComeback || "-"));
    msg(player, C + "7Most Legendary Battles: " + C + "f" + (hof.mostLegendary || "-"));
}

function showSpectate(player, targetName) {
    if (targetName == "") {
        msg(player, C + "cUsage: /spectaterival <player>");
        return;
    }
    var target = onlineByName(targetName);
    if (target == null) { msg(player, C + "cThat player is offline."); return; }
    var ch = loadJson(CH_KEY);
    if (ch == null || ch.playerSessions == null) {
        msg(player, C + "cNo active rival battles.");
        return;
    }
    var sid = ch.playerSessions[str(target.getUUID())];
    if (sid == null || ch.sessions == null || ch.sessions[String(sid)] == null) {
        msg(player, C + "cThat player is not in an official rival battle.");
        return;
    }
    var session = ch.sessions[String(sid)];
    var cA = (session.combat && session.combat[session.challengerUuid]) || {};
    var cB = (session.combat && session.combat[session.opponentUuid]) || {};
    msg(player, C + "6===== Spectating Rival Battle =====");
    msg(player, C + "7State: " + C + "f" + session.state);
    msg(player, C + "e" + session.challengerName + C + "7 dmg " + C + "f" + commas(cA.damage || 0));
    msg(player, C + "e" + session.opponentName + C + "7 dmg " + C + "f" + commas(cB.damage || 0));
    if (session.state == "active") {
        var left = Math.max(0, num(session.battleEndsAt, 0) - now());
        msg(player, C + "7Time Left: " + C + "f" + Math.ceil(left / 1000) + "s");
    }
    try {
        player.getTempdata().put("rival.v4.spectateSession", String(sid));
        player.getTempdata().put("rival.v4.spectateUntil", String(now() + 120000));
    } catch (e) {}
    msg(player, C + "aSpectating for 2 minutes. Live updates require RivalSpectator_v4.");
}

/*
 Forward gameplay commands into Global Player scripts by invoking the same
 trigger IDs while temporarily unavailable from console.
 For declare/accept/challenge we replicate enough by messaging players to use
 Global handlers: actually we dispatch a player-context run via execute.
*/
function runAsPlayerNoppes(player, id, argsLine) {
    try {
        var cmd = "noppes script trigger " + id;
        if (argsLine != null && str(argsLine) != "") cmd += " " + argsLine;
        var name = str(player.getName());
        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "execute as " + name + " at " + name + " run " + cmd);
        return true;
    } catch (e) {
        msg(player, C + "cFailed to dispatch trigger: " + e);
        return false;
    }
}

function trigger(event) {
    try {
        var id = Number(event.id);
        var args = [];
        if (event.arguments != null) {
            for (var i = 0; i < event.arguments.length; i++) args.push(str(event.arguments[i]));
        }

        var player = null;
        if (event.entity != null) {
            try { if (Number(event.entity.getType()) == 1) player = event.entity; } catch (e1) {}
        }
        if (player == null && event.player != null) player = event.player;

        var cmdArgs = [];
        if (player == null) {
            if (args.length == 0) return;
            player = onlineByName(args[0]);
            for (var a = 1; a < args.length; a++) cmdArgs.push(args[a]);
        } else {
            if (args.length > 0 && lower(args[0]) == lower(player.getName())) {
                for (var b = 1; b < args.length; b++) cmdArgs.push(args[b]);
            } else {
                cmdArgs = args;
            }
        }
        if (player == null) return;

        if (id == 200) { showHelp(player); return; }
        if (id == 206) { showStats(player, cmdArgs.length > 0 ? cmdArgs[0] : ""); return; }
        if (id == 220) { showTop(player, cmdArgs.length > 0 ? cmdArgs[0] : "rp"); return; }
        if (id == 221) { showTitle(player); return; }
        if (id == 222) { showJournal(player, cmdArgs.length > 0 ? cmdArgs[0] : ""); return; }
        if (id == 223) { showSeason(player); return; }
        if (id == 224) { showQuests(player); return; }
        if (id == 225) { showAchievements(player); return; }
        if (id == 226) { showHof(player); return; }
        if (id == 230) { showSpectate(player, cmdArgs.length > 0 ? cmdArgs[0] : ""); return; }

        /*
         Declare / challenge actions must run in player entity context so
         RivalCore / RivalChallenge Global Player scripts receive event.entity.
        */
        if (id == 201 || id == 202 || id == 203 || id == 204 || id == 205 ||
            id == 210 || id == 211 || id == 212 || id == 213) {
            runAsPlayerNoppes(player, id, cmdArgs.join(" "));
            return;
        }
    } catch (error) {
        try {
            if (event.player != null) event.player.message(C + "c[RivalRouter] " + error);
        } catch (e2) {}
        try { print("[RivalRouter v4] " + error); } catch (e3) {}
    }
}

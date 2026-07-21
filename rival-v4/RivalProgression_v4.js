/*
============================================================
 DBZ Legacy Reborn - Rival Progression V4
 Version: 4.1.0

 Phases 5/8/10/11/12/15/16 support:
 - Title sync to CMI usermeta
 - Season RP tracking hooks
 - Weekly quest progress from challenges
 - Achievement unlocks
 - Journal updates
 - Hall of Fame recompute

 PLACE AS: Global Player Script
 EVENTS: login, tick, trigger

 Trigger 240 = force refresh titles/hof (admin/self)
============================================================
*/

var RP_API = null;
var RP_Bukkit = null;

function rpApi() {
    if (RP_API === null) RP_API = Java.type("noppes.npcs.api.NpcAPI");
    return RP_API;
}
function rpBukkit() {
    if (RP_Bukkit === null) RP_Bukkit = Java.type("org.bukkit.Bukkit");
    return RP_Bukkit;
}

var C = String.fromCharCode(167);
var DB_KEY = "dlr.rivalry.v4.database";
var CH_KEY = "dlr.rivalry.v4.challenges";
var PROG_KEY = "dlr.rivalry.v4.progression";
var PROG_BACKUP = "dlr.rivalry.v4.progression.backup";

var TIERS = [
    { min: 0, name: "Acquaintance" },
    { min: 100, name: "Competitor" },
    { min: 300, name: "Adversary" },
    { min: 700, name: "Rival" },
    { min: 1500, name: "Nemesis" },
    { min: 3000, name: "Legendary" },
    { min: 5000, name: "Arch Rival" },
    { min: 7500, name: "Mortal Enemy" },
    { min: 10000, name: "Eternal Rival" },
    { min: 15000, name: "Mythic Rival" }
];

function now() {
    try { return Number(new Date().getTime()); }
    catch (e) { return Number(Java.type("java.lang.System").currentTimeMillis()); }
}
function str(v) { return v == null ? "" : String(v); }
function num(v, f) { var n = Number(v); return isNaN(n) || !isFinite(n) ? f : n; }
function msg(p, t) { try { p.message(t); } catch (e) {} }
function isPlayer(e) {
    if (e == null) return false;
    try { return Number(e.getType()) === 1; } catch (ex) { return false; }
}
function uuid(p) { try { return str(p.getUUID()); } catch (e) { return ""; } }
function pname(p) { try { return str(p.getName()); } catch (e) { return "Unknown"; } }

function store() {
    var names = ["minecraft:overworld", "overworld"];
    for (var i = 0; i < names.length; i++) {
        try {
            var w = rpApi().Instance().getIWorld(names[i]);
            if (w != null) return w.getStoreddata();
        } catch (e) {}
    }
    return null;
}

function load(key) {
    var s = store();
    if (s == null || !s.has(key)) return null;
    try { return JSON.parse(str(s.get(key))); } catch (e) { return null; }
}

function save(key, backup, obj) {
    var s = store();
    if (s == null) return;
    try {
        if (s.has(key)) s.put(backup, str(s.get(key)));
        obj.updatedAt = now();
        s.put(key, JSON.stringify(obj));
    } catch (e) {}
}

function tierName(points) {
    var rp = Math.max(0, num(points, 0));
    var name = TIERS[0].name;
    for (var i = 0; i < TIERS.length; i++) if (rp >= TIERS[i].min) name = TIERS[i].name;
    return name;
}

function ensureProg() {
    var prog = load(PROG_KEY);
    if (prog == null || typeof prog != "object") {
        prog = {
            version: 4,
            season: {
                id: 1,
                name: "Season 1",
                startedAt: now(),
                endsAt: now() + (75 * 86400000),
                leaderboard: {}
            },
            achievements: {},
            quests: {},
            journal: {},
            hallOfFame: {},
            specialTitles: {},
            processedBattles: {},
            updatedAt: now()
        };
    }
    if (prog.season == null) prog.season = { id: 1, name: "Season 1", startedAt: now(), endsAt: now() + (75 * 86400000), leaderboard: {} };
    if (prog.achievements == null) prog.achievements = {};
    if (prog.quests == null) prog.quests = {};
    if (prog.journal == null) prog.journal = {};
    if (prog.hallOfFame == null) prog.hallOfFame = {};
    if (prog.specialTitles == null) prog.specialTitles = {};
    if (prog.processedBattles == null) prog.processedBattles = {};
    return prog;
}

function weekKey() { return String(Math.floor(now() / (7 * 86400000))); }

function ensureQuests(prog, id) {
    var key = weekKey();
    if (prog.quests[id] == null || prog.quests[id].week != key) {
        prog.quests[id] = {
            week: key,
            list: [
                { id: "defeat_rival", name: "Defeat your rival", goal: 1, progress: 0, rp: 40 },
                { id: "melee_hits", name: "Land 50 melee hits in challenges", goal: 50, progress: 0, rp: 25 },
                { id: "ki_damage", name: "Deal 20,000 Ki damage in challenges", goal: 20000, progress: 0, rp: 25 },
                { id: "three_battles", name: "Fight 3 official battles", goal: 3, progress: 0, rp: 30 },
                { id: "long_battle", name: "Finish a full 60s battle", goal: 1, progress: 0, rp: 20 }
            ]
        };
    }
    return prog.quests[id];
}

function bumpQuest(q, id, amount) {
    for (var i = 0; i < q.list.length; i++) {
        if (q.list[i].id == id) {
            q.list[i].progress = num(q.list[i].progress, 0) + amount;
        }
    }
}

function unlock(prog, id, ach, player) {
    if (prog.achievements[id] == null) prog.achievements[id] = {};
    if (prog.achievements[id][ach] === true) return;
    prog.achievements[id][ach] = true;
    msg(player, C + "6[Rival Achievement] " + C + "e" + ach.replace(/_/g, " "));
    if (ach == "legend_killer") prog.specialTitles[id] = "legend_killer";
    if (ach == "god_rival") prog.specialTitles[id] = "god_slayer";
}

function syncTitle(player, title) {
    try {
        var safe = str(title).replace(/[^A-Za-z0-9 _\-]/g, "");
        rpBukkit().dispatchCommand(
            rpBukkit().getConsoleSender(),
            "cmi usermeta " + pname(player) + " set rival_title " + safe
        );
    } catch (e) {}
}

function recomputeHof(prog, db) {
    if (db == null || db.players == null) return;
    var bestRp = null;
    var bestStreak = null;
    var bestBattles = null;
    for (var id in db.players) {
        if (!db.players.hasOwnProperty(id)) continue;
        var rec = db.players[id];
        var career = rec.career || {};
        var rp = num(career.rivalPointsTotal, 0);
        var streak = num(career.bestStreak, 0);
        var battles = num(career.challengesPlayed, 0);
        if (bestRp == null || rp > bestRp.rp) bestRp = { name: rec.name + " (" + rp + ")", rp: rp };
        if (bestStreak == null || streak > bestStreak.v) bestStreak = { name: rec.name + " (" + streak + ")", v: streak };
        if (bestBattles == null || battles > bestBattles.v) bestBattles = { name: rec.name + " (" + battles + ")", v: battles };
    }
    var seasonRows = [];
    for (var sid in prog.season.leaderboard) {
        if (!prog.season.leaderboard.hasOwnProperty(sid)) continue;
        seasonRows.push(prog.season.leaderboard[sid]);
    }
    seasonRows.sort(function (a, b) { return num(b.rp, 0) - num(a.rp, 0); });
    prog.hallOfFame.seasonChampion = seasonRows.length > 0 ? seasonRows[0].name + " (" + seasonRows[0].rp + " SRP)" : "-";
    prog.hallOfFame.highestRp = bestRp != null ? bestRp.name : "-";
    prog.hallOfFame.longestStreak = bestStreak != null ? bestStreak.name : "-";
    prog.hallOfFame.mostLegendary = bestBattles != null ? bestBattles.name : "-";
    if (prog.hallOfFame.greatestComeback == null) prog.hallOfFame.greatestComeback = "-";
}

function processEndedSessions(player) {
    var ch = load(CH_KEY);
    var db = load(DB_KEY);
    var prog = ensureProg();
    if (ch == null || ch.sessions == null) {
        /* ended sessions are deleted by Challenge; use career deltas via temp marker */
        return;
    }
}

/*
 Challenge module deletes finished sessions. Progression is therefore applied
 from player career snapshots + combat temp export hooks below.
*/
function onLoginProgress(player) {
    var db = load(DB_KEY);
    var prog = ensureProg();
    if (db == null) return;
    var rec = db.players[uuid(player)];
    if (rec == null) return;
    var rp = num((rec.career || {}).rivalPointsTotal, 0);
    var title = prog.specialTitles[uuid(player)] || tierName(rp);
    if (title == "legend_killer") title = "Legend Killer";
    if (title == "god_slayer") title = "God Slayer";
    if (title == "world_rival") title = "World Rival";
    if (title == "universe_rival") title = "Universe Rival";
    syncTitle(player, typeof title == "string" && title.indexOf(" ") >= 0 ? title : tierName(rp));
    ensureQuests(prog, uuid(player));
    recomputeHof(prog, db);
    save(PROG_KEY, PROG_BACKUP, prog);

    if (num((rec.career || {}).rivalPointsTotal, 0) >= 1500) unlock(prog, uuid(player), "nemesis", player);
    if (num((rec.career || {}).bestStreak, 0) >= 5) unlock(prog, uuid(player), "unbreakable", player);
    if (num((rec.career || {}).challengesPlayed, 0) >= 25) unlock(prog, uuid(player), "battle_hardened", player);
    if (num((rec.career || {}).highestCombo, 0) >= 20) unlock(prog, uuid(player), "combo_master", player);
    if (num((rec.career || {}).rivalPointsTotal, 0) >= 15000) unlock(prog, uuid(player), "god_rival", player);
    save(PROG_KEY, PROG_BACKUP, prog);
}

function trackChallengeCombat(player) {
    var ch = load(CH_KEY);
    if (ch == null || ch.playerSessions == null) return;
    var sid = ch.playerSessions[uuid(player)];
    if (sid == null) return;
    var session = ch.sessions[String(sid)];
    if (session == null || session.state != "active") return;

    var combat = session.combat && session.combat[uuid(player)] ? session.combat[uuid(player)] : null;
    if (combat == null) return;

    var prog = ensureProg();
    var q = ensureQuests(prog, uuid(player));
    var temp = player.getTempdata();
    var lastHits = 0;
    var lastKi = 0;
    try {
        if (temp.has("rival.v4.prog.hits")) lastHits = num(temp.get("rival.v4.prog.hits"), 0);
        if (temp.has("rival.v4.prog.ki")) lastKi = num(temp.get("rival.v4.prog.ki"), 0);
    } catch (e) {}

    var hits = num(combat.hits, 0);
    var ki = num(combat.ki, 0);
    var phy = num(combat.physical, 0);
    if (hits > lastHits) bumpQuest(q, "melee_hits", hits - lastHits);
    if (ki > lastKi) bumpQuest(q, "ki_damage", Math.floor(ki - lastKi));
    try {
        temp.put("rival.v4.prog.hits", String(hits));
        temp.put("rival.v4.prog.ki", String(ki));
    } catch (e2) {}

    if (ki >= 5000) unlock(prog, uuid(player), "ki_dominator", player);
    if (num(combat.longestCombo, 0) >= 20) unlock(prog, uuid(player), "combo_master", player);
    save(PROG_KEY, PROG_BACKUP, prog);
}

function noteBattleResult(player) {
    /*
     Detect win/loss messages already handled by Challenge.
     Use career counters + temp flag set by Challenge export if present.
    */
    var temp = player.getTempdata();
    if (!temp.has("rival.v4.battleResult")) return;
    var raw = str(temp.get("rival.v4.battleResult"));
    try { temp.remove("rival.v4.battleResult"); } catch (e) {}
    var data = null;
    try { data = JSON.parse(raw); } catch (e2) { return; }
    if (data == null) return;

    var prog = ensureProg();
    var db = load(DB_KEY);
    var id = uuid(player);
    var q = ensureQuests(prog, id);
    bumpQuest(q, "three_battles", 1);
    if (data.fullDuration === true) bumpQuest(q, "long_battle", 1);
    if (data.won === true) bumpQuest(q, "defeat_rival", 1);

    if (data.won === true && num(data.damageTaken, 0) <= 0) unlock(prog, id, "untouchable", player);
    if (data.won === true && num(data.remainingHpPct, 100) >= 90) unlock(prog, id, "perfect_victory", player);
    if (data.comeback === true) {
        unlock(prog, id, "comeback_king", player);
        prog.hallOfFame.greatestComeback = pname(player);
    }
    if (data.firstWin === true) unlock(prog, id, "first_blood", player);
    if (data.beatHigherRp === true) unlock(prog, id, "legend_killer", player);

    var jKey = str(data.journalKey || "");
    if (jKey != "") {
        if (prog.journal[jKey] == null) prog.journal[jKey] = {};
        var j = prog.journal[jKey];
        if (j.firstBattleAt == null) j.firstBattleAt = now();
        if (data.won === true) {
            if (j.firstWinAt == null) j.firstWinAt = now();
            j.biggestWinDamage = Math.max(num(j.biggestWinDamage, 0), num(data.damageDealt, 0));
        } else {
            if (j.firstLossAt == null) j.firstLossAt = now();
            j.biggestLossDamage = Math.max(num(j.biggestLossDamage, 0), num(data.damageTaken, 0));
        }
        j.lastBattleAt = now();
        j.battlesThisSeason = num(j.battlesThisSeason, 0) + 1;
    }

    if (prog.season.leaderboard[id] == null) {
        prog.season.leaderboard[id] = { uuid: id, name: pname(player), rp: 0, wins: 0 };
    }
    prog.season.leaderboard[id].name = pname(player);
    prog.season.leaderboard[id].rp = num(prog.season.leaderboard[id].rp, 0) + num(data.seasonRp, 0);
    if (data.won === true) prog.season.leaderboard[id].wins = num(prog.season.leaderboard[id].wins, 0) + 1;

    recomputeHof(prog, db);
    save(PROG_KEY, PROG_BACKUP, prog);
}

function login(event) {
    try {
        if (!isPlayer(event.player)) return;
        onLoginProgress(event.player);
    } catch (e) {
        try { print("[RivalProgression] login " + e); } catch (e2) {}
    }
}

function tick(event) {
    try {
        var player = event.player;
        if (!isPlayer(player)) return;
        var temp = player.getTempdata();
        var last = 0;
        try { if (temp.has("rival.v4.prog.tick")) last = num(temp.get("rival.v4.prog.tick"), 0); } catch (e) {}
        if (now() - last < 1000) return;
        try { temp.put("rival.v4.prog.tick", String(now())); } catch (e2) {}
        trackChallengeCombat(player);
        noteBattleResult(player);
    } catch (e3) {
        try { print("[RivalProgression] tick " + e3); } catch (e4) {}
    }
}

function trigger(event) {
    try {
        var player = event.entity != null ? event.entity : event.player;
        if (!isPlayer(player)) return;
        if (Number(event.id) != 240) return;
        onLoginProgress(player);
        msg(player, C + "a[Rival] Titles / HOF refreshed.");
    } catch (e) {}
}

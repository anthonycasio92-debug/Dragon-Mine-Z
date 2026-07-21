/*
============================================================
 DBZ Legacy Reborn - Rival Command Handler
 Version: 4.4.0

 PLACE THIS SCRIPT IN THE SAME CUSTOMNPCS SCRIPT LOCATION
 AS YOUR WORKING SkillCheckCommand.js / Sparring Command Handler.

 DO NOT place this in the Global Player Script slot.

 Gameplay stays in Rival System.js (Global Player).
 This file is the command display / action handler only —
 same split as Sparring TP System + Sparring Command Handler.

 TRIGGERS:
 200 = Rival help
 201 = Declare rival
 202 = Accept rivalry
 203 = Decline rivalry
 204 = Remove rivalry
 205 = List rivals
 206 = Rival statistics
 210 = Challenge player
 211 = Accept challenge
 212 = Decline challenge
 213 = Cancel / forfeit challenge
 220 = Top leaderboards
 221 = Title + perks
 222 = Rival journal
 223 = Season status
 224 = Weekly quests
 225 = Achievements
 226 = Hall of Fame
 230 = Spectate rival battle

 COMMAND FORMAT:
 noppes script trigger <id> <playerName>
 noppes script trigger <id> <playerName> <args...>

 CMI aliases should inject [playerName] as argument 0
 (same pattern as sparring stats / leaderboards).
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var Bukkit = Java.type("org.bukkit.Bukkit");

var C = String.fromCharCode(167);
var DB_KEY = "dlr.rivalry.v4.database";
var DB_BACKUP = "dlr.rivalry.v4.database.backup";
var CH_KEY = "dlr.rivalry.v4.challenges";
var CH_BACKUP = "dlr.rivalry.v4.challenges.backup";
var PROG_KEY = "dlr.rivalry.v4.progression";

/*
 Statuses: unknown | declared | mutual | nemesis
 Mutual+Nemesis share MAX_MUTUAL slots. Declared/Unknown unlimited.
*/
var MAX_MUTUAL = 2;
var NEMESIS_RP = 1500;
var REQUEST_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
var DECLARE_COOLDOWN_MS = 30 * 1000;
var CH_REQUEST_EXPIRE_MS = 30 * 1000;
var CH_REQUEST_COOLDOWN_MS = 15 * 1000;
var CH_COUNTDOWN_MS = 5 * 1000;
var CH_DURATION_MS = 60 * 1000;
var CH_MAX_DISTANCE = 64;

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

function now() {
    try { return Number(new Date().getTime()); }
    catch (e) { return Number(Java.type("java.lang.System").currentTimeMillis()); }
}
function str(v) { return v == null ? "" : String(v); }
function num(v, f) { var n = Number(v); return isNaN(n) || !isFinite(n) ? f : n; }
function lower(v) { return str(v).toLowerCase(); }
function msg(p, t) { try { if (p != null) p.message(t); } catch (e) {} }
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
function uuidOf(p) { try { return str(p.getUUID()); } catch (e) { return ""; } }
function nameOf(p) { try { return str(p.getName()); } catch (e) { return "Unknown"; } }

function dist(a, b) {
    try {
        var dx = a.getX() - b.getX();
        var dy = a.getY() - b.getY();
        var dz = a.getZ() - b.getZ();
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (e) { return 999999; }
}

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
    if (store == null) throw new Error("No world storeddata");
    if (store.has(key)) store.put(backup, str(store.get(key)));
    obj.updatedAt = now();
    store.put(key, JSON.stringify(obj));
}

function onlineByName(name) {
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

function freshDb() {
    return { version: 4, players: {}, requests: {}, cooldowns: {}, leaderboard: {}, updatedAt: now() };
}

function freshChallengeDb() {
    return { version: 4, nextId: 1, pending: {}, sessions: {}, playerSessions: {}, cooldowns: {}, updatedAt: now() };
}

function loadDb() {
    var db = loadJson(DB_KEY);
    if (db == null || typeof db != "object") db = freshDb();
    if (db.players == null) db.players = {};
    if (db.requests == null) db.requests = {};
    if (db.cooldowns == null) db.cooldowns = {};
    if (db.leaderboard == null) db.leaderboard = {};
    return db;
}

function saveDb(db) { saveJson(DB_KEY, DB_BACKUP, db); }

function loadCh() {
    var db = loadJson(CH_KEY);
    if (db == null || typeof db != "object") db = freshChallengeDb();
    if (db.pending == null) db.pending = {};
    if (db.sessions == null) db.sessions = {};
    if (db.playerSessions == null) db.playerSessions = {};
    if (db.cooldowns == null) db.cooldowns = {};
    db.nextId = Math.max(1, num(db.nextId, 1));
    return db;
}

function saveCh(db) { saveJson(CH_KEY, CH_BACKUP, db); }

function freshPlayer(u, n) {
    return {
        uuid: u,
        name: n,
        nameLower: lower(n),
        createdAt: now(),
        lastSeenAt: now(),
        rivals: {},
        career: {
            rivalPointsTotal: 0, officialWins: 0, officialLosses: 0, officialDraws: 0,
            knockouts: 0, currentStreak: 0, bestStreak: 0, damageDealt: 0, damageTaken: 0,
            biggestHit: 0, highestCombo: 0, challengesPlayed: 0, presenceMs: 0,
            killsNearRival: 0, surpassAwards: 0, fastestWinMs: 0, longestBattleMs: 0
        },
        totals: { declarationsSent: 0, declarationsAccepted: 0, declarationsDeclined: 0, rivalsRemoved: 0 }
    };
}

function ensurePlayer(db, player) {
    var u = uuidOf(player);
    var n = nameOf(player);
    if (db.players[u] == null) db.players[u] = freshPlayer(u, n);
    var rec = db.players[u];
    rec.uuid = u;
    rec.name = n;
    rec.nameLower = lower(n);
    rec.lastSeenAt = now();
    if (rec.rivals == null) rec.rivals = {};
    if (rec.career == null) rec.career = freshPlayer(u, n).career;
    if (rec.totals == null) rec.totals = freshPlayer(u, n).totals;
    return rec;
}

function findRecord(db, name) {
    var wanted = lower(name);
    for (var u in db.players) {
        if (!db.players.hasOwnProperty(u)) continue;
        if (lower(db.players[u].name) == wanted) return db.players[u];
    }
    return null;
}

function linkStatus(link) {
    if (link == null) return "none";
    if (link.mutual === true) {
        if (num(link.points, 0) >= NEMESIS_RP) return "nemesis";
        return "mutual";
    }
    if (link.declaredByMe === true) return "declared";
    if (link.declaredByThem === true) return "unknown";
    return "none";
}

function linkStatusLabel(status) {
    if (status == "nemesis") return C + "c" + C + "lNemesis";
    if (status == "mutual") return C + "6Mutual";
    if (status == "declared") return C + "eDeclared";
    if (status == "unknown") return C + "7Unknown";
    return C + "8None";
}

function refreshLinkStatus(link) {
    if (link == null) return "none";
    link.status = linkStatus(link);
    return link.status;
}

function ensureLink(owner, target) {
    if (owner.rivals[target.uuid] == null) {
        owner.rivals[target.uuid] = {
            uuid: target.uuid, name: target.name, nameLower: lower(target.name),
            mutual: false, declaredByMe: false, declaredByThem: false, status: "none",
            points: 0, wins: 0, losses: 0, draws: 0, damageDealt: 0, damageTaken: 0,
            presenceMs: 0, createdAt: now(), updatedAt: now(), mutualSince: 0,
            lastBattleAt: 0, lastSeenTogetherAt: 0, history: []
        };
    }
    var link = owner.rivals[target.uuid];
    link.name = target.name;
    link.updatedAt = now();
    refreshLinkStatus(link);
    return link;
}

function pushHistory(link, type, note) {
    if (!(link.history instanceof Array)) link.history = [];
    link.history.push({ time: now(), type: type, note: note });
    while (link.history.length > 30) link.history.shift();
}

function countMutual(rec) {
    var c = 0;
    for (var u in rec.rivals) {
        if (!rec.rivals.hasOwnProperty(u)) continue;
        if (rec.rivals[u].mutual === true) c++;
    }
    return c;
}

function reqKey(a, b) { return a + ">" + b; }

function getRequest(db, fromU, toU) {
    var key = reqKey(fromU, toU);
    var req = db.requests[key];
    if (req == null) return null;
    if (now() - num(req.createdAt, 0) > REQUEST_EXPIRE_MS) {
        delete db.requests[key];
        return null;
    }
    return req;
}

function removeRequests(db, a, b) {
    delete db.requests[reqKey(a, b)];
    delete db.requests[reqKey(b, a)];
}

function formMutual(db, a, b, note) {
    var la = ensureLink(a, b);
    var lb = ensureLink(b, a);
    var t = now();
    la.mutual = true; la.declaredByMe = true; la.declaredByThem = true; la.mutualSince = t;
    lb.mutual = true; lb.declaredByMe = true; lb.declaredByThem = true; lb.mutualSince = t;
    refreshLinkStatus(la);
    refreshLinkStatus(lb);
    pushHistory(la, "mutual", note);
    pushHistory(lb, "mutual", note);
}

function areRelated(db, a, b) {
    var ra = db.players[a];
    var rb = db.players[b];
    if (ra == null || rb == null) return false;
    return ra.rivals[b] != null || rb.rivals[a] != null;
}

function busy(ch, u) {
    if (ch.playerSessions[u] != null) return true;
    for (var id in ch.pending) {
        if (!ch.pending.hasOwnProperty(id)) continue;
        var p = ch.pending[id];
        if (p.fromUuid == u || p.toUuid == u) return true;
    }
    return false;
}

function freshCombat() {
    return { damage: 0, physical: 0, ki: 0, hits: 0, biggestHit: 0, combo: 0, longestCombo: 0, lastHitAt: 0 };
}

function syncCmiTitle(playerName, title) {
    try {
        var safe = str(title).replace(/[^A-Za-z0-9 _\-]/g, "");
        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "cmi usermeta " + playerName + " set rival_title " + safe);
    } catch (e) {}
}

/* ========================= COMMANDS ========================= */

function cmdHelp(player) {
    line(player);
    message(player, C + "6" + C + "lRival System");
    line(player);
    message(player, C + "6Statuses: " + C + "7Unknown → Declared → Mutual → Nemesis");
    message(player, C + "7Max " + MAX_MUTUAL + " Mutual/Nemesis | Declared & Unknown unlimited");
    message(player, C + "7Nemesis at " + commas(NEMESIS_RP) + "+ RP with a mutual rival");
    line(player);
    message(player, C + "e/rival <player>  " + C + "8(or /rival declare <player>)");
    message(player, C + "e/rival accept|decline|remove <player>");
    message(player, C + "e/rival list | stats [player] | top [cat]");
    message(player, C + "e/challenge <player>  " + C + "8(or /challenge rival <player>)");
    message(player, C + "e/challenge accept | decline | cancel");
    line(player);
}

function cmdDeclare(player, targetName) {
    var clean = str(targetName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /rival declare <player>"); return; }
    var target = onlineByName(clean);
    if (target == null) { msg(player, C + "cThat player must be online."); return; }
    if (uuidOf(player) == uuidOf(target)) { msg(player, C + "cYou cannot declare yourself."); return; }

    var db = loadDb();
    var pref = ensurePlayer(db, player);
    var tref = ensurePlayer(db, target);
    var pu = pref.uuid;
    var tu = tref.uuid;

    if (pref.rivals[tu] != null && pref.rivals[tu].mutual === true) {
        var st = linkStatus(pref.rivals[tu]);
        msg(player, C + "eAlready your " + (st == "nemesis" ? "Nemesis" : "mutual rival") +
            " with " + tref.name); return;
    }
    if (pref.rivals[tu] != null && pref.rivals[tu].declaredByMe === true && pref.rivals[tu].mutual !== true) {
        msg(player, C + "eAlready a Declared rival: " + tref.name); return;
    }

    var cdKey = reqKey(pu, tu);
    var rem = DECLARE_COOLDOWN_MS - (now() - num(db.cooldowns[cdKey], 0));
    if (rem > 0) { msg(player, C + "cWait " + Math.ceil(rem / 1000) + "s."); return; }

    var reverse = getRequest(db, tu, pu);
    if (reverse != null) {
        if (countMutual(pref) >= MAX_MUTUAL || countMutual(tref) >= MAX_MUTUAL) {
            msg(player, C + "cMutual/Nemesis limit reached (max " + MAX_MUTUAL + ")."); return;
        }
        formMutual(db, pref, tref, "Crossed declarations");
        removeRequests(db, pu, tu);
        db.cooldowns[cdKey] = now();
        pref.totals.declarationsAccepted++;
        tref.totals.declarationsAccepted++;
        saveDb(db);
        msg(player, C + "6" + C + "lMUTUAL RIVAL! " + C + "e" + tref.name);
        msg(target, C + "6" + C + "lMUTUAL RIVAL! " + C + "e" + pref.name);
        return;
    }

    var pl = ensureLink(pref, tref);
    pl.declaredByMe = true;
    pl.mutual = false;
    refreshLinkStatus(pl);
    pushHistory(pl, "declare", "Declared rivalry");

    var tl = ensureLink(tref, pref);
    tl.declaredByThem = true;
    tl.mutual = false;
    refreshLinkStatus(tl);
    pushHistory(tl, "declared_by", "Was declared");

    db.requests[reqKey(pu, tu)] = {
        fromUuid: pu, fromName: pref.name, toUuid: tu, toName: tref.name, createdAt: now()
    };
    db.cooldowns[cdKey] = now();
    pref.totals.declarationsSent++;
    saveDb(db);

    msg(player, C + "aDeclared Rival: " + C + "e" + tref.name);
    msg(target, C + "6" + pref.name + C + "e declared you — status: " + C + "7Unknown");
    msg(target, C + "7Accept: " + C + "f/rival accept " + pref.name);
}

function cmdAccept(player, fromName) {
    var clean = str(fromName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /rival accept <player>"); return; }
    var db = loadDb();
    var pref = ensurePlayer(db, player);
    var from = findRecord(db, clean);
    if (from == null) { msg(player, C + "cNo request from that player."); return; }
    if (getRequest(db, from.uuid, pref.uuid) == null) {
        msg(player, C + "cNo active request from " + from.name); return;
    }
    if (countMutual(pref) >= MAX_MUTUAL || countMutual(from) >= MAX_MUTUAL) {
        msg(player, C + "cMutual/Nemesis limit reached (max " + MAX_MUTUAL + ")."); return;
    }
    formMutual(db, pref, from, "Accepted");
    removeRequests(db, from.uuid, pref.uuid);
    pref.totals.declarationsAccepted++;
    from.totals.declarationsAccepted++;
    saveDb(db);
    msg(player, C + "6" + C + "lMUTUAL RIVAL! " + C + "e" + from.name);
    msg(player, C + "7Reach " + C + "f" + commas(NEMESIS_RP) + C + "7 RP with them to ascend to Nemesis.");
    var online = onlineByName(from.name);
    if (online != null) {
        msg(online, C + "6" + C + "lMUTUAL RIVAL! " + C + "e" + pref.name + C + "a accepted!");
        msg(online, C + "7Reach " + C + "f" + commas(NEMESIS_RP) + C + "7 RP to become Nemeses.");
    }
}

function cmdDecline(player, fromName) {
    var clean = str(fromName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /rival decline <player>"); return; }
    var db = loadDb();
    var pref = ensurePlayer(db, player);
    var from = findRecord(db, clean);
    if (from == null || getRequest(db, from.uuid, pref.uuid) == null) {
        msg(player, C + "cNo active request."); return;
    }
    removeRequests(db, from.uuid, pref.uuid);
    pref.totals.declarationsDeclined++;
    saveDb(db);
    msg(player, C + "eDeclined " + from.name);
    var online = onlineByName(from.name);
    if (online != null) msg(online, C + "c" + pref.name + " declined your rivalry.");
}

function cmdRemove(player, targetName) {
    var clean = str(targetName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /rival remove <player>"); return; }
    var db = loadDb();
    var pref = ensurePlayer(db, player);
    var target = findRecord(db, clean);
    if (target == null || pref.rivals[target.uuid] == null) {
        msg(player, C + "cYou do not have that rival."); return;
    }
    var wasMutual = pref.rivals[target.uuid].mutual === true;
    delete pref.rivals[target.uuid];
    if (target.rivals[pref.uuid] != null) {
        var their = target.rivals[pref.uuid];
        if (wasMutual) {
            their.mutual = false;
            their.declaredByThem = false;
            if (their.declaredByMe !== true) delete target.rivals[pref.uuid];
        } else {
            their.declaredByThem = false;
            if (their.declaredByMe !== true) delete target.rivals[pref.uuid];
        }
    }
    removeRequests(db, pref.uuid, target.uuid);
    pref.totals.rivalsRemoved++;
    saveDb(db);
    msg(player, C + "eRemoved rivalry with " + target.name);
    var online = onlineByName(target.name);
    if (online != null) msg(online, C + "c" + pref.name + " ended rivalry with you.");
}

function cmdList(player) {
    var db = loadDb();
    var pref = ensurePlayer(db, player);
    saveDb(db);
    msg(player, C + "6========== Your Rivals ==========");
    msg(player, C + "7Career RP: " + C + "f" + commas(pref.career.rivalPointsTotal) +
        C + "7 | " + C + "a" + pref.career.officialWins + C + "7-" + C + "c" + pref.career.officialLosses);
    msg(player, C + "7Mutual/Nemesis: " + C + "f" + countMutual(pref) + "/" + MAX_MUTUAL +
        C + "8  | Declared & Unknown unlimited");

    var groups = { nemesis: [], mutual: [], declared: [], unknown: [] };
    for (var u in pref.rivals) {
        if (!pref.rivals.hasOwnProperty(u)) continue;
        var link = pref.rivals[u];
        var st = refreshLinkStatus(link);
        if (groups[st] != null) groups[st].push(link);
    }

    function printGroup(title, arr) {
        if (arr.length == 0) return;
        msg(player, C + "6--- " + title + " (" + arr.length + ") ---");
        for (var i = 0; i < arr.length; i++) {
            var L = arr[i];
            msg(player, C + "7- " + C + "f" + L.name + " " + linkStatusLabel(linkStatus(L)) +
                C + "7 | " + commas(L.points) + " RP" +
                C + "7 | W/L " + C + "a" + num(L.wins, 0) + C + "7/" + C + "c" + num(L.losses, 0));
        }
    }

    printGroup("Nemesis", groups.nemesis);
    printGroup("Mutual", groups.mutual);
    printGroup("Declared", groups.declared);
    printGroup("Unknown", groups.unknown);

    if (groups.nemesis.length + groups.mutual.length + groups.declared.length + groups.unknown.length == 0) {
        msg(player, C + "8No rivals yet. /rival <player>");
    }
    for (var key in db.requests) {
        if (!db.requests.hasOwnProperty(key)) continue;
        if (str(db.requests[key].toUuid) == pref.uuid) {
            msg(player, C + "dUnknown/Pending from " + C + "f" + db.requests[key].fromName);
        }
    }
}

function cmdChallenge(player, targetName) {
    var clean = str(targetName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /challenge <player>"); return; }
    var target = onlineByName(clean);
    if (target == null) { msg(player, C + "cPlayer must be online."); return; }
    if (uuidOf(player) == uuidOf(target)) { msg(player, C + "cCannot challenge yourself."); return; }
    if (dist(player, target) > CH_MAX_DISTANCE) {
        msg(player, C + "cGet within " + CH_MAX_DISTANCE + " blocks."); return;
    }

    var db = loadDb();
    ensurePlayer(db, player);
    ensurePlayer(db, target);
    var ch = loadCh();
    var fromU = uuidOf(player);
    var toU = uuidOf(target);
    if (busy(ch, fromU)) { msg(player, C + "cYou already have a challenge."); return; }
    if (busy(ch, toU)) { msg(player, C + "cThey are busy."); return; }

    var cdKey = fromU + ">" + toU;
    var rem = CH_REQUEST_COOLDOWN_MS - (now() - num(ch.cooldowns[cdKey], 0));
    if (rem > 0) { msg(player, C + "cWait " + Math.ceil(rem / 1000) + "s."); return; }

    var id = String(ch.nextId++);
    ch.pending[id] = {
        id: id,
        fromUuid: fromU,
        fromName: nameOf(player),
        toUuid: toU,
        toName: nameOf(target),
        createdAt: now(),
        related: areRelated(db, fromU, toU)
    };
    ch.cooldowns[cdKey] = now();
    saveCh(ch);
    saveDb(db);

    msg(player, C + "aChallenge sent to " + C + "e" + nameOf(target));
    msg(target, C + "6" + nameOf(player) + C + "e challenged you! 60s most damage.");
    msg(target, C + "7/challengeaccept   or   /challengedecline");
}

function findPendingFor(ch, toUuid, optionalFrom) {
    var wanted = lower(optionalFrom || "");
    for (var id in ch.pending) {
        if (!ch.pending.hasOwnProperty(id)) continue;
        var p = ch.pending[id];
        if (p.toUuid != toUuid) continue;
        if (wanted != "" && lower(p.fromName) != wanted) continue;
        return p;
    }
    return null;
}

function startCountdown(ch, pending) {
    delete ch.pending[pending.id];
    var sid = String(ch.nextId++);
    var t = now();
    var session = {
        id: sid,
        state: "countdown",
        challengerUuid: pending.fromUuid,
        challengerName: pending.fromName,
        opponentUuid: pending.toUuid,
        opponentName: pending.toName,
        related: pending.related === true,
        createdAt: t,
        countdownEndsAt: t + CH_COUNTDOWN_MS,
        battleEndsAt: 0,
        endedAt: 0,
        endReason: "",
        winnerUuid: "",
        loserUuid: "",
        combat: {}
    };
    session.combat[pending.fromUuid] = freshCombat();
    session.combat[pending.toUuid] = freshCombat();
    ch.sessions[sid] = session;
    ch.playerSessions[pending.fromUuid] = sid;
    ch.playerSessions[pending.toUuid] = sid;
    saveCh(ch);

    var a = onlineByName(pending.fromName);
    var b = onlineByName(pending.toName);
    if (a != null) msg(a, C + "6Challenge accepted! Countdown...");
    if (b != null) msg(b, C + "6Challenge accepted! Countdown...");
}

function cmdChallengeAccept(player, fromName) {
    var ch = loadCh();
    var pending = findPendingFor(ch, uuidOf(player), fromName);
    if (pending == null) { msg(player, C + "cNo pending challenge."); return; }
    var challenger = onlineByName(pending.fromName);
    if (challenger == null) {
        delete ch.pending[pending.id];
        saveCh(ch);
        msg(player, C + "cChallenger went offline.");
        return;
    }
    if (dist(player, challenger) > CH_MAX_DISTANCE) {
        msg(player, C + "cGet closer to accept."); return;
    }
    startCountdown(ch, pending);
}

function cmdChallengeDecline(player, fromName) {
    var ch = loadCh();
    var pending = findPendingFor(ch, uuidOf(player), fromName);
    if (pending == null) { msg(player, C + "cNo pending challenge."); return; }
    delete ch.pending[pending.id];
    saveCh(ch);
    msg(player, C + "eDeclined challenge from " + pending.fromName);
    var online = onlineByName(pending.fromName);
    if (online != null) msg(online, C + "c" + nameOf(player) + " declined.");
}

function cmdChallengeCancel(player) {
    var ch = loadCh();
    var u = uuidOf(player);
    for (var id in ch.pending) {
        if (!ch.pending.hasOwnProperty(id)) continue;
        var p = ch.pending[id];
        if (p.fromUuid == u || p.toUuid == u) {
            delete ch.pending[id];
            saveCh(ch);
            msg(player, C + "eChallenge cancelled.");
            return;
        }
    }
    var sid = ch.playerSessions[u];
    if (sid == null || ch.sessions[String(sid)] == null) {
        msg(player, C + "cNo active challenge."); return;
    }
    var session = ch.sessions[String(sid)];
    session.state = "ended";
    session.endedAt = now();
    session.endReason = "forfeit";
    session.winnerUuid = (u == session.challengerUuid) ? session.opponentUuid : session.challengerUuid;
    session.loserUuid = u;
    delete ch.playerSessions[session.challengerUuid];
    delete ch.playerSessions[session.opponentUuid];
    delete ch.sessions[String(sid)];
    saveCh(ch);
    msg(player, C + "cYou forfeited.");
    var winner = onlineByName(session.winnerUuid == session.challengerUuid ? session.challengerName : session.opponentName);
    if (winner != null) msg(winner, C + "aOpponent forfeited. You win.");
}

function showStats(player, targetName) {
    var db = loadDb();
    var name = targetName != "" ? targetName : nameOf(player);
    var record = findRecord(db, name);
    if (record == null) {
        message(player, C + "c[Rival] No record for " + name);
        return;
    }
    var career = record.career || {};
    var tier = getTier(career.rivalPointsTotal);

    line(player);
    message(player, C + "6" + C + "lRival Statistics");
    message(player, C + "7Player: " + C + "f" + record.name);
    line(player);
    message(player, C + "7Rank: " + C + tier.color + tier.name +
        C + "7 (" + C + "a" + commas(career.rivalPointsTotal) + C + "7 RP)");
    message(player, C + "7Official Record: " + C + "a" + num(career.officialWins, 0) +
        C + "7-" + C + "c" + num(career.officialLosses, 0));
    message(player, C + "7Current Streak: " + C + "6" + commas(career.currentStreak));
    message(player, C + "7Best Streak: " + C + "6" + commas(career.bestStreak));
    message(player, C + "7Damage Dealt: " + C + "f" + commas(career.damageDealt));
    message(player, C + "7Battles Played: " + C + "f" + commas(career.challengesPlayed));
    line(player);
}

function showTop(player, category) {
    var db = loadDb();
    var cat = lower(category || "rp");
    var key = "rp";
    var title = "Top Rival Points";
    if (cat == "wins") { key = "wins"; title = "Top Official Wins"; }
    else if (cat == "streak") { key = "streak"; title = "Top Rival Streaks"; }
    else if (cat == "damage") { key = "damage"; title = "Top Rival Damage"; }
    else if (cat == "combo") { key = "combo"; title = "Top Rival Combos"; }
    else if (cat == "hit") { key = "hit"; title = "Biggest Rival Hits"; }
    else if (cat == "battles") { key = "battles"; title = "Most Rival Battles"; }

    var rows = [];
    for (var u in db.players) {
        if (!db.players.hasOwnProperty(u)) continue;
        var rec = db.players[u];
        var c = rec.career || {};
        rows.push({
            name: rec.name,
            rp: num(c.rivalPointsTotal, 0),
            wins: num(c.officialWins, 0),
            streak: num(c.bestStreak, 0),
            damage: num(c.damageDealt, 0),
            combo: num(c.highestCombo, 0),
            hit: num(c.biggestHit, 0),
            battles: num(c.challengesPlayed, 0)
        });
    }
    rows.sort(function (a, b) { return num(b[key], 0) - num(a[key], 0); });

    line(player);
    message(player, C + "6" + C + "l" + title);
    line(player);

    if (rows.length == 0 || num(rows[0][key], 0) <= 0) {
        message(player, C + "7No records have been saved yet.");
        line(player);
        return;
    }

    var shown = 0;
    for (var i = 0; i < rows.length && shown < 10; i++) {
        if (num(rows[i][key], 0) <= 0) continue;
        shown++;
        message(
            player,
            C + "e#" + shown +
            C + "f " + rows[i].name +
            C + "7 - " +
            C + "a" + commas(rows[i][key])
        );
    }
    line(player);
}

function showTitle(player) {
    var db = loadDb();
    var rec = findRecord(db, nameOf(player));
    if (rec == null) { msg(player, C + "cNo record."); return; }
    var tier = getTier(num(rec.career.rivalPointsTotal, 0));
    syncCmiTitle(nameOf(player), tier.name);
    msg(player, C + "6Title: " + C + tier.color + tier.name);
    msg(player, C + "7Perk: " + C + "e" + tier.perk);
    msg(player, C + "8Synced CMI usermeta rival_title");
}

function showJournal(player, targetName) {
    var db = loadDb();
    var name = targetName != "" ? targetName : nameOf(player);
    var rec = findRecord(db, name);
    if (rec == null) { msg(player, C + "cNo record."); return; }
    msg(player, C + "6===== Rival Journal: " + rec.name + " =====");
    var n = 0;
    for (var u in rec.rivals) {
        if (!rec.rivals.hasOwnProperty(u)) continue;
        var l = rec.rivals[u];
        n++;
        msg(player, C + "e" + l.name + C + "7 | " + getTier(l.points).name +
            " | W/L " + num(l.wins, 0) + "/" + num(l.losses, 0));
    }
    if (n == 0) msg(player, C + "8Empty.");
}

function showSeason(player) {
    var prog = loadJson(PROG_KEY);
    if (prog == null || prog.season == null) {
        msg(player, C + "eSeason data will appear after first login with RivalProgression installed.");
        return;
    }
    var s = prog.season;
    var left = Math.max(0, num(s.endsAt, 0) - now());
    msg(player, C + "6===== " + s.name + " =====");
    msg(player, C + "7Ends in " + C + "f" + Math.ceil(left / 86400000) + "d");
    var entry = s.leaderboard[uuidOf(player)] || { rp: 0, wins: 0 };
    msg(player, C + "7Your Season RP: " + C + "f" + commas(entry.rp));
}

function showQuests(player) {
    msg(player, C + "6===== Weekly Rival Quests =====");
    msg(player, C + "7Install/keep RivalProgression_v4 enabled for live quest tracking.");
    msg(player, C + "8Use /rivalquests after progression login tick.");
    var prog = loadJson(PROG_KEY);
    if (prog == null || prog.quests == null || prog.quests[uuidOf(player)] == null) return;
    var q = prog.quests[uuidOf(player)];
    for (var i = 0; i < q.list.length; i++) {
        var item = q.list[i];
        msg(player, C + "7• " + item.name + C + "8 (" + Math.min(num(item.progress, 0), item.goal) + "/" + item.goal + ")");
    }
}

function showAchievements(player) {
    var prog = loadJson(PROG_KEY);
    var list = prog != null && prog.achievements != null ? (prog.achievements[uuidOf(player)] || {}) : {};
    var defs = ["first_blood", "nemesis", "unbreakable", "comeback_king", "legend_killer",
        "perfect_victory", "untouchable", "combo_master", "ki_dominator", "battle_hardened", "god_rival"];
    msg(player, C + "6===== Achievements =====");
    for (var i = 0; i < defs.length; i++) {
        msg(player, (list[defs[i]] === true ? C + "a✔ " : C + "8□ ") + C + "f" + defs[i].replace(/_/g, " "));
    }
}

function showHof(player) {
    var prog = loadJson(PROG_KEY);
    var hof = prog != null && prog.hallOfFame != null ? prog.hallOfFame : {};
    msg(player, C + "6===== Hall of Fame =====");
    msg(player, C + "7Season Champion: " + C + "f" + (hof.seasonChampion || "-"));
    msg(player, C + "7Highest RP: " + C + "f" + (hof.highestRp || "-"));
    msg(player, C + "7Longest Streak: " + C + "f" + (hof.longestStreak || "-"));
    msg(player, C + "7Greatest Comeback: " + C + "f" + (hof.greatestComeback || "-"));
    msg(player, C + "7Most Battles: " + C + "f" + (hof.mostLegendary || "-"));
}

function showSpectate(player, targetName) {
    if (targetName == "") { msg(player, C + "cUsage: /spectaterival <player>"); return; }
    var target = onlineByName(targetName);
    if (target == null) { msg(player, C + "cOffline."); return; }
    var ch = loadCh();
    var sid = ch.playerSessions[uuidOf(target)];
    if (sid == null || ch.sessions[String(sid)] == null) {
        msg(player, C + "cNot in an official battle."); return;
    }
    var session = ch.sessions[String(sid)];
    var a = (session.combat && session.combat[session.challengerUuid]) || {};
    var b = (session.combat && session.combat[session.opponentUuid]) || {};
    msg(player, C + "6===== Spectating =====");
    msg(player, C + "f" + session.challengerName + C + "7 dmg " + commas(a.damage || 0));
    msg(player, C + "f" + session.opponentName + C + "7 dmg " + commas(b.damage || 0));
    try {
        player.getTempdata().put("rival.v4.spectateSession", String(sid));
        player.getTempdata().put("rival.v4.spectateUntil", String(now() + 120000));
    } catch (e) {}
    msg(player, C + "aSpectating 2 minutes.");
}

/* ========================= TRIGGER ========================= */

function message(player, text) {
    msg(player, text);
}

function line(player) {
    message(player, C + "8" + "--------------------------------");
}

function argAt(event, index) {
    try {
        if (event.arguments != null && event.arguments.length > index) {
            var value = str(event.arguments[index]).replace(/^\s+|\s+$/g, "");
            /* CMI inserts the literal word "null" for missing $1 vars */
            if (value == "" || lower(value) == "null") return "";
            return value;
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
 /rival declare Steve  => trigger 200 <player> declare Steve
 /rivaldeclare Steve   => trigger 201 <player> Steve
*/
function routeRivalSub(player, event) {
    var parts = argsFrom(event, 1);
    if (parts.length == 0) {
        cmdHelp(player);
        return;
    }

    var sub = lower(parts[0]);
    var target = parts.length > 1 ? parts[1] : "";

    if (sub == "help" || sub == "?") {
        cmdHelp(player);
    } else if (sub == "declare") {
        cmdDeclare(player, target);
    } else if (sub == "accept") {
        cmdAccept(player, target);
    } else if (sub == "decline") {
        cmdDecline(player, target);
    } else if (sub == "remove") {
        cmdRemove(player, target);
    } else if (sub == "list") {
        cmdList(player);
    } else if (sub == "stats") {
        showStats(player, target);
    } else if (sub == "top") {
        showTop(player, target == "" ? "rp" : target);
    } else if (sub == "title") {
        showTitle(player);
    } else if (sub == "journal") {
        showJournal(player, target);
    } else if (sub == "season") {
        showSeason(player);
    } else if (sub == "quests") {
        showQuests(player);
    } else if (sub == "achievements") {
        showAchievements(player);
    } else if (sub == "hof" || sub == "hall") {
        showHof(player);
    } else {
        /*
         Original concept: /Rival <player>
         Any unknown first word is treated as a declare target.
        */
        cmdDeclare(player, parts[0]);
    }
}

function routeChallengeSub(player, event) {
    var parts = argsFrom(event, 1);
    if (parts.length == 0) {
        msg(player, C + "cUsage: /challenge <player>");
        return;
    }
    var sub = lower(parts[0]);
    var target = parts.length > 1 ? parts[1] : "";

    if (sub == "accept") {
        cmdChallengeAccept(player, target);
    } else if (sub == "decline") {
        cmdChallengeDecline(player, target);
    } else if (sub == "cancel" || sub == "forfeit") {
        cmdChallengeCancel(player);
    } else if (sub == "rival") {
        /* Original concept: /Challenge Rival <player> */
        if (target == "") {
            msg(player, C + "cUsage: /challenge rival <player>");
            return;
        }
        cmdChallenge(player, target);
    } else {
        /* /challenge Steve */
        cmdChallenge(player, parts[0]);
    }
}

function trigger(event) {
    var player = null;
    var arg0 = argAt(event, 0);

    try {
        if (arg0 != "") {
            player = onlineByName(arg0);
        }
    } catch (e) {}

    if (player == null) {
        try {
            print("[RivalCommand] No online player for trigger " +
                event.id + " arg0=" + arg0);
        } catch (e2) {}
        return;
    }

    try {
        var id = Number(event.id);
        var arg1 = argAt(event, 1);

        if (id == 200) {
            routeRivalSub(player, event);
        } else if (id == 201) {
            cmdDeclare(player, arg1);
        } else if (id == 202) {
            cmdAccept(player, arg1);
        } else if (id == 203) {
            cmdDecline(player, arg1);
        } else if (id == 204) {
            cmdRemove(player, arg1);
        } else if (id == 205) {
            cmdList(player);
        } else if (id == 206) {
            showStats(player, arg1);
        } else if (id == 210) {
            routeChallengeSub(player, event);
        } else if (id == 211) {
            cmdChallengeAccept(player, arg1);
        } else if (id == 212) {
            cmdChallengeDecline(player, arg1);
        } else if (id == 213) {
            cmdChallengeCancel(player);
        } else if (id == 220) {
            showTop(player, arg1 == "" ? "rp" : arg1);
        } else if (id == 221) {
            showTitle(player);
        } else if (id == 222) {
            showJournal(player, arg1);
        } else if (id == 223) {
            showSeason(player);
        } else if (id == 224) {
            showQuests(player);
        } else if (id == 225) {
            showAchievements(player);
        } else if (id == 226) {
            showHof(player);
        } else if (id == 230) {
            showSpectate(player, arg1);
        }
    } catch (err) {
        message(
            player,
            C + "c[Rival Command Error] " + err
        );
    }
}

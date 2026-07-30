/*
============================================================
 DBZ Legacy Reborn - Rival Command Handler
 Version: 4.7.5

 PLACE THIS SCRIPT IN THE SAME CUSTOMNPCS SCRIPT LOCATION
 AS YOUR WORKING SkillCheckCommand.js / Sparring Command Handler.

 DO NOT place this in the Global Player Script slot.

 Gameplay stays in Rival System.js (Global Player).
 This file is the command display / action handler only -
 same split as Sparring TP System + Sparring Command Handler.

 Intended rivalry path:
   /rival <player>           silent Unknown (they see nothing)
   both silent               Declared (both see each other)
   /rival declare <player>   Pending (visible notify; accept/decline/ignore)
   both declare or accept    Mutual (benefits both ways)
   Mutual + 3+ death/KO      Nemesis (timer/damage wins do NOT count)

 FIX (4.7.4):
  Visible /rival declare shows as Pending on /rival list (not Unknown).

 FIX (4.6.19):
  Restore /rival tpmsg [on|off] (also /tpmsg, /tpmessages).
  Hides kill TP chat spam; TP still awarded.

 FIX (4.6.18):
  Align silent/declare heal so pending visible declares are not
  auto-promoted to Declared. RP tier renamed Vendetta (not Nemesis).
  Cleanup messaging to match the path above.

 FIX (4.6.17 / 4.6.16):
  Nemesis display requires deathLosses >= 3 (clears stale random flags).
  /rival list recomputes Nemesis so 3+ death losses crown correctly.

 FIX (4.6.15 / 4.6.14):
  /rival declare <player> is VISIBLE (notifies them).
  /rival <player> alone is the silent Unknown path.
  Older builds wrongly made both commands silent.

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

/*
 Color codes use \u00A7 escapes (same as SkillCheck) so chat formatting
 stays reliable. Player-facing text is ASCII-only (no unicode arrows /
 checkmarks) to avoid broken glyphs/"images" in client chat.
*/
var C = "\u00A7";
var C_RESET = "\u00A7r";
var C_BOLD = "\u00A7l";
var DB_KEY = "dlr.rivalry.v4.database";
var DB_BACKUP = "dlr.rivalry.v4.database.backup";
var CH_KEY = "dlr.rivalry.v4.challenges";
var CH_BACKUP = "dlr.rivalry.v4.challenges.backup";
var PROG_KEY = "dlr.rivalry.v4.progression";

/*
 Statuses: unknown | pending | declared | mutual | nemesis
 Max 2 Mutual (3rd demotes oldest).

 /rival <player>          silent Unknown (they see nothing)
 both silent /rival       Declared (both see each other)
 /rival declare <player>  Pending (visible; accept/decline/ignore)
 both visible declares    Mutual (or accept their declare)
 Mutual Nemesis           after 3+ DEATH losses to that rival
                          (damage-dealt / timer losses do NOT count)

 Benefits: only players who rivaled someone get presence/benefit TP.
 Ignore/decline leaves the declarer with benefits; target gets none.
*/
var NEMESIS_DEATH_LOSSES = 3;
var MAX_MUTUAL = 2;
var MS_PER_DAY = 24 * 60 * 60 * 1000;
var REQUEST_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
var DECLARE_COOLDOWN_MS = 30 * 1000;
var CH_REQUEST_EXPIRE_MS = 30 * 1000;
var CH_REQUEST_COOLDOWN_MS = 15 * 1000;
var CH_COUNTDOWN_MS = 5 * 1000;
var CH_DURATION_MS = 60 * 1000;
var CH_MIN_MINUTES = 1;
var CH_MAX_MINUTES = 10;
var CH_MAX_DISTANCE = 64;

/* RP rank tiers (NOT the Mutual "Nemesis" relationship status). */
var TIERS = [
    { min: 0,     name: "Acquaintance",  color: "7", tpMult: 1.00, perk: "None" },
    { min: 100,   name: "Competitor",    color: "a", tpMult: 1.05, perk: "Sense farther + 5% rival TP" },
    { min: 300,   name: "Adversary",     color: "2", tpMult: 1.10, perk: "Better reports + 10% rival TP" },
    { min: 700,   name: "Rival",         color: "e", tpMult: 1.15, perk: "Notifications + 15% rival TP" },
    { min: 1500,  name: "Vendetta",      color: "6", tpMult: 1.25, perk: "Tracker + 25% rival TP" },
    { min: 3000,  name: "Legendary",     color: "c", tpMult: 1.35, perk: "Aura flag + 35% rival TP" },
    { min: 5000,  name: "Arch Rival",    color: "d", tpMult: 1.45, perk: "Entrance flag + 45% rival TP" },
    { min: 7500,  name: "Mortal Enemy",  color: "5", tpMult: 1.55, perk: "Priority alerts + 55% rival TP" },
    { min: 10000, name: "Eternal Rival", color: "b", tpMult: 1.70, perk: "Unique title + 70% rival TP" },
    { min: 15000, name: "Mythic Rival",  color: "4", tpMult: 2.00, perk: "Mythic title + 100% rival TP" }
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

function broadcast(text) {
    /*
     * Deduplicate by player UUID. On multi-world servers,
     * getAllPlayers() per world can re-list the same players
     * and spam identical countdown / battle lines.
     */
    try {
        var seen = {};
        var sent = 0;

        try {
            var online = Bukkit.getOnlinePlayers();
            var it = online.iterator();
            while (it.hasNext()) {
                var bp = it.next();
                var name = "";
                try { name = String(bp.getName()); } catch (eName) { continue; }
                var p = onlineByName(name);
                if (p == null) continue;
                var id = uuidOf(p);
                if (id == "" || seen[id] === true) continue;
                seen[id] = true;
                msg(p, text);
                sent++;
            }
            if (sent > 0) return;
        } catch (bukkitErr) {}

        var worlds = api().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                var players = worlds[i].getAllPlayers();
                for (var p = 0; p < players.length; p++) {
                    var pl = players[p];
                    var pid = uuidOf(pl);
                    if (pid == "" || seen[pid] === true) continue;
                    seen[pid] = true;
                    msg(pl, text);
                }
            } catch (e) {}
        }
    } catch (e2) {}
}

function claimChallengeAnnounce(key) {
    try {
        var store = worldStore();
        if (store == null) return true;
        var full = "dlr.rivalry.v4.challenge.announce." + str(key);
        var last = 0;
        try {
            if (store.has(full)) last = num(store.get(full), 0);
        } catch (e1) {}
        if (now() - last < 8000) return false;
        store.put(full, String(now()));
        return true;
    } catch (e) {
        return true;
    }
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
        totals: { declarationsSent: 0, declarationsAccepted: 0, declarationsDeclined: 0, rivalsRemoved: 0 },
        pastRivals: {}
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
    if (rec.pastRivals == null) rec.pastRivals = {};
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
        /* Never trust stale isNemesis from old history-based builds. */
        if (link.isNemesis === true && num(link.deathLosses, 0) >= NEMESIS_DEATH_LOSSES) {
            return "nemesis";
        }
        return "mutual";
    }
    /* Both silently rivaled each other = Declared. */
    if (link.declaredByMe === true && link.declaredByThem === true &&
        link.inviteSent !== true && link.inviteReceived !== true) {
        return "declared";
    }
    /* Visible /rival declare in flight (sent or received). */
    if (link.inviteSent === true || link.inviteReceived === true) {
        return "pending";
    }
    /* Silent one-sided /rival (you see them; they see nothing). */
    if (link.declaredByMe === true || link.declaredByThem === true) {
        return "unknown";
    }
    return "none";
}

function isReciprocatedSilent(link) {
    return link != null &&
        link.mutual !== true &&
        link.declaredByMe === true &&
        link.declaredByThem === true;
}

/*
 * If A and B each silently /rival each other one-sided, promote to Declared.
 * Never heal across a pending visible /rival declare (invite/request).
 */
function healCrossedSilentDeclares(db) {
    if (db == null || db.players == null) return 0;
    var healed = 0;
    var seen = {};
    for (var aUuid in db.players) {
        if (!db.players.hasOwnProperty(aUuid)) continue;
        var a = db.players[aUuid];
        if (a == null || a.rivals == null) continue;
        for (var bUuid in a.rivals) {
            if (!a.rivals.hasOwnProperty(bUuid)) continue;
            var pairKey = aUuid < bUuid ? aUuid + "|" + bUuid : bUuid + "|" + aUuid;
            if (seen[pairKey] === true) continue;
            seen[pairKey] = true;

            var la = a.rivals[bUuid];
            var b = db.players[bUuid];
            if (b == null || b.rivals == null) continue;
            var lb = b.rivals[aUuid];
            if (la == null || lb == null) continue;
            if (la.mutual === true || lb.mutual === true) continue;
            if (la.declaredByMe !== true || lb.declaredByMe !== true) continue;
            if (isReciprocatedSilent(la) && isReciprocatedSilent(lb)) continue;
            /* Visible declare in flight: leave for accept/decline/Mutual. */
            if (la.inviteSent === true || la.inviteReceived === true ||
                lb.inviteSent === true || lb.inviteReceived === true) {
                continue;
            }
            if (db.requests != null &&
                (db.requests[reqKey(aUuid, bUuid)] != null ||
                 db.requests[reqKey(bUuid, aUuid)] != null)) {
                continue;
            }

            formDeclared(db, a, b, "Healed crossed silent rivals");
            removeRequests(db, aUuid, bUuid);
            healed++;
        }
    }
    return healed;
}

function linkStatusLabel(status) {
    if (status == "nemesis") return C + "c" + C_BOLD + "Nemesis" + C_RESET;
    if (status == "mutual") return C + "6Mutual" + C_RESET;
    if (status == "declared") return C + "eDeclared" + C_RESET;
    if (status == "pending") return C + "dPending" + C_RESET;
    if (status == "unknown") return C + "7Unknown" + C_RESET;
    return C + "8None" + C_RESET;
}

function refreshLinkStatus(link) {
    if (link == null) return "none";
    link.status = linkStatus(link);
    return link.status;
}

function cloneLink(link) {
    try {
        return JSON.parse(JSON.stringify(link));
    } catch (e) {
        return null;
    }
}

/* Save rivalry history so a future rematch keeps wins/RP/grounds/etc. */
function archiveRivalLink(owner, rivalUuid) {
    if (owner == null || rivalUuid == null || rivalUuid == "") return;
    if (owner.pastRivals == null) owner.pastRivals = {};
    var link = owner.rivals[rivalUuid];
    if (link == null) return;
    var snap = cloneLink(link);
    if (snap == null) return;
    snap.mutual = false;
    snap.isNemesis = false;
    snap.declaredByMe = false;
    snap.declaredByThem = false;
    snap.inviteSent = false;
    snap.inviteReceived = false;
    snap.mutualAccepted = false;
    snap.mutualSince = 0;
    snap.status = "archived";
    snap.archivedAt = now();
    if (!(snap.history instanceof Array)) snap.history = [];
    snap.history.push({ time: now(), type: "archived", note: "Rivalry removed" });
    while (snap.history.length > 30) snap.history.shift();
    owner.pastRivals[rivalUuid] = snap;
}

function restorePastRival(owner, target) {
    if (owner == null || target == null) return null;
    if (owner.pastRivals == null) return null;
    var past = owner.pastRivals[target.uuid];
    if (past == null) return null;
    var link = cloneLink(past);
    if (link == null) return null;
    link.uuid = target.uuid;
    link.name = target.name;
    link.nameLower = lower(target.name);
    link.mutual = false;
    link.isNemesis = false;
    link.declaredByMe = false;
    link.declaredByThem = false;
    link.inviteSent = false;
    link.inviteReceived = false;
    link.mutualAccepted = false;
    link.mutualSince = 0;
    link.updatedAt = now();
    if (!(link.history instanceof Array)) link.history = [];
    link.history.push({ time: now(), type: "restored", note: "Previous rivalry history restored" });
    while (link.history.length > 30) link.history.shift();
    owner.rivals[target.uuid] = link;
    delete owner.pastRivals[target.uuid];
    refreshLinkStatus(link);
    return link;
}

function recalcCareerRp(rec) {
    if (rec == null) return 0;
    if (rec.career == null) rec.career = {};
    var total = 0;
    for (var u in rec.rivals) {
        if (!rec.rivals.hasOwnProperty(u)) continue;
        total += Math.max(0, num(rec.rivals[u].points, 0));
    }
    rec.career.rivalPointsTotal = total;
    return total;
}

function updateLb(db, rec) {
    if (db == null || rec == null) return;
    if (db.leaderboard == null) db.leaderboard = {};
    db.leaderboard[rec.uuid] = {
        uuid: rec.uuid,
        name: rec.name,
        rp: num(rec.career.rivalPointsTotal, 0),
        wins: num(rec.career.officialWins, 0),
        streak: num(rec.career.bestStreak, 0),
        updatedAt: now()
    };
}

function ensureLink(owner, target) {
    if (owner.rivals[target.uuid] == null) {
        var restored = restorePastRival(owner, target);
        if (restored == null) {
            var t = now();
            owner.rivals[target.uuid] = {
                uuid: target.uuid, name: target.name, nameLower: lower(target.name),
                mutual: false, declaredByMe: false, declaredByThem: false,
                inviteSent: false, inviteReceived: false,
                isNemesis: false, status: "none",
                points: 0, wins: 0, losses: 0, draws: 0, battles: 0,
                deathLosses: 0, deathWins: 0,
                currentStreak: 0, bestStreak: 0,
                damageDealt: 0, damageTaken: 0, timeFoughtMs: 0,
                presenceMs: 0, createdAt: t, firstMetAt: t, firstBattleAt: 0,
                updatedAt: t, mutualSince: 0, lastBattleAt: 0, lastSeenTogetherAt: 0, history: []
            };
        } else {
            recalcCareerRp(owner);
        }
    }
    var link = owner.rivals[target.uuid];
    link.name = target.name;
    link.nameLower = lower(target.name);
    link.updatedAt = now();
    if (link.inviteReceived !== true) link.inviteReceived = false;
    link.deathLosses = num(link.deathLosses, 0);
    link.deathWins = num(link.deathWins, 0);
    link.isNemesis = link.mutual === true &&
        link.deathLosses >= NEMESIS_DEATH_LOSSES &&
        link.isNemesis === true;
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

function nemesisScore(link) {
    if (link == null || link.mutual !== true) return -1;
    var deathLosses = num(link.deathLosses, 0);
    if (deathLosses < NEMESIS_DEATH_LOSSES) return -1;
    /* Prefer the mutual rival who has killed you the most. */
    return deathLosses * 1000 + num(link.deathWins, 0);
}

function recomputeNemesis(rec) {
    if (rec == null || rec.rivals == null) return null;
    var bestUuid = null;
    var bestScore = -1;
    var prev = str(rec.nemesisUuid);
    for (var u in rec.rivals) {
        if (!rec.rivals.hasOwnProperty(u)) continue;
        rec.rivals[u].deathLosses = num(rec.rivals[u].deathLosses, 0);
        rec.rivals[u].deathWins = num(rec.rivals[u].deathWins, 0);
        rec.rivals[u].isNemesis = false;
        if (rec.rivals[u].mutual !== true) continue;
        var sc = nemesisScore(rec.rivals[u]);
        if (sc > bestScore) { bestScore = sc; bestUuid = u; }
    }
    if (bestUuid != null && bestScore >= 0) {
        rec.rivals[bestUuid].isNemesis = true;
        rec.nemesisUuid = bestUuid;
    } else {
        bestUuid = null;
        rec.nemesisUuid = "";
    }
    for (var u2 in rec.rivals) {
        if (!rec.rivals.hasOwnProperty(u2)) continue;
        refreshLinkStatus(rec.rivals[u2]);
    }
    if (bestUuid != null && bestUuid !== prev) {
        var online = onlineByName(rec.name);
        if (online != null) {
            msg(online, C + "c" + C_BOLD + "NEMESIS! " + C_RESET + C + "e" + rec.rivals[bestUuid].name +
                C + "7 - you have fallen to them " +
                num(rec.rivals[bestUuid].deathLosses, 0) +
                " times by death (need " + NEMESIS_DEATH_LOSSES + ").");
        }
    }
    return bestUuid;
}

function findOldestMutual(rec, excludeUuid) {
    var oldest = null;
    var oldestSince = Number.POSITIVE_INFINITY;
    for (var u in rec.rivals) {
        if (!rec.rivals.hasOwnProperty(u)) continue;
        if (excludeUuid && u === excludeUuid) continue;
        if (rec.rivals[u].mutual !== true) continue;
        var since = num(rec.rivals[u].mutualSince, rec.rivals[u].firstMetAt || rec.rivals[u].createdAt || 0);
        if (since < oldestSince) { oldestSince = since; oldest = u; }
    }
    return oldest;
}

function demoteMutualPair(db, owner, rivalUuid) {
    var link = owner.rivals[rivalUuid];
    if (link == null || link.mutual !== true) return;
    var rivalName = str(link.name);
    link.mutual = false; link.isNemesis = false; link.mutualSince = 0;
    link.mutualAccepted = false; link.inviteSent = false; link.inviteReceived = false;
    refreshLinkStatus(link);
    pushHistory(link, "demoted", "Oldest mutual demoted");
    var other = db.players[rivalUuid];
    if (other != null && other.rivals[owner.uuid] != null) {
        var ol = other.rivals[owner.uuid];
        ol.mutual = false; ol.isNemesis = false; ol.mutualSince = 0;
        ol.mutualAccepted = false; ol.inviteSent = false; ol.inviteReceived = false;
        refreshLinkStatus(ol);
        pushHistory(ol, "demoted", "Mutual demoted");
        recomputeNemesis(other);
        var oo = onlineByName(other.name);
        if (oo != null) msg(oo, C + "eMutual with " + owner.name + " demoted to Declared.");
    }
    recomputeNemesis(owner);
    var ow = onlineByName(owner.name);
    if (ow != null) msg(ow, C + "eOldest mutual with " + rivalName + " demoted to make room.");
}

function ensureMutualRoom(db, rec, excludeUuid) {
    while (countMutual(rec) >= MAX_MUTUAL) {
        var oldest = findOldestMutual(rec, excludeUuid);
        if (oldest == null) break;
        demoteMutualPair(db, rec, oldest);
    }
}

function reqKey(a, b) { return a + ">" + b; }

function getRequest(db, fromU, toU) {
    var key = reqKey(fromU, toU);
    var req = db.requests[key];
    if (req == null) return null;
    if (now() - num(req.createdAt, 0) > REQUEST_EXPIRE_MS) {
        clearInviteFlags(db, fromU, toU);
        delete db.requests[key];
        return null;
    }
    return req;
}

function clearInviteFlags(db, fromU, toU) {
    var from = db.players[fromU];
    var to = db.players[toU];
    if (from != null && from.rivals[toU] != null) {
        var fl = from.rivals[toU];
        fl.inviteSent = false;
        /* Legacy Mutual invites wrongly set declaredByThem on the target only.
           Do not clear true Declared bonds (both silent flags). */
        if (fl.declaredByMe !== true) {
            fl.inviteReceived = false;
        }
        if (fl.declaredByMe !== true && fl.declaredByThem !== true &&
            fl.inviteReceived !== true && fl.mutual !== true) {
            delete from.rivals[toU];
        } else {
            refreshLinkStatus(fl);
        }
    }
    if (to != null && to.rivals[fromU] != null) {
        var tl = to.rivals[fromU];
        tl.inviteReceived = false;
        /* Clear invite-only declaredByThem leftover from older builds. */
        if (tl.declaredByMe !== true) {
            tl.declaredByThem = false;
        }
        if (tl.declaredByMe !== true && tl.declaredByThem !== true &&
            tl.inviteSent !== true && tl.mutual !== true) {
            delete to.rivals[fromU];
        } else {
            refreshLinkStatus(tl);
        }
    }
}

function cleanupExpiredRequests(db) {
    if (db == null || db.requests == null) return;
    for (var key in db.requests) {
        if (!db.requests.hasOwnProperty(key)) continue;
        var req = db.requests[key];
        if (now() - num(req.createdAt, 0) > REQUEST_EXPIRE_MS) {
            clearInviteFlags(db, req.fromUuid, req.toUuid);
            delete db.requests[key];
        }
    }
    healCrossedSilentDeclares(db);
}

function removeRequests(db, a, b) {
    if (db.requests[reqKey(a, b)] != null || db.requests[reqKey(b, a)] != null) {
        clearInviteFlags(db, a, b);
        clearInviteFlags(db, b, a);
    }
    delete db.requests[reqKey(a, b)];
    delete db.requests[reqKey(b, a)];
}

function formDeclared(db, a, b, note) {
    var la = ensureLink(a, b);
    var lb = ensureLink(b, a);
    var t = now();
    la.mutual = false; la.declaredByMe = true; la.declaredByThem = true;
    la.inviteSent = false; la.inviteReceived = false; la.mutualAccepted = false;
    if (num(la.firstMetAt, 0) <= 0) la.firstMetAt = t;
    lb.mutual = false; lb.declaredByMe = true; lb.declaredByThem = true;
    lb.inviteSent = false; lb.inviteReceived = false; lb.mutualAccepted = false;
    if (num(lb.firstMetAt, 0) <= 0) lb.firstMetAt = t;
    refreshLinkStatus(la);
    refreshLinkStatus(lb);
    pushHistory(la, "declared", note);
    pushHistory(lb, "declared", note);
    recalcCareerRp(a);
    recalcCareerRp(b);
}

function formMutual(db, a, b, note) {
    ensureMutualRoom(db, a, b.uuid);
    ensureMutualRoom(db, b, a.uuid);
    var la = ensureLink(a, b);
    var lb = ensureLink(b, a);
    var t = now();
    la.mutual = true; la.declaredByMe = true; la.declaredByThem = true;
    la.inviteSent = false; la.inviteReceived = false; la.mutualAccepted = false; la.mutualSince = t;
    if (num(la.firstMetAt, 0) <= 0) la.firstMetAt = t;
    lb.mutual = true; lb.declaredByMe = true; lb.declaredByThem = true;
    lb.inviteSent = false; lb.inviteReceived = false; lb.mutualAccepted = false; lb.mutualSince = t;
    if (num(lb.firstMetAt, 0) <= 0) lb.firstMetAt = t;
    refreshLinkStatus(la);
    refreshLinkStatus(lb);
    pushHistory(la, "mutual", note);
    pushHistory(lb, "mutual", note);
    recomputeNemesis(a);
    recomputeNemesis(b);
    recalcCareerRp(a);
    recalcCareerRp(b);
    updateLb(db, a);
    updateLb(db, b);
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
    uiHead(player, "RIVAL SYSTEM");
    uiProp(player, "Path", C + "7Unknown " + C + "8> " + C + "eDeclared " + C + "8/ " +
        C + "dPending " + C + "8> " + C + "6Mutual " + C + "8> " + C + "cNemesis");
    uiProp(player, "Slots", C + "f" + MAX_MUTUAL + C + "7 Mutual max" + C + "8  |  " +
        C + "cNemesis after " + NEMESIS_DEATH_LOSSES + "+ death losses");
    uiProp(player, "Rewards", C + "7RP from official battles" + C + "8  |  " + C + "7TP for those who rival");
    uiBlank(player);
    uiSection(player, "Rivalry");
    uiCmd(player, "/rival <player>", "silent Unknown (they see nothing)");
    uiCmd(player, "/rival declare <player>", "Pending declare (accept/decline/ignore)");
    uiCmd(player, "/rival accept|decline|remove <player>", "");
    uiCmd(player, "/rival list", "rivals + proving grounds");
    uiCmd(player, "/rival stats [player]", "career record");
    uiBlank(player);
    msg(player, C + "8Silent: both /rival each other -> Declared.");
    msg(player, C + "8Visible: /rival declare -> Pending; both declare/accept -> Mutual.");
    msg(player, C + "8Decline/ignore: they gain nothing; you still keep benefits.");
    msg(player, C + "8Nemesis: Mutual + " + NEMESIS_DEATH_LOSSES +
        "+ death/KO losses (not timer/damage).");
    uiBlank(player);
    uiSection(player, "Battle");
    uiCmd(player, "/challenge <player> [1-10]", "official fight (minutes, default 1)");
    uiCmd(player, "/challenge accept|decline|cancel", "");
    uiCmd(player, "/spectaterival <player>", "watch live");
    uiBlank(player);
    uiSection(player, "Progress");
    uiCmd(player, "/rival top [rp|wins|streak|damage]", "");
    uiCmd(player, "/rival title | journal | season", "");
    uiCmd(player, "/rival quests | achievements | hof", "");
    uiCmd(player, "/rival tpmsg [on|off]", "toggle kill TP chat spam");
    uiBlank(player);
    msg(player, C + "8Defeat marks Proving Grounds. Return there for bonus rewards.");
    uiFoot(player);
}

function promoteMutual(player, target, db, pref, tref, reason) {
    formMutual(db, pref, tref, reason);
    removeRequests(db, pref.uuid, tref.uuid);
    db.cooldowns[reqKey(pref.uuid, tref.uuid)] = now();
    pref.totals.declarationsAccepted++;
    tref.totals.declarationsAccepted++;
    saveDb(db);
    uiBanner(player, "MUTUAL", C + "e" + tref.name + C_RESET);
    msg(player, C + "8Both declared. Benefits work for both. " +
        NEMESIS_DEATH_LOSSES + "+ death losses can forge a Nemesis.");
    uiBanner(target, "MUTUAL", C + "e" + pref.name + C_RESET);
    msg(target, C + "8Both declared. Benefits work for both. " +
        NEMESIS_DEATH_LOSSES + "+ death losses can forge a Nemesis.");
}

function promoteDeclared(player, target, db, pref, tref, reason) {
    formDeclared(db, pref, tref, reason);
    removeRequests(db, pref.uuid, tref.uuid);
    db.cooldowns[reqKey(pref.uuid, tref.uuid)] = now();
    pref.totals.declarationsSent++;
    saveDb(db);
    uiBanner(player, "DECLARED", C + "e" + tref.name + C_RESET);
    msg(player, C + "8You both silently rivaled each other.");
    msg(player, C + "8For Mutual benefits both ways:  " + C + "f/rival declare " + tref.name);
    uiBanner(target, "DECLARED", C + "e" + pref.name + C_RESET);
    msg(target, C + "8You both silently rivaled each other.");
    msg(target, C + "8For Mutual benefits both ways:  " + C + "f/rival declare " + pref.name);
}

/* Silent one-sided rival. You see Unknown. Target sees nothing. */
function cmdSilent(player, targetName) {
    var clean = str(targetName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /rival <player>"); return; }
    var target = onlineByName(clean);
    if (target == null) { msg(player, C + "cThat player must be online."); return; }
    if (uuidOf(player) == uuidOf(target)) { msg(player, C + "cYou cannot rival yourself."); return; }

    var db = loadDb();
    cleanupExpiredRequests(db);
    var pref = ensurePlayer(db, player);
    var tref = ensurePlayer(db, target);
    var pu = pref.uuid;
    var tu = tref.uuid;

    if (pref.rivals[tu] != null && pref.rivals[tu].mutual === true) {
        var st = linkStatus(pref.rivals[tu]);
        msg(player, C + "eAlready your " + (st == "nemesis" ? "Nemesis" : "mutual rival") +
            " with " + tref.name); return;
    }
    if (pref.rivals[tu] != null && isReciprocatedSilent(pref.rivals[tu])) {
        msg(player, C + "eAlready Declared with " + tref.name +
            C + "8. For Mutual:  " + C + "f/rival declare " + tref.name); return;
    }
    if (pref.rivals[tu] != null && pref.rivals[tu].inviteSent === true && pref.rivals[tu].mutual !== true) {
        msg(player, C + "eDeclare already pending for " + tref.name);
        msg(player, C + "8They can accept/decline, or ignore. You keep benefits.");
        return;
    }
    if (pref.rivals[tu] != null && pref.rivals[tu].declaredByMe === true && pref.rivals[tu].mutual !== true) {
        msg(player, C + "eAlready silently rivaled " + tref.name + C + "8 (Unknown)");
        msg(player, C + "8For Mutual:  " + C + "f/rival declare " + tref.name);
        return;
    }

    var cdKey = reqKey(pu, tu);
    var rem = DECLARE_COOLDOWN_MS - (now() - num(db.cooldowns[cdKey], 0));
    if (rem > 0) { msg(player, C + "cWait " + Math.ceil(rem / 1000) + "s."); return; }

    /* Pending visible declare from them -> Mutual (same as /rival accept). */
    var reverse = getRequest(db, tu, pu);
    if (reverse != null) {
        promoteMutual(player, target, db, pref, tref, "Accepted their rival declare");
        return;
    }

    /* They already silently rivaled you -> Declared for both. */
    var theirLink = tref.rivals[pu];
    var theyRivaledMe = theirLink != null && theirLink.declaredByMe === true && theirLink.mutual !== true;
    if (theyRivaledMe) {
        promoteDeclared(player, target, db, pref, tref, "Crossed silent rivals");
        return;
    }

    var pl = ensureLink(pref, tref);
    pl.declaredByMe = true;
    pl.declaredByThem = false;
    pl.inviteSent = false;
    pl.inviteReceived = false;
    pl.mutual = false;
    refreshLinkStatus(pl);
    pushHistory(pl, "silent", "Silent Unknown rivalry");

    db.cooldowns[cdKey] = now();
    pref.totals.declarationsSent++;
    recalcCareerRp(pref);
    updateLb(db, pref);
    saveDb(db);

    uiBanner(player, "UNKNOWN", C + "7" + tref.name + C_RESET);
    msg(player, C + "8Silent  " + C + "7they are not notified and do not see you");
    msg(player, C + "8You still gain rival benefits. If they /rival you too, it becomes Declared.");
}

/*
 * Visible declare toward Mutual. Target is notified and may accept,
 * decline, or ignore. You keep benefits either way; they get none until
 * they declare/accept. Both visible declares -> Mutual.
 */
function cmdDeclare(player, targetName) {
    var clean = str(targetName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /rival declare <player>"); return; }
    var target = onlineByName(clean);
    if (target == null) { msg(player, C + "cThat player must be online."); return; }
    if (uuidOf(player) == uuidOf(target)) { msg(player, C + "cYou cannot declare yourself."); return; }

    var db = loadDb();
    cleanupExpiredRequests(db);
    var pref = ensurePlayer(db, player);
    var tref = ensurePlayer(db, target);
    var pu = pref.uuid;
    var tu = tref.uuid;

    if (pref.rivals[tu] != null && pref.rivals[tu].mutual === true) {
        var st = linkStatus(pref.rivals[tu]);
        msg(player, C + "eAlready your " + (st == "nemesis" ? "Nemesis" : "mutual rival") +
            " with " + tref.name); return;
    }
    if (getRequest(db, pu, tu) != null) {
        msg(player, C + "eDeclare already pending for " + tref.name); return;
    }

    var cdKey = reqKey(pu, tu);
    var rem = DECLARE_COOLDOWN_MS - (now() - num(db.cooldowns[cdKey], 0));
    if (rem > 0) { msg(player, C + "cWait " + Math.ceil(rem / 1000) + "s."); return; }

    var reverse = getRequest(db, tu, pu);
    if (reverse != null) {
        promoteMutual(player, target, db, pref, tref, "Crossed rival declares");
        return;
    }

    if (pref.rivals[tu] != null && isReciprocatedSilent(pref.rivals[tu])) {
        msg(player, C + "8You are Declared with " + tref.name +
            C + "8. Sending a visible declare for Mutual...");
    }

    /* You keep benefits (declaredByMe). They get invite only - no benefits yet. */
    var pl = ensureLink(pref, tref);
    pl.declaredByMe = true;
    pl.inviteSent = true;
    pl.mutual = false;
    refreshLinkStatus(pl);
    pushHistory(pl, "declare", "Visible rival declare");

    var tl = ensureLink(tref, pref);
    tl.inviteReceived = true;
    tl.mutual = false;
    /* Do NOT set declaredByMe on them - decline/ignore means no benefits for them. */
    refreshLinkStatus(tl);
    pushHistory(tl, "declared_by", "Received rival declare");

    db.requests[reqKey(pu, tu)] = {
        fromUuid: pu, fromName: pref.name, toUuid: tu, toName: tref.name,
        createdAt: now(), kind: "declare"
    };
    db.cooldowns[cdKey] = now();
    pref.totals.declarationsSent++;
    saveDb(db);

    uiBanner(player, "DECLARE", C + "aSent to " + C + "e" + tref.name + C_RESET);
    msg(player, C + "8They can accept, decline, or ignore.");
    msg(player, C + "8You keep rival benefits. They gain none until they declare/accept.");
    uiBanner(target, "DECLARE", C + "e" + pref.name + C + "7 declared you as a rival");
    msg(target, C + "8Accept  " + C + "f/rival accept " + pref.name +
        C + "8  |  Decline  " + C + "f/rival decline " + pref.name);
    msg(target, C + "8Ignore them and you gain nothing; they still keep benefits.");
}

/* Legacy alias: /rival request|invite -> visible /rival declare. */
function cmdRequest(player, targetName) {
    cmdDeclare(player, targetName);
}

function cmdAccept(player, fromName) {
    var clean = str(fromName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /rival accept <player>"); return; }
    var db = loadDb();
    cleanupExpiredRequests(db);
    var pref = ensurePlayer(db, player);
    var from = findRecord(db, clean);
    if (from == null) { msg(player, C + "cNo rivalry with that player."); return; }

    /* Accept their visible /rival declare -> Mutual. */
    if (getRequest(db, from.uuid, pref.uuid) != null) {
        var onlineReq = onlineByName(from.name);
        formMutual(db, pref, from, "Accepted rival declare");
        removeRequests(db, from.uuid, pref.uuid);
        pref.totals.declarationsAccepted++;
        from.totals.declarationsAccepted++;
        saveDb(db);
        uiBanner(player, "MUTUAL", C + "e" + from.name + C_RESET);
        msg(player, C + "8Both sides declared. Benefits work for both.");
        msg(player, C + "8Nemesis after " + NEMESIS_DEATH_LOSSES +
            "+ death losses to them (timer/damage losses do not count).");
        if (onlineReq != null) {
            uiBanner(onlineReq, "MUTUAL", C + "e" + pref.name + C + "a accepted!" + C_RESET);
            msg(onlineReq, C + "8Both sides declared. Benefits work for both.");
        }
        return;
    }

    msg(player, C + "cNo pending rival declare from " + from.name);
    msg(player, C + "8They must  " + C + "f/rival declare " + pref.name +
        C + "8  first, or you can declare them.");
}

function cmdDecline(player, fromName) {
    var clean = str(fromName).replace(/^\s+|\s+$/g, "");
    if (clean == "") { msg(player, C + "cUsage: /rival decline <player>"); return; }
    var db = loadDb();
    cleanupExpiredRequests(db);
    var pref = ensurePlayer(db, player);
    var from = findRecord(db, clean);
    if (from == null || getRequest(db, from.uuid, pref.uuid) == null) {
        msg(player, C + "cNo active rival declare."); return;
    }
    removeRequests(db, from.uuid, pref.uuid);
    /*
     * Declarer keeps declaredByMe benefits. Clear only invite flags on both.
     * Do not give this player declaredByMe.
     */
    if (from.rivals[pref.uuid] != null) {
        from.rivals[pref.uuid].inviteSent = false;
        refreshLinkStatus(from.rivals[pref.uuid]);
    }
    if (pref.rivals[from.uuid] != null) {
        pref.rivals[from.uuid].inviteReceived = false;
        if (pref.rivals[from.uuid].declaredByMe !== true &&
            pref.rivals[from.uuid].declaredByThem !== true &&
            pref.rivals[from.uuid].mutual !== true) {
            delete pref.rivals[from.uuid];
        } else {
            refreshLinkStatus(pref.rivals[from.uuid]);
        }
    }
    pref.totals.declarationsDeclined++;
    /* Promote any silent+silent Declared pairs left after clearing invites. */
    healCrossedSilentDeclares(db);
    saveDb(db);
    msg(player, C + "eDeclined " + from.name);
    msg(player, C + "8You gain no rival benefits from them.");
    var online = onlineByName(from.name);
    if (online != null) {
        msg(online, C + "c" + pref.name + " declined your rival declare.");
        msg(online, C + "8You still keep your rival benefits toward them.");
    }
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
    var link = pref.rivals[target.uuid];
    var st = linkStatus(link);
    var wasShared = (st == "mutual" || st == "nemesis");
    var wasDeclared = (st == "declared");
    /*
     * Silent Unknown must stay silent on remove.
     * Notify only Mutual/Nemesis/Declared (they already know).
     */
    var notifyThem = wasShared || wasDeclared;

    archiveRivalLink(pref, target.uuid);
    delete pref.rivals[target.uuid];

    if (wasShared) {
        /* Mutual / Nemesis: end the rivalry for both players. */
        if (target.rivals[pref.uuid] != null) {
            archiveRivalLink(target, pref.uuid);
            delete target.rivals[pref.uuid];
        }
        recomputeNemesis(pref);
        recomputeNemesis(target);
    } else if (wasDeclared) {
        /* Reciprocated Declared: they keep one-way Declared if they still declare you. */
        if (target.rivals[pref.uuid] != null) {
            var kept = target.rivals[pref.uuid];
            kept.mutual = false;
            kept.isNemesis = false;
            kept.declaredByThem = false;
            kept.inviteSent = false;
            kept.inviteReceived = false;
            kept.mutualAccepted = false;
            kept.mutualSince = 0;
            if (kept.declaredByMe === true) {
                refreshLinkStatus(kept);
                pushHistory(kept, "demoted", pref.name + " ended Declared rivalry");
            } else {
                delete target.rivals[pref.uuid];
            }
        }
    } else {
        /* Unknown / pending invite: only clear your side; scrub invite flags on them. */
        if (target.rivals[pref.uuid] != null) {
            var their = target.rivals[pref.uuid];
            their.declaredByThem = false;
            their.inviteReceived = false;
            their.inviteSent = false;
            if (their.declaredByMe !== true && their.mutual !== true) {
                delete target.rivals[pref.uuid];
            } else {
                refreshLinkStatus(their);
            }
        }
    }

    removeRequests(db, pref.uuid, target.uuid);
    pref.totals.rivalsRemoved++;
    recalcCareerRp(pref);
    recalcCareerRp(target);
    updateLb(db, pref);
    updateLb(db, target);
    saveDb(db);

    msg(player, C + "eRemoved rivalry with " + target.name);
    if (wasShared) {
        msg(player, C + "8History saved. Rematch keeps prior record.");
    } else if (wasDeclared) {
        msg(player, C + "8History saved. They may still have you as Unknown.");
    }
    if (notifyThem) {
        var online = onlineByName(target.name);
        if (online != null) {
            if (wasShared) {
                msg(online, C + "c" + pref.name + " ended rivalry with you.");
                msg(online, C + "8History saved if you rival again later.");
            } else if (wasDeclared) {
                msg(online, C + "e" + pref.name + " ended Declared rivalry with you.");
                msg(online, C + "8You still have them as a one-way Unknown rival.");
            }
        }
    }
}

function cmdList(player) {
    var db = loadDb();
    cleanupExpiredRequests(db);
    var pref = ensurePlayer(db, player);
    /* Crown / clear Nemesis from current deathLosses (not stale flags). */
    recomputeNemesis(pref);
    saveDb(db);

    var nemName = "-";
    if (pref.nemesisUuid && pref.rivals[pref.nemesisUuid]) nemName = pref.rivals[pref.nemesisUuid].name;

    uiHead(player, "YOUR RIVALS");
    uiProp(player, "Career", C + "f" + commas(pref.career.rivalPointsTotal) + C + "7 RP" +
        C + "8   " + C + "a" + num(pref.career.officialWins, 0) + C + "8-" +
        C + "c" + num(pref.career.officialLosses, 0));
    uiProp(player, "Mutual", C + "f" + countMutual(pref) + "/" + MAX_MUTUAL +
        C + "8   Nemesis  " + C + "c" + nemName);

    var groups = { nemesis: [], mutual: [], declared: [], pending: [], unknown: [] };
    for (var u in pref.rivals) {
        if (!pref.rivals.hasOwnProperty(u)) continue;
        var link = pref.rivals[u];
        var st = refreshLinkStatus(link);
        if (groups[st] != null) groups[st].push(link);
    }

    function printGroup(title, color, arr, showPg) {
        if (arr.length == 0) return;
        uiBlank(player);
        msg(player, C + color + C_BOLD + title + C_RESET + C + "8  (" + arr.length + ")");
        for (var i = 0; i < arr.length; i++) {
            printRivalCard(player, arr[i], showPg);
            if (i < arr.length - 1) msg(player, C + "8  .");
        }
    }

    printGroup("NEMESIS", "c", groups.nemesis, true);
    printGroup("MUTUAL", "6", groups.mutual, true);
    printGroup("DECLARED", "e", groups.declared, false);
    printGroup("PENDING", "d", groups.pending, false);
    printGroup("UNKNOWN", "7", groups.unknown, false);

    var totalShown = groups.nemesis.length + groups.mutual.length +
        groups.declared.length + groups.pending.length + groups.unknown.length;
    if (totalShown == 0) {
        uiBlank(player);
        msg(player, C + "8No rivals yet. Use  " + C + "e/rival <player>");
    }

    var inbound = 0;
    for (var key in db.requests) {
        if (!db.requests.hasOwnProperty(key)) continue;
        if (str(db.requests[key].toUuid) == pref.uuid) {
            if (inbound == 0) {
                uiBlank(player);
                uiSection(player, "Incoming Declares");
            }
            inbound++;
            msg(player, C + "d  > " + C + "f" + db.requests[key].fromName +
                C + "8  /rival accept " + db.requests[key].fromName);
        }
    }
    uiFoot(player);
}

function parseChallengeMinutes(raw) {
    var s = str(raw).replace(/^\s+|\s+$/g, "").toLowerCase();
    if (s == "") return CH_MIN_MINUTES;
    s = s.replace(/m(in(utes?)?)?$/, "");
    var n = Math.floor(Number(s));
    if (isNaN(n) || !isFinite(n)) return -1;
    if (n < CH_MIN_MINUTES || n > CH_MAX_MINUTES) return -1;
    return n;
}

function challengeDurationLabel(minutes) {
    var m = Math.max(CH_MIN_MINUTES, num(minutes, CH_MIN_MINUTES));
    if (m == 1) return "1 minute";
    return m + " minutes";
}

function cmdChallenge(player, targetName, durationRaw) {
    var clean = str(targetName).replace(/^\s+|\s+$/g, "");
    if (clean == "") {
        msg(player, C + "cUsage: /challenge <player> [1-" + CH_MAX_MINUTES + "]");
        return;
    }
    var minutes = parseChallengeMinutes(durationRaw);
    if (minutes < 0) {
        msg(player, C + "cDuration must be " + CH_MIN_MINUTES + "-" + CH_MAX_MINUTES + " minutes.");
        return;
    }
    var durationMs = minutes * 60 * 1000;

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
        related: areRelated(db, fromU, toU),
        durationMinutes: minutes,
        durationMs: durationMs
    };
    ch.cooldowns[cdKey] = now();
    saveCh(ch);
    saveDb(db);

    var label = challengeDurationLabel(minutes);
    uiBanner(player, "Challenge", C + "aSent to " + C + "e" + nameOf(target) +
        C + "8  (" + label + ")");
    uiBanner(target, "Challenge", C + "e" + nameOf(player) + C + "7 wants a " +
        C + "f" + label + C + "7 rival battle");
    msg(target, C + "8  /challenge accept" + C + "7   or   " + C + "8/challenge decline");
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
    var minutes = Math.max(CH_MIN_MINUTES, num(pending.durationMinutes, CH_MIN_MINUTES));
    if (minutes > CH_MAX_MINUTES) minutes = CH_MAX_MINUTES;
    var durationMs = num(pending.durationMs, minutes * 60 * 1000);
    if (durationMs < CH_DURATION_MS) durationMs = minutes * 60 * 1000;
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
        durationMinutes: minutes,
        durationMs: durationMs,
        endedAt: 0,
        endReason: "",
        winnerUuid: "",
        loserUuid: "",
        announcedCountdown: true,
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
    var label = challengeDurationLabel(minutes);
    if (a != null) uiBanner(a, "Challenge", C + "6Accepted! " + C + "f" + label + C + "6  Countdown...");
    if (b != null) uiBanner(b, "Challenge", C + "6Accepted! " + C + "f" + label + C + "6  Countdown...");

    /*
     * Pair-key lock so accept spam / dual handlers cannot
     * flood the server with identical countdown lines.
     */
    var announceKey = pending.fromUuid + ">" + pending.toUuid;
    if (claimChallengeAnnounce(announceKey)) {
        broadcast(C + "8--------------------------------");
        broadcast(C + "6[Rival Battle] " + C + "e" + pending.fromName +
            C + "7  vs  " + C + "e" + pending.toName);
        broadcast(C + "8" + label + C + "7  |  Countdown...  Watch: " +
            C + "f/spectaterival " + pending.fromName);
        broadcast(C + "8--------------------------------");
    }
}

function cmdChallengeAccept(player, fromName) {
    var ch = loadCh();
    var pending = findPendingFor(ch, uuidOf(player), fromName);
    if (pending == null) { msg(player, C + "cNo pending challenge."); return; }

    /* Prevent double-accept from multi-fire CMI/triggers */
    var acceptKey = "accept." + pending.fromUuid + ">" + pending.toUuid;
    if (!claimChallengeAnnounce(acceptKey)) {
        msg(player, C + "7Challenge already accepted.");
        return;
    }

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
    if (session.state == "ended") {
        msg(player, C + "cChallenge already ended."); return;
    }
    /*
     * Do not tear the session down here — Rival System owns rewards +
     * the battle report. Mark a pendingEnd for the next challenge tick.
     */
    var winnerUuid = (u == session.challengerUuid) ? session.opponentUuid : session.challengerUuid;
    session.pendingEnd = {
        reason: "forfeit",
        winnerUuid: winnerUuid,
        loserUuid: u,
        knockout: false,
        at: now()
    };
    saveCh(ch);
    msg(player, C + "cYou forfeited. Report incoming...");
    var winner = onlineByName(winnerUuid == session.challengerUuid ? session.challengerName : session.opponentName);
    if (winner != null) msg(winner, C + "aOpponent forfeited. Settling the battle...");
}

function showStats(player, targetName) {
    var db = loadDb();
    var name = targetName != "" ? targetName : nameOf(player);
    var record = findRecord(db, name);
    if (record == null) {
        uiBanner(player, "Rival", C + "cNo record for " + name);
        return;
    }
    var career = record.career || {};
    var tier = getTier(career.rivalPointsTotal);

    uiHead(player, "RIVAL STATS");
    uiProp(player, "Player", C + "f" + record.name);
    uiProp(player, "Rank", C + tier.color + tier.name + C_RESET +
        C + "8  (" + C + "f" + commas(career.rivalPointsTotal) + C + "7 RP)");
    uiBlank(player);
    uiProp(player, "Record", C + "a" + num(career.officialWins, 0) + C + "8-" +
        C + "c" + num(career.officialLosses, 0) + C + "8-" + C + "7" + num(career.officialDraws, 0));
    uiProp(player, "Streak", C + "e" + commas(career.currentStreak) +
        C + "8   Best  " + C + "6" + commas(career.bestStreak));
    uiProp(player, "Damage", C + "f" + commas(career.damageDealt) +
        C + "8  Taken  " + C + "f" + commas(career.damageTaken));
    uiProp(player, "Battles", C + "f" + commas(career.challengesPlayed));
    uiFoot(player);
}

/*
 * Same storeddata key as Rival System.js / End Dimension Strength.js.
 * Hides kill TP chat spam only — TP is still awarded.
 */
var KILL_TP_CHAT_KEY = "dmz_kill_tp_chat";

function killTpChatEnabled(player) {
    try {
        var stored = player.getStoreddata();
        if (stored == null || !stored.has(KILL_TP_CHAT_KEY)) return true;
        var value = lower(stored.get(KILL_TP_CHAT_KEY));
        return value != "0" && value != "false" && value != "off";
    } catch (e) {
        return true;
    }
}

function setKillTpChatEnabled(player, enabled) {
    try {
        var stored = player.getStoreddata();
        if (stored == null) return false;
        stored.put(KILL_TP_CHAT_KEY, enabled ? "1" : "0");
        return true;
    } catch (e) {
        return false;
    }
}

function cmdTpMsg(player, mode) {
    var want = null;
    var arg = lower(mode);
    if (arg == "on" || arg == "enable" || arg == "true" || arg == "1") want = true;
    else if (arg == "off" || arg == "disable" || arg == "false" || arg == "0") want = false;
    else if (arg == "" || arg == "toggle") want = !killTpChatEnabled(player);
    else {
        msg(player, C + "cUsage: /rival tpmsg [on|off]");
        return;
    }

    if (!setKillTpChatEnabled(player, want)) {
        msg(player, C + "cCould not save kill TP chat preference.");
        return;
    }

    if (want) {
        msg(player, C + "a[Rival] Kill TP chat " + C + "fenabled" + C + "a.");
        msg(player, C + "8You will see TP messages when killing mobs near rivals.");
    } else {
        msg(player, C + "e[Rival] Kill TP chat " + C + "fdisabled" + C + "e.");
        msg(player, C + "8TP is still awarded - only the chat spam is hidden.");
    }
}

function showTop(player, category) {
    var db = loadDb();
    var cat = lower(category || "rp");
    var key = "rp";
    var title = "TOP RIVAL POINTS";
    if (cat == "wins") { key = "wins"; title = "TOP OFFICIAL WINS"; }
    else if (cat == "streak") { key = "streak"; title = "TOP RIVAL STREAKS"; }
    else if (cat == "damage") { key = "damage"; title = "TOP RIVAL DAMAGE"; }
    else if (cat == "combo") { key = "combo"; title = "TOP RIVAL COMBOS"; }
    else if (cat == "hit") { key = "hit"; title = "BIGGEST RIVAL HITS"; }
    else if (cat == "battles") { key = "battles"; title = "MOST RIVAL BATTLES"; }

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

    uiHead(player, title);

    if (rows.length == 0 || num(rows[0][key], 0) <= 0) {
        msg(player, C + "8No records have been saved yet.");
        uiFoot(player);
        return;
    }

    var shown = 0;
    for (var i = 0; i < rows.length && shown < 10; i++) {
        if (num(rows[i][key], 0) <= 0) continue;
        shown++;
        var placeColor = shown == 1 ? "6" : (shown == 2 ? "7" : (shown == 3 ? "e" : "8"));
        msg(player,
            C + placeColor + "#" + shown + C_RESET +
            C + "f  " + rows[i].name +
            C + "8  ........  " +
            C + "a" + commas(rows[i][key])
        );
    }
    uiFoot(player);
}

function showTitle(player) {
    var db = loadDb();
    var rec = findRecord(db, nameOf(player));
    if (rec == null) { msg(player, C + "cNo record."); return; }
    var tier = getTier(num(rec.career.rivalPointsTotal, 0));
    syncCmiTitle(nameOf(player), tier.name);
    uiHead(player, "RIVAL TITLE");
    uiProp(player, "Title", C + tier.color + C_BOLD + tier.name + C_RESET);
    uiProp(player, "Perk", C + "e" + tier.perk);
    uiProp(player, "TP Gain", C + "a" + (Math.round(num(tier.tpMult, 1) * 100)) + "%");
    uiProp(player, "RP", C + "f" + commas(rec.career.rivalPointsTotal));
    msg(player, C + "8Rival TP awards use your title multiplier.");
    msg(player, C + "8Synced to CMI usermeta rival_title");
    uiFoot(player);
}

function showJournal(player, targetName) {
    var db = loadDb();
    var name = targetName != "" ? targetName : nameOf(player);
    var rec = findRecord(db, name);
    if (rec == null) { msg(player, C + "cNo record."); return; }
    uiHead(player, "RIVAL JOURNAL");
    uiProp(player, "Fighter", C + "f" + rec.name);
    uiBlank(player);
    var n = 0;
    for (var u in rec.rivals) {
        if (!rec.rivals.hasOwnProperty(u)) continue;
        var l = rec.rivals[u];
        n++;
        var tier = getTier(l.points);
        msg(player, C + "f  " + l.name + "  " + linkStatusLabel(linkStatus(l)));
        msg(player, C + "8    " + C + tier.color + tier.name + C_RESET +
            C + "8   " + C + "a" + num(l.wins, 0) + C + "8-" + C + "c" + num(l.losses, 0) +
            C + "8   " + C + "f" + commas(l.points) + C + "7 RP");
    }
    if (n == 0) msg(player, C + "8No rival history yet.");
    uiFoot(player);
}

function showSeason(player) {
    var prog = loadJson(PROG_KEY);
    if (prog == null || prog.season == null) {
        uiHead(player, "RIVAL SEASON");
        msg(player, C + "8Season data appears after RivalProgression login.");
        uiFoot(player);
        return;
    }
    var s = prog.season;
    var left = Math.max(0, num(s.endsAt, 0) - now());
    var entry = s.leaderboard[uuidOf(player)] || { rp: 0, wins: 0 };
    uiHead(player, str(s.name).toUpperCase());
    uiProp(player, "Ends", C + "f" + Math.ceil(left / 86400000) + "d");
    uiProp(player, "Your RP", C + "f" + commas(entry.rp));
    uiProp(player, "Wins", C + "a" + commas(entry.wins));
    uiFoot(player);
}

function showQuests(player) {
    uiHead(player, "WEEKLY QUESTS");
    var prog = loadJson(PROG_KEY);
    if (prog == null || prog.quests == null || prog.quests[uuidOf(player)] == null) {
        msg(player, C + "8No active quests yet. Keep RivalProgression enabled.");
        uiFoot(player);
        return;
    }
    var q = prog.quests[uuidOf(player)];
    for (var i = 0; i < q.list.length; i++) {
        var item = q.list[i];
        var cur = Math.min(num(item.progress, 0), item.goal);
        var done = cur >= item.goal;
        msg(player, (done ? C + "a  + " : C + "e  > ") + C + "f" + item.name);
        msg(player, C + "8    " + cur + " / " + item.goal);
    }
    uiFoot(player);
}

function showAchievements(player) {
    var prog = loadJson(PROG_KEY);
    var list = prog != null && prog.achievements != null ? (prog.achievements[uuidOf(player)] || {}) : {};
    var defs = [
        ["first_blood", "First Blood"],
        ["nemesis", "Vendetta Rank"],
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
    uiHead(player, "ACHIEVEMENTS");
    var unlocked = 0;
    for (var i = 0; i < defs.length; i++) {
        var ok = list[defs[i][0]] === true;
        if (ok) unlocked++;
        msg(player, (ok ? C + "a  [x] " : C + "8  [ ] ") +
            (ok ? C + "f" : C + "7") + defs[i][1] + C_RESET);
    }
    uiBlank(player);
    uiProp(player, "Progress", C + "f" + unlocked + C + "8 / " + defs.length);
    uiFoot(player);
}

function showHof(player) {
    var prog = loadJson(PROG_KEY);
    var hof = prog != null && prog.hallOfFame != null ? prog.hallOfFame : {};
    uiHead(player, "HALL OF LEGENDS");
    uiProp(player, "Greatest", C + "f" + (hof.greatestRivals || "-"));
    uiProp(player, "Longest", C + "f" + (hof.longestRivalry || "-"));
    uiProp(player, "Battles", C + "f" + (hof.mostBattles || hof.mostLegendary || "-"));
    uiProp(player, "Streak", C + "f" + (hof.longestStreak || "-"));
    uiProp(player, "Match", C + "f" + (hof.mostLegendaryMatch || "-"));
    uiProp(player, "Season", C + "f" + (hof.seasonChampion || "-"));
    uiProp(player, "Highest RP", C + "f" + (hof.highestRp || "-"));
    uiFoot(player);
}

function showSpectate(player, targetName) {
    if (targetName == "") { msg(player, C + "cUsage: /spectaterival <player>"); return; }
    var target = onlineByName(targetName);
    if (target == null) { msg(player, C + "cThat player is offline."); return; }
    var ch = loadCh();
    var sid = ch.playerSessions[uuidOf(target)];
    if (sid == null || ch.sessions[String(sid)] == null) {
        msg(player, C + "cNot in an official battle."); return;
    }
    var session = ch.sessions[String(sid)];
    var a = (session.combat && session.combat[session.challengerUuid]) || {};
    var b = (session.combat && session.combat[session.opponentUuid]) || {};
    uiHead(player, "SPECTATING");
    uiProp(player, session.challengerName, C + "f" + commas(a.damage || 0) + C + "7 dmg");
    uiProp(player, session.opponentName, C + "f" + commas(b.damage || 0) + C + "7 dmg");
    try {
        player.getTempdata().put("rival.v4.spectateSession", String(sid));
        player.getTempdata().put("rival.v4.spectateUntil", String(now() + 120000));
    } catch (e) {}
    msg(player, C + "aSpectating for 2 minutes.");
    uiFoot(player);
}

/* ========================= UI HELPERS ========================= */

function message(player, text) {
    msg(player, text);
}

function line(player) {
    uiLine(player);
}

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

function printRivalCard(player, L, showPg) {
    var st = linkStatus(L);
    var tier = getTier(L.points);
    msg(player, C + "f  " + L.name + "  " + linkStatusLabel(st));
    if (st == "pending") {
        if (L.inviteSent === true) {
            msg(player, C + "8    Waiting for them to accept / decline / ignore");
        } else if (L.inviteReceived === true) {
            msg(player, C + "8    They declared you  " + C + "f/rival accept " + L.name);
        }
    }
    msg(player, C + "8    Rank  " + C + tier.color + tier.name + C_RESET +
        C + "8   RP  " + C + "f" + commas(L.points));
    msg(player, C + "8    Record  " + C + "a" + num(L.wins, 0) + C + "8-" +
        C + "c" + num(L.losses, 0) +
        C + "8   Streak  " + C + "a" + num(L.currentStreak, 0));
    if (L.mutual === true) {
        var deaths = num(L.deathLosses, 0);
        if (st == "nemesis") {
            msg(player, C + "8    Deaths to them  " + C + "c" + deaths +
                C + "8  (Nemesis)");
        } else {
            msg(player, C + "8    Nemesis  " + C + "f" + deaths + "/" + NEMESIS_DEATH_LOSSES +
                C + "8  death losses");
        }
    }
    if (showPg === true && L.provingGrounds && L.provingGrounds.active === true) {
        var pg = L.provingGrounds;
        var place = str(pg.name);
        if (place == "") place = "Unknown Lands";
        var tierLabel = "Claimed";
        if (num(pg.tier, 0) >= 3) tierLabel = "Legendary";
        else if (num(pg.tier, 0) >= 2) tierLabel = "Dominant";
        msg(player, C + "8    Grounds  " + C + "e" + place + C + "8  (" + tierLabel + ")");
        msg(player, C + "8    Champion  " + C + "f" + str(pg.championName || "-") +
            C + "8   Battles  " + C + "f" + commas(pg.battles));
    }
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
 /rival Steve          => silent Unknown
 /rival declare Steve  => visible declare toward Mutual
 /rival request Steve  => alias of declare (old CMI)
 /rivaldeclare Steve   => trigger 200 <player> declare Steve
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
    } else if (sub == "request" || sub == "invite") {
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
    } else if (sub == "tpmsg" || sub == "tpmessages" || sub == "killtp") {
        cmdTpMsg(player, target);
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
        /* /rival <player> = silent Unknown */
        cmdSilent(player, parts[0]);
    }
}

function routeChallengeSub(player, event) {
    var parts = argsFrom(event, 1);
    if (parts.length == 0) {
        msg(player, C + "cUsage: /challenge <player> [1-" + CH_MAX_MINUTES + "]");
        return;
    }
    var sub = lower(parts[0]);
    var target = parts.length > 1 ? parts[1] : "";
    var durationArg = parts.length > 2 ? parts[2] : "";

    if (sub == "accept") {
        cmdChallengeAccept(player, target);
    } else if (sub == "decline") {
        cmdChallengeDecline(player, target);
    } else if (sub == "cancel" || sub == "forfeit") {
        cmdChallengeCancel(player);
    } else if (sub == "rival") {
        /* Original concept: /Challenge Rival <player> [minutes] */
        if (target == "") {
            msg(player, C + "cUsage: /challenge rival <player> [1-" + CH_MAX_MINUTES + "]");
            return;
        }
        cmdChallenge(player, target, durationArg);
    } else {
        /* /challenge Steve   or   /challenge Steve 5 */
        cmdChallenge(player, parts[0], parts.length > 1 ? parts[1] : "");
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
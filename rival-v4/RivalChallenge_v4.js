/*
============================================================
 DBZ Legacy Reborn - Rival Challenge V4
 Version: 4.0.0

 Official 60-second most-damage contest.

 PLACE AS:
 CustomNPCs Global Player Script

 REQUIRED EVENTS:
 - init
 - tick
 - damagedEntity
 - damaged
 - kill
 - died
 - logout
 - trigger

 TRIGGERS:
 210 = challenge <player>
 211 = accept [player]
 212 = decline [player]
 213 = cancel / forfeit

 Requires RivalCore_v4 database:
   dlr.rivalry.v4.database

 Battle sessions stored in:
   dlr.rivalry.v4.challenges

 Disable RivalBattle Manager/Combat V3 while testing.
============================================================
*/

/* ========================= JAVA TYPES ========================= */

/*
 Avoid top-level System / RC_System bindings. Multiple Global Player
 scripts can overwrite similarly named variables in CustomNPCs.
*/
var RIVAL_CH_API = null;
var RIVAL_CH_STATS_PROVIDER = null;
var RIVAL_CH_STATS_CAP = null;
var RIVAL_CH_SYNC = null;
var RIVAL_CH_NETWORK = null;
var RIVAL_CH_KI = null;

function chApi() {
    if (RIVAL_CH_API === null) RIVAL_CH_API = Java.type("noppes.npcs.api.NpcAPI");
    return RIVAL_CH_API;
}

function chStatsProvider() {
    if (RIVAL_CH_STATS_PROVIDER === null) {
        RIVAL_CH_STATS_PROVIDER = Java.type("com.dragonminez.common.stats.StatsProvider");
    }
    return RIVAL_CH_STATS_PROVIDER;
}

function chStatsCap() {
    if (RIVAL_CH_STATS_CAP === null) {
        RIVAL_CH_STATS_CAP = Java.type("com.dragonminez.common.stats.StatsCapability");
    }
    return RIVAL_CH_STATS_CAP;
}

function chSyncPacket() {
    if (RIVAL_CH_SYNC === null) {
        RIVAL_CH_SYNC = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
    }
    return RIVAL_CH_SYNC;
}

function chNetwork() {
    if (RIVAL_CH_NETWORK === null) {
        RIVAL_CH_NETWORK = Java.type("com.dragonminez.common.network.NetworkHandler");
    }
    return RIVAL_CH_NETWORK;
}

function chKiClass() {
    if (RIVAL_CH_KI === null) {
        RIVAL_CH_KI = Java.type("com.dragonminez.common.init.entities.ki.AbstractKiProjectile");
    }
    return RIVAL_CH_KI;
}

/* ========================= CONFIGURATION ========================= */

var CH_DEBUG = false;
var CH_COLOR = String.fromCharCode(167);

var CH_CORE_DB_KEY = "dlr.rivalry.v4.database";
var CH_CORE_BACKUP_KEY = "dlr.rivalry.v4.database.backup";
var CH_DB_KEY = "dlr.rivalry.v4.challenges";
var CH_DB_BACKUP_KEY = "dlr.rivalry.v4.challenges.backup";

var CH_REQUEST_EXPIRE_MS = 30 * 1000;
var CH_COUNTDOWN_MS = 5 * 1000;
var CH_DURATION_MS = 60 * 1000;
var CH_REQUEST_COOLDOWN_MS = 15 * 1000;
var CH_MAX_DISTANCE = 64;
var CH_TICK_MS = 250;

var CH_WIN_TP = 3500;
var CH_LOSE_TP = 1200;
var CH_DRAW_TP = 1800;
var CH_KO_WIN_TP_BONUS = 2500;

var CH_WIN_RP = 18;
var CH_LOSE_RP = 35;
var CH_DRAW_RP = 12;
var CH_KO_LOSE_RP_BONUS = 15;
var CH_FORFEIT_RP_PENALTY = 10;

var CH_NON_RIVAL_WIN_TP = 2000;

var CH_ALLOW_NON_RIVAL = true;

/* ========================= HELPERS ========================= */

function chNow() {
    try {
        return Number(new Date().getTime());
    } catch (ignored) {
        try {
            return Number(Java.type("java.lang.System").currentTimeMillis());
        } catch (ignored2) {
            return 0;
        }
    }
}

function chString(value) {
    if (value === null || value === undefined) return "";
    return String(value);
}

function chNumber(value, fallback) {
    var number = Number(value);
    return isNaN(number) || !isFinite(number) ? fallback : number;
}

function chMessage(player, message) {
    try {
        if (player !== null && player !== undefined) player.message(message);
    } catch (ignored) {}
}

function chLog(message) {
    if (!CH_DEBUG) return;
    try { print("[RivalChallenge v4] " + message); } catch (ignored) {}
}

function chUuid(player) {
    try { return chString(player.getUUID()); } catch (ignored) { return ""; }
}

function chName(player) {
    try { return chString(player.getName()); } catch (ignored) { return "Unknown"; }
}

function chIsPlayer(entity) {
    if (entity === null || entity === undefined) return false;
    try { return Number(entity.getType()) === 1; } catch (ignored) { return false; }
}

function chArgs(event) {
    var result = [];
    if (event === null || event.arguments === null || event.arguments === undefined) return result;
    for (var i = 0; i < event.arguments.length; i++) result.push(chString(event.arguments[i]));
    return result;
}

function chDistance(a, b) {
    try {
        var dx = a.getX() - b.getX();
        var dy = a.getY() - b.getY();
        var dz = a.getZ() - b.getZ();
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (ignored) {
        return 999999;
    }
}

function chCommas(value) {
    var number = Math.floor(chNumber(value, 0));
    var raw = String(number);
    var out = "";
    while (raw.length > 3) {
        out = "," + raw.substring(raw.length - 3) + out;
        raw = raw.substring(0, raw.length - 3);
    }
    return raw + out;
}

function chFormatMs(ms) {
    var seconds = Math.max(0, Math.ceil(chNumber(ms, 0) / 1000));
    var minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    if (minutes <= 0) return seconds + "s";
    return minutes + "m " + seconds + "s";
}

/* ========================= STORAGE ========================= */

function chDataWorld(fallbackPlayer) {
    var names = ["minecraft:overworld", "overworld"];
    for (var i = 0; i < names.length; i++) {
        try {
            var world = chApi().Instance().getIWorld(names[i]);
            if (world !== null && world !== undefined) return world;
        } catch (ignored1) {}
    }
    try { return fallbackPlayer.getWorld(); } catch (ignored2) { return null; }
}

function chFreshChallengeDb() {
    return {
        version: 4,
        nextId: 1,
        pending: {},
        sessions: {},
        playerSessions: {},
        cooldowns: {},
        updatedAt: chNow()
    };
}

function chNormalizeChallengeDb(database) {
    if (database === null || typeof database !== "object") database = chFreshChallengeDb();
    database.version = 4;
    database.nextId = Math.max(1, chNumber(database.nextId, 1));
    if (database.pending === null || typeof database.pending !== "object") database.pending = {};
    if (database.sessions === null || typeof database.sessions !== "object") database.sessions = {};
    if (database.playerSessions === null || typeof database.playerSessions !== "object") database.playerSessions = {};
    if (database.cooldowns === null || typeof database.cooldowns !== "object") database.cooldowns = {};
    database.updatedAt = chNumber(database.updatedAt, chNow());
    return database;
}

function chLoadChallengeDb(player) {
    var world = chDataWorld(player);
    if (world === null) throw new Error("No challenge storage world.");
    var stored = world.getStoreddata();
    var database;
    try {
        database = stored.has(CH_DB_KEY)
            ? JSON.parse(chString(stored.get(CH_DB_KEY)))
            : chFreshChallengeDb();
    } catch (mainError) {
        chLog("Challenge DB failed: " + mainError);
        try {
            database = stored.has(CH_DB_BACKUP_KEY)
                ? JSON.parse(chString(stored.get(CH_DB_BACKUP_KEY)))
                : chFreshChallengeDb();
        } catch (backupError) {
            database = chFreshChallengeDb();
        }
    }
    return chNormalizeChallengeDb(database);
}

function chSaveChallengeDb(player, database) {
    var world = chDataWorld(player);
    if (world === null) return;
    var stored = world.getStoreddata();
    database = chNormalizeChallengeDb(database);
    database.updatedAt = chNow();
    var json = JSON.stringify(database);
    if (stored.has(CH_DB_KEY)) stored.put(CH_DB_BACKUP_KEY, chString(stored.get(CH_DB_KEY)));
    stored.put(CH_DB_KEY, json);
}

function chLoadCoreDb(player) {
    var world = chDataWorld(player);
    if (world === null) return null;
    try {
        var stored = world.getStoreddata();
        if (!stored.has(CH_CORE_DB_KEY)) return null;
        return JSON.parse(chString(stored.get(CH_CORE_DB_KEY)));
    } catch (error) {
        chLog("Core DB read failed: " + error);
        return null;
    }
}

function chSaveCoreDb(player, database) {
    var world = chDataWorld(player);
    if (world === null) return;
    try {
        var stored = world.getStoreddata();
        database.updatedAt = chNow();
        var json = JSON.stringify(database);
        if (stored.has(CH_CORE_DB_KEY)) {
            stored.put(CH_CORE_BACKUP_KEY, chString(stored.get(CH_CORE_DB_KEY)));
        }
        stored.put(CH_CORE_DB_KEY, json);
    } catch (error) {
        chLog("Core DB save failed: " + error);
    }
}

/* ========================= LOOKUPS ========================= */

function chFindOnlineAnyWorld(name) {
    try {
        var worlds = chApi().Instance().getIWorlds();
        var wanted = chString(name).toLowerCase();
        for (var i = 0; i < worlds.length; i++) {
            try {
                var players = worlds[i].getAllPlayers();
                for (var p = 0; p < players.length; p++) {
                    if (chString(players[p].getName()).toLowerCase() === wanted) return players[p];
                }
            } catch (ignored) {}
        }
    } catch (error) {
        chLog("Player lookup failed: " + error);
    }
    return null;
}

function chFindOnlineByUuid(uuid) {
    try {
        var worlds = chApi().Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                var players = worlds[i].getAllPlayers();
                for (var p = 0; p < players.length; p++) {
                    if (chUuid(players[p]) === uuid) return players[p];
                }
            } catch (ignored) {}
        }
    } catch (error) {}
    return null;
}

function chGetSession(db, uuid) {
    if (db === null || db.playerSessions === null) return null;
    var id = db.playerSessions[uuid];
    if (id === null || id === undefined) return null;
    return db.sessions[String(id)] || null;
}

function chFreshCombat() {
    return {
        damage: 0,
        physical: 0,
        ki: 0,
        hits: 0,
        biggestHit: 0,
        combo: 0,
        longestCombo: 0,
        lastHitAt: 0
    };
}

/* ========================= DMZ ========================= */

function chGetDMZ(player) {
    try {
        var mcPlayer = player.getMCEntity();
        if (mcPlayer === null) return null;
        return chStatsProvider().get(chStatsCap().INSTANCE, mcPlayer).orElse(null);
    } catch (ignored) {
        return null;
    }
}

function chAwardTP(player, amount, reason) {
    try {
        amount = Math.floor(chNumber(amount, 0));
        if (amount <= 0) return false;
        var data = chGetDMZ(player);
        if (data === null) return false;
        data.getResources().addTrainingPoints(amount);
        var mcPlayer = player.getMCEntity();
        chNetwork().sendToTrackingEntityAndSelf(new (chSyncPacket())(mcPlayer), mcPlayer);
        chMessage(player, CH_COLOR + "a[Challenge] +" + chCommas(amount) + " TP" +
            (reason ? CH_COLOR + "7 (" + reason + ")" : ""));
        return true;
    } catch (error) {
        chMessage(player, CH_COLOR + "c[Challenge] TP award failed: " + error);
        return false;
    }
}

function chIsKiDamage(event) {
    try {
        var source = event.damageSource;
        if (source === null || source === undefined) return false;

        try {
            var immediate = source.getImmediateSource();
            if (immediate !== null) {
                var mc = null;
                try { mc = immediate.getMCEntity(); } catch (ignoredMc) { mc = immediate; }
                var KiClass = chKiClass();
                if (mc !== null && KiClass.isInstance(mc)) return true;
            }
        } catch (ignored1) {}

        try {
            var type = chString(source.getType()).toLowerCase();
            if (type.indexOf("ki") >= 0 || type.indexOf("energy") >= 0) return true;
        } catch (ignored2) {}
    } catch (ignored3) {}
    return false;
}

/* ========================= CORE RP HELPERS ========================= */

function chEnsureCorePlayer(core, player) {
    var uuid = chUuid(player);
    var name = chName(player);
    if (core.players === null || typeof core.players !== "object") core.players = {};
    var record = core.players[uuid];
    if (record === null || record === undefined) {
        record = {
            uuid: uuid,
            name: name,
            nameLower: name.toLowerCase(),
            rivals: {},
            career: {
                rivalPointsTotal: 0,
                officialWins: 0,
                officialLosses: 0,
                officialDraws: 0,
                knockouts: 0,
                currentStreak: 0,
                bestStreak: 0,
                damageDealt: 0,
                damageTaken: 0,
                biggestHit: 0,
                highestCombo: 0,
                challengesPlayed: 0,
                presenceMs: 0,
                killsNearRival: 0,
                surpassAwards: 0
            },
            totals: {
                declarationsSent: 0,
                declarationsAccepted: 0,
                declarationsDeclined: 0,
                rivalsRemoved: 0
            }
        };
        core.players[uuid] = record;
    }
    record.name = name;
    record.nameLower = name.toLowerCase();
    if (record.rivals === null || typeof record.rivals !== "object") record.rivals = {};
    if (record.career === null || typeof record.career !== "object") record.career = {};
    return record;
}

function chEnsureLink(owner, target) {
    if (owner.rivals[target.uuid] === undefined) {
        owner.rivals[target.uuid] = {
            uuid: target.uuid,
            name: target.name,
            nameLower: target.name.toLowerCase(),
            mutual: false,
            declaredByMe: false,
            declaredByThem: false,
            points: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            damageDealt: 0,
            damageTaken: 0,
            presenceMs: 0,
            createdAt: chNow(),
            updatedAt: chNow(),
            mutualSince: 0,
            lastBattleAt: chNow(),
            lastSeenTogetherAt: 0,
            history: []
        };
    }
    var link = owner.rivals[target.uuid];
    link.name = target.name;
    link.updatedAt = chNow();
    return link;
}

function chRecalcRp(record) {
    var total = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        total += Math.max(0, chNumber(record.rivals[uuid].points, 0));
    }
    record.career.rivalPointsTotal = total;
    return total;
}

function chAwardRp(record, rivalUuid, amount, reason) {
    var link = record.rivals[rivalUuid];
    if (link === null || link === undefined) return 0;
    amount = Math.floor(chNumber(amount, 0));
    link.points = Math.max(0, chNumber(link.points, 0) + amount);
    link.updatedAt = chNow();
    if (!(link.history instanceof Array)) link.history = [];
    link.history.push({ time: chNow(), type: amount >= 0 ? "rp_gain" : "rp_loss", note: reason + " (" + amount + ")" });
    while (link.history.length > 30) link.history.shift();
    chRecalcRp(record);
    return amount;
}

function chAreRelated(core, aUuid, bUuid) {
    var a = core.players[aUuid];
    var b = core.players[bUuid];
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return a.rivals[bUuid] !== undefined || b.rivals[aUuid] !== undefined;
}

/* ========================= CHALLENGE FLOW ========================= */

function chBusy(db, uuid) {
    if (db.playerSessions[uuid] !== undefined) return true;
    for (var key in db.pending) {
        if (!db.pending.hasOwnProperty(key)) continue;
        var pending = db.pending[key];
        if (pending.fromUuid === uuid || pending.toUuid === uuid) return true;
    }
    return false;
}

function chChallenge(player, targetName) {
    var clean = chString(targetName).replace(/^\s+|\s+$/g, "");
    if (clean === "") {
        chMessage(player, CH_COLOR + "cUsage: /challenge rival <player>");
        return;
    }

    var target = chFindOnlineAnyWorld(clean);
    if (target === null) {
        chMessage(player, CH_COLOR + "cThat player must be online.");
        return;
    }
    if (chUuid(player) === chUuid(target)) {
        chMessage(player, CH_COLOR + "cYou cannot challenge yourself.");
        return;
    }
    if (chDistance(player, target) > CH_MAX_DISTANCE) {
        chMessage(player, CH_COLOR + "cGet within " + CH_MAX_DISTANCE + " blocks to challenge.");
        return;
    }

    var db = chLoadChallengeDb(player);
    var core = chLoadCoreDb(player);
    if (core === null) {
        chMessage(player, CH_COLOR + "cRival database missing. Declare a rival first with /rival.");
        return;
    }

    var fromUuid = chUuid(player);
    var toUuid = chUuid(target);

    if (!CH_ALLOW_NON_RIVAL && !chAreRelated(core, fromUuid, toUuid)) {
        chMessage(player, CH_COLOR + "cYou can only challenge declared rivals.");
        return;
    }

    if (chBusy(db, fromUuid)) {
        chMessage(player, CH_COLOR + "cYou already have a pending or active challenge.");
        return;
    }
    if (chBusy(db, toUuid)) {
        chMessage(player, CH_COLOR + "cThat player is already in a challenge.");
        return;
    }

    var cooldownKey = fromUuid + ">" + toUuid;
    var remaining = CH_REQUEST_COOLDOWN_MS - (chNow() - chNumber(db.cooldowns[cooldownKey], 0));
    if (remaining > 0) {
        chMessage(player, CH_COLOR + "cWait " + Math.ceil(remaining / 1000) + "s before challenging them again.");
        return;
    }

    var id = String(db.nextId++);
    db.pending[id] = {
        id: id,
        fromUuid: fromUuid,
        fromName: chName(player),
        toUuid: toUuid,
        toName: chName(target),
        createdAt: chNow(),
        related: chAreRelated(core, fromUuid, toUuid)
    };
    db.cooldowns[cooldownKey] = chNow();
    chSaveChallengeDb(player, db);

    chMessage(player, CH_COLOR + "aChallenge sent to " + CH_COLOR + "e" + chName(target) + CH_COLOR + "a.");
    chMessage(target, CH_COLOR + "6" + chName(player) + CH_COLOR + "e challenged you to a Rival Battle!");
    chMessage(target, CH_COLOR + "7Most damage in 60 seconds. Accept: " + CH_COLOR + "f/challenge accept");
    chMessage(target, CH_COLOR + "7Decline: " + CH_COLOR + "f/challenge decline");
}

function chFindPendingFor(db, playerUuid, optionalFromName) {
    var wanted = chString(optionalFromName).toLowerCase();
    for (var id in db.pending) {
        if (!db.pending.hasOwnProperty(id)) continue;
        var pending = db.pending[id];
        if (pending.toUuid !== playerUuid) continue;
        if (wanted !== "" && chString(pending.fromName).toLowerCase() !== wanted) continue;
        return pending;
    }
    return null;
}

function chStartCountdown(player, db, pending) {
    delete db.pending[pending.id];

    var sessionId = String(db.nextId++);
    var now = chNow();
    var session = {
        id: sessionId,
        state: "countdown",
        challengerUuid: pending.fromUuid,
        challengerName: pending.fromName,
        opponentUuid: pending.toUuid,
        opponentName: pending.toName,
        related: pending.related === true,
        createdAt: now,
        countdownEndsAt: now + CH_COUNTDOWN_MS,
        battleEndsAt: 0,
        endedAt: 0,
        endReason: "",
        winnerUuid: "",
        loserUuid: "",
        combat: {}
    };
    session.combat[pending.fromUuid] = chFreshCombat();
    session.combat[pending.toUuid] = chFreshCombat();

    db.sessions[sessionId] = session;
    db.playerSessions[pending.fromUuid] = sessionId;
    db.playerSessions[pending.toUuid] = sessionId;
    chSaveChallengeDb(player, db);

    var a = chFindOnlineByUuid(pending.fromUuid);
    var b = chFindOnlineByUuid(pending.toUuid);
    if (a !== null) chMessage(a, CH_COLOR + "6Rival Challenge accepted! Countdown...");
    if (b !== null) chMessage(b, CH_COLOR + "6Rival Challenge accepted! Countdown...");
}

function chAccept(player, fromName) {
    var db = chLoadChallengeDb(player);
    var pending = chFindPendingFor(db, chUuid(player), fromName);
    if (pending === null) {
        chMessage(player, CH_COLOR + "cNo pending challenge to accept.");
        return;
    }

    var challenger = chFindOnlineByUuid(pending.fromUuid);
    if (challenger === null) {
        delete db.pending[pending.id];
        chSaveChallengeDb(player, db);
        chMessage(player, CH_COLOR + "cThe challenger went offline.");
        return;
    }
    if (chDistance(player, challenger) > CH_MAX_DISTANCE) {
        chMessage(player, CH_COLOR + "cGet within " + CH_MAX_DISTANCE + " blocks to accept.");
        return;
    }

    chStartCountdown(player, db, pending);
}

function chDecline(player, fromName) {
    var db = chLoadChallengeDb(player);
    var pending = chFindPendingFor(db, chUuid(player), fromName);
    if (pending === null) {
        chMessage(player, CH_COLOR + "cNo pending challenge to decline.");
        return;
    }
    delete db.pending[pending.id];
    chSaveChallengeDb(player, db);
    chMessage(player, CH_COLOR + "eDeclined challenge from " + pending.fromName + ".");
    var online = chFindOnlineByUuid(pending.fromUuid);
    if (online !== null) chMessage(online, CH_COLOR + "c" + chName(player) + " declined your challenge.");
}

function chCancel(player) {
    var db = chLoadChallengeDb(player);
    var uuid = chUuid(player);

    for (var id in db.pending) {
        if (!db.pending.hasOwnProperty(id)) continue;
        var pending = db.pending[id];
        if (pending.fromUuid === uuid || pending.toUuid === uuid) {
            delete db.pending[id];
            chSaveChallengeDb(player, db);
            chMessage(player, CH_COLOR + "eChallenge request cancelled.");
            var otherUuid = pending.fromUuid === uuid ? pending.toUuid : pending.fromUuid;
            var other = chFindOnlineByUuid(otherUuid);
            if (other !== null) chMessage(other, CH_COLOR + "7Challenge with " + chName(player) + " was cancelled.");
            return;
        }
    }

    var session = chGetSession(db, uuid);
    if (session === null) {
        chMessage(player, CH_COLOR + "cYou have no active challenge.");
        return;
    }

    chEndSession(player, db, session, {
        reason: "forfeit",
        winnerUuid: session.challengerUuid === uuid ? session.opponentUuid : session.challengerUuid,
        loserUuid: uuid,
        knockout: false
    });
}

/* ========================= SESSION LIFECYCLE ========================= */

function chBeginBattle(player, db, session) {
    session.state = "active";
    session.battleEndsAt = chNow() + CH_DURATION_MS;
    chSaveChallengeDb(player, db);

    var a = chFindOnlineByUuid(session.challengerUuid);
    var b = chFindOnlineByUuid(session.opponentUuid);
    if (a !== null) chMessage(a, CH_COLOR + "c" + CH_COLOR + "lFIGHT! " + CH_COLOR + "eDeal the most damage in 60 seconds!");
    if (b !== null) chMessage(b, CH_COLOR + "c" + CH_COLOR + "lFIGHT! " + CH_COLOR + "eDeal the most damage in 60 seconds!");
}

function chBuildReport(session, winnerName, loserName) {
    var lines = [];
    lines.push(CH_COLOR + "6━━━━━━━━━━━━━━━━━━━━━━");
    lines.push(CH_COLOR + "eOfficial Rival Challenge");
    lines.push(CH_COLOR + "7Winner: " + CH_COLOR + "a" + (winnerName || "Draw"));
    if (loserName) lines.push(CH_COLOR + "7Runner-up: " + CH_COLOR + "c" + loserName);
    lines.push(CH_COLOR + "7Duration: " + CH_COLOR + "f" + chFormatMs(Math.max(0, session.endedAt - (session.battleEndsAt - CH_DURATION_MS))));
    lines.push(CH_COLOR + "7Reason: " + CH_COLOR + "f" + session.endReason);

    var ids = [session.challengerUuid, session.opponentUuid];
    for (var i = 0; i < ids.length; i++) {
        var combat = session.combat[ids[i]] || chFreshCombat();
        var name = ids[i] === session.challengerUuid ? session.challengerName : session.opponentName;
        lines.push(CH_COLOR + "6--- " + CH_COLOR + "f" + name + CH_COLOR + "6 ---");
        lines.push(CH_COLOR + "7Damage: " + CH_COLOR + "f" + chCommas(combat.damage) +
            CH_COLOR + "8 (Phy " + chCommas(combat.physical) + " / Ki " + chCommas(combat.ki) + ")");
        lines.push(CH_COLOR + "7Hits: " + CH_COLOR + "f" + combat.hits +
            CH_COLOR + "7  Best Hit: " + CH_COLOR + "f" + chCommas(combat.biggestHit) +
            CH_COLOR + "7  Combo: " + CH_COLOR + "f" + combat.longestCombo);
    }
    lines.push(CH_COLOR + "6━━━━━━━━━━━━━━━━━━━━━━");
    return lines;
}


function chWriteBattleResult(onlinePlayer, session, result, won, seasonRp, journalKey, extras) {
    if (onlinePlayer === null) return;
    try {
        var combat = session.combat[chUuid(onlinePlayer)] || chFreshCombat();
        var otherUuid = chUuid(onlinePlayer) === session.challengerUuid
            ? session.opponentUuid
            : session.challengerUuid;
        var otherCombat = session.combat[otherUuid] || chFreshCombat();
        var duration = Math.max(0, chNumber(session.endedAt, chNow()) - (chNumber(session.battleEndsAt, chNow()) - CH_DURATION_MS));
        var payload = {
            won: won === true,
            seasonRp: chNumber(seasonRp, 0),
            journalKey: chString(journalKey),
            damageDealt: chNumber(combat.damage, 0),
            damageTaken: chNumber(otherCombat.damage, 0),
            physical: chNumber(combat.physical, 0),
            ki: chNumber(combat.ki, 0),
            longestCombo: chNumber(combat.longestCombo, 0),
            biggestHit: chNumber(combat.biggestHit, 0),
            fullDuration: duration >= (CH_DURATION_MS - 1500),
            durationMs: duration,
            knockout: result.knockout === true,
            reason: chString(result.reason),
            firstWin: extras && extras.firstWin === true,
            comeback: extras && extras.comeback === true,
            beatHigherRp: extras && extras.beatHigherRp === true,
            remainingHpPct: extras && extras.remainingHpPct != null ? extras.remainingHpPct : -1
        };
        onlinePlayer.getTempdata().put("rival.v4.battleResult", JSON.stringify(payload));
    } catch (e) {
        chLog("battleResult write failed: " + e);
    }
}

function chApplyRewards(player, session, result) {
    var core = chLoadCoreDb(player);
    if (core === null) return;

    var challenger = chFindOnlineByUuid(session.challengerUuid);
    var opponent = chFindOnlineByUuid(session.opponentUuid);

    var challengerRecord = null;
    var opponentRecord = null;
    if (challenger !== null) challengerRecord = chEnsureCorePlayer(core, challenger);
    if (opponent !== null) opponentRecord = chEnsureCorePlayer(core, opponent);

    /* Offline-safe: still update stored records if present */
    if (challengerRecord === null) challengerRecord = core.players[session.challengerUuid] || null;
    if (opponentRecord === null) opponentRecord = core.players[session.opponentUuid] || null;

    function bumpCombatStats(record, combat, takenCombat) {
        if (record === null) return;
        record.career.challengesPlayed = chNumber(record.career.challengesPlayed, 0) + 1;
        record.career.damageDealt = chNumber(record.career.damageDealt, 0) + chNumber(combat.damage, 0);
        record.career.damageTaken = chNumber(record.career.damageTaken, 0) + chNumber(takenCombat.damage, 0);
        record.career.biggestHit = Math.max(chNumber(record.career.biggestHit, 0), chNumber(combat.biggestHit, 0));
        record.career.highestCombo = Math.max(chNumber(record.career.highestCombo, 0), chNumber(combat.longestCombo, 0));
    }

    var cCombat = session.combat[session.challengerUuid] || chFreshCombat();
    var oCombat = session.combat[session.opponentUuid] || chFreshCombat();
    bumpCombatStats(challengerRecord, cCombat, oCombat);
    bumpCombatStats(opponentRecord, oCombat, cCombat);

    var battleDuration = Math.max(0, chNumber(session.endedAt, chNow()) - (chNumber(session.battleEndsAt, chNow()) - CH_DURATION_MS));
    function touchDuration(record, wonFlag) {
        if (record === null) return;
        record.career.longestBattleMs = Math.max(chNumber(record.career.longestBattleMs, 0), battleDuration);
        if (wonFlag === true) {
            var fastest = chNumber(record.career.fastestWinMs, 0);
            if (fastest <= 0 || battleDuration < fastest) record.career.fastestWinMs = battleDuration;
        }
    }

    var related = session.related === true;
    if (challengerRecord !== null && opponentRecord !== null && related) {
        chEnsureLink(challengerRecord, opponentRecord);
        chEnsureLink(opponentRecord, challengerRecord);
    }

    if (result.reason === "draw") {
        if (challenger !== null) chAwardTP(challenger, CH_DRAW_TP, "Draw");
        if (opponent !== null) chAwardTP(opponent, CH_DRAW_TP, "Draw");
        if (related && challengerRecord !== null && opponentRecord !== null) {
            chAwardRp(challengerRecord, opponentRecord.uuid, CH_DRAW_RP, "challenge_draw");
            chAwardRp(opponentRecord, challengerRecord.uuid, CH_DRAW_RP, "challenge_draw");
            challengerRecord.rivals[opponentRecord.uuid].draws++;
            opponentRecord.rivals[challengerRecord.uuid].draws++;
            challengerRecord.career.officialDraws = chNumber(challengerRecord.career.officialDraws, 0) + 1;
            opponentRecord.career.officialDraws = chNumber(opponentRecord.career.officialDraws, 0) + 1;
            chWriteBattleResult(challenger, session, result, false, CH_DRAW_RP,
                challengerRecord.uuid + ">" + opponentRecord.uuid, {});
            chWriteBattleResult(opponent, session, result, false, CH_DRAW_RP,
                opponentRecord.uuid + ">" + challengerRecord.uuid, {});
        }
        chSaveCoreDb(player, core);
        return;
    }

    var winnerUuid = result.winnerUuid;
    var loserUuid = result.loserUuid;
    var winnerIsChallenger = winnerUuid === session.challengerUuid;
    var winnerPlayer = winnerIsChallenger ? challenger : opponent;
    var loserPlayer = winnerIsChallenger ? opponent : challenger;
    var winnerRecord = winnerIsChallenger ? challengerRecord : opponentRecord;
    var loserRecord = winnerIsChallenger ? opponentRecord : challengerRecord;

    var winTp = CH_WIN_TP + (result.knockout ? CH_KO_WIN_TP_BONUS : 0);
    var loseTp = CH_LOSE_TP;
    if (!related) winTp = CH_NON_RIVAL_WIN_TP;

    if (winnerPlayer !== null) chAwardTP(winnerPlayer, winTp, result.knockout ? "KO Victory" : "Victory");
    if (loserPlayer !== null && result.reason !== "forfeit" && result.reason !== "disconnect") {
        chAwardTP(loserPlayer, loseTp, "Participation");
    }

    if (related && winnerRecord !== null && loserRecord !== null) {
        var winRp = CH_WIN_RP;
        var loseRp = CH_LOSE_RP + (result.knockout ? CH_KO_LOSE_RP_BONUS : 0);
        if (result.reason === "forfeit" || result.reason === "disconnect") {
            loseRp = -CH_FORFEIT_RP_PENALTY;
            winRp = CH_WIN_RP;
        }

        chAwardRp(winnerRecord, loserRecord.uuid, winRp, "challenge_win");
        chAwardRp(loserRecord, winnerRecord.uuid, loseRp, result.reason === "forfeit" ? "forfeit" : "challenge_loss");

        winnerRecord.rivals[loserRecord.uuid].wins++;
        loserRecord.rivals[winnerRecord.uuid].losses++;
        winnerRecord.rivals[loserRecord.uuid].lastBattleAt = chNow();
        loserRecord.rivals[winnerRecord.uuid].lastBattleAt = chNow();
        winnerRecord.rivals[loserRecord.uuid].damageDealt =
            chNumber(winnerRecord.rivals[loserRecord.uuid].damageDealt, 0) +
            chNumber((session.combat[winnerUuid] || chFreshCombat()).damage, 0);
        loserRecord.rivals[winnerRecord.uuid].damageDealt =
            chNumber(loserRecord.rivals[winnerRecord.uuid].damageDealt, 0) +
            chNumber((session.combat[loserUuid] || chFreshCombat()).damage, 0);

        winnerRecord.career.officialWins = chNumber(winnerRecord.career.officialWins, 0) + 1;
        loserRecord.career.officialLosses = chNumber(loserRecord.career.officialLosses, 0) + 1;
        if (result.knockout) {
            winnerRecord.career.knockouts = chNumber(winnerRecord.career.knockouts, 0) + 1;
        }

        winnerRecord.career.currentStreak = chNumber(winnerRecord.career.currentStreak, 0) + 1;
        winnerRecord.career.bestStreak = Math.max(
            chNumber(winnerRecord.career.bestStreak, 0),
            winnerRecord.career.currentStreak
        );
        loserRecord.career.currentStreak = 0;

        if (core.leaderboard === null || typeof core.leaderboard !== "object") core.leaderboard = {};
        core.leaderboard[winnerRecord.uuid] = {
            uuid: winnerRecord.uuid,
            name: winnerRecord.name,
            rp: chNumber(winnerRecord.career.rivalPointsTotal, 0),
            wins: chNumber(winnerRecord.career.officialWins, 0),
            streak: chNumber(winnerRecord.career.bestStreak, 0),
            updatedAt: chNow()
        };
        core.leaderboard[loserRecord.uuid] = {
            uuid: loserRecord.uuid,
            name: loserRecord.name,
            rp: chNumber(loserRecord.career.rivalPointsTotal, 0),
            wins: chNumber(loserRecord.career.officialWins, 0),
            streak: chNumber(loserRecord.career.bestStreak, 0),
            updatedAt: chNow()
        };

        touchDuration(winnerRecord, true);
        touchDuration(loserRecord, false);

        var winRpFinal = CH_WIN_RP;
        var loseRpFinal = (result.reason === "forfeit" || result.reason === "disconnect")
            ? 0
            : (CH_LOSE_RP + (result.knockout ? CH_KO_LOSE_RP_BONUS : 0));
        var winLinkPts = chNumber(winnerRecord.rivals[loserRecord.uuid].points, 0);
        var loseLinkPts = chNumber(loserRecord.rivals[winnerRecord.uuid].points, 0);
        var firstWin = chNumber(winnerRecord.career.officialWins, 0) === 1;
        var comeback = chNumber(cCombat.damage, 0) < chNumber(oCombat.damage, 0) && winnerIsChallenger
            ? false
            : (chNumber((session.combat[winnerUuid] || chFreshCombat()).damage, 0) > 0 &&
               chNumber((session.combat[loserUuid] || chFreshCombat()).damage, 0) >
               chNumber((session.combat[winnerUuid] || chFreshCombat()).damage, 0) * 0.75);
        /* simpler comeback: winner took more damage than dealt */
        comeback = chNumber((session.combat[loserUuid] || chFreshCombat()).damage, 0) >
                   chNumber((session.combat[winnerUuid] || chFreshCombat()).damage, 0);
        var beatHigher = loseLinkPts > winLinkPts;

        chWriteBattleResult(winnerPlayer, session, result, true, winRpFinal,
            winnerRecord.uuid + ">" + loserRecord.uuid,
            { firstWin: firstWin, comeback: comeback, beatHigherRp: beatHigher });
        chWriteBattleResult(loserPlayer, session, result, false, loseRpFinal,
            loserRecord.uuid + ">" + winnerRecord.uuid,
            { firstWin: false, comeback: false, beatHigherRp: false });
    }

    chSaveCoreDb(player, core);
}

function chEndSession(player, db, session, result) {
    if (session.state === "ended") return;

    session.state = "ended";
    session.endedAt = chNow();
    session.endReason = result.reason;
    session.winnerUuid = chString(result.winnerUuid);
    session.loserUuid = chString(result.loserUuid);

    delete db.playerSessions[session.challengerUuid];
    delete db.playerSessions[session.opponentUuid];
    chSaveChallengeDb(player, db);

    chApplyRewards(player, session, result);

    var winnerName = "";
    var loserName = "";
    if (result.reason === "draw") {
        winnerName = "Draw";
    } else {
        winnerName = result.winnerUuid === session.challengerUuid ? session.challengerName : session.opponentName;
        loserName = result.loserUuid === session.challengerUuid ? session.challengerName : session.opponentName;
    }

    var report = chBuildReport(session, winnerName, loserName);
    var a = chFindOnlineByUuid(session.challengerUuid);
    var b = chFindOnlineByUuid(session.opponentUuid);
    for (var i = 0; i < report.length; i++) {
        if (a !== null) chMessage(a, report[i]);
        if (b !== null) chMessage(b, report[i]);
    }

    if (result.reason !== "draw") {
        if (a !== null) {
            if (chUuid(a) === result.winnerUuid) chMessage(a, CH_COLOR + "aVictory!");
            else chMessage(a, CH_COLOR + "cDefeat!");
        }
        if (b !== null) {
            if (chUuid(b) === result.winnerUuid) chMessage(b, CH_COLOR + "aVictory!");
            else chMessage(b, CH_COLOR + "cDefeat!");
        }
    }

    delete db.sessions[session.id];
    chSaveChallengeDb(player, db);
}

function chResolveByDamage(player, db, session, reason) {
    var c = session.combat[session.challengerUuid] || chFreshCombat();
    var o = session.combat[session.opponentUuid] || chFreshCombat();
    var cDmg = chNumber(c.damage, 0);
    var oDmg = chNumber(o.damage, 0);

    if (Math.abs(cDmg - oDmg) < 0.01) {
        chEndSession(player, db, session, {
            reason: "draw",
            winnerUuid: "",
            loserUuid: "",
            knockout: false
        });
        return;
    }

    if (cDmg > oDmg) {
        chEndSession(player, db, session, {
            reason: reason || "time",
            winnerUuid: session.challengerUuid,
            loserUuid: session.opponentUuid,
            knockout: false
        });
    } else {
        chEndSession(player, db, session, {
            reason: reason || "time",
            winnerUuid: session.opponentUuid,
            loserUuid: session.challengerUuid,
            knockout: false
        });
    }
}

function chRecordHit(session, attackerUuid, victimUuid, damage, isKi) {
    damage = Math.max(0, chNumber(damage, 0));
    if (damage <= 0) return;

    if (session.combat[attackerUuid] === undefined) session.combat[attackerUuid] = chFreshCombat();
    if (session.combat[victimUuid] === undefined) session.combat[victimUuid] = chFreshCombat();

    var atk = session.combat[attackerUuid];
    atk.damage += damage;
    if (isKi) atk.ki += damage;
    else atk.physical += damage;
    atk.hits++;
    if (damage > atk.biggestHit) atk.biggestHit = damage;
    atk.combo++;
    if (atk.combo > atk.longestCombo) atk.longestCombo = atk.combo;
    atk.lastHitAt = chNow();

    session.combat[victimUuid].combo = 0;
}

/* ========================= EVENTS ========================= */

function init(event) {
    try {
        if (!chIsPlayer(event.player)) return;
        chLoadChallengeDb(event.player);
    } catch (error) {
        chLog("init failed: " + error);
    }
}

function tick(event) {
    try {
        var player = event.player;
        if (!chIsPlayer(player)) return;

        var temp = player.getTempdata();
        var now = chNow();
        var last = 0;
        try {
            if (temp.has("rival.v4.challenge.tick")) last = chNumber(temp.get("rival.v4.challenge.tick"), 0);
        } catch (ignored) {}
        if (now - last < CH_TICK_MS) return;
        try { temp.put("rival.v4.challenge.tick", chString(now)); } catch (ignored2) {}

        var db = chLoadChallengeDb(player);

        /* Expire pending requests */
        for (var id in db.pending) {
            if (!db.pending.hasOwnProperty(id)) continue;
            var pending = db.pending[id];
            if (now - chNumber(pending.createdAt, 0) > CH_REQUEST_EXPIRE_MS) {
                delete db.pending[id];
                chSaveChallengeDb(player, db);
                var from = chFindOnlineByUuid(pending.fromUuid);
                var to = chFindOnlineByUuid(pending.toUuid);
                if (from !== null) chMessage(from, CH_COLOR + "7Your challenge to " + pending.toName + " expired.");
                if (to !== null) chMessage(to, CH_COLOR + "7Challenge from " + pending.fromName + " expired.");
            }
        }

        var session = chGetSession(db, chUuid(player));
        if (session === null) return;

        if (session.state === "countdown") {
            var remaining = session.countdownEndsAt - now;
            if (remaining <= 0) {
                chBeginBattle(player, db, session);
                return;
            }
            var sec = Math.ceil(remaining / 1000);
            var markKey = "rival.v4.challenge.cd." + session.id;
            var lastMark = 0;
            try {
                if (temp.has(markKey)) lastMark = chNumber(temp.get(markKey), 0);
            } catch (ignored3) {}
            if (sec !== lastMark && sec <= 5) {
                try { temp.put(markKey, chString(sec)); } catch (ignored4) {}
                chMessage(player, CH_COLOR + "e" + sec + "...");
            }
            return;
        }

        if (session.state === "active") {
            var a = chFindOnlineByUuid(session.challengerUuid);
            var b = chFindOnlineByUuid(session.opponentUuid);
            if (a === null || b === null) {
                var offlineUuid = a === null ? session.challengerUuid : session.opponentUuid;
                var winnerUuid = offlineUuid === session.challengerUuid ? session.opponentUuid : session.challengerUuid;
                chEndSession(player, db, session, {
                    reason: "disconnect",
                    winnerUuid: winnerUuid,
                    loserUuid: offlineUuid,
                    knockout: false
                });
                return;
            }

            if (chDistance(a, b) > CH_MAX_DISTANCE * 2) {
                chMessage(a, CH_COLOR + "cToo far apart! Return within range!");
                chMessage(b, CH_COLOR + "cToo far apart! Return within range!");
            }

            if (now >= session.battleEndsAt) {
                chResolveByDamage(player, db, session, "time");
                return;
            }

            var left = Math.ceil((session.battleEndsAt - now) / 1000);
            if (left === 30 || left === 10 || left === 5) {
                var tKey = "rival.v4.challenge.time." + session.id + "." + left;
                if (!temp.has(tKey)) {
                    try { temp.put(tKey, "1"); } catch (ignored5) {}
                    chMessage(player, CH_COLOR + "e" + left + "s remaining!");
                }
            }
        }
    } catch (error) {
        chLog("tick failed: " + error);
    }
}

function damagedEntity(event) {
    try {
        var attacker = event.player;
        var target = event.target;
        if (!chIsPlayer(attacker) || !chIsPlayer(target)) return;

        var db = chLoadChallengeDb(attacker);
        var session = chGetSession(db, chUuid(attacker));
        if (session === null || session.state !== "active") return;

        var atkUuid = chUuid(attacker);
        var tgtUuid = chUuid(target);
        if (tgtUuid !== session.challengerUuid && tgtUuid !== session.opponentUuid) return;
        if (atkUuid !== session.challengerUuid && atkUuid !== session.opponentUuid) return;

        chRecordHit(session, atkUuid, tgtUuid, Number(event.damage), chIsKiDamage(event));
        chSaveChallengeDb(attacker, db);
    } catch (error) {
        chLog("damagedEntity failed: " + error);
    }
}

function damaged(event) {
    try {
        var victim = event.player;
        if (!chIsPlayer(victim)) return;

        var source = null;
        try { source = event.source; } catch (ignored) {}
        if (!chIsPlayer(source)) return;

        var db = chLoadChallengeDb(victim);
        var session = chGetSession(db, chUuid(victim));
        if (session === null || session.state !== "active") return;

        var atkUuid = chUuid(source);
        var vicUuid = chUuid(victim);
        if (atkUuid !== session.challengerUuid && atkUuid !== session.opponentUuid) return;
        if (vicUuid !== session.challengerUuid && vicUuid !== session.opponentUuid) return;

        chRecordHit(session, atkUuid, vicUuid, Number(event.damage), chIsKiDamage(event));
        chSaveChallengeDb(victim, db);
    } catch (error) {
        chLog("damaged failed: " + error);
    }
}

function kill(event) {
    try {
        var killer = event.player;
        var victim = event.entity;
        if (!chIsPlayer(killer) || !chIsPlayer(victim)) return;

        var db = chLoadChallengeDb(killer);
        var session = chGetSession(db, chUuid(killer));
        if (session === null || session.state !== "active") return;

        var killUuid = chUuid(killer);
        var vicUuid = chUuid(victim);
        if ((killUuid !== session.challengerUuid && killUuid !== session.opponentUuid) ||
            (vicUuid !== session.challengerUuid && vicUuid !== session.opponentUuid)) {
            return;
        }

        chEndSession(killer, db, session, {
            reason: "knockout",
            winnerUuid: killUuid,
            loserUuid: vicUuid,
            knockout: true
        });
    } catch (error) {
        chLog("kill failed: " + error);
    }
}

function died(event) {
    try {
        var victim = event.player;
        if (!chIsPlayer(victim)) return;

        var db = chLoadChallengeDb(victim);
        var session = chGetSession(db, chUuid(victim));
        if (session === null || session.state !== "active") return;

        var source = null;
        try { source = event.source; } catch (ignored) {}
        if (!chIsPlayer(source)) {
            /* Treat mysterious death as loss for victim vs the other participant */
            var winnerUuid = chUuid(victim) === session.challengerUuid
                ? session.opponentUuid
                : session.challengerUuid;
            chEndSession(victim, db, session, {
                reason: "knockout",
                winnerUuid: winnerUuid,
                loserUuid: chUuid(victim),
                knockout: true
            });
            return;
        }

        chEndSession(victim, db, session, {
            reason: "knockout",
            winnerUuid: chUuid(source),
            loserUuid: chUuid(victim),
            knockout: true
        });
    } catch (error) {
        chLog("died failed: " + error);
    }
}

function logout(event) {
    try {
        var player = event.player;
        if (!chIsPlayer(player)) return;
        var db = chLoadChallengeDb(player);
        var session = chGetSession(db, chUuid(player));
        if (session === null) return;

        var uuid = chUuid(player);
        var winnerUuid = uuid === session.challengerUuid ? session.opponentUuid : session.challengerUuid;
        chEndSession(player, db, session, {
            reason: "disconnect",
            winnerUuid: winnerUuid,
            loserUuid: uuid,
            knockout: false
        });
    } catch (error) {
        chLog("logout failed: " + error);
    }
}

function chTriggerPlayer(event) {
    /*
     CustomNPCs ScriptTriggerEvent provides the player on event.entity.
    */
    if (event === null || event === undefined) return null;
    if (chIsPlayer(event.entity)) return event.entity;
    if (chIsPlayer(event.player)) return event.player;
    return null;
}

function trigger(event) {
    var player = null;
    try {
        player = chTriggerPlayer(event);
        if (!chIsPlayer(player)) return;

        var id = Number(event.id);
        var args = chArgs(event);

        if (args.length > 0 && chString(args[0]).toLowerCase() === chName(player).toLowerCase()) {
            args.shift();
        }

        if (id === 210) {
            chChallenge(player, args.length > 0 ? args[0] : "");
            return;
        }
        if (id === 211) {
            chAccept(player, args.length > 0 ? args[0] : "");
            return;
        }
        if (id === 212) {
            chDecline(player, args.length > 0 ? args[0] : "");
            return;
        }
        if (id === 213) {
            chCancel(player);
            return;
        }
    } catch (error) {
        if (player !== null) {
            chMessage(player, CH_COLOR + "c[RivalChallenge] Error: " + error);
        }
        try {
            print("[RivalChallenge v4] trigger error: " + error);
        } catch (ignored) {}
    }
}

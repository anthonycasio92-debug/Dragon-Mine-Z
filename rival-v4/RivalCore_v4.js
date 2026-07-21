/*
============================================================
 DBZ Legacy Reborn - Rival Core V4
 Version: 4.0.0

 Persistent rivalry management for the reworked rival system.

 PLACE AS:
 CustomNPCs Global Player Script

 REQUIRED EVENTS:
 - init
 - login
 - trigger

 TRIGGERS (also handled by RivalCommands_v4 for displays):
 200 = help
 201 = declare <player>
 202 = accept <player>
 203 = decline <player>
 204 = remove <player>
 205 = list

 Disable RivalCore V3 while testing.

 Companion modules:
 - RivalProximity_v4.js
 - RivalChallenge_v4.js
 - RivalCommands_v4.js
============================================================
*/

/* ========================= JAVA TYPES ========================= */

var RC_Npc = Java.type("java.lang.System");
var RC_API = Java.type("noppes.npcs.api.NpcAPI");

/* ========================= CONFIGURATION ========================= */

var RC_DEBUG = false;
var RC_VERSION = 4;
var RC_COLOR = String.fromCharCode(167);

var RC_MAX_MUTUAL_RIVALS = 3;
var RC_MAX_ONE_SIDED_OUT = 5;
var RC_REQUEST_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
var RC_DECLARE_COOLDOWN_MS = 30 * 1000;
var RC_HISTORY_LIMIT = 30;

var RC_DATABASE_KEY = "dlr.rivalry.v4.database";
var RC_BACKUP_KEY = "dlr.rivalry.v4.database.backup";

var RC_TIERS = [
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

/* ========================= BASIC HELPERS ========================= */

function rcNow() {
    return Number(RC_SYSTEM.currentTimeMillis());
}

function rcString(value) {
    if (value === null || value === undefined) return "";
    return String(value);
}

function rcLower(value) {
    return rcString(value).toLowerCase();
}

function rcNumber(value, fallback) {
    var number = Number(value);
    return isNaN(number) || !isFinite(number) ? fallback : number;
}

function rcClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function rcMessage(player, message) {
    try {
        if (player !== null && player !== undefined) player.message(message);
    } catch (ignored) {}
}

function rcLog(message) {
    if (!RC_DEBUG) return;
    try {
        print("[RivalCore v4] " + message);
    } catch (ignored) {}
}

function rcUuid(player) {
    try {
        return rcString(player.getUUID());
    } catch (ignored) {
        return "";
    }
}

function rcName(player) {
    try {
        return rcString(player.getName());
    } catch (ignored) {
        return "Unknown";
    }
}

function rcIsPlayer(entity) {
    if (entity === null || entity === undefined) return false;
    try {
        return Number(entity.getType()) === 1;
    } catch (ignored) {
        return false;
    }
}

function rcArgs(event) {
    var result = [];
    if (event === null || event === undefined || event.arguments === null || event.arguments === undefined) {
        return result;
    }
    for (var i = 0; i < event.arguments.length; i++) {
        result.push(rcString(event.arguments[i]));
    }
    return result;
}

function rcCommas(value) {
    var number = Math.floor(rcNumber(value, 0));
    var raw = String(number);
    var out = "";
    while (raw.length > 3) {
        out = "," + raw.substring(raw.length - 3) + out;
        raw = raw.substring(0, raw.length - 3);
    }
    return raw + out;
}

/* ========================= TIERS ========================= */

function rcGetTier(points) {
    var rp = Math.max(0, rcNumber(points, 0));
    var tier = RC_TIERS[0];
    for (var i = 0; i < RC_TIERS.length; i++) {
        if (rp >= RC_TIERS[i].min) tier = RC_TIERS[i];
    }
    return tier;
}

function rcTierLabel(points) {
    var tier = rcGetTier(points);
    return RC_COLOR + tier.color + tier.name + RC_COLOR + "7 (" + rcCommas(points) + " RP)";
}

/* ========================= WORLD STORAGE ========================= */

function rcDataWorld(fallbackPlayer) {
    var names = ["minecraft:overworld", "overworld"];
    for (var i = 0; i < names.length; i++) {
        try {
            var world = RC_API.Instance().getIWorld(names[i]);
            if (world !== null && world !== undefined) return world;
        } catch (error1) {
            rcLog("World lookup failed for " + names[i] + ": " + error1);
        }
    }

    if (fallbackPlayer !== null && fallbackPlayer !== undefined) {
        try {
            return fallbackPlayer.getWorld();
        } catch (error2) {
            rcLog("Fallback world lookup failed: " + error2);
        }
    }
    return null;
}

function rcFreshDatabase() {
    return {
        version: RC_VERSION,
        players: {},
        requests: {},
        cooldowns: {},
        leaderboard: {},
        updatedAt: rcNow()
    };
}

function rcNormalizeDatabase(database) {
    if (database === null || typeof database !== "object") database = rcFreshDatabase();
    database.version = RC_VERSION;
    if (database.players === null || typeof database.players !== "object") database.players = {};
    if (database.requests === null || typeof database.requests !== "object") database.requests = {};
    if (database.cooldowns === null || typeof database.cooldowns !== "object") database.cooldowns = {};
    if (database.leaderboard === null || typeof database.leaderboard !== "object") database.leaderboard = {};
    database.updatedAt = rcNumber(database.updatedAt, rcNow());
    return database;
}

function rcLoadDatabase(player) {
    var world = rcDataWorld(player);
    if (world === null) throw new Error("RivalCore could not access persistent storage.");

    var storage = world.getStoreddata();
    var database;

    try {
        database = storage.has(RC_DATABASE_KEY)
            ? JSON.parse(rcString(storage.get(RC_DATABASE_KEY)))
            : rcFreshDatabase();
    } catch (mainError) {
        rcLog("Main database parse failed: " + mainError);
        try {
            database = storage.has(RC_BACKUP_KEY)
                ? JSON.parse(rcString(storage.get(RC_BACKUP_KEY)))
                : rcFreshDatabase();
            rcLog("Recovered database from backup.");
        } catch (backupError) {
            rcLog("Backup parse failed: " + backupError);
            database = rcFreshDatabase();
        }
    }

    return rcNormalizeDatabase(database);
}

function rcSaveDatabase(player, database) {
    var world = rcDataWorld(player);
    if (world === null) throw new Error("RivalCore could not access persistent storage.");

    database = rcNormalizeDatabase(database);
    database.updatedAt = rcNow();

    var storage = world.getStoreddata();
    var json = JSON.stringify(database);

    if (storage.has(RC_DATABASE_KEY)) {
        storage.put(RC_BACKUP_KEY, rcString(storage.get(RC_DATABASE_KEY)));
    }
    storage.put(RC_DATABASE_KEY, json);
}

/* ========================= PLAYER / RIVAL RECORDS ========================= */

function rcFreshPlayerRecord(uuid, name) {
    var now = rcNow();
    return {
        uuid: uuid,
        name: name,
        nameLower: rcLower(name),
        createdAt: now,
        lastSeenAt: now,
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
}

function rcNormalizeCareer(career) {
    if (career === null || typeof career !== "object") career = {};
    career.rivalPointsTotal = rcNumber(career.rivalPointsTotal, 0);
    career.officialWins = rcNumber(career.officialWins, 0);
    career.officialLosses = rcNumber(career.officialLosses, 0);
    career.officialDraws = rcNumber(career.officialDraws, 0);
    career.knockouts = rcNumber(career.knockouts, 0);
    career.currentStreak = rcNumber(career.currentStreak, 0);
    career.bestStreak = rcNumber(career.bestStreak, 0);
    career.damageDealt = rcNumber(career.damageDealt, 0);
    career.damageTaken = rcNumber(career.damageTaken, 0);
    career.biggestHit = rcNumber(career.biggestHit, 0);
    career.highestCombo = rcNumber(career.highestCombo, 0);
    career.challengesPlayed = rcNumber(career.challengesPlayed, 0);
    career.presenceMs = rcNumber(career.presenceMs, 0);
    career.killsNearRival = rcNumber(career.killsNearRival, 0);
    career.surpassAwards = rcNumber(career.surpassAwards, 0);
    return career;
}

function rcNormalizeRivalLink(link, uuid, name) {
    if (link === null || typeof link !== "object") link = {};
    link.uuid = rcString(link.uuid || uuid);
    link.name = rcString(link.name || name);
    link.nameLower = rcLower(link.name);
    link.mutual = link.mutual === true;
    link.declaredByMe = link.declaredByMe === true;
    link.declaredByThem = link.declaredByThem === true;
    link.points = Math.max(0, rcNumber(link.points, 0));
    link.wins = rcNumber(link.wins, 0);
    link.losses = rcNumber(link.losses, 0);
    link.draws = rcNumber(link.draws, 0);
    link.damageDealt = rcNumber(link.damageDealt, 0);
    link.damageTaken = rcNumber(link.damageTaken, 0);
    link.presenceMs = rcNumber(link.presenceMs, 0);
    link.createdAt = rcNumber(link.createdAt, rcNow());
    link.updatedAt = rcNumber(link.updatedAt, rcNow());
    link.mutualSince = rcNumber(link.mutualSince, 0);
    link.lastBattleAt = rcNumber(link.lastBattleAt, 0);
    link.lastSeenTogetherAt = rcNumber(link.lastSeenTogetherAt, 0);
    if (!(link.history instanceof Array)) link.history = [];
    return link;
}

function rcEnsurePlayer(database, player) {
    var uuid = rcUuid(player);
    var name = rcName(player);
    var record = database.players[uuid];

    if (record === null || record === undefined || typeof record !== "object") {
        record = rcFreshPlayerRecord(uuid, name);
        database.players[uuid] = record;
    }

    record.uuid = uuid;
    record.name = name;
    record.nameLower = rcLower(name);
    record.lastSeenAt = rcNow();
    if (record.rivals === null || typeof record.rivals !== "object") record.rivals = {};
    record.career = rcNormalizeCareer(record.career);
    if (record.totals === null || typeof record.totals !== "object") {
        record.totals = {
            declarationsSent: 0,
            declarationsAccepted: 0,
            declarationsDeclined: 0,
            rivalsRemoved: 0
        };
    }

    for (var rivalUuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(rivalUuid)) continue;
        record.rivals[rivalUuid] = rcNormalizeRivalLink(
            record.rivals[rivalUuid],
            rivalUuid,
            record.rivals[rivalUuid].name
        );
    }

    return record;
}

function rcFindPlayerRecordByName(database, name) {
    var wanted = rcLower(name);
    for (var uuid in database.players) {
        if (!database.players.hasOwnProperty(uuid)) continue;
        var record = database.players[uuid];
        if (rcLower(record.name) === wanted || rcLower(record.nameLower) === wanted) {
            return record;
        }
    }
    return null;
}

function rcFindOnlinePlayer(world, name) {
    if (world === null || world === undefined) return null;
    try {
        var direct = world.getPlayer(name);
        if (direct !== null && direct !== undefined) return direct;
    } catch (ignored1) {}

    try {
        var players = world.getAllPlayers();
        var wanted = rcLower(name);
        for (var i = 0; i < players.length; i++) {
            if (rcLower(players[i].getName()) === wanted) return players[i];
        }
    } catch (ignored2) {}
    return null;
}

function rcFindOnlinePlayerAnyWorld(name) {
    try {
        var worlds = RC_API.Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            var found = rcFindOnlinePlayer(worlds[i], name);
            if (found !== null) return found;
        }
    } catch (error) {
        rcLog("Cross-world player lookup failed: " + error);
    }
    return null;
}

function rcCountMutual(record) {
    var count = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        if (record.rivals[uuid].mutual === true) count++;
    }
    return count;
}

function rcCountOneSidedOut(record) {
    var count = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        var link = record.rivals[uuid];
        if (link.declaredByMe === true && link.mutual !== true) count++;
    }
    return count;
}

function rcGetOrCreateRival(ownerRecord, targetRecord) {
    var rival = ownerRecord.rivals[targetRecord.uuid];
    if (rival === null || rival === undefined) {
        rival = rcNormalizeRivalLink({}, targetRecord.uuid, targetRecord.name);
        ownerRecord.rivals[targetRecord.uuid] = rival;
    }
    rival.name = targetRecord.name;
    rival.nameLower = rcLower(targetRecord.name);
    rival.updatedAt = rcNow();
    return rival;
}

function rcPushHistory(rivalRecord, type, note) {
    if (!(rivalRecord.history instanceof Array)) rivalRecord.history = [];
    rivalRecord.history.push({
        time: rcNow(),
        type: rcString(type),
        note: rcString(note)
    });
    while (rivalRecord.history.length > RC_HISTORY_LIMIT) {
        rivalRecord.history.shift();
    }
}

function rcRecalcCareerRp(record) {
    var total = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        total += Math.max(0, rcNumber(record.rivals[uuid].points, 0));
    }
    record.career.rivalPointsTotal = total;
    return total;
}

function rcUpdateLeaderboard(database, record) {
    database.leaderboard[record.uuid] = {
        uuid: record.uuid,
        name: record.name,
        rp: rcNumber(record.career.rivalPointsTotal, 0),
        wins: rcNumber(record.career.officialWins, 0),
        streak: rcNumber(record.career.bestStreak, 0),
        updatedAt: rcNow()
    };
}

/* ========================= PUBLIC RP API (used by other modules) ========================= */

/*
 Other Global Player scripts cannot call these functions directly.
 They mutate the shared database JSON using the same keys / schema.
 These helpers remain the reference implementation for RP awards.
*/

function rcAwardRivalPoints(database, ownerRecord, rivalUuid, amount, reason) {
    amount = Math.floor(rcNumber(amount, 0));
    if (amount === 0) return 0;

    var link = ownerRecord.rivals[rivalUuid];
    if (link === null || link === undefined) return 0;

    link.points = Math.max(0, rcNumber(link.points, 0) + amount);
    link.updatedAt = rcNow();
    rcPushHistory(link, amount >= 0 ? "rp_gain" : "rp_loss", reason + " (" + amount + ")");
    rcRecalcCareerRp(ownerRecord);
    rcUpdateLeaderboard(database, ownerRecord);
    return amount;
}

/* ========================= REQUESTS ========================= */

function rcRequestKey(fromUuid, toUuid) {
    return fromUuid + ">" + toUuid;
}

function rcGetRequest(database, fromUuid, toUuid) {
    var key = rcRequestKey(fromUuid, toUuid);
    var request = database.requests[key];
    if (request === null || request === undefined) return null;

    var createdAt = rcNumber(request.createdAt, 0);
    if (createdAt <= 0 || rcNow() - createdAt > RC_REQUEST_EXPIRE_MS) {
        delete database.requests[key];
        return null;
    }
    return request;
}

function rcRemoveRequestsBetween(database, uuidA, uuidB) {
    delete database.requests[rcRequestKey(uuidA, uuidB)];
    delete database.requests[rcRequestKey(uuidB, uuidA)];
}

function rcCleanupExpiredRequests(database) {
    var now = rcNow();
    for (var key in database.requests) {
        if (!database.requests.hasOwnProperty(key)) continue;
        var createdAt = rcNumber(database.requests[key].createdAt, 0);
        if (createdAt <= 0 || now - createdAt > RC_REQUEST_EXPIRE_MS) {
            delete database.requests[key];
        }
    }
}

/* ========================= CORE OPERATIONS ========================= */

function rcFormMutual(database, playerRecord, targetRecord, note) {
    var now = rcNow();
    var playerRival = rcGetOrCreateRival(playerRecord, targetRecord);
    var targetRival = rcGetOrCreateRival(targetRecord, playerRecord);

    playerRival.mutual = true;
    playerRival.declaredByMe = true;
    playerRival.declaredByThem = true;
    playerRival.mutualSince = now;
    rcPushHistory(playerRival, "mutual", note);

    targetRival.mutual = true;
    targetRival.declaredByMe = true;
    targetRival.declaredByThem = true;
    targetRival.mutualSince = now;
    rcPushHistory(targetRival, "mutual", note);

    rcRecalcCareerRp(playerRecord);
    rcRecalcCareerRp(targetRecord);
    rcUpdateLeaderboard(database, playerRecord);
    rcUpdateLeaderboard(database, targetRecord);
}

function rcDeclare(player, targetName) {
    var cleanName = rcString(targetName).replace(/^\s+|\s+$/g, "");
    if (cleanName === "") {
        rcMessage(player, RC_COLOR + "cUsage: /rival <player>");
        return;
    }

    var target = rcFindOnlinePlayerAnyWorld(cleanName);
    if (target === null) {
        rcMessage(player, RC_COLOR + "cThat player must be online for the first declaration.");
        return;
    }

    var playerUuid = rcUuid(player);
    var targetUuid = rcUuid(target);
    if (playerUuid === targetUuid) {
        rcMessage(player, RC_COLOR + "cYou cannot declare yourself as a rival.");
        return;
    }

    var database = rcLoadDatabase(player);
    rcCleanupExpiredRequests(database);

    var playerRecord = rcEnsurePlayer(database, player);
    var targetRecord = rcEnsurePlayer(database, target);

    var current = playerRecord.rivals[targetUuid];
    if (current !== null && current !== undefined && current.mutual === true) {
        rcMessage(player, RC_COLOR + "e" + targetRecord.name + " is already your mutual rival.");
        return;
    }

    if (current !== null && current !== undefined && current.declaredByMe === true && current.mutual !== true) {
        rcMessage(player, RC_COLOR + "eYou already declared " + targetRecord.name + ". Waiting for them.");
        return;
    }

    var cooldownKey = rcRequestKey(playerUuid, targetUuid);
    var lastDeclaration = rcNumber(database.cooldowns[cooldownKey], 0);
    var remaining = RC_DECLARE_COOLDOWN_MS - (rcNow() - lastDeclaration);
    if (remaining > 0) {
        rcMessage(player, RC_COLOR + "cWait " + Math.ceil(remaining / 1000) + "s before declaring this player again.");
        return;
    }

    var reverseRequest = rcGetRequest(database, targetUuid, playerUuid);
    if (reverseRequest !== null) {
        if (rcCountMutual(playerRecord) >= RC_MAX_MUTUAL_RIVALS) {
            rcMessage(player, RC_COLOR + "cYou already have the maximum of " + RC_MAX_MUTUAL_RIVALS + " mutual rivals.");
            return;
        }
        if (rcCountMutual(targetRecord) >= RC_MAX_MUTUAL_RIVALS) {
            rcMessage(player, RC_COLOR + "c" + targetRecord.name + " already has the maximum mutual rivals.");
            return;
        }

        rcFormMutual(database, playerRecord, targetRecord, "Crossed declarations became mutual.");
        rcRemoveRequestsBetween(database, playerUuid, targetUuid);
        database.cooldowns[cooldownKey] = rcNow();
        playerRecord.totals.declarationsAccepted++;
        targetRecord.totals.declarationsAccepted++;
        rcSaveDatabase(player, database);

        rcMessage(player, RC_COLOR + "6" + RC_COLOR + "lRIVALRY FORMED! " + RC_COLOR + "e" + targetRecord.name + " is now your mutual rival.");
        rcMessage(target, RC_COLOR + "6" + RC_COLOR + "lRIVALRY FORMED! " + RC_COLOR + "e" + playerRecord.name + " is now your mutual rival.");
        return;
    }

    if (rcCountOneSidedOut(playerRecord) >= RC_MAX_ONE_SIDED_OUT && (current === null || current === undefined || current.declaredByMe !== true)) {
        rcMessage(player, RC_COLOR + "cYou already have " + RC_MAX_ONE_SIDED_OUT + " one-sided rival declarations.");
        return;
    }

    var playerRival = rcGetOrCreateRival(playerRecord, targetRecord);
    playerRival.declaredByMe = true;
    playerRival.declaredByThem = playerRival.declaredByThem === true;
    playerRival.mutual = false;
    rcPushHistory(playerRival, "declare", "Declared rivalry.");

    var targetRival = rcGetOrCreateRival(targetRecord, playerRecord);
    targetRival.declaredByThem = true;
    targetRival.declaredByMe = targetRival.declaredByMe === true;
    targetRival.mutual = false;
    rcPushHistory(targetRival, "declared_by", "Was declared as a rival.");

    database.requests[rcRequestKey(playerUuid, targetUuid)] = {
        fromUuid: playerUuid,
        fromName: playerRecord.name,
        toUuid: targetUuid,
        toName: targetRecord.name,
        createdAt: rcNow()
    };
    database.cooldowns[cooldownKey] = rcNow();
    playerRecord.totals.declarationsSent++;

    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "aYou declared " + RC_COLOR + "e" + targetRecord.name + RC_COLOR + "a as a rival.");
    rcMessage(player, RC_COLOR + "7They can accept with " + RC_COLOR + "f/rival accept " + playerRecord.name);
    rcMessage(player, RC_COLOR + "7One-sided bonuses already apply while you hunt them.");

    rcMessage(target, RC_COLOR + "6" + playerRecord.name + RC_COLOR + "e declared you as a rival!");
    rcMessage(target, RC_COLOR + "7Accept: " + RC_COLOR + "f/rival accept " + playerRecord.name);
    rcMessage(target, RC_COLOR + "7Decline: " + RC_COLOR + "f/rival decline " + playerRecord.name);
}

function rcAccept(player, targetName) {
    var cleanName = rcString(targetName).replace(/^\s+|\s+$/g, "");
    if (cleanName === "") {
        rcMessage(player, RC_COLOR + "cUsage: /rival accept <player>");
        return;
    }

    var database = rcLoadDatabase(player);
    rcCleanupExpiredRequests(database);

    var playerRecord = rcEnsurePlayer(database, player);
    var fromRecord = rcFindPlayerRecordByName(database, cleanName);
    if (fromRecord === null) {
        rcMessage(player, RC_COLOR + "cNo rivalry request found from that player.");
        return;
    }

    var request = rcGetRequest(database, fromRecord.uuid, playerRecord.uuid);
    if (request === null) {
        rcMessage(player, RC_COLOR + "cNo active rivalry request from " + fromRecord.name + ".");
        return;
    }

    if (rcCountMutual(playerRecord) >= RC_MAX_MUTUAL_RIVALS) {
        rcMessage(player, RC_COLOR + "cYou already have the maximum of " + RC_MAX_MUTUAL_RIVALS + " mutual rivals.");
        return;
    }
    if (rcCountMutual(fromRecord) >= RC_MAX_MUTUAL_RIVALS) {
        rcMessage(player, RC_COLOR + "c" + fromRecord.name + " already has the maximum mutual rivals.");
        return;
    }

    rcFormMutual(database, playerRecord, fromRecord, "Request accepted.");
    rcRemoveRequestsBetween(database, fromRecord.uuid, playerRecord.uuid);
    playerRecord.totals.declarationsAccepted++;
    fromRecord.totals.declarationsAccepted++;
    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "6" + RC_COLOR + "lRIVALRY FORMED! " + RC_COLOR + "e" + fromRecord.name + " is now your mutual rival.");

    var online = rcFindOnlinePlayerAnyWorld(fromRecord.name);
    if (online !== null) {
        rcMessage(online, RC_COLOR + "6" + RC_COLOR + "lRIVALRY FORMED! " + RC_COLOR + "e" + playerRecord.name + " accepted your rivalry!");
    }
}

function rcDecline(player, targetName) {
    var cleanName = rcString(targetName).replace(/^\s+|\s+$/g, "");
    if (cleanName === "") {
        rcMessage(player, RC_COLOR + "cUsage: /rival decline <player>");
        return;
    }

    var database = rcLoadDatabase(player);
    rcCleanupExpiredRequests(database);

    var playerRecord = rcEnsurePlayer(database, player);
    var fromRecord = rcFindPlayerRecordByName(database, cleanName);
    if (fromRecord === null) {
        rcMessage(player, RC_COLOR + "cNo rivalry request found from that player.");
        return;
    }

    var request = rcGetRequest(database, fromRecord.uuid, playerRecord.uuid);
    if (request === null) {
        rcMessage(player, RC_COLOR + "cNo active rivalry request from " + fromRecord.name + ".");
        return;
    }

    rcRemoveRequestsBetween(database, fromRecord.uuid, playerRecord.uuid);
    playerRecord.totals.declarationsDeclined++;
    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "eDeclined rivalry request from " + fromRecord.name + ".");
    var online = rcFindOnlinePlayerAnyWorld(fromRecord.name);
    if (online !== null) {
        rcMessage(online, RC_COLOR + "c" + playerRecord.name + " declined your rivalry request.");
    }
}

function rcRemove(player, targetName) {
    var cleanName = rcString(targetName).replace(/^\s+|\s+$/g, "");
    if (cleanName === "") {
        rcMessage(player, RC_COLOR + "cUsage: /rival remove <player>");
        return;
    }

    var database = rcLoadDatabase(player);
    var playerRecord = rcEnsurePlayer(database, player);
    var targetRecord = rcFindPlayerRecordByName(database, cleanName);
    if (targetRecord === null || playerRecord.rivals[targetRecord.uuid] === undefined) {
        rcMessage(player, RC_COLOR + "cYou do not have that rival.");
        return;
    }

    var link = playerRecord.rivals[targetRecord.uuid];
    var wasMutual = link.mutual === true;
    delete playerRecord.rivals[targetRecord.uuid];

    if (targetRecord.rivals[playerRecord.uuid] !== undefined) {
        var theirLink = targetRecord.rivals[playerRecord.uuid];
        if (wasMutual) {
            theirLink.mutual = false;
            theirLink.declaredByThem = false;
            theirLink.declaredByMe = theirLink.declaredByMe === true;
            rcPushHistory(theirLink, "broken", "Mutual rivalry ended by " + playerRecord.name);
            if (theirLink.declaredByMe !== true) {
                delete targetRecord.rivals[playerRecord.uuid];
            }
        } else {
            theirLink.declaredByThem = false;
            if (theirLink.declaredByMe !== true) {
                delete targetRecord.rivals[playerRecord.uuid];
            }
        }
    }

    rcRemoveRequestsBetween(database, playerRecord.uuid, targetRecord.uuid);
    playerRecord.totals.rivalsRemoved++;
    rcRecalcCareerRp(playerRecord);
    rcRecalcCareerRp(targetRecord);
    rcUpdateLeaderboard(database, playerRecord);
    rcUpdateLeaderboard(database, targetRecord);
    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "eRemoved rivalry with " + targetRecord.name + ".");
    var online = rcFindOnlinePlayerAnyWorld(targetRecord.name);
    if (online !== null) {
        rcMessage(online, RC_COLOR + "c" + playerRecord.name + " ended their rivalry with you.");
    }
}

function rcList(player) {
    var database = rcLoadDatabase(player);
    var record = rcEnsurePlayer(database, player);
    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "6========== " + RC_COLOR + "eYour Rivals " + RC_COLOR + "6==========");
    rcMessage(player, RC_COLOR + "7Career RP: " + RC_COLOR + "f" + rcCommas(record.career.rivalPointsTotal) +
        RC_COLOR + "7  |  Record: " + RC_COLOR + "a" + record.career.officialWins +
        RC_COLOR + "7-" + RC_COLOR + "c" + record.career.officialLosses);

    var count = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        var link = record.rivals[uuid];
        count++;
        var status = link.mutual === true
            ? RC_COLOR + "6Mutual"
            : (link.declaredByMe === true ? RC_COLOR + "eDeclared" : RC_COLOR + "7Incoming");
        rcMessage(
            player,
            RC_COLOR + "7- " + RC_COLOR + "f" + link.name + " " + status +
            RC_COLOR + "7 | " + rcTierLabel(link.points) +
            RC_COLOR + "7 | W/L " + RC_COLOR + "a" + link.wins + RC_COLOR + "7/" + RC_COLOR + "c" + link.losses
        );
    }

    if (count === 0) {
        rcMessage(player, RC_COLOR + "8No rivals yet. Use /rival <player> to declare one.");
    }

    rcCleanupExpiredRequests(database);
    var pending = 0;
    for (var key in database.requests) {
        if (!database.requests.hasOwnProperty(key)) continue;
        var req = database.requests[key];
        if (rcString(req.toUuid) === record.uuid) {
            pending++;
            rcMessage(player, RC_COLOR + "dPending request from " + RC_COLOR + "f" + req.fromName);
        }
    }
    if (pending === 0) {
        rcMessage(player, RC_COLOR + "8No pending incoming requests.");
    }
}

function rcHelp(player) {
    rcMessage(player, RC_COLOR + "6===== Rival System V4 =====");
    rcMessage(player, RC_COLOR + "e/rival <player> " + RC_COLOR + "7- Declare a rival");
    rcMessage(player, RC_COLOR + "e/rival accept <player> " + RC_COLOR + "7- Accept a request");
    rcMessage(player, RC_COLOR + "e/rival decline <player> " + RC_COLOR + "7- Decline a request");
    rcMessage(player, RC_COLOR + "e/rival remove <player> " + RC_COLOR + "7- End a rivalry");
    rcMessage(player, RC_COLOR + "e/rival list " + RC_COLOR + "7- View rivals + RP tiers");
    rcMessage(player, RC_COLOR + "e/rival stats [player] " + RC_COLOR + "7- Career statistics");
    rcMessage(player, RC_COLOR + "e/challenge rival <player> " + RC_COLOR + "7- 60s damage contest");
    rcMessage(player, RC_COLOR + "7Near rivals for offensive bonuses, kill TP, and RP growth.");
}

/* ========================= EVENTS ========================= */

function init(event) {
    try {
        var player = event.player;
        if (!rcIsPlayer(player)) return;
        var database = rcLoadDatabase(player);
        rcEnsurePlayer(database, player);
        rcCleanupExpiredRequests(database);
        rcSaveDatabase(player, database);
    } catch (error) {
        rcLog("init failed: " + error);
    }
}

function login(event) {
    try {
        var player = event.player;
        if (!rcIsPlayer(player)) return;
        var database = rcLoadDatabase(player);
        var record = rcEnsurePlayer(database, player);
        rcCleanupExpiredRequests(database);
        rcSaveDatabase(player, database);

        var incoming = 0;
        for (var key in database.requests) {
            if (!database.requests.hasOwnProperty(key)) continue;
            if (rcString(database.requests[key].toUuid) === record.uuid) incoming++;
        }
        if (incoming > 0) {
            rcMessage(player, RC_COLOR + "6[Rival] " + RC_COLOR + "eYou have " + incoming + " pending rivalry request(s). /rival list");
        }
    } catch (error) {
        rcLog("login failed: " + error);
    }
}

function rcTriggerPlayer(event) {
    /*
     Verified from CustomNPCs ScriptTriggerEvent:
     Global Player triggers use event.entity, not event.player.
     Keep event.player as a fallback for other script slots.
    */
    if (event === null || event === undefined) return null;
    if (rcIsPlayer(event.entity)) return event.entity;
    if (rcIsPlayer(event.player)) return event.player;
    return null;
}

function trigger(event) {
    var player = null;
    try {
        player = rcTriggerPlayer(event);
        if (!rcIsPlayer(player)) return;

        var id = Number(event.id);
        var args = rcArgs(event);

        /*
         Some command plugins pass: trigger <id> <executor> <target...>
         If args[0] is the executor name, shift it off.
        */
        if (args.length > 0 && rcLower(args[0]) === rcLower(rcName(player))) {
            args.shift();
        }

        if (id === 200) {
            rcHelp(player);
            return;
        }
        if (id === 201) {
            rcDeclare(player, args.length > 0 ? args[0] : "");
            return;
        }
        if (id === 202) {
            rcAccept(player, args.length > 0 ? args[0] : "");
            return;
        }
        if (id === 203) {
            rcDecline(player, args.length > 0 ? args[0] : "");
            return;
        }
        if (id === 204) {
            rcRemove(player, args.length > 0 ? args[0] : "");
            return;
        }
        if (id === 205) {
            rcList(player);
            return;
        }
    } catch (error) {
        if (player !== null) {
            rcMessage(player, RC_COLOR + "c[RivalCore] Error: " + error);
        }
        try {
            print("[RivalCore v4] trigger error: " + error);
        } catch (ignored) {}
    }
}

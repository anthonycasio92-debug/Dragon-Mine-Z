/*
 DBZ LEGACY REBORN - RIVALRY SYSTEM V3
 PHASE 1: RIVAL CORE + TEMPORARY TEST TRIGGERS

 Verified target:
 - CustomNPCs 1.20.1.20260227
 - Nashorn-compatible ES5 JavaScript

 Install as ONE Global Player Script.
 Enable these events:
 - init
 - login
 - trigger

 This phase intentionally contains no DMZ bonuses, TP rewards, sensing,
 battles, or leaderboards. It establishes and tests persistent rivalry data.

 Temporary test trigger IDs:
 100 = help
 101 = declare <player>
 102 = accept <player>
 103 = decline <player>
 104 = remove <player>
 105 = list
 106 = debug
*/

var RC_VERSION = 3;
var RC_COLOR = String.fromCharCode(167);

var RC_DATABASE_KEY = "dlr.rivalry.v3.database";
var RC_BACKUP_KEY = "dlr.rivalry.v3.database.backup";
var RC_DEBUG = false;

var RC_MAX_MUTUAL_RIVALS = 2;
var RC_REQUEST_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
var RC_DECLARE_COOLDOWN_MS = 60 * 1000;

var RC_API = Java.type("noppes.npcs.api.NpcAPI");
var RC_SYSTEM = Java.type("java.lang.System");

/* -------------------------------------------------------------------------- */
/* BASIC HELPERS                                                              */
/* -------------------------------------------------------------------------- */

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
    return isNaN(number) ? fallback : number;
}

function rcMessage(player, message) {
    if (player !== null && player !== undefined) {
        player.message(message);
    }
}

function rcLog(message) {
    if (!RC_DEBUG) return;
    try {
        print("[RivalCore v3] " + message);
    } catch (ignored) {}
}

function rcPlayerUuid(player) {
    return rcString(player.getUUID());
}

function rcPlayerName(player) {
    return rcString(player.getName());
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

/* -------------------------------------------------------------------------- */
/* WORLD STORAGE                                                              */
/* -------------------------------------------------------------------------- */

function rcGetDataWorld(fallbackPlayer) {
    /*
     NpcAPI.getIWorld(String) is verified in the uploaded CNPC jar.
     Keeping the database in minecraft:overworld prevents rivalry data from
     being split when players move between dimensions.
    */
    try {
        var world = RC_API.Instance().getIWorld("minecraft:overworld");
        if (world !== null && world !== undefined) return world;
    } catch (error1) {
        rcLog("Overworld lookup failed: " + error1);
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
        updatedAt: rcNow()
    };
}

function rcParseDatabase(raw) {
    if (raw === null || raw === undefined || rcString(raw) === "") {
        return rcFreshDatabase();
    }

    var parsed = JSON.parse(rcString(raw));
    if (parsed === null || typeof parsed !== "object") {
        throw new Error("Database root was not an object.");
    }

    return parsed;
}

function rcNormalizeDatabase(database) {
    if (database === null || typeof database !== "object") {
        database = rcFreshDatabase();
    }

    database.version = RC_VERSION;

    if (database.players === null || typeof database.players !== "object") {
        database.players = {};
    }

    if (database.requests === null || typeof database.requests !== "object") {
        database.requests = {};
    }

    if (database.cooldowns === null || typeof database.cooldowns !== "object") {
        database.cooldowns = {};
    }

    database.updatedAt = rcNumber(database.updatedAt, rcNow());
    return database;
}

function rcLoadDatabase(player) {
    var world = rcGetDataWorld(player);
    if (world === null) {
        throw new Error("RivalCore could not access a world for persistent storage.");
    }

    var storage = world.getStoreddata();
    var database;

    try {
        database = rcParseDatabase(storage.has(RC_DATABASE_KEY) ? storage.get(RC_DATABASE_KEY) : null);
    } catch (mainError) {
        rcLog("Main database parse failed: " + mainError);

        try {
            database = rcParseDatabase(storage.has(RC_BACKUP_KEY) ? storage.get(RC_BACKUP_KEY) : null);
            rcLog("Recovered database from backup.");
        } catch (backupError) {
            rcLog("Backup parse failed: " + backupError);
            database = rcFreshDatabase();
        }
    }

    return rcNormalizeDatabase(database);
}

function rcSaveDatabase(player, database) {
    var world = rcGetDataWorld(player);
    if (world === null) {
        throw new Error("RivalCore could not access a world for persistent storage.");
    }

    database = rcNormalizeDatabase(database);
    database.updatedAt = rcNow();

    var storage = world.getStoreddata();
    var json = JSON.stringify(database);

    /*
     Keep the previously valid database as a recovery copy before replacing it.
    */
    if (storage.has(RC_DATABASE_KEY)) {
        storage.put(RC_BACKUP_KEY, rcString(storage.get(RC_DATABASE_KEY)));
    }

    storage.put(RC_DATABASE_KEY, json);
}

/* -------------------------------------------------------------------------- */
/* PLAYER RECORDS                                                             */
/* -------------------------------------------------------------------------- */

function rcFreshPlayerRecord(uuid, name) {
    var now = rcNow();

    return {
        uuid: uuid,
        name: name,
        nameLower: rcLower(name),
        createdAt: now,
        lastSeenAt: now,
        rivals: {},
        totals: {
            declarationsSent: 0,
            declarationsAccepted: 0,
            declarationsDeclined: 0,
            rivalsRemoved: 0
        }
    };
}

function rcNormalizeRivalRecord(record, uuid, name) {
    if (record === null || typeof record !== "object") {
        record = {};
    }

    record.uuid = rcString(record.uuid || uuid);
    record.name = rcString(record.name || name);
    record.nameLower = rcLower(record.name);
    record.mutual = record.mutual === true;
    record.declaredByMe = record.declaredByMe === true;
    record.declaredByThem = record.declaredByThem === true;
    record.points = rcNumber(record.points, 0);
    record.wins = rcNumber(record.wins, 0);
    record.losses = rcNumber(record.losses, 0);
    record.createdAt = rcNumber(record.createdAt, rcNow());
    record.updatedAt = rcNumber(record.updatedAt, rcNow());
    record.mutualSince = rcNumber(record.mutualSince, 0);

    if (!(record.history instanceof Array)) {
        record.history = [];
    }

    return record;
}

function rcEnsurePlayer(database, player) {
    var uuid = rcPlayerUuid(player);
    var name = rcPlayerName(player);
    var record = database.players[uuid];

    if (record === null || record === undefined || typeof record !== "object") {
        record = rcFreshPlayerRecord(uuid, name);
        database.players[uuid] = record;
    }

    record.uuid = uuid;
    record.name = name;
    record.nameLower = rcLower(name);
    record.lastSeenAt = rcNow();

    if (record.rivals === null || typeof record.rivals !== "object") {
        record.rivals = {};
    }

    if (record.totals === null || typeof record.totals !== "object") {
        record.totals = {};
    }

    record.totals.declarationsSent = rcNumber(record.totals.declarationsSent, 0);
    record.totals.declarationsAccepted = rcNumber(record.totals.declarationsAccepted, 0);
    record.totals.declarationsDeclined = rcNumber(record.totals.declarationsDeclined, 0);
    record.totals.rivalsRemoved = rcNumber(record.totals.rivalsRemoved, 0);

    for (var rivalUuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(rivalUuid)) continue;
        record.rivals[rivalUuid] = rcNormalizeRivalRecord(
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
            if (rcLower(players[i].getName()) === wanted) {
                return players[i];
            }
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

function rcGetOrCreateRival(ownerRecord, targetRecord) {
    var rival = ownerRecord.rivals[targetRecord.uuid];

    if (rival === null || rival === undefined) {
        rival = rcNormalizeRivalRecord({}, targetRecord.uuid, targetRecord.name);
        ownerRecord.rivals[targetRecord.uuid] = rival;
    }

    rival.name = targetRecord.name;
    rival.nameLower = rcLower(targetRecord.name);
    rival.updatedAt = rcNow();

    return rival;
}

/* -------------------------------------------------------------------------- */
/* REQUESTS                                                                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* HISTORY                                                                    */
/* -------------------------------------------------------------------------- */

function rcPushHistory(rivalRecord, type, note) {
    if (!(rivalRecord.history instanceof Array)) {
        rivalRecord.history = [];
    }

    rivalRecord.history.push({
        time: rcNow(),
        type: rcString(type),
        note: rcString(note)
    });

    while (rivalRecord.history.length > 20) {
        rivalRecord.history.shift();
    }
}

/* -------------------------------------------------------------------------- */
/* CORE OPERATIONS                                                            */
/* -------------------------------------------------------------------------- */

function rcDeclare(player, targetName) {
    var cleanName = rcString(targetName).replace(/^\s+|\s+$/g, "");

    if (cleanName === "") {
        rcMessage(player, RC_COLOR + "cUsage: rivalry trigger 101 <player>");
        return;
    }

    var target = rcFindOnlinePlayerAnyWorld(cleanName);

    if (target === null) {
        rcMessage(player, RC_COLOR + "cThat player must be online for the first declaration.");
        return;
    }

    var playerUuid = rcPlayerUuid(player);
    var targetUuid = rcPlayerUuid(target);

    if (playerUuid === targetUuid) {
        rcMessage(player, RC_COLOR + "cYou cannot declare yourself as a rival.");
        return;
    }

    var database = rcLoadDatabase(player);
    rcCleanupExpiredRequests(database);

    var playerRecord = rcEnsurePlayer(database, player);
    var targetRecord = rcEnsurePlayer(database, target);

    var currentRival = playerRecord.rivals[targetUuid];
    if (currentRival !== null && currentRival !== undefined && currentRival.mutual === true) {
        rcMessage(player, RC_COLOR + "e" + targetRecord.name + " is already your mutual rival.");
        return;
    }

    var cooldownKey = rcRequestKey(playerUuid, targetUuid);
    var lastDeclaration = rcNumber(database.cooldowns[cooldownKey], 0);
    var remaining = RC_DECLARE_COOLDOWN_MS - (rcNow() - lastDeclaration);

    if (remaining > 0) {
        rcMessage(
            player,
            RC_COLOR + "cWait " + Math.ceil(remaining / 1000) +
            " seconds before declaring this player again."
        );
        return;
    }

    var reverseRequest = rcGetRequest(database, targetUuid, playerUuid);

    /*
     Crossing declarations immediately create a mutual rivalry, provided both
     players have room for another mutual rival.
    */
    if (reverseRequest !== null) {
        if (rcCountMutual(playerRecord) >= RC_MAX_MUTUAL_RIVALS) {
            rcMessage(player, RC_COLOR + "cYou already have the maximum of " + RC_MAX_MUTUAL_RIVALS + " mutual rivals.");
            return;
        }

        if (rcCountMutual(targetRecord) >= RC_MAX_MUTUAL_RIVALS) {
            rcMessage(player, RC_COLOR + "c" + targetRecord.name + " already has the maximum number of mutual rivals.");
            return;
        }

        var playerRival = rcGetOrCreateRival(playerRecord, targetRecord);
        var targetRival = rcGetOrCreateRival(targetRecord, playerRecord);
        var now = rcNow();

        playerRival.mutual = true;
        playerRival.declaredByMe = true;
        playerRival.declaredByThem = true;
        playerRival.mutualSince = now;
        rcPushHistory(playerRival, "mutual", "Crossed declarations became mutual.");

        targetRival.mutual = true;
        targetRival.declaredByMe = true;
        targetRival.declaredByThem = true;
        targetRival.mutualSince = now;
        rcPushHistory(targetRival, "mutual", "Crossed declarations became mutual.");

        rcRemoveRequestsBetween(database, playerUuid, targetUuid);
        database.cooldowns[cooldownKey] = now;

        playerRecord.totals.declarationsAccepted++;
        targetRecord.totals.declarationsAccepted++;

        rcSaveDatabase(player, database);

        rcMessage(player, RC_COLOR + "6" + RC_COLOR + "lRIVALRY FORMED! " + RC_COLOR + "e" + targetRecord.name + " is now your mutual rival.");
        rcMessage(target, RC_COLOR + "6" + RC_COLOR + "lRIVALRY FORMED! " + RC_COLOR + "e" + playerRecord.name + " is now your mutual rival.");
        return;
    }

    var playerRivalOneSided = rcGetOrCreateRival(playerRecord, targetRecord);
    var targetRivalIncoming = rcGetOrCreateRival(targetRecord, playerRecord);

    playerRivalOneSided.declaredByMe = true;
    playerRivalOneSided.updatedAt = rcNow();
    rcPushHistory(playerRivalOneSided, "declared", "You declared this player as a rival.");

    targetRivalIncoming.declaredByThem = true;
    targetRivalIncoming.updatedAt = rcNow();
    rcPushHistory(targetRivalIncoming, "incoming", "This player declared you as a rival.");

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
    rcMessage(player, RC_COLOR + "7This is one-sided until they accept.");

    rcMessage(target, RC_COLOR + "6" + playerRecord.name + RC_COLOR + "e has declared you as a rival!");
    rcMessage(target, RC_COLOR + "7Accept: " + RC_COLOR + "f/noppes script trigger 102 " + playerRecord.name);
    rcMessage(target, RC_COLOR + "7Decline: " + RC_COLOR + "f/noppes script trigger 103 " + playerRecord.name);
}

function rcAccept(player, declarerName) {
    var database = rcLoadDatabase(player);
    rcCleanupExpiredRequests(database);

    var playerRecord = rcEnsurePlayer(database, player);
    var declarerRecord = rcFindPlayerRecordByName(database, declarerName);

    if (declarerRecord === null) {
        rcMessage(player, RC_COLOR + "cNo known rivalry declaration was found from that player.");
        return;
    }

    var request = rcGetRequest(database, declarerRecord.uuid, playerRecord.uuid);

    if (request === null) {
        rcMessage(player, RC_COLOR + "cThere is no active declaration from " + declarerRecord.name + ".");
        return;
    }

    if (rcCountMutual(playerRecord) >= RC_MAX_MUTUAL_RIVALS) {
        rcMessage(player, RC_COLOR + "cYou already have the maximum of " + RC_MAX_MUTUAL_RIVALS + " mutual rivals.");
        return;
    }

    if (rcCountMutual(declarerRecord) >= RC_MAX_MUTUAL_RIVALS) {
        rcMessage(player, RC_COLOR + "c" + declarerRecord.name + " already has the maximum number of mutual rivals.");
        return;
    }

    var playerRival = rcGetOrCreateRival(playerRecord, declarerRecord);
    var declarerRival = rcGetOrCreateRival(declarerRecord, playerRecord);
    var now = rcNow();

    playerRival.mutual = true;
    playerRival.declaredByMe = false;
    playerRival.declaredByThem = true;
    playerRival.mutualSince = now;
    rcPushHistory(playerRival, "accepted", "You accepted the rivalry.");

    declarerRival.mutual = true;
    declarerRival.declaredByMe = true;
    declarerRival.declaredByThem = false;
    declarerRival.mutualSince = now;
    rcPushHistory(declarerRival, "accepted", "Your declaration was accepted.");

    rcRemoveRequestsBetween(database, declarerRecord.uuid, playerRecord.uuid);

    playerRecord.totals.declarationsAccepted++;
    declarerRecord.totals.declarationsAccepted++;

    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "6" + RC_COLOR + "lRIVALRY FORMED! " + RC_COLOR + "e" + declarerRecord.name + " is now your mutual rival.");

    var declarerOnline = rcFindOnlinePlayerAnyWorld(declarerRecord.name);
    if (declarerOnline !== null) {
        rcMessage(declarerOnline, RC_COLOR + "6" + RC_COLOR + "lRIVALRY FORMED! " + RC_COLOR + "e" + playerRecord.name + " accepted your declaration.");
    }
}

function rcDecline(player, declarerName) {
    var database = rcLoadDatabase(player);
    rcCleanupExpiredRequests(database);

    var playerRecord = rcEnsurePlayer(database, player);
    var declarerRecord = rcFindPlayerRecordByName(database, declarerName);

    if (declarerRecord === null) {
        rcMessage(player, RC_COLOR + "cNo known player record was found with that name.");
        return;
    }

    var request = rcGetRequest(database, declarerRecord.uuid, playerRecord.uuid);

    if (request === null) {
        rcMessage(player, RC_COLOR + "cThere is no active declaration from " + declarerRecord.name + ".");
        return;
    }

    rcRemoveRequestsBetween(database, declarerRecord.uuid, playerRecord.uuid);

    var playerRival = playerRecord.rivals[declarerRecord.uuid];
    if (playerRival !== null && playerRival !== undefined && playerRival.mutual !== true) {
        delete playerRecord.rivals[declarerRecord.uuid];
    }

    var declarerRival = declarerRecord.rivals[playerRecord.uuid];
    if (declarerRival !== null && declarerRival !== undefined && declarerRival.mutual !== true) {
        delete declarerRecord.rivals[playerRecord.uuid];
    }

    playerRecord.totals.declarationsDeclined++;
    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "7You declined " + RC_COLOR + "f" + declarerRecord.name + RC_COLOR + "7's rivalry declaration.");

    var declarerOnline = rcFindOnlinePlayerAnyWorld(declarerRecord.name);
    if (declarerOnline !== null) {
        rcMessage(declarerOnline, RC_COLOR + "c" + playerRecord.name + " declined your rivalry declaration.");
    }
}

function rcRemove(player, rivalName) {
    var database = rcLoadDatabase(player);
    var playerRecord = rcEnsurePlayer(database, player);
    var targetRecord = rcFindPlayerRecordByName(database, rivalName);

    if (targetRecord === null || playerRecord.rivals[targetRecord.uuid] === undefined) {
        rcMessage(player, RC_COLOR + "cThat player is not in your rivalry list.");
        return;
    }

    var wasMutual = playerRecord.rivals[targetRecord.uuid].mutual === true;

    delete playerRecord.rivals[targetRecord.uuid];

    if (targetRecord.rivals !== null && targetRecord.rivals !== undefined) {
        delete targetRecord.rivals[playerRecord.uuid];
    }

    rcRemoveRequestsBetween(database, playerRecord.uuid, targetRecord.uuid);
    playerRecord.totals.rivalsRemoved++;

    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "7Removed " + RC_COLOR + "f" + targetRecord.name + RC_COLOR + "7 from your rivalry list.");

    var targetOnline = rcFindOnlinePlayerAnyWorld(targetRecord.name);
    if (targetOnline !== null && wasMutual) {
        rcMessage(targetOnline, RC_COLOR + "c" + playerRecord.name + " ended your mutual rivalry.");
    }
}

function rcList(player) {
    var database = rcLoadDatabase(player);
    var playerRecord = rcEnsurePlayer(database, player);
    var count = 0;

    rcMessage(player, RC_COLOR + "6" + RC_COLOR + "lRIVALRY LIST");
    rcMessage(player, RC_COLOR + "8------------------------------");

    for (var uuid in playerRecord.rivals) {
        if (!playerRecord.rivals.hasOwnProperty(uuid)) continue;

        var rival = playerRecord.rivals[uuid];
        var state;

        if (rival.mutual === true) {
            state = RC_COLOR + "aMutual";
        } else if (rival.declaredByMe === true) {
            state = RC_COLOR + "eOne-sided (declared by you)";
        } else {
            state = RC_COLOR + "6Incoming declaration";
        }

        rcMessage(
            player,
            RC_COLOR + "f" + rival.name +
            RC_COLOR + "7 - " + state +
            RC_COLOR + "7 - RP: " + RC_COLOR + "b" + rival.points
        );

        count++;
    }

    if (count === 0) {
        rcMessage(player, RC_COLOR + "7You currently have no rivals.");
    }

    rcMessage(
        player,
        RC_COLOR + "8Mutual slots: " +
        RC_COLOR + "f" + rcCountMutual(playerRecord) +
        RC_COLOR + "7/" + RC_MAX_MUTUAL_RIVALS
    );
}

function rcDebug(player) {
    var database = rcLoadDatabase(player);
    var record = rcEnsurePlayer(database, player);
    var pendingIn = 0;
    var pendingOut = 0;

    rcCleanupExpiredRequests(database);

    for (var key in database.requests) {
        if (!database.requests.hasOwnProperty(key)) continue;

        var request = database.requests[key];
        if (request.toUuid === record.uuid) pendingIn++;
        if (request.fromUuid === record.uuid) pendingOut++;
    }

    rcSaveDatabase(player, database);

    rcMessage(player, RC_COLOR + "d" + RC_COLOR + "lRIVAL CORE DEBUG");
    rcMessage(player, RC_COLOR + "7Database version: " + RC_COLOR + "f" + database.version);
    rcMessage(player, RC_COLOR + "7Your UUID: " + RC_COLOR + "f" + record.uuid);
    rcMessage(player, RC_COLOR + "7Stored name: " + RC_COLOR + "f" + record.name);
    rcMessage(player, RC_COLOR + "7Rival entries: " + RC_COLOR + "f" + Object.keys(record.rivals).length);
    rcMessage(player, RC_COLOR + "7Mutual rivals: " + RC_COLOR + "f" + rcCountMutual(record));
    rcMessage(player, RC_COLOR + "7Pending incoming: " + RC_COLOR + "f" + pendingIn);
    rcMessage(player, RC_COLOR + "7Pending outgoing: " + RC_COLOR + "f" + pendingOut);
    rcMessage(player, RC_COLOR + "7Database players: " + RC_COLOR + "f" + Object.keys(database.players).length);
}

/* -------------------------------------------------------------------------- */
/* EVENTS                                                                     */
/* -------------------------------------------------------------------------- */

function init(event) {
    if (event === null || event === undefined || event.player === null || event.player === undefined) {
        return;
    }

    try {
        var database = rcLoadDatabase(event.player);
        rcEnsurePlayer(database, event.player);
        rcCleanupExpiredRequests(database);
        rcSaveDatabase(event.player, database);
    } catch (error) {
        rcMessage(event.player, RC_COLOR + "c[RivalCore] Initialization failed. Check the server log.");
        print("[RivalCore v3] init error: " + error);
    }
}

function login(event) {
    if (event === null || event === undefined || event.player === null || event.player === undefined) {
        return;
    }

    try {
        var database = rcLoadDatabase(event.player);
        var playerRecord = rcEnsurePlayer(database, event.player);
        var incoming = 0;

        rcCleanupExpiredRequests(database);

        for (var key in database.requests) {
            if (!database.requests.hasOwnProperty(key)) continue;
            if (database.requests[key].toUuid === playerRecord.uuid) incoming++;
        }

        rcSaveDatabase(event.player, database);

        if (incoming > 0) {
            rcMessage(
                event.player,
                RC_COLOR + "6[Rivalry] You have " + incoming +
                " pending rivalry declaration" + (incoming === 1 ? "." : "s.")
            );
            rcMessage(event.player, RC_COLOR + "7Use trigger 105 to view your rivalry list.");
        }
    } catch (error) {
        rcMessage(event.player, RC_COLOR + "c[RivalCore] Login synchronization failed.");
        print("[RivalCore v3] login error: " + error);
    }
}

function trigger(event) {
    /*
     Verified from the uploaded CNPC jar:
     WorldEvent.ScriptTriggerEvent uses event.entity, event.id, event.arguments.
    */
    if (event === null || event === undefined || !rcIsPlayer(event.entity)) {
        return;
    }

    var player = event.entity;
    var id = Number(event.id);
    var args = rcArgs(event);

    try {
        if (id === 100) {
            rcMessage(player, RC_COLOR + "6" + RC_COLOR + "lRIVAL CORE TEST COMMANDS");
            rcMessage(player, RC_COLOR + "f101 <player> " + RC_COLOR + "7- Declare");
            rcMessage(player, RC_COLOR + "f102 <player> " + RC_COLOR + "7- Accept");
            rcMessage(player, RC_COLOR + "f103 <player> " + RC_COLOR + "7- Decline");
            rcMessage(player, RC_COLOR + "f104 <player> " + RC_COLOR + "7- Remove");
            rcMessage(player, RC_COLOR + "f105 " + RC_COLOR + "7- List");
            rcMessage(player, RC_COLOR + "f106 " + RC_COLOR + "7- Debug");
            return;
        }

        if (id === 101) {
            rcDeclare(player, args.length > 0 ? args[0] : "");
            return;
        }

        if (id === 102) {
            rcAccept(player, args.length > 0 ? args[0] : "");
            return;
        }

        if (id === 103) {
            rcDecline(player, args.length > 0 ? args[0] : "");
            return;
        }

        if (id === 104) {
            rcRemove(player, args.length > 0 ? args[0] : "");
            return;
        }

        if (id === 105) {
            rcList(player);
            return;
        }

        if (id === 106) {
            rcDebug(player);
        }
    } catch (error) {
        rcMessage(player, RC_COLOR + "c[RivalCore] An error occurred. Check the server log.");
        print("[RivalCore v3] trigger " + id + " error: " + error);
    }
}
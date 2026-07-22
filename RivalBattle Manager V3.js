/*
 DBZ LEGACY REBORN - RIVAL BATTLE MANAGER V3
 PHASE 3A: CHALLENGES + COUNTDOWN + SESSION MANAGEMENT

 Verified target:
 - CustomNPCs 1.20.1.20260227
 - Nashorn-compatible ES5 JavaScript

 Requires:
 - RivalCore_v3
 - RivalEvents_v3 may remain installed

 Install as a NEW Global Player Script.
 Enable:
 - init
 - login
 - tick
 - logout
 - died
 - trigger

 Trigger IDs:
 108 = challenge <player>
 109 = accept [player]
 110 = decline [player]
 111 = cancel
 112 = battle debug

 This module intentionally does not track damage or grant rewards yet.
*/

/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 *
 * SUITE WARNING: RivalCore / RivalEvents / RivalBattle Manager / RivalBattle Combat Core must EACH be their own Player Script tab. All define init/trigger/login/died.
 */
var RB_COLOR = String.fromCharCode(167);
var RB_API = Java.type("noppes.npcs.api.NpcAPI");
var RB_SYSTEM = Java.type("java.lang.System");

var RB_CORE_DATABASE_KEY = "dlr.rivalry.v3.database";
var RB_DATABASE_KEY = "dlr.rivalry.v3.battle_manager";
var RB_BACKUP_KEY = "dlr.rivalry.v3.battle_manager.backup";

var RB_VERSION = 3;
var RB_DEBUG_LOG = false;

var RB_CHALLENGE_EXPIRE_MS = 30 * 1000;
var RB_COUNTDOWN_MS = 10 * 1000;
var RB_BATTLE_DURATION_MS = 60 * 1000;
var RB_REQUEST_COOLDOWN_MS = 15 * 1000;
var RB_MAX_COUNTDOWN_DISTANCE = 64;
var RB_MAX_BATTLE_DISTANCE = 256;
var RB_DISTANCE_GRACE_MS = 10 * 1000;
var RB_TICK_INTERVAL_MS = 500;

/* -------------------------------------------------------------------------- */
/* BASIC HELPERS                                                              */
/* -------------------------------------------------------------------------- */

function rbNow() {
    return Number(RB_SYSTEM.currentTimeMillis());
}

function rbString(value) {
    if (value === null || value === undefined) return "";
    return String(value);
}

function rbLower(value) {
    return rbString(value).toLowerCase();
}

function rbNumber(value, fallback) {
    var number = Number(value);
    return isNaN(number) ? fallback : number;
}

function rbMessage(player, message) {
    try {
        if (player !== null && player !== undefined) player.message(message);
    } catch (ignored) {}
}

function rbLog(message) {
    if (!RB_DEBUG_LOG) return;
    try {
        print("[RivalBattle Manager v3] " + message);
    } catch (ignored) {}
}

function rbUuid(player) {
    try {
        return rbString(player.getUUID());
    } catch (ignored) {
        return "";
    }
}

function rbName(player) {
    try {
        return rbString(player.getName());
    } catch (ignored) {
        return "Unknown";
    }
}

function rbIsPlayer(entity) {
    if (entity === null || entity === undefined) return false;
    try {
        return Number(entity.getType()) === 1;
    } catch (ignored) {
        return false;
    }
}

function rbArgs(event) {
    var result = [];
    if (event === null || event.arguments === null || event.arguments === undefined) return result;

    for (var i = 0; i < event.arguments.length; i++) {
        result.push(rbString(event.arguments[i]));
    }
    return result;
}

function rbFormatSeconds(milliseconds) {
    return Math.max(0, Math.ceil(rbNumber(milliseconds, 0) / 1000));
}

/* -------------------------------------------------------------------------- */
/* WORLD + STORAGE                                                            */
/* -------------------------------------------------------------------------- */

function rbDataWorld(fallbackPlayer) {
    try {
        var world = RB_API.Instance().getIWorld("minecraft:overworld");
        if (world !== null && world !== undefined) return world;
    } catch (ignored1) {}

    try {
        return fallbackPlayer.getWorld();
    } catch (ignored2) {
        return null;
    }
}

function rbFreshDatabase() {
    return {
        version: RB_VERSION,
        nextSessionId: 1,
        pending: {},
        sessions: {},
        playerSessions: {},
        cooldowns: {},
        updatedAt: rbNow()
    };
}

function rbNormalizeDatabase(database) {
    if (database === null || typeof database !== "object") database = rbFreshDatabase();

    database.version = RB_VERSION;
    database.nextSessionId = Math.max(1, rbNumber(database.nextSessionId, 1));

    if (database.pending === null || typeof database.pending !== "object") database.pending = {};
    if (database.sessions === null || typeof database.sessions !== "object") database.sessions = {};
    if (database.playerSessions === null || typeof database.playerSessions !== "object") database.playerSessions = {};
    if (database.cooldowns === null || typeof database.cooldowns !== "object") database.cooldowns = {};

    database.updatedAt = rbNumber(database.updatedAt, rbNow());
    return database;
}

function rbLoadDatabase(player) {
    var world = rbDataWorld(player);
    if (world === null) throw new Error("Could not access persistent battle storage.");

    var stored = world.getStoreddata();
    var database;

    try {
        database = stored.has(RB_DATABASE_KEY)
            ? JSON.parse(rbString(stored.get(RB_DATABASE_KEY)))
            : rbFreshDatabase();
    } catch (mainError) {
        rbLog("Main battle database failed: " + mainError);

        try {
            database = stored.has(RB_BACKUP_KEY)
                ? JSON.parse(rbString(stored.get(RB_BACKUP_KEY)))
                : rbFreshDatabase();
        } catch (backupError) {
            rbLog("Backup battle database failed: " + backupError);
            database = rbFreshDatabase();
        }
    }

    return rbNormalizeDatabase(database);
}

function rbSaveDatabase(player, database) {
    var world = rbDataWorld(player);
    if (world === null) throw new Error("Could not access persistent battle storage.");

    database = rbNormalizeDatabase(database);
    database.updatedAt = rbNow();

    var stored = world.getStoreddata();

    if (stored.has(RB_DATABASE_KEY)) {
        stored.put(RB_BACKUP_KEY, rbString(stored.get(RB_DATABASE_KEY)));
    }

    stored.put(RB_DATABASE_KEY, JSON.stringify(database));
}

function rbLoadCore(player) {
    var world = rbDataWorld(player);
    if (world === null) return null;

    try {
        var stored = world.getStoreddata();
        if (!stored.has(RB_CORE_DATABASE_KEY)) return null;

        var database = JSON.parse(rbString(stored.get(RB_CORE_DATABASE_KEY)));
        if (database === null || typeof database !== "object") return null;
        if (database.players === null || typeof database.players !== "object") return null;

        return database;
    } catch (ignored) {
        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* PLAYER LOOKUP                                                              */
/* -------------------------------------------------------------------------- */

function rbFindOnlineByName(name) {
    var wanted = rbLower(name);
    if (wanted === "") return null;

    try {
        var worlds = RB_API.Instance().getIWorlds();

        for (var w = 0; w < worlds.length; w++) {
            var direct;

            try {
                direct = worlds[w].getPlayer(name);
                if (direct !== null && direct !== undefined) return direct;
            } catch (ignored1) {}

            try {
                var players = worlds[w].getAllPlayers();

                for (var p = 0; p < players.length; p++) {
                    if (rbLower(players[p].getName()) === wanted) return players[p];
                }
            } catch (ignored2) {}
        }
    } catch (ignored3) {}

    return null;
}

function rbFindOnlineByUuid(uuid) {
    var wanted = rbString(uuid);
    if (wanted === "") return null;

    try {
        var worlds = RB_API.Instance().getIWorlds();

        for (var w = 0; w < worlds.length; w++) {
            var players;

            try {
                players = worlds[w].getAllPlayers();
            } catch (ignored1) {
                continue;
            }

            for (var p = 0; p < players.length; p++) {
                if (rbUuid(players[p]) === wanted) return players[p];
            }
        }
    } catch (ignored2) {}

    return null;
}

function rbWorldId(player) {
    try {
        return rbString(player.getWorld().getName());
    } catch (ignored1) {}

    try {
        return rbString(player.getMCEntity().level().dimension().location());
    } catch (ignored2) {}

    return "";
}

function rbSameWorld(playerA, playerB) {
    return rbWorldId(playerA) === rbWorldId(playerB);
}

function rbDistance(playerA, playerB) {
    try {
        var dx = Number(playerA.getX()) - Number(playerB.getX());
        var dy = Number(playerA.getY()) - Number(playerB.getY());
        var dz = Number(playerA.getZ()) - Number(playerB.getZ());
        return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    } catch (ignored) {
        return -1;
    }
}

/* -------------------------------------------------------------------------- */
/* CORE RIVAL VALIDATION                                                      */
/* -------------------------------------------------------------------------- */

function rbCorePlayer(core, uuid) {
    if (core === null || core.players === null) return null;
    return core.players[uuid] || null;
}

function rbAreMutualRivals(core, uuidA, uuidB) {
    var recordA = rbCorePlayer(core, uuidA);
    var recordB = rbCorePlayer(core, uuidB);

    if (recordA === null || recordB === null) return false;
    if (recordA.rivals === null || recordB.rivals === null) return false;

    var aToB = recordA.rivals[uuidB];
    var bToA = recordB.rivals[uuidA];

    return aToB !== null && aToB !== undefined &&
           bToA !== null && bToA !== undefined &&
           aToB.mutual === true &&
           bToA.mutual === true;
}

/* -------------------------------------------------------------------------- */
/* STATE HELPERS                                                              */
/* -------------------------------------------------------------------------- */

function rbPendingKey(fromUuid, toUuid) {
    return rbString(fromUuid) + ">" + rbString(toUuid);
}

function rbCooldownKey(fromUuid, toUuid) {
    return rbString(fromUuid) + ">" + rbString(toUuid);
}

function rbGetSessionForPlayer(database, uuid) {
    var sessionId = database.playerSessions[uuid];
    if (sessionId === null || sessionId === undefined) return null;

    var session = database.sessions[rbString(sessionId)];
    if (session === null || session === undefined) {
        delete database.playerSessions[uuid];
        return null;
    }

    return session;
}

function rbIsBusy(database, uuid) {
    return rbGetSessionForPlayer(database, uuid) !== null;
}

function rbFindIncoming(database, targetUuid, optionalFromName) {
    var wantedName = rbLower(optionalFromName);
    var newest = null;

    for (var key in database.pending) {
        if (!database.pending.hasOwnProperty(key)) continue;

        var request = database.pending[key];
        if (request.toUuid !== targetUuid) continue;
        if (wantedName !== "" && rbLower(request.fromName) !== wantedName) continue;

        if (newest === null || rbNumber(request.createdAt, 0) > rbNumber(newest.createdAt, 0)) {
            newest = request;
        }
    }

    return newest;
}

function rbRemovePendingBetween(database, uuidA, uuidB) {
    delete database.pending[rbPendingKey(uuidA, uuidB)];
    delete database.pending[rbPendingKey(uuidB, uuidA)];
}

function rbSetCooldown(database, fromUuid, toUuid) {
    database.cooldowns[rbCooldownKey(fromUuid, toUuid)] = rbNow() + RB_REQUEST_COOLDOWN_MS;
}

function rbCooldownRemaining(database, fromUuid, toUuid) {
    var key = rbCooldownKey(fromUuid, toUuid);
    var until = rbNumber(database.cooldowns[key], 0);

    if (until <= rbNow()) {
        delete database.cooldowns[key];
        return 0;
    }

    return until - rbNow();
}

function rbCreateSession(database, request) {
    var id = database.nextSessionId++;
    var now = rbNow();

    var session = {
        version: RB_VERSION,
        id: id,
        state: "countdown",

        challengerUuid: request.fromUuid,
        challengerName: request.fromName,
        opponentUuid: request.toUuid,
        opponentName: request.toName,

        createdAt: now,
        acceptedAt: now,
        countdownEndsAt: now + RB_COUNTDOWN_MS,
        startedAt: 0,
        endsAt: 0,
        endedAt: 0,

        lastCountdownNumber: -1,
        outOfRangeSince: 0,

        endReason: "",
        winnerUuid: "",
        winnerName: "",
        loserUuid: "",
        loserName: ""
    };

    database.sessions[rbString(id)] = session;
    database.playerSessions[session.challengerUuid] = id;
    database.playerSessions[session.opponentUuid] = id;

    return session;
}

function rbSessionPlayers(session) {
    return {
        challenger: rbFindOnlineByUuid(session.challengerUuid),
        opponent: rbFindOnlineByUuid(session.opponentUuid)
    };
}

function rbOtherPlayer(session, uuid) {
    if (session.challengerUuid === uuid) {
        return {
            uuid: session.opponentUuid,
            name: session.opponentName
        };
    }

    return {
        uuid: session.challengerUuid,
        name: session.challengerName
    };
}

function rbNotifyBoth(session, message) {
    var players = rbSessionPlayers(session);
    rbMessage(players.challenger, message);
    rbMessage(players.opponent, message);
}

function rbReleaseSession(database, session) {
    delete database.playerSessions[session.challengerUuid];
    delete database.playerSessions[session.opponentUuid];
}

function rbEndSession(database, session, reason, winnerUuid, winnerName, loserUuid, loserName) {
    if (session === null || session.state === "ended") return;

    session.state = "ended";
    session.endedAt = rbNow();
    session.endReason = rbString(reason);
    session.winnerUuid = rbString(winnerUuid);
    session.winnerName = rbString(winnerName);
    session.loserUuid = rbString(loserUuid);
    session.loserName = rbString(loserName);

    rbReleaseSession(database, session);

    var players = rbSessionPlayers(session);

    if (winnerUuid !== null && rbString(winnerUuid) !== "") {
        rbMessage(
            players.challenger,
            RB_COLOR + "6[Rival Battle] " +
            RB_COLOR + "e" + winnerName +
            RB_COLOR + "7 wins by " +
            RB_COLOR + "f" + reason +
            RB_COLOR + "7."
        );

        rbMessage(
            players.opponent,
            RB_COLOR + "6[Rival Battle] " +
            RB_COLOR + "e" + winnerName +
            RB_COLOR + "7 wins by " +
            RB_COLOR + "f" + reason +
            RB_COLOR + "7."
        );
    } else {
        rbMessage(
            players.challenger,
            RB_COLOR + "8[Rival Battle] " +
            RB_COLOR + "7Battle ended: " +
            RB_COLOR + "f" + reason +
            RB_COLOR + "7."
        );

        rbMessage(
            players.opponent,
            RB_COLOR + "8[Rival Battle] " +
            RB_COLOR + "7Battle ended: " +
            RB_COLOR + "f" + reason +
            RB_COLOR + "7."
        );
    }
}

/* -------------------------------------------------------------------------- */
/* COMMANDS                                                                   */
/* -------------------------------------------------------------------------- */

function rbChallenge(player, targetName) {
    if (targetName === "") {
        rbMessage(player, RB_COLOR + "cUsage: /noppes script trigger 108 <player>");
        return;
    }

    var target = rbFindOnlineByName(targetName);

    if (target === null) {
        rbMessage(player, RB_COLOR + "cThat player is not online.");
        return;
    }

    var playerUuid = rbUuid(player);
    var targetUuid = rbUuid(target);

    if (playerUuid === targetUuid) {
        rbMessage(player, RB_COLOR + "cYou cannot challenge yourself.");
        return;
    }

    var core = rbLoadCore(player);

    if (core === null) {
        rbMessage(player, RB_COLOR + "cRivalCore database could not be read.");
        return;
    }

    if (!rbAreMutualRivals(core, playerUuid, targetUuid)) {
        rbMessage(player, RB_COLOR + "cYou can only officially challenge a mutual rival.");
        return;
    }

    var database = rbLoadDatabase(player);
    rbCleanup(database, player);

    if (rbIsBusy(database, playerUuid)) {
        rbMessage(player, RB_COLOR + "cYou are already in an official rival battle.");
        rbSaveDatabase(player, database);
        return;
    }

    if (rbIsBusy(database, targetUuid)) {
        rbMessage(player, RB_COLOR + "c" + rbName(target) + " is already in an official rival battle.");
        rbSaveDatabase(player, database);
        return;
    }

    var cooldown = rbCooldownRemaining(database, playerUuid, targetUuid);

    if (cooldown > 0) {
        rbMessage(
            player,
            RB_COLOR + "cWait " + rbFormatSeconds(cooldown) +
            " seconds before challenging this rival again."
        );
        rbSaveDatabase(player, database);
        return;
    }

    var sameRequest = database.pending[rbPendingKey(playerUuid, targetUuid)];

    if (sameRequest !== null && sameRequest !== undefined) {
        rbMessage(player, RB_COLOR + "cYou already challenged this rival.");
        rbSaveDatabase(player, database);
        return;
    }

    var reverseRequest = database.pending[rbPendingKey(targetUuid, playerUuid)];

    if (reverseRequest !== null && reverseRequest !== undefined) {
        rbMessage(
            player,
            RB_COLOR + "e" + rbName(target) +
            RB_COLOR + "7 already challenged you. Use trigger " +
            RB_COLOR + "f109 " + rbName(target) +
            RB_COLOR + "7 to accept."
        );
        rbSaveDatabase(player, database);
        return;
    }

    var now = rbNow();

    database.pending[rbPendingKey(playerUuid, targetUuid)] = {
        version: RB_VERSION,
        fromUuid: playerUuid,
        fromName: rbName(player),
        toUuid: targetUuid,
        toName: rbName(target),
        createdAt: now,
        expiresAt: now + RB_CHALLENGE_EXPIRE_MS
    };

    rbSaveDatabase(player, database);

    rbMessage(
        player,
        RB_COLOR + "6[Rival Battle] " +
        RB_COLOR + "7Challenge sent to " +
        RB_COLOR + "e" + rbName(target) +
        RB_COLOR + "7."
    );

    rbMessage(
        target,
        RB_COLOR + "6" + RB_COLOR + "lOFFICIAL RIVAL CHALLENGE"
    );
    rbMessage(
        target,
        RB_COLOR + "e" + rbName(player) +
        RB_COLOR + "7 has challenged you."
    );
    rbMessage(
        target,
        RB_COLOR + "aAccept: " + RB_COLOR + "f/noppes script trigger 109 " + rbName(player)
    );
    rbMessage(
        target,
        RB_COLOR + "cDecline: " + RB_COLOR + "f/noppes script trigger 110 " + rbName(player)
    );
    rbMessage(
        target,
        RB_COLOR + "8Expires in " + rbFormatSeconds(RB_CHALLENGE_EXPIRE_MS) + " seconds."
    );
}

function rbAccept(player, challengerName) {
    var database = rbLoadDatabase(player);
    rbCleanup(database, player);

    var playerUuid = rbUuid(player);
    var request = rbFindIncoming(database, playerUuid, challengerName);

    if (request === null) {
        rbMessage(player, RB_COLOR + "cNo matching rival challenge was found.");
        rbSaveDatabase(player, database);
        return;
    }

    var challenger = rbFindOnlineByUuid(request.fromUuid);

    if (challenger === null) {
        delete database.pending[rbPendingKey(request.fromUuid, request.toUuid)];
        rbSetCooldown(database, request.fromUuid, request.toUuid);
        rbSaveDatabase(player, database);
        rbMessage(player, RB_COLOR + "cThe challenger is no longer online.");
        return;
    }

    var core = rbLoadCore(player);

    if (!rbAreMutualRivals(core, request.fromUuid, request.toUuid)) {
        delete database.pending[rbPendingKey(request.fromUuid, request.toUuid)];
        rbSaveDatabase(player, database);
        rbMessage(player, RB_COLOR + "cThis challenge is no longer valid because the rivalry is not mutual.");
        return;
    }

    if (rbIsBusy(database, request.fromUuid) || rbIsBusy(database, request.toUuid)) {
        delete database.pending[rbPendingKey(request.fromUuid, request.toUuid)];
        rbSaveDatabase(player, database);
        rbMessage(player, RB_COLOR + "cOne of you is already in a battle.");
        return;
    }

    if (!rbSameWorld(player, challenger)) {
        rbMessage(player, RB_COLOR + "cYou must be in the same dimension to accept.");
        rbSaveDatabase(player, database);
        return;
    }

    var distance = rbDistance(player, challenger);

    if (distance < 0 || distance > RB_MAX_COUNTDOWN_DISTANCE) {
        rbMessage(
            player,
            RB_COLOR + "cYou must be within " + RB_MAX_COUNTDOWN_DISTANCE +
            " blocks of the challenger."
        );
        rbSaveDatabase(player, database);
        return;
    }

    rbRemovePendingBetween(database, request.fromUuid, request.toUuid);
    var session = rbCreateSession(database, request);
    rbSaveDatabase(player, database);

    rbNotifyBoth(
        session,
        RB_COLOR + "6" + RB_COLOR + "lOFFICIAL RIVAL BATTLE" +
        RB_COLOR + "r " +
        RB_COLOR + "e" + session.challengerName +
        RB_COLOR + "7 vs " +
        RB_COLOR + "e" + session.opponentName
    );

    rbNotifyBoth(
        session,
        RB_COLOR + "7Battle begins in " +
        RB_COLOR + "f" + rbFormatSeconds(RB_COUNTDOWN_MS) +
        RB_COLOR + "7 seconds."
    );
}

function rbDecline(player, challengerName) {
    var database = rbLoadDatabase(player);
    rbCleanup(database, player);

    var request = rbFindIncoming(database, rbUuid(player), challengerName);

    if (request === null) {
        rbMessage(player, RB_COLOR + "cNo matching rival challenge was found.");
        rbSaveDatabase(player, database);
        return;
    }

    delete database.pending[rbPendingKey(request.fromUuid, request.toUuid)];
    rbSetCooldown(database, request.fromUuid, request.toUuid);
    rbSaveDatabase(player, database);

    var challenger = rbFindOnlineByUuid(request.fromUuid);

    rbMessage(
        player,
        RB_COLOR + "7You declined " +
        RB_COLOR + "e" + request.fromName +
        RB_COLOR + "7's challenge."
    );

    rbMessage(
        challenger,
        RB_COLOR + "e" + request.toName +
        RB_COLOR + "7 declined your rival challenge."
    );
}

function rbCancel(player) {
    var database = rbLoadDatabase(player);
    rbCleanup(database, player);

    var uuid = rbUuid(player);
    var session = rbGetSessionForPlayer(database, uuid);

    if (session !== null) {
        var other = rbOtherPlayer(session, uuid);

        if (session.state === "countdown") {
            rbEndSession(database, session, "countdown cancelled", "", "", "", "");
        } else {
            rbEndSession(
                database,
                session,
                "forfeit",
                other.uuid,
                other.name,
                uuid,
                rbName(player)
            );
        }

        rbSaveDatabase(player, database);
        return;
    }

    var removed = false;

    for (var key in database.pending) {
        if (!database.pending.hasOwnProperty(key)) continue;

        var request = database.pending[key];

        if (request.fromUuid === uuid) {
            var target = rbFindOnlineByUuid(request.toUuid);

            rbMessage(
                target,
                RB_COLOR + "e" + request.fromName +
                RB_COLOR + "7 cancelled their rival challenge."
            );

            delete database.pending[key];
            rbSetCooldown(database, request.fromUuid, request.toUuid);
            removed = true;
        }
    }

    if (removed) {
        rbMessage(player, RB_COLOR + "7Your pending rival challenge was cancelled.");
    } else {
        rbMessage(player, RB_COLOR + "cYou have no pending challenge or active battle.");
    }

    rbSaveDatabase(player, database);
}

function rbDebug(player) {
    var database = rbLoadDatabase(player);
    rbCleanup(database, player);

    var uuid = rbUuid(player);
    var session = rbGetSessionForPlayer(database, uuid);

    rbMessage(player, RB_COLOR + "d" + RB_COLOR + "lRIVAL BATTLE DEBUG");
    rbMessage(player, RB_COLOR + "8------------------------------");

    var pendingIncoming = 0;
    var pendingOutgoing = 0;

    for (var key in database.pending) {
        if (!database.pending.hasOwnProperty(key)) continue;

        var request = database.pending[key];
        if (request.toUuid === uuid) pendingIncoming++;
        if (request.fromUuid === uuid) pendingOutgoing++;
    }

    rbMessage(player, RB_COLOR + "7Incoming challenges: " + RB_COLOR + "f" + pendingIncoming);
    rbMessage(player, RB_COLOR + "7Outgoing challenges: " + RB_COLOR + "f" + pendingOutgoing);

    if (session === null) {
        rbMessage(player, RB_COLOR + "7Active session: " + RB_COLOR + "cNone");
        rbSaveDatabase(player, database);
        return;
    }

    var now = rbNow();
    var other = rbOtherPlayer(session, uuid);
    var otherPlayer = rbFindOnlineByUuid(other.uuid);

    rbMessage(player, RB_COLOR + "7Session ID: " + RB_COLOR + "f" + session.id);
    rbMessage(player, RB_COLOR + "7State: " + RB_COLOR + "f" + session.state);
    rbMessage(player, RB_COLOR + "7Opponent: " + RB_COLOR + "e" + other.name);

    if (session.state === "countdown") {
        rbMessage(
            player,
            RB_COLOR + "7Countdown remaining: " +
            RB_COLOR + "f" + rbFormatSeconds(session.countdownEndsAt - now) + "s"
        );
    }

    if (session.state === "active") {
        rbMessage(
            player,
            RB_COLOR + "7Battle remaining: " +
            RB_COLOR + "f" + rbFormatSeconds(session.endsAt - now) + "s"
        );
    }

    if (otherPlayer === null) {
        rbMessage(player, RB_COLOR + "7Opponent online: " + RB_COLOR + "cNo");
    } else {
        rbMessage(player, RB_COLOR + "7Opponent online: " + RB_COLOR + "aYes");
        rbMessage(
            player,
            RB_COLOR + "7Same dimension: " +
            RB_COLOR + (rbSameWorld(player, otherPlayer) ? "aYes" : "cNo")
        );

        if (rbSameWorld(player, otherPlayer)) {
            rbMessage(
                player,
                RB_COLOR + "7Distance: " +
                RB_COLOR + "f" + Math.floor(rbDistance(player, otherPlayer)) + "m"
            );
        }
    }

    rbSaveDatabase(player, database);
}

/* -------------------------------------------------------------------------- */
/* CLEANUP + SESSION TICK                                                     */
/* -------------------------------------------------------------------------- */

function rbCleanup(database, fallbackPlayer) {
    var now = rbNow();

    for (var cooldownKey in database.cooldowns) {
        if (!database.cooldowns.hasOwnProperty(cooldownKey)) continue;
        if (rbNumber(database.cooldowns[cooldownKey], 0) <= now) {
            delete database.cooldowns[cooldownKey];
        }
    }

    for (var pendingKey in database.pending) {
        if (!database.pending.hasOwnProperty(pendingKey)) continue;

        var request = database.pending[pendingKey];
        var expiresAt = rbNumber(request.expiresAt, rbNumber(request.createdAt, 0) + RB_CHALLENGE_EXPIRE_MS);

        if (expiresAt <= now) {
            var challenger = rbFindOnlineByUuid(request.fromUuid);
            var target = rbFindOnlineByUuid(request.toUuid);

            rbMessage(
                challenger,
                RB_COLOR + "8[Rival Battle] " +
                RB_COLOR + "7Your challenge to " +
                RB_COLOR + "e" + request.toName +
                RB_COLOR + "7 expired."
            );

            rbMessage(
                target,
                RB_COLOR + "8[Rival Battle] " +
                RB_COLOR + "e" + request.fromName +
                RB_COLOR + "7's challenge expired."
            );

            delete database.pending[pendingKey];
            rbSetCooldown(database, request.fromUuid, request.toUuid);
        }
    }

    for (var sessionId in database.sessions) {
        if (!database.sessions.hasOwnProperty(sessionId)) continue;

        var session = database.sessions[sessionId];

        if (session === null || typeof session !== "object") {
            delete database.sessions[sessionId];
            continue;
        }

        if (session.state === "ended") {
            if (now - rbNumber(session.endedAt, now) > 5 * 60 * 1000) {
                delete database.sessions[sessionId];
            }
            continue;
        }

        var players = rbSessionPlayers(session);

        if (players.challenger === null || players.opponent === null) {
            var onlinePlayer = players.challenger !== null ? players.challenger : players.opponent;
            var onlineUuid = onlinePlayer !== null ? rbUuid(onlinePlayer) : "";
            var offline;

            if (players.challenger === null) {
                offline = {
                    uuid: session.challengerUuid,
                    name: session.challengerName,
                    winnerUuid: session.opponentUuid,
                    winnerName: session.opponentName
                };
            } else {
                offline = {
                    uuid: session.opponentUuid,
                    name: session.opponentName,
                    winnerUuid: session.challengerUuid,
                    winnerName: session.challengerName
                };
            }

            if (session.state === "countdown") {
                rbEndSession(database, session, "player disconnected during countdown", "", "", "", "");
            } else {
                rbEndSession(
                    database,
                    session,
                    "disconnect forfeit",
                    offline.winnerUuid,
                    offline.winnerName,
                    offline.uuid,
                    offline.name
                );
            }

            continue;
        }

        if (!rbSameWorld(players.challenger, players.opponent)) {
            if (session.state === "countdown") {
                rbEndSession(database, session, "dimension changed during countdown", "", "", "", "");
            } else {
                rbEndSession(database, session, "dimension separation", "", "", "", "");
            }
            continue;
        }

        var distance = rbDistance(players.challenger, players.opponent);
        var distanceLimit = session.state === "countdown"
            ? RB_MAX_COUNTDOWN_DISTANCE
            : RB_MAX_BATTLE_DISTANCE;

        if (distance < 0 || distance > distanceLimit) {
            if (session.state === "countdown") {
                rbEndSession(database, session, "too far apart during countdown", "", "", "", "");
                continue;
            }

            if (rbNumber(session.outOfRangeSince, 0) <= 0) {
                session.outOfRangeSince = now;

                rbNotifyBoth(
                    session,
                    RB_COLOR + "c[Rival Battle] Return within " +
                    RB_COLOR + "f" + rbFormatSeconds(RB_DISTANCE_GRACE_MS) +
                    RB_COLOR + "c seconds or the battle will end."
                );
            } else if (now - session.outOfRangeSince >= RB_DISTANCE_GRACE_MS) {
                rbEndSession(database, session, "distance limit", "", "", "", "");
                continue;
            }
        } else {
            session.outOfRangeSince = 0;
        }

        if (session.state === "countdown") {
            var remaining = session.countdownEndsAt - now;

            if (remaining <= 0) {
                session.state = "active";
                session.startedAt = now;
                session.endsAt = now + RB_BATTLE_DURATION_MS;
                session.lastCountdownNumber = 0;

                rbNotifyBoth(
                    session,
                    RB_COLOR + "c" + RB_COLOR + "lFIGHT!"
                );
            } else {
                var seconds = rbFormatSeconds(remaining);

                if (seconds !== session.lastCountdownNumber) {
                    session.lastCountdownNumber = seconds;

                    if (seconds <= 5 || seconds === 10) {
                        rbNotifyBoth(
                            session,
                            RB_COLOR + "6[Rival Battle] " +
                            RB_COLOR + "f" + seconds
                        );
                    }
                }
            }
        } else if (session.state === "active") {
            if (now >= session.endsAt) {
                rbEndSession(
                    database,
                    session,
                    "time limit reached; combat scoring is not installed yet",
                    "",
                    "",
                    "",
                    ""
                );
            }
        }
    }

    /*
     Repair stale player-session links.
    */
    for (var uuid in database.playerSessions) {
        if (!database.playerSessions.hasOwnProperty(uuid)) continue;

        var linked = database.sessions[rbString(database.playerSessions[uuid])];

        if (linked === null || linked === undefined || linked.state === "ended") {
            delete database.playerSessions[uuid];
        }
    }
}

/* -------------------------------------------------------------------------- */
/* EVENTS                                                                     */
/* -------------------------------------------------------------------------- */

function init(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    try {
        event.player.getTempdata().put("dlr_rival_battle_next_tick", "0");

        var database = rbLoadDatabase(event.player);
        rbCleanup(database, event.player);
        rbSaveDatabase(event.player, database);
    } catch (error) {
        print("[RivalBattle Manager v3] init error: " + error);
    }
}

function login(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    try {
        event.player.getTempdata().put("dlr_rival_battle_next_tick", "0");

        var database = rbLoadDatabase(event.player);
        rbCleanup(database, event.player);
        rbSaveDatabase(event.player, database);
    } catch (error) {
        print("[RivalBattle Manager v3] login error: " + error);
    }
}

function tick(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    var player = event.player;
    var temp = player.getTempdata();
    var now = rbNow();
    var next = 0;

    try {
        if (temp.has("dlr_rival_battle_next_tick")) {
            next = rbNumber(temp.get("dlr_rival_battle_next_tick"), 0);
        }
    } catch (ignored) {}

    if (now < next) return;

    try {
        temp.put("dlr_rival_battle_next_tick", rbString(now + RB_TICK_INTERVAL_MS));

        var database = rbLoadDatabase(player);
        rbCleanup(database, player);
        rbSaveDatabase(player, database);
    } catch (error) {
        rbLog("tick error for " + rbName(player) + ": " + error);
    }
}

function died(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    try {
        var player = event.player;
        var database = rbLoadDatabase(player);
        rbCleanup(database, player);

        var session = rbGetSessionForPlayer(database, rbUuid(player));

        if (session !== null) {
            var other = rbOtherPlayer(session, rbUuid(player));

            if (session.state === "countdown") {
                rbEndSession(database, session, "death during countdown", "", "", "", "");
            } else {
                rbEndSession(
                    database,
                    session,
                    "knockout",
                    other.uuid,
                    other.name,
                    rbUuid(player),
                    rbName(player)
                );
            }
        }

        rbSaveDatabase(player, database);
    } catch (error) {
        print("[RivalBattle Manager v3] died error: " + error);
    }
}

function logout(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    try {
        var player = event.player;
        var database = rbLoadDatabase(player);
        rbCleanup(database, player);

        var uuid = rbUuid(player);
        var session = rbGetSessionForPlayer(database, uuid);

        if (session !== null) {
            var other = rbOtherPlayer(session, uuid);

            if (session.state === "countdown") {
                rbEndSession(database, session, "logout during countdown", "", "", "", "");
            } else {
                rbEndSession(
                    database,
                    session,
                    "logout forfeit",
                    other.uuid,
                    other.name,
                    uuid,
                    rbName(player)
                );
            }
        }

        for (var key in database.pending) {
            if (!database.pending.hasOwnProperty(key)) continue;

            var request = database.pending[key];

            if (request.fromUuid === uuid || request.toUuid === uuid) {
                var otherUuid = request.fromUuid === uuid ? request.toUuid : request.fromUuid;
                var otherPlayer = rbFindOnlineByUuid(otherUuid);

                rbMessage(
                    otherPlayer,
                    RB_COLOR + "8[Rival Battle] " +
                    RB_COLOR + "7A pending challenge was cancelled because a player logged out."
                );

                delete database.pending[key];
            }
        }

        rbSaveDatabase(player, database);
    } catch (error) {
        print("[RivalBattle Manager v3] logout error: " + error);
    }
}

function trigger(event) {
    if (event === null || !rbIsPlayer(event.entity)) return;

    var player = event.entity;
    var args = rbArgs(event);
    var id = Number(event.id);

    try {
        if (id === 108) {
            rbChallenge(player, args.length > 0 ? args[0] : "");
        } else if (id === 109) {
            rbAccept(player, args.length > 0 ? args[0] : "");
        } else if (id === 110) {
            rbDecline(player, args.length > 0 ? args[0] : "");
        } else if (id === 111) {
            rbCancel(player);
        } else if (id === 112) {
            rbDebug(player);
        }
    } catch (error) {
        rbMessage(player, RB_COLOR + "c[Rival Battle] Command failed. Check the server log.");
        print("[RivalBattle Manager v3] trigger " + id + " error: " + error);
    }
}
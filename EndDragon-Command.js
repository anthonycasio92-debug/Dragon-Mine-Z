/*
============================================================
 EndDragon-Command
 Version: 1.0.0

 Tiny Global Player script — OWN tab, event: trigger ONLY.

 Why this exists:
 - Same pattern as Android conversion trigger 45.
 - Keeps /enddragon reliable even if the large End Dimension
   Strength tab errors, merges, or fails to load trigger().
 - Resolves the real player from arguments[0] (CMI asFakeOp!).
 - Queues a spawn request into world storeddata; End Dimension
   Strength.js picks it up on tick and runs EndDragonFight spawn.

 INSTALL:
   CustomNPCs → Global Player → NEW tab (only this file)
   Enable: trigger
   Reload scripts

 COMMAND / CMI:
   noppes script trigger 50 <PlayerName>
   asFakeOp! noppes script trigger 50 [playerName]
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");

var TRIGGER_ID = 50;
var WORLD_CMD_SPAWN_REQUEST = "end.strength.cmdSpawnRequest";
var COLOR = "\u00A7";

function logLine(text) {
    try { print("[EndDragon-Command] " + text); } catch (ignored) {}
}

function tell(player, text) {
    try { if (player != null) player.message(text); } catch (ignored) {}
}

function str(v) { return v == null ? "" : String(v); }

function nowMs() {
    try { return Number(new Date().getTime()); }
    catch (e) {
        try { return Number(Java.type("java.lang.System").currentTimeMillis()); }
        catch (e2) { return 0; }
    }
}

function getTargetName(event) {
    try {
        if (event.arguments != null && event.arguments.length > 0) {
            return str(event.arguments[0]).trim();
        }
    } catch (ignored1) {}
    try {
        if (event.args != null && event.args.length > 0) {
            return str(event.args[0]).trim();
        }
    } catch (ignored2) {}
    return "";
}

function findOnlinePlayer(name) {
    var wanted = str(name).toLowerCase();
    if (wanted === "") return null;
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var w = 0; w < worlds.length; w++) {
            var players = worlds[w].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                if (str(players[p].getName()).toLowerCase() === wanted) {
                    return players[p];
                }
            }
        }
    } catch (e) {}
    return null;
}

function queueSpawnRequest(playerName) {
    var payload = str(playerName) + "|" + nowMs() + "|command";
    var wrote = 0;
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                worlds[i].getStoreddata().put(WORLD_CMD_SPAWN_REQUEST, payload);
                wrote++;
            } catch (e1) {}
        }
    } catch (e2) {}
    return wrote > 0;
}

function trigger(event) {
    if (event == null) return;

    var id = -1;
    try { id = Number(event.id); } catch (eId) { id = -1; }
    if (id != TRIGGER_ID) return;

    var targetName = getTargetName(event);
    if (targetName.length === 0) {
        logLine("Missing player name. Use: noppes script trigger 50 PlayerName");
        return;
    }

    var player = findOnlinePlayer(targetName);
    if (player == null) {
        logLine("Online player not found: " + targetName);
        return;
    }

    var queued = queueSpawnRequest(str(player.getName()));
    if (queued) {
        tell(player, COLOR + "6[The End] " + COLOR + "eDragon spawn requested — processing...");
        logLine("Queued spawn for " + str(player.getName()));
    } else {
        tell(player, COLOR + "c[The End] Could not queue dragon spawn (no world storeddata).");
        logLine("Failed to queue spawn for " + str(player.getName()));
    }
}

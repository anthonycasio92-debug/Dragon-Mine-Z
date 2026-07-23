/*
============================================================
 End Dragon Forge Trigger Bridge
 Version: 1.0.0

 WHY THIS EXISTS:
 CustomNPCs only runs Global PLAYER script `trigger` when the
 command source entity is a real player (not null, not FakePlayer).

 So these do NOTHING for End Dimension Strength.js alone:
   - console:  noppes script trigger 50 <name>
   - CMI asFakeOp! noppes script trigger 50 [playerName]
   - command blocks / non-player sources

 This Forge script ALWAYS receives trigger events, then forwards
 trigger 50 to the target player's PlayerScriptData so
 End Dimension Strength.js function trigger() actually runs.

 INSTALL:
   CustomNPCs → Global → Forge Scripts
   - Own tab with ONLY this file
   - Enable Forge scripts
   - Event: trigger (SCRIPT_TRIGGER)

 ALSO REQUIRED:
   End Dimension Strength.js in Global Player (own tab)
   with events: tick, kill, trigger, damagedEntity
============================================================
*/

var NpcAPI = null;
try { NpcAPI = Java.type("noppes.npcs.api.NpcAPI"); } catch (e1) { NpcAPI = null; }

var END_DRAGON_TRIGGER_ID = 50;

function init(event) {
    try {
        print("[EndDragonForge] Trigger bridge v1.0.0 loaded (forwards trigger " +
            END_DRAGON_TRIGGER_ID + " to player scripts).");
    } catch (e) {}
}

function str(v) { return v == null ? "" : String(v); }

function isRealPlayerEntity(entity) {
    if (entity == null) return false;
    try {
        if (entity.getType() != 1) return false;
    } catch (e1) {
        return false;
    }
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return false;
        var FakePlayer = Java.type("net.minecraftforge.common.util.FakePlayer");
        if (mc instanceof FakePlayer) return false;
    } catch (e2) {}
    return true;
}

function findOnlinePlayer(name) {
    var wanted = str(name).toLowerCase();
    if (wanted === "" || NpcAPI == null) return null;
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

function argName(event) {
    try {
        if (event.arguments != null && event.arguments.length > 0) {
            return str(event.arguments[0]);
        }
    } catch (e1) {}
    try {
        if (event.args != null && event.args.length > 0) {
            return str(event.args[0]);
        }
    } catch (e2) {}
    return "";
}

/*
 * Forge SCRIPT_TRIGGER — runs for console / FakePlayer / real player.
 * If CNPC already delivered the event to a real player's scripts, skip.
 * Otherwise forward to the named online player's script handler.
 */
function trigger(event) {
    try {
        if (event == null) return;
        var id = -1;
        try { id = Math.floor(Number(event.id)); } catch (eId) { id = -1; }
        if (id !== END_DRAGON_TRIGGER_ID) return;

        /* Real player source → Global Player scripts already handled it. */
        if (isRealPlayerEntity(event.entity)) {
            try {
                print("[EndDragonForge] trigger 50 already handled via player source " +
                    str(event.entity.getName()));
            } catch (e0) {}
            return;
        }

        var playerName = argName(event);
        var player = findOnlinePlayer(playerName);
        if (player == null) {
            try {
                print("[EndDragonForge] trigger 50: no online player for '" +
                    playerName + "'. Usage: noppes script trigger 50 <PlayerName>");
            } catch (e1) {}
            return;
        }

        var mc = null;
        try { mc = player.getMCEntity(); } catch (e2) {}
        if (mc == null) {
            try { print("[EndDragonForge] trigger 50: missing MC entity for " + playerName); } catch (e3) {}
            return;
        }

        var PlayerData = Java.type("noppes.npcs.controllers.data.PlayerData");
        var EnumScriptType = Java.type("noppes.npcs.constants.EnumScriptType");
        var ScriptTriggerEvent = Java.type("noppes.npcs.api.event.WorldEvent$ScriptTriggerEvent");

        var world = null;
        try { world = event.world; } catch (e4) {}
        if (world == null) {
            try { world = player.getWorld(); } catch (e5) {}
        }

        var pos = null;
        try { pos = event.pos; } catch (e6) {}
        if (pos == null) {
            try { pos = player.getPos(); } catch (e7) {}
        }

        var args = null;
        try { args = event.arguments; } catch (e8) {}
        if (args == null) {
            args = [playerName];
        }

        var forwarded = new ScriptTriggerEvent(id, world, pos, player, args);
        var data = PlayerData.get(mc);
        if (data == null || data.scriptData == null) {
            try { print("[EndDragonForge] trigger 50: player has no scriptData"); } catch (e9) {}
            return;
        }

        try {
            print("[EndDragonForge] forwarding trigger 50 to player scripts for " +
                str(player.getName()));
        } catch (e10) {}

        data.scriptData.runScript(EnumScriptType.SCRIPT_TRIGGER, forwarded);
    } catch (error) {
        try { print("[EndDragonForge] trigger error: " + error); } catch (e) {}
    }
}

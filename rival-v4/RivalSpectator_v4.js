/*
============================================================
 DBZ Legacy Reborn - Rival Spectator V4
 Version: 4.1.0

 Phase 14 — Live updates while spectating an official battle.

 PLACE AS: Global Player Script
 EVENTS: tick

 Start spectating with /spectaterival <player> (trigger 230 via Router).
============================================================
*/

var RS_API = null;
function rsApi() {
    if (RS_API === null) RS_API = Java.type("noppes.npcs.api.NpcAPI");
    return RS_API;
}

var C = String.fromCharCode(167);
var CH_KEY = "dlr.rivalry.v4.challenges";

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

function loadCh() {
    try {
        var names = ["minecraft:overworld", "overworld"];
        for (var i = 0; i < names.length; i++) {
            var w = rsApi().Instance().getIWorld(names[i]);
            if (w == null) continue;
            var sd = w.getStoreddata();
            if (!sd.has(CH_KEY)) return null;
            return JSON.parse(str(sd.get(CH_KEY)));
        }
    } catch (e) {}
    return null;
}

function tick(event) {
    try {
        var player = event.player;
        if (!isPlayer(player)) return;
        var temp = player.getTempdata();
        if (!temp.has("rival.v4.spectateSession")) return;

        var until = num(temp.get("rival.v4.spectateUntil"), 0);
        if (now() > until) {
            try { temp.remove("rival.v4.spectateSession"); temp.remove("rival.v4.spectateUntil"); } catch (e) {}
            msg(player, C + "7Spectate ended.");
            return;
        }

        var last = 0;
        try { if (temp.has("rival.v4.spectate.tick")) last = num(temp.get("rival.v4.spectate.tick"), 0); } catch (e2) {}
        if (now() - last < 2000) return;
        try { temp.put("rival.v4.spectate.tick", String(now())); } catch (e3) {}

        var sid = str(temp.get("rival.v4.spectateSession"));
        var ch = loadCh();
        if (ch == null || ch.sessions == null || ch.sessions[sid] == null) {
            msg(player, C + "eBattle ended.");
            try { temp.remove("rival.v4.spectateSession"); } catch (e4) {}
            return;
        }
        var session = ch.sessions[sid];
        var a = (session.combat && session.combat[session.challengerUuid]) || {};
        var b = (session.combat && session.combat[session.opponentUuid]) || {};
        var left = session.state == "active"
            ? Math.max(0, Math.ceil((num(session.battleEndsAt, 0) - now()) / 1000))
            : 0;
        msg(player, C + "8[Spec] " + C + "f" + session.challengerName + " " + commas(a.damage || 0) +
            C + "8 vs " + C + "f" + session.opponentName + " " + commas(b.damage || 0) +
            (session.state == "active" ? C + "7 (" + left + "s)" : C + "7 [" + session.state + "]"));
    } catch (error) {
        try { print("[RivalSpectator] " + error); } catch (e) {}
    }
}

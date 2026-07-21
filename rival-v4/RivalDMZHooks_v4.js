/*
============================================================
 DBZ Legacy Reborn - Rival DMZ Hooks V4
 Version: 4.1.0

 Phase 17 + fusion bonus from adjusted design:
 If fused with a mutual rival, grant multiplicative offense bonus
 scaled by rivalry points, and split kill TP to both accounts.

 PLACE AS: Global Player Script
 EVENTS: tick, kill, logout, died

 Verified DMZ fields:
  Status.isFused(), isFusionLeader(), getFusionPartnerUUID()
  BonusStats.addBonus/removeBonus
  Resources.addTrainingPoints
============================================================
*/

var RF_StatsProvider = null;
var RF_StatsCap = null;
var RF_Sync = null;
var RF_Network = null;
var RF_API = null;

function rfApi() {
    if (RF_API === null) RF_API = Java.type("noppes.npcs.api.NpcAPI");
    return RF_API;
}
function rfStatsProvider() {
    if (RF_StatsProvider === null) RF_StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
    return RF_StatsProvider;
}
function rfStatsCap() {
    if (RF_StatsCap === null) RF_StatsCap = Java.type("com.dragonminez.common.stats.StatsCapability");
    return RF_StatsCap;
}
function rfSync() {
    if (RF_Sync === null) RF_Sync = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
    return RF_Sync;
}
function rfNetwork() {
    if (RF_Network === null) RF_Network = Java.type("com.dragonminez.common.network.NetworkHandler");
    return RF_Network;
}

var C = String.fromCharCode(167);
var DB_KEY = "dlr.rivalry.v4.database";
var BONUS_NAME = "Rival Fusion";
var TICK_MS = 1000;
var KILL_TP = 400;
var MAX_FUSION_BONUS = 0.25;

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

function loadDb() {
    try {
        var names = ["minecraft:overworld", "overworld"];
        for (var i = 0; i < names.length; i++) {
            var w = rfApi().Instance().getIWorld(names[i]);
            if (w == null) continue;
            var sd = w.getStoreddata();
            if (!sd.has(DB_KEY)) return null;
            return JSON.parse(str(sd.get(DB_KEY)));
        }
    } catch (e) {}
    return null;
}

function dmz(player) {
    try {
        return rfStatsProvider().get(rfStatsCap().INSTANCE, player.getMCEntity()).orElse(null);
    } catch (e) { return null; }
}

function clearBonus(data) {
    if (data == null) return;
    try {
        var b = data.getBonusStats();
        b.removeBonus("STR", BONUS_NAME);
        b.removeBonus("SKP", BONUS_NAME);
    } catch (e) {}
}

function applyBonus(player, data, mult) {
    if (data == null) return;
    try {
        var b = data.getBonusStats();
        clearBonus(data);
        if (mult <= 1.001) {
            rfNetwork().sendToTrackingEntityAndSelf(new (rfSync())(player.getMCEntity()), player.getMCEntity());
            return;
        }
        var strVal = 0;
        var skpVal = 0;
        try { strVal = Number(data.getCurrentStatValue("STR")); } catch (e1) {}
        try { skpVal = Number(data.getCurrentStatValue("SKP")); } catch (e2) {}
        var key = skpVal > strVal ? "SKP" : "STR";
        b.addBonus(key, BONUS_NAME, "*", mult);
        rfNetwork().sendToTrackingEntityAndSelf(new (rfSync())(player.getMCEntity()), player.getMCEntity());
    } catch (e) {}
}

function findByUuid(id) {
    try {
        var worlds = rfApi().Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            var players = worlds[i].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                if (uuid(players[p]) === id) return players[p];
            }
        }
    } catch (e) {}
    return null;
}

function mutualPoints(db, a, b) {
    if (db == null || db.players == null) return 0;
    var ra = db.players[a];
    var rb = db.players[b];
    if (ra == null || rb == null) return 0;
    var la = ra.rivals && ra.rivals[b];
    var lb = rb.rivals && rb.rivals[a];
    if (la == null || lb == null) return 0;
    if (la.mutual !== true || lb.mutual !== true) return 0;
    return Math.max(0, num(la.points, 0));
}

function fusionMult(points) {
    var bonus = Math.min(MAX_FUSION_BONUS, 0.05 + (Math.max(0, points) / 15000) * 0.20);
    return 1.0 + bonus;
}

function tick(event) {
    try {
        var player = event.player;
        if (!isPlayer(player)) return;
        var temp = player.getTempdata();
        var last = 0;
        try { if (temp.has("rival.v4.fusion.tick")) last = num(temp.get("rival.v4.fusion.tick"), 0); } catch (e) {}
        if (now() - last < TICK_MS) return;
        try { temp.put("rival.v4.fusion.tick", String(now())); } catch (e2) {}

        var data = dmz(player);
        if (data == null) return;
        var status = null;
        try { status = data.getStatus(); } catch (e3) { return; }
        if (status == null || status.isFused() !== true) {
            applyBonus(player, data, 1.0);
            try { temp.put("rival.v4.fusion.partner", ""); } catch (e4) {}
            return;
        }

        var partnerId = "";
        try { partnerId = str(status.getFusionPartnerUUID()); } catch (e5) {}
        if (partnerId === "") {
            applyBonus(player, data, 1.0);
            return;
        }

        var db = loadDb();
        var pts = mutualPoints(db, uuid(player), partnerId);
        if (pts <= 0) {
            applyBonus(player, data, 1.0);
            return;
        }

        var mult = fusionMult(pts);
        applyBonus(player, data, mult);
        try { temp.put("rival.v4.fusion.partner", partnerId); } catch (e6) {}
    } catch (error) {
        try { print("[RivalDMZHooks] tick " + error); } catch (e) {}
    }
}

function kill(event) {
    try {
        var killer = event.player;
        if (!isPlayer(killer)) return;
        var temp = killer.getTempdata();
        if (!temp.has("rival.v4.fusion.partner")) return;
        var partnerId = str(temp.get("rival.v4.fusion.partner"));
        if (partnerId === "") return;

        var data = dmz(killer);
        if (data == null) return;
        try {
            data.getResources().addTrainingPoints(KILL_TP);
            rfNetwork().sendToTrackingEntityAndSelf(new (rfSync())(killer.getMCEntity()), killer.getMCEntity());
            msg(killer, C + "a[Rival Fusion] +" + KILL_TP + " TP");
        } catch (e) {}

        var partner = findByUuid(partnerId);
        if (partner == null) return;
        var pdata = dmz(partner);
        if (pdata == null) return;
        try {
            pdata.getResources().addTrainingPoints(KILL_TP);
            rfNetwork().sendToTrackingEntityAndSelf(new (rfSync())(partner.getMCEntity()), partner.getMCEntity());
            msg(partner, C + "a[Rival Fusion] +" + KILL_TP + " TP (partner kill)");
        } catch (e2) {}
    } catch (error) {
        try { print("[RivalDMZHooks] kill " + error); } catch (e3) {}
    }
}

function logout(event) {
    try {
        if (!isPlayer(event.player)) return;
        applyBonus(event.player, dmz(event.player), 1.0);
    } catch (e) {}
}

function died(event) {
    try {
        if (!isPlayer(event.player)) return;
        applyBonus(event.player, dmz(event.player), 1.0);
    } catch (e) {}
}

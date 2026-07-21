/*
============================================================
 DBZ Legacy Reborn - Rival Instinct V4
 Version: 4.1.0

 Phase 2 — Passive sensing for rivals (jar-verified DMZ fields).

 PLACE AS: Global Player Script
 EVENTS: tick, login

 Uses:
  Status.isChargingKi(), isAuraActive(), isFused(), getFusionName()
  StatsData.getBattlePowerExact()
  Resources.getPowerRelease()
============================================================
*/

var RI_StatsProvider = null;
var RI_StatsCap = null;
var RI_API = null;

function riApi() {
    if (RI_API === null) RI_API = Java.type("noppes.npcs.api.NpcAPI");
    return RI_API;
}
function riStatsProvider() {
    if (RI_StatsProvider === null) RI_StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
    return RI_StatsProvider;
}
function riStatsCap() {
    if (RI_StatsCap === null) RI_StatsCap = Java.type("com.dragonminez.common.stats.StatsCapability");
    return RI_StatsCap;
}

var RI_COLOR = String.fromCharCode(167);
var RI_DB = "dlr.rivalry.v4.database";
var RI_TICK_MS = 1500;
var RI_ALERT_COOLDOWN_MS = 8000;

var RI_TIERS = [
    { min: 0,    range: 48,  relative: false, charging: false, battlePower: false, form: false, fusion: false, name: "Acquaintance" },
    { min: 100,  range: 64,  relative: true,  charging: false, battlePower: false, form: false, fusion: false, name: "Competitor" },
    { min: 300,  range: 80,  relative: true,  charging: true,  battlePower: false, form: false, fusion: false, name: "Adversary" },
    { min: 700,  range: 96,  relative: true,  charging: true,  battlePower: true,  form: false, fusion: false, name: "Rival" },
    { min: 1500, range: 128, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: false, name: "Nemesis" },
    { min: 3000, range: 160, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: true,  name: "Legendary" },
    { min: 5000, range: 176, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: true,  name: "Arch Rival" },
    { min: 7500, range: 192, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: true,  name: "Mortal Enemy" },
    { min: 10000,range: 208, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: true,  name: "Eternal Rival" },
    { min: 15000,range: 224, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: true,  name: "Mythic Rival" }
];

function riNow() {
    try { return Number(new Date().getTime()); }
    catch (e) { return Number(Java.type("java.lang.System").currentTimeMillis()); }
}
function riStr(v) { return v == null ? "" : String(v); }
function riNum(v, f) { var n = Number(v); return isNaN(n) || !isFinite(n) ? f : n; }
function riMsg(p, t) { try { p.message(t); } catch (e) {} }
function riUuid(p) { try { return riStr(p.getUUID()); } catch (e) { return ""; } }
function riIsPlayer(e) {
    if (e == null) return false;
    try { return Number(e.getType()) === 1; } catch (ex) { return false; }
}
function riDist(a, b) {
    try {
        var dx = a.getX() - b.getX();
        var dy = a.getY() - b.getY();
        var dz = a.getZ() - b.getZ();
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (e) { return 999999; }
}

function riTier(points) {
    var rp = Math.max(0, riNum(points, 0));
    var t = RI_TIERS[0];
    for (var i = 0; i < RI_TIERS.length; i++) if (rp >= RI_TIERS[i].min) t = RI_TIERS[i];
    return t;
}

function riWorld(player) {
    var names = ["minecraft:overworld", "overworld"];
    for (var i = 0; i < names.length; i++) {
        try {
            var w = riApi().Instance().getIWorld(names[i]);
            if (w != null) return w;
        } catch (e) {}
    }
    try { return player.getWorld(); } catch (e2) { return null; }
}

function riLoad(player) {
    try {
        var w = riWorld(player);
        if (w == null) return null;
        var sd = w.getStoreddata();
        if (!sd.has(RI_DB)) return null;
        return JSON.parse(riStr(sd.get(RI_DB)));
    } catch (e) { return null; }
}

function riDMZ(player) {
    try {
        return riStatsProvider().get(riStatsCap().INSTANCE, player.getMCEntity()).orElse(null);
    } catch (e) { return null; }
}

function riBP(data) {
    if (data == null) return 0;
    try {
        var exact = Number(data.getBattlePowerExact());
        if (!isNaN(exact) && exact > 0) return exact;
    } catch (e) {}
    try {
        var bp = Number(data.getBattlePower());
        if (!isNaN(bp) && bp > 0) return bp;
    } catch (e2) {}
    return 0;
}

function riRelease(data) {
    if (data == null) return 100;
    try {
        var r = Number(data.getResources().getPowerRelease());
        if (isNaN(r) || r <= 0) return 100;
        if (r <= 3) r *= 100;
        return Math.max(0, Math.min(200, r));
    } catch (e) { return 100; }
}

function riReleased(data) {
    return riBP(data) * (riRelease(data) / 100.0);
}

function riStatus(data) {
    try { return data.getStatus(); } catch (e) { return null; }
}

function riFind(uuid) {
    try {
        var worlds = riApi().Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            var players = worlds[i].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                if (riUuid(players[p]) === uuid) return players[p];
            }
        }
    } catch (e) {}
    return null;
}

function riFormat(n) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    var u = [
        { v: 1e15, s: "Q" }, { v: 1e12, s: "T" }, { v: 1e9, s: "B" },
        { v: 1e6, s: "M" }, { v: 1e3, s: "K" }
    ];
    for (var i = 0; i < u.length; i++) {
        if (Math.abs(n) >= u[i].v) return (n / u[i].v).toFixed(1).replace(/\.0$/, "") + u[i].s;
    }
    return String(Math.floor(n));
}

function riRelative(myBP, theirBP) {
    if (myBP <= 0 || theirBP <= 0) return "unknown";
    var ratio = theirBP / myBP;
    if (ratio >= 2.0) return "overwhelmingly stronger";
    if (ratio >= 1.25) return "stronger";
    if (ratio >= 0.8) return "evenly matched";
    if (ratio >= 0.5) return "weaker";
    return "far weaker";
}

function riAlert(temp, key, message, player) {
    var last = 0;
    try { if (temp.has(key)) last = riNum(temp.get(key), 0); } catch (e) {}
    if (riNow() - last < RI_ALERT_COOLDOWN_MS) return;
    try { temp.put(key, String(riNow())); } catch (e2) {}
    riMsg(player, message);
}

function riScan(player) {
    var db = riLoad(player);
    if (db == null) return;
    var record = db.players[riUuid(player)];
    if (record == null || record.rivals == null) return;

    var myData = riDMZ(player);
    var myReleased = riReleased(myData);
    var temp = player.getTempdata();

    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        var link = record.rivals[uuid];
        if (link.declaredByMe !== true && link.mutual !== true && link.declaredByThem !== true) continue;

        var rival = riFind(uuid);
        if (rival == null) continue;

        var tier = riTier(link.points);
        var dist = riDist(player, rival);
        if (dist > tier.range) continue;

        var rivalData = riDMZ(rival);
        var status = riStatus(rivalData);
        var theirReleased = riReleased(rivalData);

        riAlert(
            temp,
            "rival.v4.instinct.near." + uuid,
            RI_COLOR + "b[Rival Instinct] " + RI_COLOR + "f" + link.name +
            RI_COLOR + "7 sensed nearby (" + Math.floor(dist) + "m) " +
            RI_COLOR + "8[" + tier.name + "]",
            player
        );

        if (tier.relative) {
            riAlert(
                temp,
                "rival.v4.instinct.rel." + uuid,
                RI_COLOR + "b[Rival Instinct] " + RI_COLOR + "e" + link.name +
                RI_COLOR + "7 feels " + riRelative(myReleased, theirReleased),
                player
            );
        }

        if (tier.charging && status != null) {
            try {
                if (status.isChargingKi() === true) {
                    riAlert(
                        temp,
                        "rival.v4.instinct.charge." + uuid,
                        RI_COLOR + "c[Rival Instinct] " + RI_COLOR + "e" + link.name +
                        RI_COLOR + "c is charging ki!",
                        player
                    );
                }
            } catch (e) {}
        }

        if (tier.battlePower) {
            riAlert(
                temp,
                "rival.v4.instinct.bp." + uuid,
                RI_COLOR + "b[Rival Instinct] " + RI_COLOR + "e" + link.name +
                RI_COLOR + "7 released BP ~ " + RI_COLOR + "f" + riFormat(theirReleased),
                player
            );
        }

        if (tier.form && status != null) {
            try {
                if (status.isAuraActive() === true) {
                    riAlert(
                        temp,
                        "rival.v4.instinct.aura." + uuid,
                        RI_COLOR + "d[Rival Instinct] " + RI_COLOR + "e" + link.name +
                        RI_COLOR + "d aura spike detected!",
                        player
                    );
                }
            } catch (e2) {}
        }

        if (tier.fusion && status != null) {
            try {
                if (status.isFused() === true) {
                    var fname = "";
                    try { fname = riStr(status.getFusionName()); } catch (e3) {}
                    riAlert(
                        temp,
                        "rival.v4.instinct.fusion." + uuid,
                        RI_COLOR + "5[Rival Instinct] " + RI_COLOR + "e" + link.name +
                        RI_COLOR + "5 is fused" + (fname !== "" ? " (" + fname + ")" : "") + "!",
                        player
                    );
                }
            } catch (e4) {}
        }
    }
}

function tick(event) {
    try {
        var player = event.player;
        if (!riIsPlayer(player)) return;
        var temp = player.getTempdata();
        var last = 0;
        try { if (temp.has("rival.v4.instinct.tick")) last = riNum(temp.get("rival.v4.instinct.tick"), 0); } catch (e) {}
        if (riNow() - last < RI_TICK_MS) return;
        try { temp.put("rival.v4.instinct.tick", String(riNow())); } catch (e2) {}
        riScan(player);
    } catch (error) {
        try { print("[RivalInstinct] " + error); } catch (e3) {}
    }
}

function login(event) {
    try {
        if (!riIsPlayer(event.player)) return;
        riMsg(event.player, RI_COLOR + "8[Rival Instinct] Sensing online.");
    } catch (e) {}
}

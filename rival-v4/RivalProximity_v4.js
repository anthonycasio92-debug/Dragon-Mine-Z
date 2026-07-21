/*
============================================================
 DBZ Legacy Reborn - Rival Proximity V4
 Version: 4.0.0

 Passive near-rival bonuses, kill TP, anti-gank growth, and
 catch-up scaling. Patterned after Sparring TP System.

 PLACE AS:
 CustomNPCs Global Player Script

 REQUIRED EVENTS:
 - tick
 - damagedEntity
 - damaged
 - kill
 - logout
 - died

 Requires RivalCore_v4 database schema:
   dlr.rivalry.v4.database

 Disable RivalEvents V3 while testing.
============================================================
*/

/* ========================= JAVA TYPES ========================= */

var RIVAL_PROX_API = null;
var RIVAL_PROX_STATS_PROVIDER = null;
var RIVAL_PROX_STATS_CAP = null;
var RIVAL_PROX_SYNC = null;
var RIVAL_PROX_NETWORK = null;

function rpApi() {
    if (RIVAL_PROX_API === null) RIVAL_PROX_API = Java.type("noppes.npcs.api.NpcAPI");
    return RIVAL_PROX_API;
}
function rpStatsProvider() {
    if (RIVAL_PROX_STATS_PROVIDER === null) RIVAL_PROX_STATS_PROVIDER = Java.type("com.dragonminez.common.stats.StatsProvider");
    return RIVAL_PROX_STATS_PROVIDER;
}
function rpStatsCap() {
    if (RIVAL_PROX_STATS_CAP === null) RIVAL_PROX_STATS_CAP = Java.type("com.dragonminez.common.stats.StatsCapability");
    return RIVAL_PROX_STATS_CAP;
}
function rpSyncPacket() {
    if (RIVAL_PROX_SYNC === null) RIVAL_PROX_SYNC = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
    return RIVAL_PROX_SYNC;
}
function rpNetwork() {
    if (RIVAL_PROX_NETWORK === null) RIVAL_PROX_NETWORK = Java.type("com.dragonminez.common.network.NetworkHandler");
    return RIVAL_PROX_NETWORK;
}

/* ========================= CONFIGURATION ========================= */

var RP_DEBUG = false;
var RP_COLOR = String.fromCharCode(167);

var RP_DATABASE_KEY = "dlr.rivalry.v4.database";
var RP_BACKUP_KEY = "dlr.rivalry.v4.database.backup";

var RP_TICK_MS = 1000;
var RP_BONUS_NAME = "Rival Proximity";

/* Presence / sensing */
var RP_BASE_RANGE = 48;
var RP_RANGE_PER_TIER = 8;
var RP_MAX_RANGE = 160;

/* Offensive proximity bonus on highest of STR / SKP */
var RP_BASE_OFFENSE_BONUS = 0.03;      // +3% at Acquaintance
var RP_OFFENSE_PER_TIER = 0.02;        // +2% per tier above
var RP_PRESENCE_BONUS_CAP = 0.10;      // extra +10% from long presence
var RP_PRESENCE_FULL_MS = 10 * 60 * 1000;
var RP_MAX_OFFENSE_BONUS = 0.35;       // hard cap 35%

/* Catch-up: if your RP > theirs and they have higher BP */
var RP_CATCHUP_ENABLED = true;
var RP_CATCHUP_MAX = 0.25;             // up to +25% extra
var RP_CATCHUP_BP_RATIO = 1.25;        // rival must be at least 25% stronger

/* Passive RP from hanging out */
var RP_PRESENCE_RP_INTERVAL_MS = 60 * 1000;
var RP_PRESENCE_RP_MUTUAL = 3;
var RP_PRESENCE_RP_ONE_SIDED = 2;

/* Kill TP near rival */
var RP_KILL_TP_BASE = 250;
var RP_KILL_TP_PER_TIER = 75;
var RP_KILL_TP_MUTUAL_MULT = 1.35;
var RP_SHOW_KILL_TP = true;

/* Surpass rival BP award */
var RP_SURPASS_ENABLED = true;
var RP_SURPASS_TP = 5000;
var RP_SURPASS_COOLDOWN_MS = 30 * 60 * 1000;

/* One-sided underdog combat */
var RP_UNDERDOG_ENGAGE_TP = 150;
var RP_UNDERDOG_ENGAGE_COOLDOWN_MS = 15 * 1000;
var RP_UNDERDOG_DEATH_RP = 25;
var RP_UNDERDOG_WIN_TP = 4000;
var RP_UNDERDOG_WIN_RP = 40;

/* Anti-gank: weaker declarers (<= 40% of your released BP) */
var RP_ANTIGANK_RATIO = 0.40;
var RP_ANTIGANK_WITNESS_KILL_TP = 200;   // strong player kill TP bonus
var RP_ANTIGANK_WITNESS_RP = 4;         // weak rival RP for witnessing kills
var RP_ANTIGANK_HIT_TP = 80;            // weak rival TP when strong takes damage
var RP_ANTIGANK_HIT_RP = 2;
var RP_ANTIGANK_HIT_COOLDOWN_MS = 3000;
var RP_ANTIGANK_OFFENSE_BONUS = 0.08;   // weak rival offense near strong target

var RP_TIERS = [
    { min: 0,     name: "Acquaintance" },
    { min: 100,   name: "Competitor" },
    { min: 300,   name: "Adversary" },
    { min: 700,   name: "Rival" },
    { min: 1500,  name: "Nemesis" },
    { min: 3000,  name: "Legendary" },
    { min: 5000,  name: "Arch Rival" },
    { min: 7500,  name: "Mortal Enemy" },
    { min: 10000, name: "Eternal Rival" },
    { min: 15000, name: "Mythic Rival" }
];

/* ========================= HELPERS ========================= */

function rpNow() {
    try { return Number(new Date().getTime()); }
    catch (ignored) {
        try { return Number(Java.type("java.lang.System").currentTimeMillis()); }
        catch (ignored2) { return 0; }
    }
}

function rpString(value) {
    if (value === null || value === undefined) return "";
    return String(value);
}

function rpNumber(value, fallback) {
    var number = Number(value);
    return isNaN(number) || !isFinite(number) ? fallback : number;
}

function rpClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function rpMessage(player, message) {
    try {
        if (player !== null && player !== undefined) player.message(message);
    } catch (ignored) {}
}

function rpLog(message) {
    if (!RP_DEBUG) return;
    try { print("[RivalProximity v4] " + message); } catch (ignored) {}
}

function rpUuid(player) {
    try { return rpString(player.getUUID()); } catch (ignored) { return ""; }
}

function rpName(player) {
    try { return rpString(player.getName()); } catch (ignored) { return "Unknown"; }
}

function rpIsPlayer(entity) {
    if (entity === null || entity === undefined) return false;
    try { return Number(entity.getType()) === 1; } catch (ignored) { return false; }
}

function rpDistance(a, b) {
    try {
        var dx = a.getX() - b.getX();
        var dy = a.getY() - b.getY();
        var dz = a.getZ() - b.getZ();
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (ignored) {
        return 999999;
    }
}

function rpTierIndex(points) {
    var rp = Math.max(0, rpNumber(points, 0));
    var index = 0;
    for (var i = 0; i < RP_TIERS.length; i++) {
        if (rp >= RP_TIERS[i].min) index = i;
    }
    return index;
}

function rpCommas(value) {
    var number = Math.floor(rpNumber(value, 0));
    var raw = String(number);
    var out = "";
    while (raw.length > 3) {
        out = "," + raw.substring(raw.length - 3) + out;
        raw = raw.substring(0, raw.length - 3);
    }
    return raw + out;
}

/* ========================= DATABASE ========================= */

function rpDataWorld(fallbackPlayer) {
    var names = ["minecraft:overworld", "overworld"];
    for (var i = 0; i < names.length; i++) {
        try {
            var world = rpApi().Instance().getIWorld(names[i]);
            if (world !== null && world !== undefined) return world;
        } catch (ignored1) {}
    }
    try { return fallbackPlayer.getWorld(); } catch (ignored2) { return null; }
}

function rpLoadDatabase(player) {
    var world = rpDataWorld(player);
    if (world === null) return null;
    try {
        var stored = world.getStoreddata();
        if (!stored.has(RP_DATABASE_KEY)) return null;
        var database = JSON.parse(rpString(stored.get(RP_DATABASE_KEY)));
        if (database === null || typeof database !== "object") return null;
        if (database.players === null || typeof database.players !== "object") return null;
        return database;
    } catch (error) {
        rpLog("Database read failed: " + error);
        return null;
    }
}

function rpSaveDatabase(player, database) {
    var world = rpDataWorld(player);
    if (world === null) return;
    try {
        var stored = world.getStoreddata();
        database.updatedAt = rpNow();
        var json = JSON.stringify(database);
        if (stored.has(RP_DATABASE_KEY)) {
            stored.put(RP_BACKUP_KEY, rpString(stored.get(RP_DATABASE_KEY)));
        }
        stored.put(RP_DATABASE_KEY, json);
    } catch (error) {
        rpLog("Database save failed: " + error);
    }
}

function rpGetLink(record, rivalUuid) {
    if (record === null || record.rivals === null) return null;
    var link = record.rivals[rivalUuid];
    return link === null || link === undefined ? null : link;
}

function rpRecalcCareerRp(record) {
    var total = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        total += Math.max(0, rpNumber(record.rivals[uuid].points, 0));
    }
    if (record.career === null || typeof record.career !== "object") record.career = {};
    record.career.rivalPointsTotal = total;
    return total;
}

function rpAwardPoints(record, rivalUuid, amount, reason) {
    var link = rpGetLink(record, rivalUuid);
    if (link === null) return 0;
    amount = Math.floor(rpNumber(amount, 0));
    if (amount === 0) return 0;
    link.points = Math.max(0, rpNumber(link.points, 0) + amount);
    link.updatedAt = rpNow();
    if (!(link.history instanceof Array)) link.history = [];
    link.history.push({ time: rpNow(), type: amount >= 0 ? "rp_gain" : "rp_loss", note: reason + " (" + amount + ")" });
    while (link.history.length > 30) link.history.shift();
    rpRecalcCareerRp(record);
    return amount;
}

/* ========================= DMZ ========================= */

function rpGetDMZ(player) {
    try {
        var mcPlayer = player.getMCEntity();
        if (mcPlayer === null) return null;
        return rpStatsProvider().get(rpStatsCap().INSTANCE, mcPlayer).orElse(null);
    } catch (ignored) {
        return null;
    }
}

function rpInvokeNumber(object, methodNames, fallback) {
    if (object === null) return fallback;
    for (var i = 0; i < methodNames.length; i++) {
        try {
            var method = object.getClass().getMethod(methodNames[i]);
            var value = Number(method.invoke(object));
            if (!isNaN(value)) return value;
        } catch (ignored1) {}
        try {
            var direct = object[methodNames[i]];
            if (typeof direct === "function") {
                var directValue = Number(direct.call(object));
                if (!isNaN(directValue)) return directValue;
            }
        } catch (ignored2) {}
    }
    return fallback;
}

function rpGetBattlePower(data) {
    if (data === null) return 0;
    var direct = rpInvokeNumber(data, [
        "getBattlePowerExact",
        "getCurrentBattlePower",
        "getBattlePower",
        "getCurrentPower",
        "getPowerLevel",
        "getPower"
    ], -1);
    if (direct >= 0) return direct;
    try {
        var fromStats = rpInvokeNumber(data.getStats(), [
            "getBattlePowerExact", "getCurrentBattlePower", "getBattlePower"
        ], -1);
        if (fromStats >= 0) return fromStats;
    } catch (ignored) {}
    return 0;
}

function rpGetReleasePercent(data) {
    if (data === null) return 100.0;
    try {
        var release = Number(data.getResources().getPowerRelease());
        if (!isNaN(release) && release > 0) {
            if (release <= 3.0) release *= 100.0;
            return rpClamp(release, 0.0, 200.0);
        }
    } catch (ignored) {}
    return 100.0;
}

function rpGetReleasedBP(data) {
    var bp = rpGetBattlePower(data);
    var release = rpGetReleasePercent(data) / 100.0;
    return bp * release;
}

function rpGetStat(data, key) {
    if (data === null) return 0;
    try {
        return Math.max(0, rpNumber(data.getCurrentStatValue(key), 0));
    } catch (ignored1) {}
    try {
        var stats = data.getStats();
        if (key === "STR") return Math.max(0, rpNumber(stats.getStrength(), 0));
        if (key === "SKP") return Math.max(0, rpNumber(stats.getStrikePower(), 0));
    } catch (ignored2) {}
    return 0;
}

function rpHighestOffense(data) {
    var str = rpGetStat(data, "STR");
    var skp = rpGetStat(data, "SKP");
    if (skp > str) return { key: "SKP", value: skp };
    return { key: "STR", value: str };
}

function rpAwardTP(player, data, amount, reason) {
    try {
        amount = Math.floor(rpNumber(amount, 0));
        if (amount <= 0 || data === null) return false;
        var resources = data.getResources();
        if (resources === null) return false;
        resources.addTrainingPoints(amount);
        var mcPlayer = player.getMCEntity();
        rpNetwork().sendToTrackingEntityAndSelf(new (rpSyncPacket())(mcPlayer), mcPlayer);
        if (RP_SHOW_KILL_TP) {
            rpMessage(player, RP_COLOR + "a[Rival] +" + rpCommas(amount) + " TP" +
                (reason ? RP_COLOR + "7 (" + reason + ")" : ""));
        }
        return true;
    } catch (error) {
        rpMessage(player, RP_COLOR + "c[Rival] Failed to award TP: " + error);
        return false;
    }
}

function rpClearOffenseBonus(bonusStats) {
    try { bonusStats.removeBonus("STR", RP_BONUS_NAME); } catch (ignored1) {}
    try { bonusStats.removeBonus("SKP", RP_BONUS_NAME); } catch (ignored2) {}
}

function rpApplyOffenseBonus(player, data, multiplier) {
    if (data === null) return false;
    try {
        var bonusStats = data.getBonusStats();
        if (bonusStats === null) return false;

        rpClearOffenseBonus(bonusStats);

        multiplier = rpNumber(multiplier, 1.0);
        if (multiplier <= 1.001) {
            try {
                rpNetwork().sendToTrackingEntityAndSelf(
                    new (rpSyncPacket())(player.getMCEntity()),
                    player.getMCEntity()
                );
            } catch (ignoredSync) {}
            return false;
        }

        var offense = rpHighestOffense(data);
        bonusStats.addBonus(offense.key, RP_BONUS_NAME, "*", multiplier);

        try {
            rpNetwork().sendToTrackingEntityAndSelf(
                new (rpSyncPacket())(player.getMCEntity()),
                player.getMCEntity()
            );
        } catch (ignoredSync2) {}
        return true;
    } catch (error) {
        rpLog("Bonus apply failed: " + error);
        return false;
    }
}

/* ========================= ONLINE LOOKUP ========================= */

function rpFindOnlineByUuid(uuid) {
    try {
        var worlds = rpApi().Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                var players = worlds[i].getAllPlayers();
                for (var p = 0; p < players.length; p++) {
                    if (rpUuid(players[p]) === uuid) return players[p];
                }
            } catch (ignored) {}
        }
    } catch (error) {
        rpLog("Online lookup failed: " + error);
    }
    return null;
}

/* ========================= PROXIMITY MATH ========================= */

function rpRangeForPoints(points) {
    var tier = rpTierIndex(points);
    return Math.min(RP_MAX_RANGE, RP_BASE_RANGE + tier * RP_RANGE_PER_TIER);
}

function rpOffenseMultiplier(points, presenceMs, catchupExtra) {
    var tier = rpTierIndex(points);
    var base = RP_BASE_OFFENSE_BONUS + tier * RP_OFFENSE_PER_TIER;
    var presenceRatio = rpClamp(rpNumber(presenceMs, 0) / RP_PRESENCE_FULL_MS, 0, 1);
    var presence = presenceRatio * RP_PRESENCE_BONUS_CAP;
    var total = base + presence + rpNumber(catchupExtra, 0);
    total = rpClamp(total, 0, RP_MAX_OFFENSE_BONUS);
    return 1.0 + total;
}

function rpTemp(player) {
    return player.getTempdata();
}

function rpTempNumber(temp, key, fallback) {
    try {
        if (temp.has(key)) return rpNumber(temp.get(key), fallback);
    } catch (ignored) {}
    return fallback;
}

function rpTempPut(temp, key, value) {
    try { temp.put(key, rpString(value)); } catch (ignored) {}
}

/* ========================= CORE TICK ========================= */

function rpProcessPlayer(player) {
    var database = rpLoadDatabase(player);
    if (database === null) {
        rpApplyOffenseBonus(player, rpGetDMZ(player), 1.0);
        return;
    }

    var uuid = rpUuid(player);
    var record = database.players[uuid];
    if (record === null || record === undefined) {
        rpApplyOffenseBonus(player, rpGetDMZ(player), 1.0);
        return;
    }

    var data = rpGetDMZ(player);
    var myReleased = rpGetReleasedBP(data);
    var temp = rpTemp(player);
    var now = rpNow();

    var bestMultiplier = 1.0;
    var nearCount = 0;
    var dirty = false;

    for (var rivalUuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(rivalUuid)) continue;
        var link = record.rivals[rivalUuid];
        var rivalPlayer = rpFindOnlineByUuid(rivalUuid);
        if (rivalPlayer === null) continue;

        var range = rpRangeForPoints(link.points);
        var distance = rpDistance(player, rivalPlayer);
        if (distance > range) continue;

        nearCount++;
        link.lastSeenTogetherAt = now;
        link.presenceMs = rpNumber(link.presenceMs, 0) + RP_TICK_MS;
        if (record.career === null || typeof record.career !== "object") record.career = {};
        record.career.presenceMs = rpNumber(record.career.presenceMs, 0) + RP_TICK_MS;

        var rivalData = rpGetDMZ(rivalPlayer);
        var rivalReleased = rpGetReleasedBP(rivalData);
        var rivalRecord = database.players[rivalUuid];
        var theirLink = rivalRecord !== null && rivalRecord !== undefined
            ? rpGetLink(rivalRecord, uuid)
            : null;

        var catchup = 0;
        if (RP_CATCHUP_ENABLED && theirLink !== null) {
            var myRp = rpNumber(link.points, 0);
            var theirRp = rpNumber(theirLink.points, 0);
            if (myRp > theirRp && rivalReleased > myReleased * RP_CATCHUP_BP_RATIO && rivalReleased > 0) {
                var gap = (rivalReleased / Math.max(1, myReleased)) - 1.0;
                catchup = rpClamp(gap * 0.15, 0, RP_CATCHUP_MAX);
            }
        }

        var mult = rpOffenseMultiplier(link.points, link.presenceMs, catchup);

        /* Anti-gank offense for weak one-sided declarers targeting a stronger player */
        if (link.declaredByMe === true && myReleased > 0 && rivalReleased > 0) {
            if (myReleased <= rivalReleased * RP_ANTIGANK_RATIO) {
                mult = Math.max(mult, 1.0 + RP_ANTIGANK_OFFENSE_BONUS + rpTierIndex(link.points) * 0.01);
            }
        }

        if (mult > bestMultiplier) bestMultiplier = mult;

        /* Presence RP ticks */
        var presenceKey = "rival.v4.presenceRp." + rivalUuid;
        var lastPresenceRp = rpTempNumber(temp, presenceKey, 0);
        if (now - lastPresenceRp >= RP_PRESENCE_RP_INTERVAL_MS) {
            var presenceRp = link.mutual === true ? RP_PRESENCE_RP_MUTUAL : RP_PRESENCE_RP_ONE_SIDED;
            if (link.declaredByMe === true || link.mutual === true) {
                rpAwardPoints(record, rivalUuid, presenceRp, "presence");
                dirty = true;
            }
            rpTempPut(temp, presenceKey, now);
        }

        /* Surpass award */
        if (RP_SURPASS_ENABLED && rivalReleased > 0 && myReleased > rivalReleased) {
            var surpassKey = "rival.v4.surpass." + rivalUuid;
            var lastSurpass = rpTempNumber(temp, surpassKey, 0);
            if (now - lastSurpass >= RP_SURPASS_COOLDOWN_MS) {
                if (rpAwardTP(player, data, RP_SURPASS_TP, "Surpassed " + link.name)) {
                    record.career.surpassAwards = rpNumber(record.career.surpassAwards, 0) + 1;
                    rpTempPut(temp, surpassKey, now);
                    dirty = true;
                }
            }
        }
    }

    rpApplyOffenseBonus(player, data, bestMultiplier);

    if (nearCount > 0) {
        rpTempPut(temp, "rival.v4.nearCount", nearCount);
        rpTempPut(temp, "rival.v4.offenseMult", bestMultiplier.toFixed(3));
    } else {
        rpTempPut(temp, "rival.v4.nearCount", 0);
        rpTempPut(temp, "rival.v4.offenseMult", "1.000");
    }

    if (dirty) rpSaveDatabase(player, database);
}

/* ========================= COMBAT HOOKS ========================= */

function rpIsRivalOf(record, otherUuid) {
    return rpGetLink(record, otherUuid) !== null;
}

function rpHandleKillNearRivals(killer, victim) {
    var database = rpLoadDatabase(killer);
    if (database === null) return;

    var killerUuid = rpUuid(killer);
    var record = database.players[killerUuid];
    if (record === null || record === undefined) return;

    var killerData = rpGetDMZ(killer);
    var killerReleased = rpGetReleasedBP(killerData);
    var dirty = false;
    var victimIsPlayer = rpIsPlayer(victim);
    var victimUuid = victimIsPlayer ? rpUuid(victim) : "";

    /* Direct rival kill underdog win */
    if (victimIsPlayer) {
        var directLink = rpGetLink(record, victimUuid);
        if (directLink !== null && directLink.declaredByMe === true && directLink.mutual !== true) {
            var victimData = rpGetDMZ(victim);
            var victimReleased = rpGetReleasedBP(victimData);
            if (victimReleased > killerReleased) {
                rpAwardTP(killer, killerData, RP_UNDERDOG_WIN_TP, "Underdog victory vs " + directLink.name);
                rpAwardPoints(record, victimUuid, RP_UNDERDOG_WIN_RP, "underdog_win");
                dirty = true;
            }
        }
    }

    for (var rivalUuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(rivalUuid)) continue;
        if (victimIsPlayer && rivalUuid === victimUuid) continue;

        var link = record.rivals[rivalUuid];
        var rivalPlayer = rpFindOnlineByUuid(rivalUuid);
        if (rivalPlayer === null) continue;
        if (rpDistance(killer, rivalPlayer) > rpRangeForPoints(link.points)) continue;

        var tier = rpTierIndex(link.points);
        var tp = RP_KILL_TP_BASE + tier * RP_KILL_TP_PER_TIER;
        if (link.mutual === true) tp = Math.floor(tp * RP_KILL_TP_MUTUAL_MULT);

        rpAwardTP(killer, killerData, tp, "Near rival " + link.name);
        if (record.career === null || typeof record.career !== "object") record.career = {};
        record.career.killsNearRival = rpNumber(record.career.killsNearRival, 0) + 1;
        dirty = true;

        /* Anti-gank: if this rival is much weaker and has me declared, they gain from witnessing */
        var rivalRecord = database.players[rivalUuid];
        if (rivalRecord === null || rivalRecord === undefined) continue;
        var theirLink = rpGetLink(rivalRecord, killerUuid);
        if (theirLink === null || theirLink.declaredByMe !== true) continue;

        var rivalData = rpGetDMZ(rivalPlayer);
        var rivalReleased = rpGetReleasedBP(rivalData);
        if (killerReleased > 0 && rivalReleased <= killerReleased * RP_ANTIGANK_RATIO) {
            rpAwardTP(killer, killerData, RP_ANTIGANK_WITNESS_KILL_TP, "Rivals watching");
            rpAwardPoints(rivalRecord, killerUuid, RP_ANTIGANK_WITNESS_RP, "witness_kill");
            dirty = true;
        }
    }

    if (dirty) rpSaveDatabase(killer, database);
}

function rpHandleDamagedByRival(victim, attacker) {
    if (!rpIsPlayer(attacker)) return;

    var database = rpLoadDatabase(victim);
    if (database === null) return;

    var victimUuid = rpUuid(victim);
    var attackerUuid = rpUuid(attacker);
    var record = database.players[victimUuid];
    if (record === null || record === undefined) return;

    var link = rpGetLink(record, attackerUuid);
    if (link === null) return;

    var temp = rpTemp(victim);
    var now = rpNow();

    /* Underdog engage TP when fighting a stronger one-sided rival */
    if (link.declaredByMe === true && link.mutual !== true) {
        var myData = rpGetDMZ(victim);
        var theirData = rpGetDMZ(attacker);
        var myReleased = rpGetReleasedBP(myData);
        var theirReleased = rpGetReleasedBP(theirData);
        if (theirReleased > myReleased) {
            var engageKey = "rival.v4.engage." + attackerUuid;
            var last = rpTempNumber(temp, engageKey, 0);
            if (now - last >= RP_UNDERDOG_ENGAGE_COOLDOWN_MS) {
                rpAwardTP(victim, myData, RP_UNDERDOG_ENGAGE_TP, "Engaging rival");
                rpTempPut(temp, engageKey, now);
            }
        }
    }
}

function rpHandleStrongPlayerDamagedNearWeakRivals(victim) {
    var database = rpLoadDatabase(victim);
    if (database === null) return;

    var victimUuid = rpUuid(victim);
    var record = database.players[victimUuid];
    if (record === null || record === undefined) return;

    var victimData = rpGetDMZ(victim);
    var victimReleased = rpGetReleasedBP(victimData);
    if (victimReleased <= 0) return;

    var temp = rpTemp(victim);
    var now = rpNow();
    var hitKey = "rival.v4.antigankHit";
    var last = rpTempNumber(temp, hitKey, 0);
    if (now - last < RP_ANTIGANK_HIT_COOLDOWN_MS) return;

    var dirty = false;

    for (var rivalUuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(rivalUuid)) continue;
        var rivalRecord = database.players[rivalUuid];
        if (rivalRecord === null || rivalRecord === undefined) continue;

        var theirLink = rpGetLink(rivalRecord, victimUuid);
        if (theirLink === null || theirLink.declaredByMe !== true) continue;

        var rivalPlayer = rpFindOnlineByUuid(rivalUuid);
        if (rivalPlayer === null) continue;

        var myLink = record.rivals[rivalUuid];
        if (rpDistance(victim, rivalPlayer) > rpRangeForPoints(myLink.points)) continue;

        var rivalData = rpGetDMZ(rivalPlayer);
        var rivalReleased = rpGetReleasedBP(rivalData);
        if (rivalReleased > victimReleased * RP_ANTIGANK_RATIO) continue;

        rpAwardTP(rivalPlayer, rivalData, RP_ANTIGANK_HIT_TP, "Rival under fire");
        rpAwardPoints(rivalRecord, victimUuid, RP_ANTIGANK_HIT_RP, "target_hit");
        dirty = true;
    }

    if (dirty) {
        rpTempPut(temp, hitKey, now);
        rpSaveDatabase(victim, database);
    }
}

function rpHandleDeathToRival(victim, damageSource) {
    var attacker = null;
    try { attacker = damageSource; } catch (ignored) {}
    if (!rpIsPlayer(attacker)) {
        try {
            if (damageSource !== null && damageSource.getSourceEntity) {
                attacker = damageSource.getSourceEntity();
            }
        } catch (ignored2) {}
    }
    if (!rpIsPlayer(attacker)) return;

    var database = rpLoadDatabase(victim);
    if (database === null) return;

    var victimUuid = rpUuid(victim);
    var attackerUuid = rpUuid(attacker);
    var record = database.players[victimUuid];
    if (record === null || record === undefined) return;

    var link = rpGetLink(record, attackerUuid);
    if (link === null) return;
    if (link.declaredByMe !== true) return;

    var myData = rpGetDMZ(victim);
    var theirData = rpGetDMZ(attacker);
    if (rpGetReleasedBP(theirData) > rpGetReleasedBP(myData)) {
        rpAwardPoints(record, attackerUuid, RP_UNDERDOG_DEATH_RP, "died_to_stronger_rival");
        rpSaveDatabase(victim, database);
        rpMessage(victim, RP_COLOR + "e[Rival] +" + RP_UNDERDOG_DEATH_RP + " RP for falling to " + link.name);
    }
}

/* ========================= EVENTS ========================= */

function tick(event) {
    try {
        var player = event.player;
        if (!rpIsPlayer(player)) return;

        var temp = rpTemp(player);
        var now = rpNow();
        var last = rpTempNumber(temp, "rival.v4.tick", 0);
        if (now - last < RP_TICK_MS) return;
        rpTempPut(temp, "rival.v4.tick", now);

        rpProcessPlayer(player);
    } catch (error) {
        rpLog("tick failed: " + error);
    }
}

function damagedEntity(event) {
    try {
        var attacker = event.player;
        var target = event.target;
        if (!rpIsPlayer(attacker) || target === null) return;
        if (rpIsPlayer(target)) {
            rpHandleDamagedByRival(target, attacker);
        }
    } catch (error) {
        rpLog("damagedEntity failed: " + error);
    }
}

function damaged(event) {
    try {
        var victim = event.player;
        if (!rpIsPlayer(victim)) return;

        var source = null;
        try { source = event.source; } catch (ignored) {}
        if (rpIsPlayer(source)) {
            rpHandleDamagedByRival(victim, source);
        }

        rpHandleStrongPlayerDamagedNearWeakRivals(victim);
    } catch (error) {
        rpLog("damaged failed: " + error);
    }
}

function kill(event) {
    try {
        var killer = event.player;
        var victim = event.entity;
        if (!rpIsPlayer(killer) || victim === null) return;
        rpHandleKillNearRivals(killer, victim);
    } catch (error) {
        rpLog("kill failed: " + error);
    }
}

function died(event) {
    try {
        var victim = event.player;
        if (!rpIsPlayer(victim)) return;
        var source = null;
        try { source = event.source; } catch (ignored) {}
        rpHandleDeathToRival(victim, source);

        var data = rpGetDMZ(victim);
        rpApplyOffenseBonus(victim, data, 1.0);
    } catch (error) {
        rpLog("died failed: " + error);
    }
}

function logout(event) {
    try {
        var player = event.player;
        if (!rpIsPlayer(player)) return;
        var data = rpGetDMZ(player);
        rpApplyOffenseBonus(player, data, 1.0);
    } catch (error) {
        rpLog("logout failed: " + error);
    }
}

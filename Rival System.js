/*
============================================================
 DBZ Legacy Reborn - Rival System V4
 Version: 4.7.4

 Combined Global Player gameplay modules (like Sparring TP System).

 PLACE AS:
 CustomNPCs Global Player Script

 REQUIRED EVENTS:
 - init
 - login
 - tick
 - damagedEntity
 - damaged
 - kill
 - died
 - logout
 - trigger   (admin refresh id 240 only)

 COMMANDS:
 Rival Command Handler.js (script-slot) owns ALL player commands.
 This file owns gameplay only: proximity TP, challenges, death
 Nemesis tracking, Instinct, progression.

 Intended rivalry path:
   /rival <player>           silent Unknown (they see nothing)
   both silent               Declared (both see each other)
   /rival declare <player>   visible notify; accept/decline/ignore
   both declare or accept    Mutual (benefits both ways)
   Mutual + 3+ death/KO      Nemesis (timer/damage wins do NOT count)

 Changelog (4.7.2 consolidate):
 - Keeps declare-status path: silent Unknown, declare Mutual,
   Nemesis after 3+ mutual death/KO losses only.
 - Nearby rival TP capped at 2 + requires recent mob kill (30s).
 - Rival TP awards scaled to 60%.
 - Challenge planned-duration helpers + long-fight live score cadence.
 - tpmsg kill-chat toggle + HP-based challenge damage retained.

 NPC:
 Use RivalNPC_v4.js on the Rival Master NPC.

 This file merges:
  Core, Proximity, Challenge, Instinct, Progression,
  Spectator, DMZ/Fusion hooks.
============================================================
*/


/* ========================= CORE ========================= */

/* ========================= JAVA TYPES ========================= */

/*
 CustomNPCs Global Player scripts can clash on names like RC_SYSTEM /
 RC_System / System. Keep API lazy and avoid a top-level System binding.
*/
var RIVAL_CORE_API = null;

function rcApi() {
    if (RIVAL_CORE_API === null) {
        RIVAL_CORE_API = Java.type("noppes.npcs.api.NpcAPI");
    }
    return RIVAL_CORE_API;
}

/* ========================= CONFIGURATION ========================= */

var RC_DEBUG = false;
var RC_VERSION = 4;
var RC_COLOR = "\u00A7";

/*
 Rival relationship statuses (per-link) - must match Command Handler:
  unknown  - silent /rival one-sided, or pending visible declare
  declared - both players silently /rival each other
  mutual   - both /rival declare (or accept); max RC_MAX_MUTUAL_RIVALS
  nemesis  - mutual + 3 or more DEATH losses to that rival (one per player)

 Benefits require declaredByMe (you rivaled them). Incoming-only links
 get no presence TP. Damage/timer losses never crown a Nemesis.
*/
var RC_NEMESIS_DEATH_LOSSES = 3;
var RC_MAX_MUTUAL_RIVALS = 2;
var RC_REQUEST_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
var RC_DECLARE_COOLDOWN_MS = 30 * 1000;
var RC_HISTORY_LIMIT = 30;
var RC_MS_PER_DAY = 24 * 60 * 60 * 1000;

var RC_DATABASE_KEY = "dlr.rivalry.v4.database";
var RC_BACKUP_KEY = "dlr.rivalry.v4.database.backup";

/* RP rank tiers (NOT the Mutual "Nemesis" relationship status). */
var RC_TIERS = [
    { min: 0,     name: "Acquaintance",  color: "7" },
    { min: 100,   name: "Competitor",    color: "a" },
    { min: 300,   name: "Adversary",     color: "2" },
    { min: 700,   name: "Rival",         color: "e" },
    { min: 1500,  name: "Vendetta",      color: "6" },
    { min: 3000,  name: "Legendary",     color: "c" },
    { min: 5000,  name: "Arch Rival",    color: "d" },
    { min: 7500,  name: "Mortal Enemy",  color: "5" },
    { min: 10000, name: "Eternal Rival", color: "b" },
    { min: 15000, name: "Mythic Rival",  color: "4" }
];

/* ========================= BASIC HELPERS ========================= */

function rcNow() {
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
            var world = rcApi().Instance().getIWorld(names[i]);
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
        nemesisUuid: "",
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
    career.lastSurpassAt = rcNumber(career.lastSurpassAt, 0);
    return career;
}

function rcLinkStatus(link) {
    if (link === null || link === undefined) return "none";
    if (link.mutual === true) {
        /*
         * Never trust a stale isNemesis flag from older history-based
         * builds. Nemesis requires Mutual + 3 death losses.
         */
        if (link.isNemesis === true &&
            rcNumber(link.deathLosses, 0) >= RC_NEMESIS_DEATH_LOSSES) {
            return "nemesis";
        }
        return "mutual";
    }
    /* Declared = both silent, with no visible declare still in flight. */
    if (link.declaredByMe === true && link.declaredByThem === true &&
        link.inviteSent !== true && link.inviteReceived !== true) {
        return "declared";
    }
    /* Visible /rival declare pending (sent or received). */
    if (link.inviteSent === true || link.inviteReceived === true) {
        return "pending";
    }
    /* Silent one-sided Unknown. */
    if (link.declaredByMe === true || link.declaredByThem === true) {
        return "unknown";
    }
    return "none";
}

function rcLinkStatusLabel(status) {
    if (status === "nemesis") return RC_COLOR + "c" + RC_COLOR + "lNemesis" + RC_COLOR + "r";
    if (status === "mutual") return RC_COLOR + "6Mutual" + RC_COLOR + "r";
    if (status === "declared") return RC_COLOR + "eDeclared" + RC_COLOR + "r";
    if (status === "pending") return RC_COLOR + "dPending" + RC_COLOR + "r";
    if (status === "unknown") return RC_COLOR + "7Unknown" + RC_COLOR + "r";
    return RC_COLOR + "8None" + RC_COLOR + "r";
}

function rcRefreshLinkStatus(link) {
    if (link === null || link === undefined) return "none";
    link.status = rcLinkStatus(link);
    return link.status;
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
    link.currentStreak = rcNumber(link.currentStreak, 0);
    link.bestStreak = rcNumber(link.bestStreak, 0);
    link.damageDealt = rcNumber(link.damageDealt, 0);
    link.damageTaken = rcNumber(link.damageTaken, 0);
    link.timeFoughtMs = rcNumber(link.timeFoughtMs, 0);
    link.battles = rcNumber(link.battles, link.wins + link.losses + link.draws);
    link.deathLosses = rcNumber(link.deathLosses, 0);
    link.deathWins = rcNumber(link.deathWins, 0);
    /* Drop legacy random/history Nemesis unless death threshold is met. */
    link.isNemesis = link.mutual === true &&
        link.deathLosses >= RC_NEMESIS_DEATH_LOSSES &&
        link.isNemesis === true;
    link.presenceMs = rcNumber(link.presenceMs, 0);
    link.createdAt = rcNumber(link.createdAt, rcNow());
    link.firstMetAt = rcNumber(link.firstMetAt, link.createdAt);
    link.firstBattleAt = rcNumber(link.firstBattleAt, 0);
    link.updatedAt = rcNumber(link.updatedAt, rcNow());
    link.mutualSince = rcNumber(link.mutualSince, 0);
    link.lastBattleAt = rcNumber(link.lastBattleAt, 0);
    link.lastSeenTogetherAt = rcNumber(link.lastSeenTogetherAt, 0);
    link.lastSurpassAt = rcNumber(link.lastSurpassAt, 0);
    link.surpassWasBelow = link.surpassWasBelow === true;
    link.provingGrounds = pgNormalize(link.provingGrounds);
    if (!(link.history instanceof Array)) link.history = [];
    rcRefreshLinkStatus(link);
    return link;
}

/* ========================= PROVING GROUNDS ========================= */

var PG_ENABLED = true;
var PG_RADIUS = 48;
var PG_TIER2_WINS = 5;
var PG_TIER3_WINS = 15;
var PG_ON_GROUNDS_TP_MULT = 1.35;
var PG_UNDERDOG_TP_MULT = 1.25;
var PG_ON_GROUNDS_RP_BONUS = 12;
var PG_RECLAIM_TP = 12000;
var PG_RECLAIM_RP = 45;
var PG_CHALLENGE_TP_BONUS = 0.40;
var PG_UNDERDOG_OFFENSE = 1.12;
var PG_UNDERDOG_BONUS_NAME = "RivalProvingUnderdog";

function pgFresh() {
    return {
        active: false,
        name: "",
        biome: "",
        dim: "",
        x: 0,
        y: 0,
        z: 0,
        radius: PG_RADIUS,
        championUuid: "",
        championName: "",
        claimedAt: 0,
        battles: 0,
        championWins: 0,
        damageTotal: 0,
        longestFightMs: 0,
        strongestHit: 0,
        tier: 0,
        lastBattleAt: 0
    };
}

function pgNormalize(pg) {
    if (pg === null || typeof pg !== "object") return pgFresh();
    var out = pgFresh();
    out.active = pg.active === true;
    out.name = rcString(pg.name);
    out.biome = rcString(pg.biome);
    out.dim = rcString(pg.dim);
    out.x = rcNumber(pg.x, 0);
    out.y = rcNumber(pg.y, 0);
    out.z = rcNumber(pg.z, 0);
    out.radius = Math.max(16, rcNumber(pg.radius, PG_RADIUS));
    out.championUuid = rcString(pg.championUuid);
    out.championName = rcString(pg.championName);
    out.claimedAt = rcNumber(pg.claimedAt, 0);
    out.battles = rcNumber(pg.battles, 0);
    out.championWins = rcNumber(pg.championWins, 0);
    out.damageTotal = rcNumber(pg.damageTotal, 0);
    out.longestFightMs = rcNumber(pg.longestFightMs, 0);
    out.strongestHit = rcNumber(pg.strongestHit, 0);
    out.tier = rcNumber(pg.tier, 0);
    out.lastBattleAt = rcNumber(pg.lastBattleAt, 0);
    if (out.active && out.tier <= 0) out.tier = pgComputeTier(out.championWins);
    return out;
}

function pgComputeTier(championWins) {
    var w = rcNumber(championWins, 0);
    if (w >= PG_TIER3_WINS) return 3;
    if (w >= PG_TIER2_WINS) return 2;
    if (w >= 1) return 1;
    return 0;
}

function pgTierName(tier) {
    if (tier >= 3) return "Legendary Proving Grounds";
    if (tier >= 2) return "Dominant Grounds";
    if (tier >= 1) return "Claimed Proving Grounds";
    return "Unclaimed";
}

function pgBattlefieldName(biome, dim) {
    var b = rcLower(biome);
    var d = rcLower(dim);
    if (d.indexOf("nether") >= 0 || b.indexOf("nether") >= 0 || b.indexOf("soul") >= 0 || b.indexOf("crimson") >= 0 || b.indexOf("warped") >= 0) {
        return "Hell";
    }
    if (d.indexOf("end") >= 0 || b.indexOf("end") >= 0) return "Kami's Lookout";
    if (b.indexOf("desert") >= 0 || b.indexOf("badlands") >= 0 || b.indexOf("eroded") >= 0) return "Rocky Wastelands";
    if (b.indexOf("ocean") >= 0 || b.indexOf("beach") >= 0 || b.indexOf("river") >= 0) return "Planet Namek";
    if (b.indexOf("mushroom") >= 0) return "Beerus' Planet";
    if (b.indexOf("plains") >= 0 || b.indexOf("sunflower") >= 0) return "the Tournament Arena";
    if (b.indexOf("jungle") >= 0) return "the Sacred Land";
    if (b.indexOf("taiga") >= 0 || b.indexOf("snow") >= 0 || b.indexOf("ice") >= 0 || b.indexOf("frozen") >= 0) {
        return "the Northern Mountains";
    }
    if (b.indexOf("swamp") >= 0 || b.indexOf("mangrove") >= 0) return "the Dark Wetlands";
    if (b.indexOf("forest") >= 0 || b.indexOf("grove") >= 0) return "the Whispering Woods";
    if (b.indexOf("mountain") >= 0 || b.indexOf("peak") >= 0 || b.indexOf("stony") >= 0) {
        return "the High Cliffs";
    }
    if (b.indexOf("cherry") >= 0) return "the Sacred Blossoms";
    var clean = rcString(biome).replace(/^minecraft:/i, "").replace(/_/g, " ");
    if (clean === "") clean = "Unknown Lands";
    return clean;
}

function pgDisplayName(pg) {
    if (pg === null || pg.active !== true) return "-";
    var place = rcString(pg.name);
    if (place === "") place = "Unknown Lands";
    if (place.indexOf("the ") === 0 || place.indexOf("The ") === 0) {
        return "Proving Grounds of " + place;
    }
    if (place === "Hell" || place === "Kami's Lookout" || place === "Planet Namek" ||
        place.indexOf("'") >= 0) {
        return "Proving Grounds of " + place;
    }
    return "Proving Grounds of the " + place;
}

function pgShortPlace(pg) {
    if (pg === null || pg.active !== true) return "-";
    var place = rcString(pg.name);
    return place === "" ? "Unknown Lands" : place;
}

function pgCaptureLocation(player) {
    var out = { x: 0, y: 0, z: 0, biome: "", dim: "", name: "Unknown Lands" };
    if (player === null) return out;
    try {
        out.x = Math.floor(Number(player.getX()));
        out.y = Math.floor(Number(player.getY()));
        out.z = Math.floor(Number(player.getZ()));
        var world = player.getWorld();
        if (world != null) {
            try { out.biome = rcString(world.getBiomeName(out.x, out.z)); } catch (e1) {}
            try { out.dim = rcString(world.getDimension().getId()); } catch (e2) {
                try { out.dim = rcString(world.getName()); } catch (e3) {}
            }
        }
        out.name = pgBattlefieldName(out.biome, out.dim);
    } catch (e) {}
    return out;
}

function pgSameDim(player, pg) {
    if (player === null || pg === null) return false;
    try {
        var dim = rcString(player.getWorld().getDimension().getId());
        return rcLower(dim) === rcLower(pg.dim) || pg.dim === "";
    } catch (e) {
        return true;
    }
}

function pgOnGrounds(player, pg) {
    if (PG_ENABLED !== true || player === null || pg === null || pg.active !== true) return false;
    if (!pgSameDim(player, pg)) return false;
    try {
        var dx = Number(player.getX()) - pg.x;
        var dz = Number(player.getZ()) - pg.z;
        return Math.sqrt(dx * dx + dz * dz) <= rcNumber(pg.radius, PG_RADIUS);
    } catch (e) {
        return false;
    }
}

function pgSyncPair(aLink, bLink, pg) {
    var copy = pgNormalize(pg);
    aLink.provingGrounds = pgNormalize(copy);
    bLink.provingGrounds = pgNormalize(copy);
}

function pgClearUnderdogBonus(player) {
    try {
        var data = rpGetDMZ(player);
        if (data == null) return;
        data.getBonusStats().removeBonus("STR", PG_UNDERDOG_BONUS_NAME);
        data.getBonusStats().removeBonus("SKP", PG_UNDERDOG_BONUS_NAME);
    } catch (e) {}
}

function pgApplyUnderdogBonus(player) {
    try {
        var data = rpGetDMZ(player);
        if (data == null) return;
        var bonus = data.getBonusStats();
        try { bonus.removeBonus("STR", PG_UNDERDOG_BONUS_NAME); } catch (e1) {}
        try { bonus.removeBonus("SKP", PG_UNDERDOG_BONUS_NAME); } catch (e2) {}
        var offense = rpHighestOffense(data);
        bonus.addBonus(offense.key, PG_UNDERDOG_BONUS_NAME, "*", PG_UNDERDOG_OFFENSE);
        try {
            rpNetwork().sendToTrackingEntityAndSelf(
                new (rpSyncPacket())(player.getMCEntity()),
                player.getMCEntity()
            );
        } catch (e3) {}
    } catch (e) {}
}

/*
 Official rival battle outcome -> create / strengthen / reclaim Proving Grounds.
 Returns reward flags used by chApplyRewards.
*/
function pgProcessBattle(winnerPlayer, loserPlayer, winnerRecord, loserRecord, wCombat, lCombat, battleDuration) {
    var out = {
        onGrounds: false,
        created: false,
        reclaimed: false,
        strengthened: false,
        tierUp: false,
        winnerWasUnderdog: false,
        oldChampionName: "",
        pg: null
    };
    if (PG_ENABLED !== true || winnerRecord === null || loserRecord === null) return out;

    var wLink = winnerRecord.rivals[loserRecord.uuid];
    var lLink = loserRecord.rivals[winnerRecord.uuid];
    if (wLink === null || wLink === undefined || lLink === null || lLink === undefined) return out;

    var pg = pgNormalize(wLink.provingGrounds);
    var now = rcNow();
    var totalDmg = rcNumber(wCombat.damage, 0) + rcNumber(lCombat.damage, 0);
    var bestHit = Math.max(rcNumber(wCombat.biggestHit, 0), rcNumber(lCombat.biggestHit, 0));
    var duration = Math.max(0, rcNumber(battleDuration, 0));

    if (pg.active !== true) {
        var loc = pgCaptureLocation(winnerPlayer !== null ? winnerPlayer : loserPlayer);
        pg.active = true;
        pg.name = loc.name;
        pg.biome = loc.biome;
        pg.dim = loc.dim;
        pg.x = loc.x;
        pg.y = loc.y;
        pg.z = loc.z;
        pg.radius = PG_RADIUS;
        pg.championUuid = winnerRecord.uuid;
        pg.championName = winnerRecord.name;
        pg.claimedAt = now;
        pg.battles = 1;
        pg.championWins = 1;
        pg.damageTotal = totalDmg;
        pg.longestFightMs = duration;
        pg.strongestHit = bestHit;
        pg.tier = 1;
        pg.lastBattleAt = now;
        pgSyncPair(wLink, lLink, pg);
        out.created = true;
        out.pg = pg;

        if (loserPlayer !== null) {
            rcMessage(loserPlayer, RC_COLOR + "c[Proving Grounds] " + RC_COLOR + "7Defeat marked " +
                RC_COLOR + "e" + pgDisplayName(pg) + RC_COLOR + "7.");
            rcMessage(loserPlayer, RC_COLOR + "8Return here to face " + winnerRecord.name + " for greater rewards.");
        }
        if (winnerPlayer !== null) {
            rcMessage(winnerPlayer, RC_COLOR + "6[Proving Grounds] " + RC_COLOR + "7You claimed " +
                RC_COLOR + "e" + pgDisplayName(pg) + RC_COLOR + "7.");
            rcMessage(winnerPlayer, RC_COLOR + "8Tier I - " + pgTierName(1) + ". Defend your claim.");
        }
        return out;
    }

    var onGrounds = false;
    if (winnerPlayer !== null && pgOnGrounds(winnerPlayer, pg)) onGrounds = true;
    if (loserPlayer !== null && pgOnGrounds(loserPlayer, pg)) onGrounds = true;
    out.onGrounds = onGrounds;
    out.pg = pg;

    if (!onGrounds) return out;

    out.winnerWasUnderdog = rcString(pg.championUuid) !== "" &&
        rcString(pg.championUuid) !== winnerRecord.uuid;

    pg.battles = rcNumber(pg.battles, 0) + 1;
    pg.damageTotal = rcNumber(pg.damageTotal, 0) + totalDmg;
    pg.longestFightMs = Math.max(rcNumber(pg.longestFightMs, 0), duration);
    pg.strongestHit = Math.max(rcNumber(pg.strongestHit, 0), bestHit);
    pg.lastBattleAt = now;

    if (out.winnerWasUnderdog) {
        out.reclaimed = true;
        out.oldChampionName = rcString(pg.championName) || "their rival";
        pg.championUuid = winnerRecord.uuid;
        pg.championName = winnerRecord.name;
        pg.championWins = 1;
        pg.claimedAt = now;
        pg.tier = 1;
        pgSyncPair(wLink, lLink, pg);

        if (winnerPlayer !== null) {
            rcMessage(winnerPlayer, RC_COLOR + "a[Proving Grounds] " + RC_COLOR + "eYou have reclaimed your honor.");
            rcMessage(winnerPlayer, RC_COLOR + "7" + pgDisplayName(pg) + RC_COLOR + "8 is yours again.");
        }
        if (loserPlayer !== null) {
            rcMessage(loserPlayer, RC_COLOR + "c[Proving Grounds] " + RC_COLOR + "7" +
                winnerRecord.name + " reclaimed these grounds from you.");
        }
        chBroadcast(CH_COLOR + "8--------------------------------");
        chBroadcast(CH_COLOR + "6[Proving Grounds] " + CH_COLOR + "e" + winnerRecord.name +
            CH_COLOR + "7 has reclaimed the grounds from " +
            CH_COLOR + "c" + out.oldChampionName + CH_COLOR + "7!");
        chBroadcast(CH_COLOR + "8" + pgDisplayName(pg));
        chBroadcast(CH_COLOR + "8--------------------------------");
        return out;
    }

    var oldTier = rcNumber(pg.tier, 1);
    pg.championWins = rcNumber(pg.championWins, 0) + 1;
    pg.tier = pgComputeTier(pg.championWins);
    out.strengthened = true;
    out.tierUp = pg.tier > oldTier;
    pgSyncPair(wLink, lLink, pg);

    if (winnerPlayer !== null) {
        rcMessage(winnerPlayer, RC_COLOR + "6[Proving Grounds] " + RC_COLOR + "7Your claim grows stronger. " +
            RC_COLOR + "e" + pgTierName(pg.tier) +
            RC_COLOR + "8 (" + pg.championWins + " wins here)");
        if (out.tierUp) {
            rcMessage(winnerPlayer, RC_COLOR + "aTier up! " + RC_COLOR + "e" + pgTierName(pg.tier));
        }
    }
    if (loserPlayer !== null) {
        rcMessage(loserPlayer, RC_COLOR + "c[Proving Grounds] " + RC_COLOR + "7Your rival's dominance over these grounds grows stronger.");
    }
    return out;
}

function pgTouchDraw(playerA, playerB, recordA, recordB, combatA, combatB, battleDuration) {
    if (PG_ENABLED !== true || recordA === null || recordB === null) return;
    var linkA = recordA.rivals[recordB.uuid];
    var linkB = recordB.rivals[recordA.uuid];
    if (linkA === null || linkA === undefined || linkB === null || linkB === undefined) return;
    var pg = pgNormalize(linkA.provingGrounds);
    if (pg.active !== true) return;
    var on = (playerA !== null && pgOnGrounds(playerA, pg)) ||
        (playerB !== null && pgOnGrounds(playerB, pg));
    if (!on) return;
    pg.battles = rcNumber(pg.battles, 0) + 1;
    pg.damageTotal = rcNumber(pg.damageTotal, 0) +
        rcNumber(combatA.damage, 0) + rcNumber(combatB.damage, 0);
    pg.longestFightMs = Math.max(rcNumber(pg.longestFightMs, 0), rcNumber(battleDuration, 0));
    pg.strongestHit = Math.max(
        rcNumber(pg.strongestHit, 0),
        Math.max(rcNumber(combatA.biggestHit, 0), rcNumber(combatB.biggestHit, 0))
    );
    pg.lastBattleAt = rcNow();
    pgSyncPair(linkA, linkB, pg);
}

function pgChallengeFlavor(player, otherName, pg, myUuid) {
    if (player === null || pg === null || pg.active !== true) return;
    if (!pgOnGrounds(player, pg)) return;
    if (rcString(pg.championUuid) === myUuid) {
        chMessage(player, CH_COLOR + "6[Proving Grounds] " + CH_COLOR + "7Your rival awaits where your last battle ended.");
    } else {
        chMessage(player, CH_COLOR + "6[Proving Grounds] " + CH_COLOR + "7Your rival awaits on " +
            CH_COLOR + "e" + pgShortPlace(pg) + CH_COLOR + "7.");
        chMessage(player, CH_COLOR + "8Underdog bonus active. Reclaim your honor.");
    }
}

function pgListLines(player, link) {
    var pg = pgNormalize(link.provingGrounds);
    if (pg.active !== true) return;
    var tierLabel = "Claimed";
    if (pg.tier >= 3) tierLabel = "Legendary";
    else if (pg.tier >= 2) tierLabel = "Dominant";
    rcMessage(player, RC_COLOR + "8    Grounds  " + RC_COLOR + "e" + pgShortPlace(pg) +
        RC_COLOR + "8  (" + tierLabel + ")");
    rcMessage(player, RC_COLOR + "8    Champion  " + RC_COLOR + "f" + (pg.championName || "-") +
        RC_COLOR + "8   Battles  " + RC_COLOR + "f" + rcCommas(pg.battles));
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
        var worlds = rcApi().Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            var found = rcFindOnlinePlayer(worlds[i], name);
            if (found !== null) return found;
        }
    } catch (error) {
        rcLog("Cross-world player lookup failed: " + error);
    }
    return null;
}

/* Mutual rivals only - Nemesis is one of those mutuals (max 1 Nemesis). */
function rcCountMutual(record) {
    var count = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        if (record.rivals[uuid].mutual === true) count++;
    }
    return count;
}

function rcCountByStatus(record, status) {
    var count = 0;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        if (rcLinkStatus(record.rivals[uuid]) === status) count++;
    }
    return count;
}

/* Nemesis requires Mutual + enough DEATH losses to that rival. */
function rcNemesisScore(link) {
    if (link === null || link.mutual !== true) return -1;
    var deathLosses = rcNumber(link.deathLosses, 0);
    if (deathLosses < RC_NEMESIS_DEATH_LOSSES) return -1;
    return deathLosses * 1000 + rcNumber(link.deathWins, 0);
}

function rcRecomputeNemesis(record) {
    if (record === null || record.rivals === null) return null;
    var bestUuid = null;
    var bestScore = -1;
    var prevUuid = rcString(record.nemesisUuid);

    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        var link = record.rivals[uuid];
        link.deathLosses = rcNumber(link.deathLosses, 0);
        link.deathWins = rcNumber(link.deathWins, 0);
        link.isNemesis = false;
        if (link.mutual !== true) continue;
        var score = rcNemesisScore(link);
        if (score > bestScore) {
            bestScore = score;
            bestUuid = uuid;
        }
    }

    if (bestUuid !== null && bestScore >= 0) {
        record.rivals[bestUuid].isNemesis = true;
        record.nemesisUuid = bestUuid;
        rcRefreshLinkStatus(record.rivals[bestUuid]);
    } else {
        bestUuid = null;
        record.nemesisUuid = "";
    }

    for (var u2 in record.rivals) {
        if (!record.rivals.hasOwnProperty(u2)) continue;
        rcRefreshLinkStatus(record.rivals[u2]);
    }

    if (bestUuid !== null && bestUuid !== prevUuid) {
        var online = rcFindOnlinePlayerAnyWorld(record.name);
        if (online !== null) {
            rcMessage(online, RC_COLOR + "c" + RC_COLOR + "lNEMESIS! " +
                RC_COLOR + "e" + record.rivals[bestUuid].name +
                RC_COLOR + "7 - fallen to them " +
                rcNumber(record.rivals[bestUuid].deathLosses, 0) +
                " times by death (need " + RC_NEMESIS_DEATH_LOSSES + ").");
        }
    }
    return bestUuid;
}

/*
 * Record a real death to a Mutual rival for Nemesis progress.
 * Returns true when deathLosses were incremented.
 */
function rcRegisterMutualDeathLoss(database, victimRecord, killerRecord, note) {
    if (database == null || victimRecord == null || killerRecord == null) return false;
    if (victimRecord.uuid === killerRecord.uuid) return false;

    var vLink = victimRecord.rivals[killerRecord.uuid];
    var kLink = killerRecord.rivals[victimRecord.uuid];
    if (vLink == null || kLink == null) return false;
    if (vLink.mutual !== true || kLink.mutual !== true) return false;

    vLink.deathLosses = rcNumber(vLink.deathLosses, 0) + 1;
    kLink.deathWins = rcNumber(kLink.deathWins, 0) + 1;
    vLink.updatedAt = rcNow();
    kLink.updatedAt = rcNow();
    if (!(vLink.history instanceof Array)) vLink.history = [];
    vLink.history.push({
        time: rcNow(),
        type: "death_loss",
        note: rcString(note || ("Fallen to mutual rival " + killerRecord.name))
    });
    while (vLink.history.length > 30) vLink.history.shift();

    rcRecomputeNemesis(victimRecord);
    rcRecomputeNemesis(killerRecord);
    return true;
}

function rcFindOldestMutualUuid(record, excludeUuid) {
    var oldestUuid = null;
    var oldestSince = Number.POSITIVE_INFINITY;
    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        if (excludeUuid && uuid === excludeUuid) continue;
        var link = record.rivals[uuid];
        if (link.mutual !== true) continue;
        var since = rcNumber(link.mutualSince, link.firstMetAt || link.createdAt || 0);
        if (since < oldestSince) {
            oldestSince = since;
            oldestUuid = uuid;
        }
    }
    return oldestUuid;
}

/* Demote a mutual bond on both sides back to Declared (still declared both ways). */
function rcDemoteMutualPair(database, ownerRecord, rivalUuid, reason) {
    var link = ownerRecord.rivals[rivalUuid];
    if (link === null || link === undefined || link.mutual !== true) return null;

    var rivalName = rcString(link.name);
    link.mutual = false;
    link.isNemesis = false;
    link.mutualSince = 0;
    link.inviteSent = false;
    link.inviteReceived = false;
    link.mutualAccepted = false;
    /* Keep declaredByMe/Them so status falls back to Declared. */
    rcRefreshLinkStatus(link);
    rcPushHistory(link, "demoted", reason || "Oldest mutual demoted for a new rivalry");

    var other = database.players[rivalUuid];
    if (other !== null && other !== undefined && other.rivals[ownerRecord.uuid] !== undefined) {
        var ol = other.rivals[ownerRecord.uuid];
        ol.mutual = false;
        ol.isNemesis = false;
        ol.mutualSince = 0;
        ol.inviteSent = false;
        ol.inviteReceived = false;
        ol.mutualAccepted = false;
        rcRefreshLinkStatus(ol);
        rcPushHistory(ol, "demoted", reason || "Mutual demoted");
        rcRecomputeNemesis(other);
        var otherOnline = rcFindOnlinePlayerAnyWorld(other.name);
        if (otherOnline !== null) {
            rcMessage(otherOnline, RC_COLOR + "eYour mutual rivalry with " + ownerRecord.name +
                " was demoted to Declared (they formed a new mutual rivalry).");
        }
    }

    rcRecomputeNemesis(ownerRecord);
    var ownerOnline = rcFindOnlinePlayerAnyWorld(ownerRecord.name);
    if (ownerOnline !== null) {
        rcMessage(ownerOnline, RC_COLOR + "eOldest mutual with " + rivalName +
            " demoted to Declared to make room.");
    }
    return rivalName;
}

/* Ensure room for one more mutual by demoting oldest if needed. */
function rcEnsureMutualRoom(database, record, excludeUuid) {
    while (rcCountMutual(record) >= RC_MAX_MUTUAL_RIVALS) {
        var oldest = rcFindOldestMutualUuid(record, excludeUuid);
        if (oldest === null) break;
        rcDemoteMutualPair(database, record, oldest, "Demoted oldest mutual for new rivalry");
    }
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
    rcRefreshLinkStatus(link);
    rcRecalcCareerRp(ownerRecord);
    rcUpdateLeaderboard(database, ownerRecord);
    if (link.mutual === true) rcRecomputeNemesis(ownerRecord);
    return amount;
}

/* ========================= REQUESTS ========================= */

/*
 * Match Handler clearInviteFlags so Global Player expiry cannot leave
 * orphan inviteSent / inviteReceived after deleting db.requests.
 */
function rcClearInviteFlags(database, fromU, toU) {
    if (database == null || database.players == null) return;
    var from = database.players[fromU];
    var to = database.players[toU];
    if (from != null && from.rivals != null && from.rivals[toU] != null) {
        var fl = from.rivals[toU];
        fl.inviteSent = false;
        if (fl.declaredByMe !== true) {
            fl.inviteReceived = false;
        }
        if (fl.declaredByMe !== true && fl.declaredByThem !== true &&
            fl.inviteReceived !== true && fl.mutual !== true) {
            delete from.rivals[toU];
        } else {
            rcRefreshLinkStatus(fl);
        }
    }
    if (to != null && to.rivals != null && to.rivals[fromU] != null) {
        var tl = to.rivals[fromU];
        tl.inviteReceived = false;
        if (tl.declaredByMe !== true) {
            tl.declaredByThem = false;
        }
        if (tl.declaredByMe !== true && tl.declaredByThem !== true &&
            tl.inviteSent !== true && tl.mutual !== true) {
            delete to.rivals[fromU];
        } else {
            rcRefreshLinkStatus(tl);
        }
    }
}

/* Expire pending visible /rival declare entries. Commands live in Handler. */
function rcCleanupExpiredRequests(database) {
    if (database == null || database.requests == null) return;
    var now = rcNow();
    for (var key in database.requests) {
        if (!database.requests.hasOwnProperty(key)) continue;
        var req = database.requests[key];
        var createdAt = rcNumber(req == null ? 0 : req.createdAt, 0);
        if (createdAt <= 0 || now - createdAt > RC_REQUEST_EXPIRE_MS) {
            if (req != null) {
                rcClearInviteFlags(database, req.fromUuid, req.toUuid);
            }
            delete database.requests[key];
        }
    }
}

/* ========================= EVENTS (core DB touch) ========================= */

function rivalCoreInit(event) {
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

function rivalCoreLogin(event) {
    try {
        var player = event.player;
        if (!rcIsPlayer(player)) return;
        var database = rcLoadDatabase(player);
        var record = rcEnsurePlayer(database, player);
        rcCleanupExpiredRequests(database);
        rcRecomputeNemesis(record);
        rcSaveDatabase(player, database);

        var incoming = 0;
        for (var key in database.requests) {
            if (!database.requests.hasOwnProperty(key)) continue;
            if (rcString(database.requests[key].toUuid) === record.uuid) incoming++;
        }
        if (incoming > 0) {
            rcMessage(player, RC_COLOR + "6[Rival] " + RC_COLOR + "eYou have " + incoming +
                " pending rival declare(s). /rival list");
        }
        if (record.nemesisUuid && record.rivals[record.nemesisUuid]) {
            rcMessage(player, RC_COLOR + "c[Rival] Nemesis: " + RC_COLOR + "e" +
                record.rivals[record.nemesisUuid].name);
        }
    } catch (error) {
        rcLog("login failed: " + error);
    }
}

function rcTriggerPlayer(event) {
    /*
     * Player commands are handled by Rival Command Handler.js.
     * Global Player trigger is reserved for progression admin refresh.
     */
    return rcIsPlayer(event && event.player ? event.player : null) ? event.player : null;
}

/* ========================= PROXIMITY ========================= */

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
var RP_COLOR = "\u00A7";

var RP_DATABASE_KEY = "dlr.rivalry.v4.database";
var RP_BACKUP_KEY = "dlr.rivalry.v4.database.backup";

var RP_TICK_MS = 1000;
var RP_BONUS_NAME = "Rival Proximity";

/* Presence / sensing */
var RP_BASE_RANGE = 48;
var RP_RANGE_PER_TIER = 8;
var RP_MAX_RANGE = 160;

/* Offensive proximity bonus on highest of STR / SKP */
/*
 Original concept: RP unlocks sensing / records / titles - NOT raw combat stats.
 Offense bonus stays off; proximity is for instinct presence only.
*/
var RP_OFFENSE_ENABLED = false;
var RP_PRESENCE_RP_ENABLED = false;
var RP_BASE_OFFENSE_BONUS = 0.04;      // unused while RP_OFFENSE_ENABLED is false
var RP_OFFENSE_PER_TIER = 0.025;       // +2.5% per tier above
var RP_PRESENCE_BONUS_CAP = 0.12;      // extra +12% from long presence
var RP_PRESENCE_FULL_MS = 10 * 60 * 1000;
var RP_MAX_OFFENSE_BONUS = 0.55;       // hard cap - catch-up can push past stronger rivals

/* Catch-up: if your RP > theirs and they have higher released BP */
var RP_CATCHUP_ENABLED = true;
var RP_CATCHUP_MAX = 0.40;             // up to +40% extra from RP lead vs stronger rival
var RP_CATCHUP_BP_RATIO = 1.15;        // rival must be at least 15% stronger released BP

/* Presence: RP stays official-battle-only; TP still rewards training near rivals */
var RP_PRESENCE_RP_INTERVAL_MS = 60 * 1000;
var RP_PRESENCE_RP_MUTUAL = 4;          // unused while RP_PRESENCE_RP_ENABLED is false
var RP_PRESENCE_RP_ONE_SIDED = 3;       // unused while RP_PRESENCE_RP_ENABLED is false
var RP_PRESENCE_TP_ENABLED = true;
/*
 * Presence TP:
 *  - You declared them (Unknown / Declared / Mutual / Nemesis) -> YES
 *  - Incoming-only / invite-only (they declared you, you did not) -> NO
 * Mutual / Nemesis earn for both sides (both declared).
 */
var RP_PRESENCE_TP_UNKNOWN = false;
var RP_PRESENCE_TP_ONE_SIDED = 180;
var RP_PRESENCE_TP_MUTUAL = 280;
var RP_PRESENCE_TP_NEMESIS = 360;

/* Kill TP near rival */
var RP_KILL_TP_BASE = 400;
var RP_KILL_TP_PER_TIER = 120;
var RP_KILL_TP_MUTUAL_MULT = 1.45;
var RP_SHOW_KILL_TP = true;
/*
 * Max nearby rivals that can grant presence/kill TP or feed the
 * proximity offense pick. Extra rivals in range are ignored for rewards.
 */
var RP_NEAR_RIVAL_TP_CAP = 2;
/*
 * AFK gate: a rival only counts for nearby rewards if they have killed
 * a non-player mob within this window.
 */
var RP_NEAR_ACTIVE_KILL_MS = 30 * 1000;
var RP_LAST_MOB_KILL_KEY = "rival.v4.lastMobKillAt";

/*
 * Global Rival System TP scale (presence, kill, challenge, surpass, etc.)
 * Applied inside rivalScaleTpByLevel before DMZ STORY multipliers.
 */
var RIVAL_TP_GAIN_SCALE = 0.60;


/*
 * Per-player kill TP chat preference (storeddata).
 * /rival tpmsg [on|off] — default ON.
 * Shared with End Dimension Strength kill-settle messages.
 */
var KILL_TP_CHAT_KEY = "dmz_kill_tp_chat";

/*
 * Level-based TP scaling (DMZ StatsData.getLevel()).
 * Applied to ALL rival TP awards.
 *
 * Two curves:
 *  burst - challenges, kills, surpass, underdog wins, fusion
 *  drip  - presence / engage / light anti-gank (gentler so AFK near
 *          a rival cannot outpace official battles at high level)
 *
 * Burst anchors:
 *  Level        Mult
 *  1            1.5x
 *  10           2.5x
 *  100          5x
 *  1,000        14x
 *  5,000        35x
 *  10,000       70x
 *  25,000       160x
 *  50,000       320x
 *  75,000       520x
 *  100,000      850x
 *
 * Above 100k: +220x per extra decade of level (soft continue, capped).
 * Drip uses burst^DRIP_POWER (capped) so it still scales with level.
 */
var RIVAL_LEVEL_TP_ENABLED = true;
var RIVAL_LEVEL_TP_SHOW_IN_REASON = true;
var RIVAL_LEVEL_TP_MAX = 3500.0;
var RIVAL_LEVEL_TP_DRIP_POWER = 0.55;
var RIVAL_LEVEL_TP_DRIP_MAX = 75.0;

var RIVAL_LEVEL_TP_LEVEL_ANCHORS = [
    1,
    10,
    100,
    1000,
    5000,
    10000,
    25000,
    50000,
    75000,
    100000
];

var RIVAL_LEVEL_TP_MULT_ANCHORS = [
    1.5,
    2.5,
    5.0,
    14.0,
    35.0,
    70.0,
    160.0,
    320.0,
    520.0,
    850.0
];

/*
 Surpass rival released BP award.
 - Only awards on a true cross (you were weaker, then go stronger)
 - Per-rival cooldown is persisted on the link (survives logout)
 - Global cooldown prevents chaining many rivals for massive TP
*/
var RP_SURPASS_ENABLED = true;
var RP_SURPASS_TP = 8000;
var RP_SURPASS_COOLDOWN_MS = 6 * 60 * 60 * 1000;      // 6h per rival
var RP_SURPASS_GLOBAL_COOLDOWN_MS = 60 * 60 * 1000;    // 1h between any surpass

/* One-sided underdog combat (you declared a stronger rival) */
var RP_UNDERDOG_ENGAGE_TP = 250;
var RP_UNDERDOG_ENGAGE_COOLDOWN_MS = 12 * 1000;
var RP_UNDERDOG_DEATH_RP = 30;
var RP_UNDERDOG_WIN_TP = 6500;
var RP_UNDERDOG_WIN_RP = 45;

/* Anti-gank: weaker declarers (<= 40% of your released BP) */
var RP_ANTIGANK_RATIO = 0.40;
var RP_ANTIGANK_WITNESS_KILL_TP = 350;   // strong player kill TP bonus while watched
var RP_ANTIGANK_WITNESS_RP = 5;         // weak rival RP for witnessing kills
var RP_ANTIGANK_HIT_TP = 140;           // weak rival TP when strong takes damage
var RP_ANTIGANK_HIT_RP = 3;
var RP_ANTIGANK_HIT_COOLDOWN_MS = 15000;
var RP_ANTIGANK_OFFENSE_BONUS = 0.12;   // weak rival offense near strong target

var RP_TIERS = [
    { min: 0,     name: "Acquaintance" },
    { min: 100,   name: "Competitor" },
    { min: 300,   name: "Adversary" },
    { min: 700,   name: "Rival" },
    { min: 1500,  name: "Vendetta" },
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
    /* Official-battle-only RP: proximity / underdog / anti-gank must not award RP. */
    var reasonKey = rpString(reason).toLowerCase();
    if (reasonKey.indexOf("challenge") < 0 && reasonKey.indexOf("official") < 0) {
        return 0;
    }
    var link = rpGetLink(record, rivalUuid);
    if (link === null) return 0;
    amount = Math.floor(rpNumber(amount, 0));
    if (amount === 0) return 0;
    link.points = Math.max(0, rpNumber(link.points, 0) + amount);
    link.updatedAt = rpNow();
    if (!(link.history instanceof Array)) link.history = [];
    link.history.push({ time: rpNow(), type: amount >= 0 ? "rp_gain" : "rp_loss", note: reason + " (" + amount + ")" });
    while (link.history.length > 30) link.history.shift();
    rcRefreshLinkStatus(link);
    rpRecalcCareerRp(record);
    if (link.mutual === true) rcRecomputeNemesis(record);
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

function rivalGetDmzLevel(data) {
    try {
        if (data == null) return 0;
        var level = Number(data.getLevel());
        if (isNaN(level) || !isFinite(level)) return 0;
        return Math.max(0, Math.floor(level));
    } catch (e) {
        return 0;
    }
}

function rivalFormatMult(mult) {
    var n = Number(mult);
    if (isNaN(n) || !isFinite(n)) return "1x";
    if (n >= 100) return String(Math.round(n)) + "x";
    if (n >= 10) return n.toFixed(1) + "x";
    return n.toFixed(2) + "x";
}

/*
 * Smooth log10 interpolation between level anchors (same style as
 * Sparring BP TP curve). Keeps early levels gentle and late-game
 * payouts large enough for 100k-level TP sinks.
 */
function rivalLevelTpMultiplierFromLevel(level) {
    if (RIVAL_LEVEL_TP_ENABLED !== true) return 1.0;

    var lvl = Math.max(1, Math.floor(Number(level)));
    if (isNaN(lvl) || !isFinite(lvl)) lvl = 1;

    var levels = RIVAL_LEVEL_TP_LEVEL_ANCHORS;
    var mults = RIVAL_LEVEL_TP_MULT_ANCHORS;
    if (levels == null || mults == null || levels.length < 2) return 1.0;

    if (lvl <= levels[0]) return mults[0];

    for (var i = 0; i < levels.length - 1; i++) {
        var loL = levels[i];
        var hiL = levels[i + 1];
        if (lvl <= hiL) {
            var loM = mults[i];
            var hiM = mults[i + 1];
            var loLog = Math.log(loL) / Math.log(10);
            var hiLog = Math.log(hiL) / Math.log(10);
            var curLog = Math.log(lvl) / Math.log(10);
            var progress = (curLog - loLog) / (hiLog - loLog);
            if (progress < 0) progress = 0;
            if (progress > 1) progress = 1;
            return loM + (hiM - loM) * progress;
        }
    }

    var lastL = levels[levels.length - 1];
    var lastM = mults[mults.length - 1];
    var extraDecades =
        (Math.log(lvl) - Math.log(lastL)) / Math.log(10);
    var continued = lastM + extraDecades * 220.0;
    var cap = Number(RIVAL_LEVEL_TP_MAX);
    if (isNaN(cap) || cap < 1) cap = 3500;
    return Math.min(cap, continued);
}

function rivalLevelTpMultiplier(data) {
    return rivalLevelTpMultiplierFromLevel(rivalGetDmzLevel(data));
}

/* kind: "burst" (default) or "drip" */
function rivalEffectiveTpMultiplier(data, kind) {
    var burst = rivalLevelTpMultiplier(data);
    if (kind !== "drip") return burst;
    var drip = Math.pow(Math.max(1.0, burst), RIVAL_LEVEL_TP_DRIP_POWER);
    var dripCap = Number(RIVAL_LEVEL_TP_DRIP_MAX);
    if (isNaN(dripCap) || dripCap < 1) dripCap = 75.0;
    if (drip > dripCap) drip = dripCap;
    return drip;
}

function rivalScaleTpByLevel(data, amount, kind) {
    var base = Math.floor(Number(amount));
    if (isNaN(base) || base <= 0) return 0;
    var gainScale = Number(RIVAL_TP_GAIN_SCALE);
    if (!(gainScale > 0) || isNaN(gainScale) || !isFinite(gainScale)) gainScale = 1.0;
    base = Math.max(1, Math.floor(base * gainScale));
    if (data === null || data === undefined) return base;
    var mult = rivalEffectiveTpMultiplier(data, kind);
    if (!(mult > 0) || isNaN(mult) || !isFinite(mult)) mult = 1.0;
    return Math.max(1, Math.floor(base * mult));
}

function rivalKillTpChatEnabled(player) {
    try {
        if (player === null || player === undefined) return true;
        var stored = player.getStoreddata();
        if (stored === null || stored === undefined) return true;
        if (!stored.has(KILL_TP_CHAT_KEY)) return true;
        var value = String(stored.get(KILL_TP_CHAT_KEY)).toLowerCase();
        return value !== "0" && value !== "false" && value !== "off";
    } catch (e) {
        return true;
    }
}

/*
 * killChat=true: message respects /rival tpmsg preference.
 * Other awards still show unless RP_SHOW_KILL_TP is false.
 */
function rpAwardTP(player, data, amount, reason, kind, killChat) {
    try {
        if (data === null || data === undefined) return false;
        var scaleKind = kind === "drip" ? "drip" : "burst";
        amount = rivalScaleTpByLevel(data, amount, scaleKind);
        if (amount <= 0) return false;
        var resources = data.getResources();
        if (resources === null) return false;
        resources.addTrainingPoints(amount);
        var mcPlayer = player.getMCEntity();
        rpNetwork().sendToTrackingEntityAndSelf(new (rpSyncPacket())(mcPlayer), mcPlayer);
        var show = RP_SHOW_KILL_TP === true;
        if (killChat === true) {
            show = show && rivalKillTpChatEnabled(player);
        }
        if (show) {
            var note = reason ? String(reason) : "";
            if (RIVAL_LEVEL_TP_SHOW_IN_REASON === true && RIVAL_LEVEL_TP_ENABLED === true) {
                var lvl = rivalGetDmzLevel(data);
                note = (note ? note + " | " : "") +
                    "Lv" + rpCommas(lvl) + " " +
                    rivalFormatMult(rivalEffectiveTpMultiplier(data, scaleKind));
            }
            rpMessage(player, RP_COLOR + "a[Rival] +" + rpCommas(amount) + " TP" +
                (note ? RP_COLOR + "7 (" + note + ")" : ""));
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

        if (RP_OFFENSE_ENABLED !== true) {
            try {
                rpNetwork().sendToTrackingEntityAndSelf(
                    new (rpSyncPacket())(player.getMCEntity()),
                    player.getMCEntity()
                );
            } catch (ignoredOff) {}
            return false;
        }

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

function rpNearRivalPriority(link) {
    if (link == null) return 0;
    var status = rcLinkStatus(link);
    var rank = 0;
    if (status === "nemesis") rank = 4;
    else if (status === "mutual") rank = 3;
    else if (status === "declared") rank = 2;
    else if (status === "pending") rank = 1;
    else if (status === "unknown") rank = 1;
    return rank * 1000000 + rpNumber(link.points, 0);
}

function rpSortNearRivalsByPriority(list) {
    if (list == null || list.length <= 1) return list;
    list.sort(function (a, b) {
        return rpNumber(b.priority, 0) - rpNumber(a.priority, 0);
    });
    return list;
}

function rpNearRivalTpCap() {
    var cap = Math.floor(Number(RP_NEAR_RIVAL_TP_CAP));
    if (isNaN(cap) || !isFinite(cap) || cap < 1) return 2;
    return cap;
}

function rpMarkMobKill(player) {
    if (!rpIsPlayer(player)) return;
    try {
        rpTempPut(rpTemp(player), RP_LAST_MOB_KILL_KEY, rpNow());
    } catch (ignored) {}
}

/*
 * True if this player killed a mob recently enough to count as "active"
 * for nearby-rival rewards (blocks AFK parking).
 */
function rpHasRecentMobKill(player, nowMs) {
    if (!rpIsPlayer(player)) return false;
    var now = nowMs > 0 ? nowMs : rpNow();
    var windowMs = Math.floor(Number(RP_NEAR_ACTIVE_KILL_MS));
    if (isNaN(windowMs) || !isFinite(windowMs) || windowMs < 1000) windowMs = 30000;
    var last = rpTempNumber(rpTemp(player), RP_LAST_MOB_KILL_KEY, 0);
    if (last <= 0) return false;
    return (now - last) <= windowMs;
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
    var inChallenge = rpInActiveChallenge(player);
    var inSparring = rpIsInSparring(player);

    var bestMultiplier = 1.0;
    var nearCount = 0;
    var dirty = false;
    var wantsPgUnderdog = false;
    var nearForRewards = [];

    for (var rivalUuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(rivalUuid)) continue;
        var link = record.rivals[rivalUuid];
        var rivalPlayer = rpFindOnlineByUuid(rivalUuid);

        /* Proving Grounds enter pulse + underdog aura (even if rival is offline) */
        if (PG_ENABLED === true) {
            var pg = pgNormalize(link.provingGrounds);
            var enterKey = "rival.v4.pgEnter." + rivalUuid;
            if (pg.active === true && pgOnGrounds(player, pg)) {
                if (rpTempNumber(temp, enterKey, 0) <= 0) {
                    rpTempPut(temp, enterKey, now);
                    if (rcString(pg.championUuid) === rivalUuid) {
                        rpMessage(player, RP_COLOR + "6[Proving Grounds] " + RP_COLOR + "7You enter the Proving Grounds where " +
                            RP_COLOR + "c" + link.name + RP_COLOR + "7 last defeated you.");
                    } else if (rcString(pg.championUuid) === uuid) {
                        rpMessage(player, RP_COLOR + "6[Proving Grounds] " + RP_COLOR + "7You enter your claimed grounds: " +
                            RP_COLOR + "e" + pgShortPlace(pg) + RP_COLOR + "7.");
                    } else {
                        rpMessage(player, RP_COLOR + "6[Proving Grounds] " + RP_COLOR + "7You enter " +
                            RP_COLOR + "e" + pgDisplayName(pg) + RP_COLOR + "7.");
                    }
                }
                if (rcString(pg.championUuid) !== "" && rcString(pg.championUuid) !== uuid) {
                    wantsPgUnderdog = true;
                }
            } else if (rpTempNumber(temp, enterKey, 0) > 0) {
                rpTempPut(temp, enterKey, 0);
            }
        }

        if (rivalPlayer === null) continue;

        var range = rpRangeForPoints(link.points);
        var distance = rpDistance(player, rivalPlayer);
        if (distance > range) continue;

        nearCount++;
        link.lastSeenTogetherAt = now;
        link.presenceMs = rpNumber(link.presenceMs, 0) + RP_TICK_MS;
        if (record.career === null || typeof record.career !== "object") record.career = {};
        record.career.presenceMs = rpNumber(record.career.presenceMs, 0) + RP_TICK_MS;

        /* AFK rivals do not grant nearby reward / multiplier credit. */
        if (!rpHasRecentMobKill(rivalPlayer, now)) continue;

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

        nearForRewards.push({
            rivalUuid: rivalUuid,
            link: link,
            rivalPlayer: rivalPlayer,
            rivalReleased: rivalReleased,
            mult: mult,
            priority: rpNearRivalPriority(link)
        });

        /* Surpass award: cross from weaker -> stronger only, persisted cooldowns */
        if (RP_SURPASS_ENABLED && rivalReleased > 0) {
            if (myReleased <= rivalReleased) {
                /* Must be weaker (or tied) before the next surpass can trigger */
                if (link.surpassWasBelow !== true) {
                    link.surpassWasBelow = true;
                    dirty = true;
                }
            } else {
                var canCross = link.surpassWasBelow === true;
                var lastRivalSurpass = rpNumber(link.lastSurpassAt, 0);
                var lastGlobalSurpass = rpNumber((record.career || {}).lastSurpassAt, 0);
                var rivalReady = now - lastRivalSurpass >= RP_SURPASS_COOLDOWN_MS;
                var globalReady = now - lastGlobalSurpass >= RP_SURPASS_GLOBAL_COOLDOWN_MS;

                if (canCross && rivalReady && globalReady) {
                    if (rpAwardTP(player, data, RP_SURPASS_TP, "Surpassed " + link.name)) {
                        if (record.career === null || typeof record.career !== "object") record.career = {};
                        record.career.surpassAwards = rpNumber(record.career.surpassAwards, 0) + 1;
                        record.career.lastSurpassAt = now;
                        link.lastSurpassAt = now;
                        link.surpassWasBelow = false;
                        dirty = true;
                        rpMessage(player, RP_COLOR + "8[Rival] Surpass cooldown: " +
                            Math.ceil(RP_SURPASS_COOLDOWN_MS / 3600000) + "h for " + link.name +
                            ", " + Math.ceil(RP_SURPASS_GLOBAL_COOLDOWN_MS / 3600000) + "h global.");
                    }
                } else if (link.surpassWasBelow === true) {
                    /* Already stronger; clear arm so standing nearby cannot re-fire without dipping below */
                    link.surpassWasBelow = false;
                    dirty = true;
                }
            }
        }
    }

    /* Only the top N nearby active rivals feed offense pick + presence TP. */
    rpSortNearRivalsByPriority(nearForRewards);
    var rewardCap = rpNearRivalTpCap();
    var rewardedNear = 0;
    for (var ni = 0; ni < nearForRewards.length; ni++) {
        var nearEntry = nearForRewards[ni];
        if (ni >= rewardCap) break;
        rewardedNear++;

        if (nearEntry.mult > bestMultiplier) bestMultiplier = nearEntry.mult;

        var cappedLink = nearEntry.link;
        var cappedRivalUuid = nearEntry.rivalUuid;
        var presenceKey = "rival.v4.presenceRp." + cappedRivalUuid;
        var lastPresenceRp = rpTempNumber(temp, presenceKey, 0);
        if (now - lastPresenceRp >= RP_PRESENCE_RP_INTERVAL_MS) {
            cappedLink.presenceMs = rpNumber(cappedLink.presenceMs, 0) + RP_PRESENCE_RP_INTERVAL_MS;
            cappedLink.lastSeenTogetherAt = now;
            dirty = true;
            rpTempPut(temp, presenceKey, now);

            if (RP_PRESENCE_TP_ENABLED === true && inChallenge !== true && inSparring !== true) {
                var pStatus = rcLinkStatus(cappedLink);
                var presenceTp = 0;
                /*
                 * Benefits only if YOU rivaled them (declaredByMe).
                 * Silent Unknown, Declared, Mutual, Nemesis all qualify when you declared.
                 */
                if (cappedLink.mutual === true) {
                    if (pStatus === "nemesis") presenceTp = RP_PRESENCE_TP_NEMESIS;
                    else presenceTp = RP_PRESENCE_TP_MUTUAL;
                } else if (cappedLink.declaredByMe === true) {
                    presenceTp = RP_PRESENCE_TP_ONE_SIDED;
                } else if (pStatus === "unknown" && RP_PRESENCE_TP_UNKNOWN === true) {
                    presenceTp = RP_PRESENCE_TP_ONE_SIDED;
                }

                if (presenceTp > 0) {
                    rpAwardTP(
                        player,
                        data,
                        presenceTp,
                        "Near " + pStatus + " " + cappedLink.name,
                        "drip"
                    );
                }
            }
            if (RP_PRESENCE_RP_ENABLED === true) {
                if (cappedLink.declaredByMe === true || cappedLink.mutual === true) {
                    var presenceRp = RP_PRESENCE_RP_ONE_SIDED;
                    if (cappedLink.mutual === true) presenceRp = RP_PRESENCE_RP_MUTUAL;
                    if (rcLinkStatus(cappedLink) === "nemesis") presenceRp = RP_PRESENCE_RP_MUTUAL + 2;
                    rpAwardPoints(record, cappedRivalUuid, presenceRp, "presence");
                }
            }
        }
    }

    rpApplyOffenseBonus(player, data, bestMultiplier);

    if (PG_ENABLED === true) {
        if (wantsPgUnderdog === true) pgApplyUnderdogBonus(player);
        else pgClearUnderdogBonus(player);
    }

    if (nearCount > 0) {
        rpTempPut(temp, "rival.v4.nearCount", nearCount);
        rpTempPut(temp, "rival.v4.nearRewardCount", rewardedNear);
        rpTempPut(temp, "rival.v4.offenseMult", bestMultiplier.toFixed(3));
    } else {
        rpTempPut(temp, "rival.v4.nearCount", 0);
        rpTempPut(temp, "rival.v4.nearRewardCount", 0);
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
    var nearKillList = [];

    /* Direct rival kill underdog win */
    if (victimIsPlayer) {
        var directLink = rpGetLink(record, victimUuid);
        if (directLink !== null && directLink.declaredByMe === true && directLink.mutual !== true) {
            var victimData = rpGetDMZ(victim);
            var victimReleased = rpGetReleasedBP(victimData);
            if (victimReleased > killerReleased) {
                rpAwardTP(killer, killerData, RP_UNDERDOG_WIN_TP,
                    "Underdog victory vs " + directLink.name, "burst", true);
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
        /* AFK rivals do not grant kill-near-rival TP. */
        if (!rpHasRecentMobKill(rivalPlayer, rpNow())) continue;

        nearKillList.push({
            rivalUuid: rivalUuid,
            link: link,
            rivalPlayer: rivalPlayer,
            priority: rpNearRivalPriority(link)
        });
    }

    rpSortNearRivalsByPriority(nearKillList);
    var killCap = rpNearRivalTpCap();
    for (var ki = 0; ki < nearKillList.length && ki < killCap; ki++) {
        var nearKill = nearKillList[ki];
        var killLink = nearKill.link;
        var killRivalUuid = nearKill.rivalUuid;
        var killRivalPlayer = nearKill.rivalPlayer;

        var tier = rpTierIndex(killLink.points);
        var tp = RP_KILL_TP_BASE + tier * RP_KILL_TP_PER_TIER;
        var killStatus = rcLinkStatus(killLink);
        if (killStatus === "nemesis") tp = Math.floor(tp * RP_KILL_TP_MUTUAL_MULT * 1.25);
        else if (killStatus === "mutual") tp = Math.floor(tp * RP_KILL_TP_MUTUAL_MULT);

        rpAwardTP(killer, killerData, tp, "Near " + killStatus + " " + killLink.name, "burst", true);
        if (record.career === null || typeof record.career !== "object") record.career = {};
        record.career.killsNearRival = rpNumber(record.career.killsNearRival, 0) + 1;
        dirty = true;

        /* Anti-gank: if this rival is much weaker and has me declared, they gain from witnessing */
        var rivalRecord = database.players[killRivalUuid];
        if (rivalRecord === null || rivalRecord === undefined) continue;
        var theirLink = rpGetLink(rivalRecord, killerUuid);
        if (theirLink === null || theirLink.declaredByMe !== true) continue;

        var rivalData = rpGetDMZ(killRivalPlayer);
        var rivalReleased = rpGetReleasedBP(rivalData);
        if (killerReleased > 0 && rivalReleased <= killerReleased * RP_ANTIGANK_RATIO) {
            rpAwardTP(killer, killerData, RP_ANTIGANK_WITNESS_KILL_TP, "Rivals watching", "burst", true);
            dirty = true;
        }
    }

    if (dirty) rpSaveDatabase(killer, database);
}

/*
 Underdog engage TP: one-sided declarer fighting a stronger rival.
 Fires for the underdog whether they deal or take the hit.
*/
function rpTryUnderdogEngage(underdog, stronger) {
    if (!rpIsPlayer(underdog) || !rpIsPlayer(stronger)) return;

    var database = rpLoadDatabase(underdog);
    if (database === null) return;

    var underUuid = rpUuid(underdog);
    var strongUuid = rpUuid(stronger);
    var record = database.players[underUuid];
    if (record === null || record === undefined) return;

    var link = rpGetLink(record, strongUuid);
    if (link === null) return;
    if (link.declaredByMe !== true || link.mutual === true) return;

    var myData = rpGetDMZ(underdog);
    var theirData = rpGetDMZ(stronger);
    var myReleased = rpGetReleasedBP(myData);
    var theirReleased = rpGetReleasedBP(theirData);
    if (theirReleased <= myReleased) return;

    var temp = rpTemp(underdog);
    var now = rpNow();
    var engageKey = "rival.v4.engage." + strongUuid;
    var last = rpTempNumber(temp, engageKey, 0);
    if (now - last < RP_UNDERDOG_ENGAGE_COOLDOWN_MS) return;

    rpAwardTP(underdog, myData, RP_UNDERDOG_ENGAGE_TP, "Engaging rival", "drip");
    rpTempPut(temp, engageKey, now);
}

function rpHandleDamagedByRival(victim, attacker) {
    if (!rpIsPlayer(attacker)) return;
    /* Victim may be underdog taking hits */
    rpTryUnderdogEngage(victim, attacker);
    /* Attacker may be underdog landing hits */
    rpTryUnderdogEngage(attacker, victim);
}

function rpInActiveChallenge(player) {
    try {
        var w = rpDataWorld(player);
        if (w == null) return false;
        var stored = w.getStoreddata();
        var key = "dlr.rivalry.v4.challenges";
        if (stored == null || !stored.has(key)) return false;
        var ch = JSON.parse(String(stored.get(key)));
        if (ch == null || ch.playerSessions == null) return false;
        var sid = ch.playerSessions[rpUuid(player)];
        if (sid == null) return false;
        var session = ch.sessions != null ? ch.sessions[String(sid)] : null;
        if (session == null) return false;
        var st = rpString(session.state);
        return st === "active" || st === "countdown";
    } catch (e) {
        return false;
    }
}

function rpHandleStrongPlayerDamagedNearWeakRivals(victim) {
    var database = rpLoadDatabase(victim);
    if (database === null) return;
    /* Don't spam under-fire TP during official challenges */
    if (rpInActiveChallenge(victim)) return;

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

        rpAwardTP(rivalPlayer, rivalData, RP_ANTIGANK_HIT_TP, "Rival under fire", "drip");
        dirty = true;
    }

    if (dirty) {
        rpTempPut(temp, hitKey, now);
        rpSaveDatabase(victim, database);
    }
}

/* Sparring sessions must not advance Rival Nemesis / presence TP. */
function rpIsInSparring(player) {
    if (player == null) return false;
    try {
        var temp = player.getTempdata();
        if (temp == null || !temp.has("spar.active")) return false;
        return rpString(temp.get("spar.active")) === "1";
    } catch (e) {
        return false;
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
    /* died event may pass IDamageSource - resolve the killing player. */
    if (!rpIsPlayer(attacker)) {
        try {
            if (damageSource !== null && damageSource.getTrueSource) {
                attacker = damageSource.getTrueSource();
            }
        } catch (ignored3) {}
    }
    if (!rpIsPlayer(attacker)) {
        try {
            if (damageSource !== null && damageSource.getImmediateSource) {
                var imm = damageSource.getImmediateSource();
                if (rpIsPlayer(imm)) attacker = imm;
                else if (imm != null && typeof imm.getMCEntity == "function") {
                    /* ignore non-players */
                }
            }
        } catch (ignored4) {}
    }
    if (!rpIsPlayer(attacker)) return;
    if (rpIsInSparring(victim) || rpIsInSparring(attacker)) return;

    var database = rpLoadDatabase(victim);
    if (database === null) return;

    var victimUuid = rpUuid(victim);
    var attackerUuid = rpUuid(attacker);
    var victimRecord = database.players[victimUuid];
    if (victimRecord == null) victimRecord = rcEnsurePlayer(database, victim);
    var killerRecord = database.players[attackerUuid];
    if (killerRecord == null) killerRecord = rcEnsurePlayer(database, attacker);
    if (victimRecord == null || killerRecord == null) return;

    /*
     * Challenge KO already counted deathLosses in chApplyRewards.
     * Skip open-world double-count for a few seconds.
     */
    try {
        var temp = victim.getTempdata();
        if (temp != null && temp.has("rival.v4.deathLossCounted")) {
            var countedAt = rpNumber(temp.get("rival.v4.deathLossCounted"), 0);
            if (rpNow() - countedAt < 5000) return;
        }
    } catch (eSkip) {}

    var link = rpGetLink(victimRecord, attackerUuid);
    if (link == null) return;

    /* Mutual deaths drive Nemesis. One-sided deaths stay flavor history. */
    if (link.mutual === true) {
        if (rcRegisterMutualDeathLoss(database, victimRecord, killerRecord, "Fallen to mutual rival in the world")) {
            try {
                victim.getTempdata().put("rival.v4.deathLossCounted", String(rpNow()));
            } catch (eMark) {}
            rpSaveDatabase(victim, database);
            var deaths = rcNumber(victimRecord.rivals[attackerUuid].deathLosses, 0);
            rpMessage(victim, RP_COLOR + "c[Rival] Death to Mutual rival " +
                RP_COLOR + "e" + killerRecord.name + RP_COLOR + "7 (" +
                deaths + "/" + RC_NEMESIS_DEATH_LOSSES + " toward Nemesis)");
            if (deaths >= RC_NEMESIS_DEATH_LOSSES &&
                rcString(victimRecord.nemesisUuid) === attackerUuid) {
                /* Announce already handled inside rcRecomputeNemesis when newly crowned. */
            }
        }
        return;
    }

    if (link.declaredByMe !== true) return;

    var myData = rpGetDMZ(victim);
    var theirData = rpGetDMZ(attacker);
    /* RP is official-battle-only; death to a stronger declared rival is flavor history only. */
    if (rpGetReleasedBP(theirData) > rpGetReleasedBP(myData)) {
        if (!(link.history instanceof Array)) link.history = [];
        link.history.push({ time: rpNow(), type: "death", note: "Fell to stronger rival " + link.name });
        while (link.history.length > 30) link.history.shift();
        rpSaveDatabase(victim, database);
    }
}

/* ========================= EVENTS ========================= */

function rivalProxTick(event) {
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

function rivalProxDamagedEntity(event) {
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

function rivalProxDamaged(event) {
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

/*
 * Killer-side backup: CNPC died.source is often IDamageSource and may
 * fail to resolve the player killer. Kill events always know the killer.
 */
function rpHandleKillOfMutualRival(killer, victim) {
    if (!rpIsPlayer(killer) || !rpIsPlayer(victim)) return false;
    if (rpIsInSparring(killer) || rpIsInSparring(victim)) return false;

    try {
        var temp = victim.getTempdata();
        if (temp != null && temp.has("rival.v4.deathLossCounted")) {
            var countedAt = rpNumber(temp.get("rival.v4.deathLossCounted"), 0);
            if (rpNow() - countedAt < 5000) return false;
        }
    } catch (eSkip) {}

    var database = rpLoadDatabase(killer);
    if (database === null) return false;

    var killerRecord = database.players[rpUuid(killer)];
    if (killerRecord == null) killerRecord = rcEnsurePlayer(database, killer);
    var victimRecord = database.players[rpUuid(victim)];
    if (victimRecord == null) victimRecord = rcEnsurePlayer(database, victim);
    if (killerRecord == null || victimRecord == null) return false;

    var link = rpGetLink(victimRecord, rpUuid(killer));
    if (link == null || link.mutual !== true) return false;

    if (!rcRegisterMutualDeathLoss(
        database,
        victimRecord,
        killerRecord,
        "Fallen to mutual rival in the world"
    )) {
        return false;
    }

    try {
        victim.getTempdata().put("rival.v4.deathLossCounted", String(rpNow()));
    } catch (eMark) {}
    rpSaveDatabase(killer, database);

    var deaths = rcNumber(victimRecord.rivals[rpUuid(killer)].deathLosses, 0);
    try {
        rpMessage(victim, RP_COLOR + "c[Rival] Death to Mutual rival " +
            RP_COLOR + "e" + killerRecord.name + RP_COLOR + "7 (" +
            deaths + "/" + RC_NEMESIS_DEATH_LOSSES + " toward Nemesis)");
    } catch (eMsg) {}
    return true;
}

function rivalProxKill(event) {
    try {
        var killer = event.player;
        var victim = event.entity;
        if (!rpIsPlayer(killer) || victim === null) return;
        if (!rpIsPlayer(victim)) {
            rpMarkMobKill(killer);
        }
        try { rpHandleKillOfMutualRival(killer, victim); } catch (eDeath) {
            rpLog("mutual kill death-loss failed: " + eDeath);
        }
        rpHandleKillNearRivals(killer, victim);
    } catch (error) {
        rpLog("kill failed: " + error);
    }
}

function rivalProxDied(event) {
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

function rivalProxLogout(event) {
    try {
        var player = event.player;
        if (!rpIsPlayer(player)) return;
        var data = rpGetDMZ(player);
        rpApplyOffenseBonus(player, data, 1.0);
    } catch (error) {
        rpLog("logout failed: " + error);
    }
}

/* ========================= CHALLENGE ========================= */

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
var CH_COLOR = "\u00A7";

var CH_CORE_DB_KEY = "dlr.rivalry.v4.database";
var CH_CORE_BACKUP_KEY = "dlr.rivalry.v4.database.backup";
var CH_DB_KEY = "dlr.rivalry.v4.challenges";
var CH_DB_BACKUP_KEY = "dlr.rivalry.v4.challenges.backup";

var CH_REQUEST_EXPIRE_MS = 30 * 1000;
var CH_COUNTDOWN_MS = 5 * 1000;
var CH_DURATION_MS = 60 * 1000;
var CH_MIN_MINUTES = 1;
var CH_MAX_MINUTES = 10;
/* Live score cadence: short fights stay frequent; long fights quiet down. */
var CH_LONG_FIGHT_MS = 2 * 60 * 1000;
var CH_BROADCAST_SCORE_LONG_MS = 60 * 1000;
var CH_REQUEST_COOLDOWN_MS = 15 * 1000;
var CH_MAX_DISTANCE = 64;
var CH_TICK_MS = 250;

/*
 * CNPC damaged / damagedEntity fire on LivingHurtEvent with the
 * pre-mitigation amount (DMZ attack damage). Challenge scoring must
 * use health actually lost after armor / DMZ defense instead.
 */
var CH_HP_SAMPLE_KEY = "rival.v4.challenge.hpPool";
var CH_PENDING_SAMPLE_KEY = "rival.v4.challenge.pendingSample";
var CH_PENDING_ATK_KEY = "rival.v4.challenge.pendingAtk";
var CH_PENDING_KI_KEY = "rival.v4.challenge.pendingKi";
var CH_PENDING_UNTIL_KEY = "rival.v4.challenge.pendingUntil";
var CH_PENDING_RESOLVE_MS = 75;

/* Server-wide rival battle display */
var CH_BROADCAST_ENABLED = true;
var CH_BROADCAST_SCORE_MS = 15 * 1000;
var CH_BROADCAST_REPORT = true;

var CH_WIN_TP = 5500;
var CH_LOSE_TP = 2000;
var CH_DRAW_TP = 3000;
var CH_KO_WIN_TP_BONUS = 4000;

var CH_WIN_RP = 18;
var CH_LOSE_RP = 40;              // loser gets more rivalry than winner
var CH_DRAW_RP = 14;
var CH_KO_LOSE_RP_BONUS = 20;     // KO loss = even more rivalry
var CH_CLOSE_BATTLE_RP = 12;      // both sides when damage within 15%
var CH_CLOSE_BATTLE_RATIO = 0.85;
var CH_LONG_RIVALRY_DAY_RP = 2;   // +RP per mutual day (capped)
var CH_LONG_RIVALRY_DAY_CAP = 30;
var CH_FORFEIT_RP_PENALTY = 10;

var CH_NON_RIVAL_WIN_TP = 3200;   // win vs non-rival still awards TP

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

function chBroadcast(text) {
    if (CH_BROADCAST_ENABLED !== true) return;
    /*
     * Deduplicate by player UUID. Multi-world getAllPlayers() can
     * re-list the same players and spam identical challenge lines.
     */
    try {
        var seen = {};
        var sent = 0;

        try {
            var Bukkit = Java.type("org.bukkit.Bukkit");
            var online = Bukkit.getOnlinePlayers();
            var it = online.iterator();
            while (it.hasNext()) {
                var bp = it.next();
                var name = "";
                try { name = String(bp.getName()); } catch (eName) { continue; }
                var p = chFindOnlineAnyWorld(name);
                if (p === null) continue;
                var id = chUuid(p);
                if (id === "" || seen[id] === true) continue;
                seen[id] = true;
                chMessage(p, text);
                sent++;
            }
            if (sent > 0) return;
        } catch (bukkitErr) {}

        var worlds = chApi().Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                var players = worlds[i].getAllPlayers();
                for (var pIdx = 0; pIdx < players.length; pIdx++) {
                    var pl = players[pIdx];
                    var pid = chUuid(pl);
                    if (pid === "" || seen[pid] === true) continue;
                    seen[pid] = true;
                    chMessage(pl, text);
                }
            } catch (ignored) {}
        }
    } catch (error) {
        chLog("Broadcast failed: " + error);
    }
}

function chClaimCountdownAnnounce(pairKey) {
    try {
        var world = chDataWorld(null);
        if (world === null) return true;
        var stored = world.getStoreddata();
        var key = "dlr.rivalry.v4.challenge.announce." + chString(pairKey);
        var last = 0;
        try {
            if (stored.has(key)) last = chNumber(stored.get(key), 0);
        } catch (e1) {}
        if (chNow() - last < 8000) return false;
        stored.put(key, "" + chNow());
        return true;
    } catch (e) {
        return true;
    }
}

function chPlannedDurationMs(session) {
    var planned = chNumber(session == null ? 0 : session.durationMs, CH_DURATION_MS);
    if (planned < CH_DURATION_MS) planned = CH_DURATION_MS;
    return planned;
}

function chBattleElapsedMs(session) {
    if (session == null) return 0;
    var ended = chNumber(session.endedAt, chNow());
    var started = chNumber(session.battleStartedAt, 0);
    if (started > 0) return Math.max(0, ended - started);
    var planned = chPlannedDurationMs(session);
    return Math.max(0, ended - (chNumber(session.battleEndsAt, ended) - planned));
}

function chScoreBroadcastIntervalMs(session) {
    if (chPlannedDurationMs(session) > CH_LONG_FIGHT_MS) return CH_BROADCAST_SCORE_LONG_MS;
    return CH_BROADCAST_SCORE_MS;
}

function chBroadcastLines(lines) {
    if (lines == null) return;
    for (var i = 0; i < lines.length; i++) chBroadcast(lines[i]);
}

function chScoreLine(session) {
    var c = session.combat[session.challengerUuid] || chFreshCombat();
    var o = session.combat[session.opponentUuid] || chFreshCombat();
    var left = Math.max(0, Math.ceil((chNumber(session.battleEndsAt, chNow()) - chNow()) / 1000));
    return CH_COLOR + "6[Live] " +
        CH_COLOR + "f" + session.challengerName + CH_COLOR + "e " + chCommas(c.damage) +
        CH_COLOR + "8  vs  " +
        CH_COLOR + "f" + session.opponentName + CH_COLOR + "e " + chCommas(o.damage) +
        CH_COLOR + "8   " + left + "s";
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
        var data = chGetDMZ(player);
        if (data === null) return false;
        amount = rivalScaleTpByLevel(data, amount, "burst");
        if (amount <= 0) return false;
        data.getResources().addTrainingPoints(amount);
        var mcPlayer = player.getMCEntity();
        chNetwork().sendToTrackingEntityAndSelf(new (chSyncPacket())(mcPlayer), mcPlayer);
        var note = reason ? String(reason) : "";
        if (RIVAL_LEVEL_TP_SHOW_IN_REASON === true && RIVAL_LEVEL_TP_ENABLED === true) {
            note = (note ? note + " | " : "") +
                "Lv" + chCommas(rivalGetDmzLevel(data)) + " " +
                rivalFormatMult(rivalEffectiveTpMultiplier(data, "burst"));
        }
        chMessage(player, CH_COLOR + "a[Challenge] +" + chCommas(amount) + " TP" +
            (note ? CH_COLOR + "7 (" + note + ")" : ""));
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
        var t = chNow();
        owner.rivals[target.uuid] = {
            uuid: target.uuid,
            name: target.name,
            nameLower: target.name.toLowerCase(),
            mutual: false,
            declaredByMe: false,
            declaredByThem: false,
            isNemesis: false,
            points: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            battles: 0,
            deathLosses: 0,
            deathWins: 0,
            currentStreak: 0,
            bestStreak: 0,
            damageDealt: 0,
            damageTaken: 0,
            timeFoughtMs: 0,
            presenceMs: 0,
            createdAt: t,
            firstMetAt: t,
            firstBattleAt: 0,
            updatedAt: t,
            mutualSince: 0,
            lastBattleAt: 0,
            lastSeenTogetherAt: 0,
            lastSurpassAt: 0,
            surpassWasBelow: false,
            provingGrounds: pgFresh(),
            history: []
        };
    }
    var link = owner.rivals[target.uuid];
    link.name = target.name;
    link.updatedAt = chNow();
    link.deathLosses = chNumber(link.deathLosses, 0);
    link.deathWins = chNumber(link.deathWins, 0);
    link.isNemesis = link.mutual === true &&
        link.deathLosses >= RC_NEMESIS_DEATH_LOSSES &&
        link.isNemesis === true;
    link.provingGrounds = pgNormalize(link.provingGrounds);
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
    /* Official battles between Mutual rivals only write RP history. */
    if (link.mutual !== true) return 0;
    amount = Math.floor(chNumber(amount, 0));
    if (amount === 0) return 0;
    link.points = Math.max(0, chNumber(link.points, 0) + amount);
    link.updatedAt = chNow();
    if (!(link.history instanceof Array)) link.history = [];
    link.history.push({ time: chNow(), type: amount >= 0 ? "rp_gain" : "rp_loss", note: reason + " (" + amount + ")" });
    while (link.history.length > 30) link.history.shift();
    rcRefreshLinkStatus(link);
    chRecalcRp(record);
    rcRecomputeNemesis(record);
    return amount;
}

function chAreRelated(core, aUuid, bUuid) {
    var a = core.players[aUuid];
    var b = core.players[bUuid];
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return a.rivals[bUuid] !== undefined || b.rivals[aUuid] !== undefined;
}

function chAreMutual(core, aUuid, bUuid) {
    var a = core.players[aUuid];
    if (a === null || a === undefined || a.rivals[bUuid] === undefined) return false;
    return a.rivals[bUuid].mutual === true;
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

    chMessage(player, CH_COLOR + "6[Challenge] " + CH_COLOR + "aSent to " + CH_COLOR + "e" + chName(target));
    chMessage(target, CH_COLOR + "6[Challenge] " + CH_COLOR + "e" + chName(player) +
        CH_COLOR + "7 wants a 60s rival battle");
    chMessage(target, CH_COLOR + "8  /challenge accept" + CH_COLOR + "7   or   " +
        CH_COLOR + "8/challenge decline");
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
        announcedCountdown: true,
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
    if (a !== null) chMessage(a, CH_COLOR + "6[Challenge] " + CH_COLOR + "eAccepted! Countdown...");
    if (b !== null) chMessage(b, CH_COLOR + "6[Challenge] " + CH_COLOR + "eAccepted! Countdown...");

    /*
     * Pair-key lock so accept spam / dual handlers cannot
     * flood the server with identical countdown lines.
     */
    var pairKey = chString(pending.fromUuid) + ">" + chString(pending.toUuid);
    if (chClaimCountdownAnnounce(pairKey)) {
        chBroadcast(CH_COLOR + "8--------------------------------");
        chBroadcast(CH_COLOR + "6[Rival Battle] " + CH_COLOR + "e" + pending.fromName +
            CH_COLOR + "7  vs  " + CH_COLOR + "e" + pending.toName);
        chBroadcast(CH_COLOR + "8Countdown..." + CH_COLOR + "7  Watch: " +
            CH_COLOR + "f/spectaterival " + pending.fromName);

        try {
            if (pending.related === true) {
                var coreDb = chLoadCoreDb(player);
                if (coreDb !== null) {
                    var fromRec = coreDb.players[pending.fromUuid];
                    var toRec = coreDb.players[pending.toUuid];
                    if (fromRec !== null && fromRec !== undefined && toRec !== null && toRec !== undefined) {
                        var pgLink = fromRec.rivals[pending.toUuid];
                        if (pgLink !== null && pgLink !== undefined) {
                            var pgCtx = pgNormalize(pgLink.provingGrounds);
                            if (a !== null) pgChallengeFlavor(a, pending.toName, pgCtx, pending.fromUuid);
                            if (b !== null) pgChallengeFlavor(b, pending.fromName, pgCtx, pending.toUuid);
                            if (pgCtx.active === true &&
                                ((a !== null && pgOnGrounds(a, pgCtx)) || (b !== null && pgOnGrounds(b, pgCtx)))) {
                                chBroadcast(CH_COLOR + "6Grounds  " + CH_COLOR + "e" + pgShortPlace(pgCtx));
                            }
                        }
                    }
                }
            }
        } catch (pgErr) {}
        chBroadcast(CH_COLOR + "8--------------------------------");
    }
}

function chAccept(player, fromName) {
    var db = chLoadChallengeDb(player);
    var pending = chFindPendingFor(db, chUuid(player), fromName);
    if (pending === null) {
        chMessage(player, CH_COLOR + "cNo pending challenge to accept.");
        return;
    }

    /* Prevent double-accept from multi-fire CMI/triggers */
    var acceptKey = "accept." + chString(pending.fromUuid) + ">" + chString(pending.toUuid);
    if (!chClaimCountdownAnnounce(acceptKey)) {
        chMessage(player, CH_COLOR + "7Challenge already accepted.");
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
    if (session.state !== "countdown") return;
    if (session.announcedFight === true) return;

    /*
     * Only the challenger's tick starts the fight. Both fighters tick the
     * countdown; without this they race and each get duplicate FIGHT lines.
     */
    if (chUuid(player) !== chString(session.challengerUuid)) return;

    var fightKey = "fight." + chString(session.challengerUuid) + ">" +
        chString(session.opponentUuid);
    if (!chClaimCountdownAnnounce(fightKey)) return;

    session.state = "active";
    var durationMs = chNumber(session.durationMs, CH_DURATION_MS);
    if (durationMs < CH_DURATION_MS) durationMs = CH_DURATION_MS;
    session.battleStartedAt = chNow();
    session.battleEndsAt = session.battleStartedAt + durationMs;
    session.lastScoreBroadcastAt = 0;
    session.announcedFight = true;
    chSaveChallengeDb(player, db);

    var a = chFindOnlineByUuid(session.challengerUuid);
    var b = chFindOnlineByUuid(session.opponentUuid);
    var minutes = Math.max(1, Math.round(durationMs / 60000));
    var fightLabel = minutes === 1 ? "60 seconds" : (minutes + " minutes");
    if (a !== null) chMessage(a, CH_COLOR + "c" + CH_COLOR + "lFIGHT! " + CH_COLOR + "r" +
        CH_COLOR + "eMost damage in " + fightLabel + "!");
    if (b !== null) chMessage(b, CH_COLOR + "c" + CH_COLOR + "lFIGHT! " + CH_COLOR + "r" +
        CH_COLOR + "eMost damage in " + fightLabel + "!");

    chBroadcast(CH_COLOR + "8--------------------------------");
    chBroadcast(CH_COLOR + "c" + CH_COLOR + "l FIGHT! " + CH_COLOR + "r");
    chBroadcast(CH_COLOR + "e" + session.challengerName + CH_COLOR + "7  vs  " +
        CH_COLOR + "e" + session.opponentName);
    chBroadcast(CH_COLOR + "8" + fightLabel + " most damage");
    try {
        if (session.related === true) {
            var fightCore = chLoadCoreDb(player);
            if (fightCore !== null) {
                var fightRec = fightCore.players[session.challengerUuid];
                if (fightRec !== null && fightRec !== undefined && fightRec.rivals[session.opponentUuid]) {
                    var fightPg = pgNormalize(fightRec.rivals[session.opponentUuid].provingGrounds);
                    if (fightPg.active === true &&
                        ((a !== null && pgOnGrounds(a, fightPg)) || (b !== null && pgOnGrounds(b, fightPg)))) {
                        chBroadcast(CH_COLOR + "6Grounds  " + CH_COLOR + "e" + pgShortPlace(fightPg) +
                            CH_COLOR + "8   Champion  " + CH_COLOR + "f" + (fightPg.championName || "-"));
                    }
                }
            }
        }
    } catch (fightPgErr) {}
    chBroadcast(CH_COLOR + "8Watch  " + CH_COLOR + "f/spectaterival " + session.challengerName);
    chBroadcast(CH_COLOR + "8--------------------------------");
}

function chBuildReport(session, winnerName, loserName) {
    var lines = [];
    /* ASCII-only borders - unicode box lines render as ? on many clients */
    lines.push(CH_COLOR + "8--------------------------------");
    lines.push(CH_COLOR + "6" + CH_COLOR + "l RIVAL BATTLE REPORT " + CH_COLOR + "r");
    lines.push(CH_COLOR + "8--------------------------------");
    if (winnerName === "Draw" || !loserName) {
        lines.push(CH_COLOR + "8Result  " + CH_COLOR + "eDraw");
    } else {
        lines.push(CH_COLOR + "8Winner  " + CH_COLOR + "a" + winnerName);
        lines.push(CH_COLOR + "8Runner  " + CH_COLOR + "c" + loserName);
    }
    lines.push(CH_COLOR + "8Time    " + CH_COLOR + "f" +
        chFormatMs(chBattleElapsedMs(session)) +
        CH_COLOR + "8   via  " + CH_COLOR + "7" + session.endReason);

    var ids = [session.challengerUuid, session.opponentUuid];
    for (var i = 0; i < ids.length; i++) {
        var combat = session.combat[ids[i]] || chFreshCombat();
        var name = ids[i] === session.challengerUuid ? session.challengerName : session.opponentName;
        lines.push(" ");
        lines.push(CH_COLOR + "e" + name);
        lines.push(CH_COLOR + "8  Damage  " + CH_COLOR + "f" + chCommas(combat.damage) +
            CH_COLOR + "8  (Phy " + chCommas(combat.physical) + " / Ki " + chCommas(combat.ki) + ")");
        lines.push(CH_COLOR + "8  Hits  " + CH_COLOR + "f" + combat.hits +
            CH_COLOR + "8   Best  " + CH_COLOR + "f" + chCommas(combat.biggestHit) +
            CH_COLOR + "8   Combo  " + CH_COLOR + "f" + combat.longestCombo);
    }
    lines.push(CH_COLOR + "8--------------------------------");
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
        var plannedMs = chPlannedDurationMs(session);
        var duration = chBattleElapsedMs(session);
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
            fullDuration: duration >= (plannedMs - 1500),
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

    var battleDuration = chBattleElapsedMs(session);
    function touchDuration(record, wonFlag) {
        if (record === null) return;
        record.career.longestBattleMs = Math.max(chNumber(record.career.longestBattleMs, 0), battleDuration);
        if (wonFlag === true) {
            var fastest = chNumber(record.career.fastestWinMs, 0);
            if (fastest <= 0 || battleDuration < fastest) record.career.fastestWinMs = battleDuration;
        }
    }

    var related = session.related === true;
    var mutual = challengerRecord !== null && opponentRecord !== null &&
        chAreMutual(core, session.challengerUuid, session.opponentUuid);
    if (challengerRecord !== null && opponentRecord !== null && related) {
        chEnsureLink(challengerRecord, opponentRecord);
        chEnsureLink(opponentRecord, challengerRecord);
    }

    function chTouchLinkHistory(ownerRec, otherUuid, myCombat, theirCombat, outcome) {
        if (ownerRec === null || ownerRec.rivals[otherUuid] === undefined) return;
        var L = ownerRec.rivals[otherUuid];
        var nowT = chNow();
        if (chNumber(L.firstBattleAt, 0) <= 0) L.firstBattleAt = nowT;
        if (chNumber(L.firstMetAt, 0) <= 0) L.firstMetAt = chNumber(L.createdAt, nowT);
        L.lastBattleAt = nowT;
        L.battles = chNumber(L.battles, 0) + 1;
        L.timeFoughtMs = chNumber(L.timeFoughtMs, 0) + battleDuration;
        L.damageDealt = chNumber(L.damageDealt, 0) + chNumber(myCombat.damage, 0);
        L.damageTaken = chNumber(L.damageTaken, 0) + chNumber(theirCombat.damage, 0);
        if (outcome === "win") {
            L.currentStreak = chNumber(L.currentStreak, 0) + 1;
            L.bestStreak = Math.max(chNumber(L.bestStreak, 0), L.currentStreak);
        } else if (outcome === "loss") {
            L.currentStreak = 0;
        }
        L.updatedAt = nowT;
    }

    function chLongRivalryBonus(ownerRec, otherUuid) {
        if (ownerRec === null || ownerRec.rivals[otherUuid] === undefined) return 0;
        var L = ownerRec.rivals[otherUuid];
        if (L.mutual !== true) return 0;
        var ageMs = Math.max(0, chNow() - chNumber(L.mutualSince, L.firstMetAt || 0));
        var days = Math.min(CH_LONG_RIVALRY_DAY_CAP, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
        return days * CH_LONG_RIVALRY_DAY_RP;
    }

    if (result.reason === "draw") {
        var drawTp = CH_DRAW_TP;
        var drawOnGrounds = false;
        if (related && challengerRecord !== null && opponentRecord !== null) {
            var drawPg = pgNormalize((challengerRecord.rivals[opponentRecord.uuid] || {}).provingGrounds);
            drawOnGrounds = drawPg.active === true &&
                ((challenger !== null && pgOnGrounds(challenger, drawPg)) ||
                    (opponent !== null && pgOnGrounds(opponent, drawPg)));
            if (drawOnGrounds) drawTp = Math.floor(drawTp * PG_ON_GROUNDS_TP_MULT);
        }
        if (challenger !== null) chAwardTP(challenger, drawTp, drawOnGrounds ? "Draw (Proving Grounds)" : "Draw");
        if (opponent !== null) chAwardTP(opponent, drawTp, drawOnGrounds ? "Draw (Proving Grounds)" : "Draw");
        if (related && challengerRecord !== null && opponentRecord !== null) {
            chTouchLinkHistory(challengerRecord, opponentRecord.uuid, cCombat, oCombat, "draw");
            chTouchLinkHistory(opponentRecord, challengerRecord.uuid, oCombat, cCombat, "draw");
            challengerRecord.rivals[opponentRecord.uuid].draws++;
            opponentRecord.rivals[challengerRecord.uuid].draws++;
            challengerRecord.career.officialDraws = chNumber(challengerRecord.career.officialDraws, 0) + 1;
            opponentRecord.career.officialDraws = chNumber(opponentRecord.career.officialDraws, 0) + 1;
            pgTouchDraw(challenger, opponent, challengerRecord, opponentRecord, cCombat, oCombat, battleDuration);
            var drawRp = CH_DRAW_RP;
            if (mutual) {
                var closeDraw = Math.min(chNumber(cCombat.damage, 0), chNumber(oCombat.damage, 0)) /
                    Math.max(1, Math.max(chNumber(cCombat.damage, 0), chNumber(oCombat.damage, 0))) >= CH_CLOSE_BATTLE_RATIO;
                if (closeDraw) drawRp += CH_CLOSE_BATTLE_RP;
                drawRp += chLongRivalryBonus(challengerRecord, opponentRecord.uuid);
                if (drawOnGrounds) drawRp += PG_ON_GROUNDS_RP_BONUS;
                chAwardRp(challengerRecord, opponentRecord.uuid, drawRp, "challenge_draw");
                chAwardRp(opponentRecord, challengerRecord.uuid, drawRp, "challenge_draw");
            }
            chWriteBattleResult(challenger, session, result, false, mutual ? drawRp : 0,
                challengerRecord.uuid + ">" + opponentRecord.uuid, {});
            chWriteBattleResult(opponent, session, result, false, mutual ? drawRp : 0,
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

    var pgResult = null;
    if (related && winnerRecord !== null && loserRecord !== null) {
        var wCombatPg = session.combat[winnerUuid] || chFreshCombat();
        var lCombatPg = session.combat[loserUuid] || chFreshCombat();
        /* Peek on-grounds before claim mutation for reward mults */
        var peekPg = pgNormalize(winnerRecord.rivals[loserRecord.uuid].provingGrounds);
        var fightingOnGrounds = peekPg.active === true &&
            ((winnerPlayer !== null && pgOnGrounds(winnerPlayer, peekPg)) ||
                (loserPlayer !== null && pgOnGrounds(loserPlayer, peekPg)));
        var underdogBefore = fightingOnGrounds &&
            rcString(peekPg.championUuid) !== "" &&
            rcString(peekPg.championUuid) !== winnerRecord.uuid;

        if (fightingOnGrounds) {
            winTp = Math.floor(winTp * PG_ON_GROUNDS_TP_MULT);
            winTp = Math.floor(winTp * (1.0 + PG_CHALLENGE_TP_BONUS));
            loseTp = Math.floor(loseTp * PG_ON_GROUNDS_TP_MULT);
            if (underdogBefore) winTp = Math.floor(winTp * PG_UNDERDOG_TP_MULT);
        }

        pgResult = pgProcessBattle(
            winnerPlayer, loserPlayer, winnerRecord, loserRecord,
            wCombatPg, lCombatPg, battleDuration
        );
    }

    var winNote = result.knockout ? "KO Victory" : "Victory";
    if (pgResult !== null && pgResult.onGrounds) winNote += " (Proving Grounds)";
    if (pgResult !== null && pgResult.reclaimed) winNote = "Reclaimed Proving Grounds";
    if (winnerPlayer !== null) chAwardTP(winnerPlayer, winTp, winNote);
    if (loserPlayer !== null && result.reason !== "forfeit" && result.reason !== "disconnect") {
        chAwardTP(loserPlayer, loseTp, pgResult !== null && pgResult.onGrounds ? "Participation (Proving Grounds)" : "Participation");
    }
    if (pgResult !== null && pgResult.reclaimed === true && winnerPlayer !== null) {
        chAwardTP(winnerPlayer, PG_RECLAIM_TP, "Honor Reclaimed");
    }

    touchDuration(winnerRecord, true);
    touchDuration(loserRecord, false);

    if (!related) {
        chWriteBattleResult(winnerPlayer, session, result, true, 0, "", {});
        chWriteBattleResult(loserPlayer, session, result, false, 0, "", {});
        chSaveCoreDb(player, core);
        return;
    }

    if (related && winnerRecord !== null && loserRecord !== null) {
        var wCombat = session.combat[winnerUuid] || chFreshCombat();
        var lCombat = session.combat[loserUuid] || chFreshCombat();
        chTouchLinkHistory(winnerRecord, loserRecord.uuid, wCombat, lCombat, "win");
        chTouchLinkHistory(loserRecord, winnerRecord.uuid, lCombat, wCombat, "loss");

        winnerRecord.rivals[loserRecord.uuid].wins++;
        loserRecord.rivals[winnerRecord.uuid].losses++;

        /*
         * Nemesis tracks DEATH / knockout losses only.
         * Timer or damage-dealt decisions do not increment deathLosses.
         */
        var deathLoss = result.knockout === true ||
            result.reason === "knockout" ||
            result.reason === "death";
        if (deathLoss && mutual) {
            rcRegisterMutualDeathLoss(
                core,
                loserRecord,
                winnerRecord,
                "Fallen in official challenge"
            );
            try {
                if (loserPlayer != null) {
                    loserPlayer.getTempdata().put("rival.v4.deathLossCounted", String(chNow()));
                }
            } catch (eMarkDeath) {}
        } else if (mutual) {
            /* Timer / damage wins never crown or advance Nemesis. */
            rcRecomputeNemesis(winnerRecord);
            rcRecomputeNemesis(loserRecord);
        }
        var loseRp = 0;
        if (mutual) {
            winRp = CH_WIN_RP;
            loseRp = CH_LOSE_RP + (result.knockout ? CH_KO_LOSE_RP_BONUS : 0);
            if (result.reason === "forfeit" || result.reason === "disconnect") {
                loseRp = -CH_FORFEIT_RP_PENALTY;
                winRp = CH_WIN_RP;
            } else {
                var closeFight = Math.min(chNumber(wCombat.damage, 0), chNumber(lCombat.damage, 0)) /
                    Math.max(1, Math.max(chNumber(wCombat.damage, 0), chNumber(lCombat.damage, 0))) >= CH_CLOSE_BATTLE_RATIO;
                if (closeFight) {
                    winRp += CH_CLOSE_BATTLE_RP;
                    loseRp += CH_CLOSE_BATTLE_RP;
                }
                var longBonus = chLongRivalryBonus(winnerRecord, loserRecord.uuid);
                winRp += longBonus;
                loseRp += longBonus;
            }
            if (pgResult !== null && (pgResult.onGrounds || pgResult.created)) {
                winRp += PG_ON_GROUNDS_RP_BONUS;
                loseRp += PG_ON_GROUNDS_RP_BONUS;
            }
            if (pgResult !== null && pgResult.reclaimed === true) {
                winRp += PG_RECLAIM_RP;
            }
            chAwardRp(winnerRecord, loserRecord.uuid, winRp, "challenge_win");
            chAwardRp(loserRecord, winnerRecord.uuid, loseRp,
                result.reason === "forfeit" ? "forfeit" : "challenge_loss");
        }

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

        var winLinkPts = chNumber(winnerRecord.rivals[loserRecord.uuid].points, 0);
        var loseLinkPts = chNumber(loserRecord.rivals[winnerRecord.uuid].points, 0);
        var firstWin = chNumber(winnerRecord.career.officialWins, 0) === 1;
        var comeback = chNumber(lCombat.damage, 0) > chNumber(wCombat.damage, 0);
        var beatHigher = loseLinkPts > winLinkPts;
        var legendScore = chNumber(wCombat.damage, 0) + chNumber(lCombat.damage, 0) +
            (result.knockout ? 5000 : 0) + (comeback ? 2500 : 0) + Math.floor(battleDuration / 1000) * 10;
        try {
            var progDb = rprogEnsureProg();
            var prevScore = rprogNum((progDb.hallOfFame || {}).legendaryMatchScore, 0);
            if (legendScore > prevScore) {
                if (progDb.hallOfFame == null) progDb.hallOfFame = {};
                progDb.hallOfFame.legendaryMatchScore = legendScore;
                progDb.hallOfFame.mostLegendaryMatch =
                    winnerRecord.name + " vs " + loserRecord.name +
                    " (" + Math.floor(legendScore) + ")";
                rprogSave(RPROG_PROG_KEY, RPROG_PROG_BACKUP, progDb);
            }
        } catch (hofErr) {}

        chWriteBattleResult(winnerPlayer, session, result, true, winRp,
            winnerRecord.uuid + ">" + loserRecord.uuid,
            { firstWin: firstWin, comeback: comeback, beatHigherRp: beatHigher });
        chWriteBattleResult(loserPlayer, session, result, false, Math.max(0, loseRp),
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

    /* Show full report to the whole server */
    if (CH_BROADCAST_REPORT === true) {
        chBroadcastLines(report);
        if (result.reason === "draw") {
            chBroadcast(CH_COLOR + "e[Rival Battle] " + CH_COLOR + "fDraw!");
        } else {
            chBroadcast(CH_COLOR + "a[Rival Battle] " + CH_COLOR + "f" + winnerName +
                CH_COLOR + "a takes the win!");
        }
    } else {
        for (var i = 0; i < report.length; i++) {
            if (a !== null) chMessage(a, report[i]);
            if (b !== null) chMessage(b, report[i]);
        }
    }

    if (result.reason !== "draw") {
        if (a !== null) {
            if (chUuid(a) === result.winnerUuid) chMessage(a, CH_COLOR + "a[Rival] Victory!");
            else chMessage(a, CH_COLOR + "c[Rival] Defeat!");
        }
        if (b !== null) {
            if (chUuid(b) === result.winnerUuid) chMessage(b, CH_COLOR + "a[Rival] Victory!");
            else chMessage(b, CH_COLOR + "c[Rival] Defeat!");
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

/* Health + absorption = real damage-received pool. */
function chGetHealthPool(player) {
    var health = 0;
    var absorption = 0;
    try { health = Number(player.getHealth()); } catch (e1) { health = 0; }
    try {
        if (typeof player.getAbsorptionAmount == "function") {
            absorption = Number(player.getAbsorptionAmount());
        } else if (typeof player.getAbsorption == "function") {
            absorption = Number(player.getAbsorption());
        }
    } catch (e2) {}
    try {
        var mc = player.getMCEntity();
        if (mc != null) {
            if (!(absorption > 0)) {
                try { absorption = Number(mc.getAbsorptionAmount()); } catch (e3) {}
            }
            if (!(health > 0)) {
                try { health = Number(mc.getHealth()); } catch (e4) {}
            }
        }
    } catch (e5) {}
    if (isNaN(health) || health < 0) health = 0;
    if (isNaN(absorption) || absorption < 0) absorption = 0;
    return health + absorption;
}

function chTempHas(temp, key) {
    try { return temp != null && temp.has(key); } catch (e) { return false; }
}

function chTempGetNumber(temp, key, fallback) {
    try {
        if (temp != null && temp.has(key)) return chNumber(temp.get(key), fallback);
    } catch (e) {}
    return fallback;
}

function chTempPut(temp, key, value) {
    try { temp.put(key, chString(value)); } catch (e) {}
}

function chTempClear(temp, key) {
    try {
        if (temp != null && temp.has(key)) temp.remove(key);
    } catch (e) {
        try { temp.put(key, ""); } catch (e2) {}
    }
}

function chSampleHealthPool(player) {
    if (player == null) return;
    try {
        chTempPut(player.getTempdata(), CH_HP_SAMPLE_KEY, chGetHealthPool(player));
    } catch (e) {}
}

function chClearPendingReceived(player) {
    if (player == null) return;
    try {
        var temp = player.getTempdata();
        chTempClear(temp, CH_PENDING_SAMPLE_KEY);
        chTempClear(temp, CH_PENDING_ATK_KEY);
        chTempClear(temp, CH_PENDING_KI_KEY);
        chTempClear(temp, CH_PENDING_UNTIL_KEY);
    } catch (e) {}
}

/*
 * Queue a received-damage resolve. LivingHurtEvent has not applied
 * mitigation yet, so we snapshot the pool and measure the drop next tick.
 */
function chQueueReceivedHit(victim, attackerUuid, isKi) {
    if (victim == null || attackerUuid == null || attackerUuid == "") return;
    try {
        var temp = victim.getTempdata();
        var pool = chGetHealthPool(victim);
        if (!chTempHas(temp, CH_PENDING_SAMPLE_KEY) ||
            chTempGetNumber(temp, CH_PENDING_SAMPLE_KEY, -1) < 0) {
            chTempPut(temp, CH_PENDING_SAMPLE_KEY, pool);
        }
        chTempPut(temp, CH_PENDING_ATK_KEY, attackerUuid);
        chTempPut(temp, CH_PENDING_KI_KEY, isKi === true ? "1" : "0");
        chTempPut(temp, CH_PENDING_UNTIL_KEY, chNow() + CH_PENDING_RESOLVE_MS);
    } catch (e) {}
}

/* Apply pending HP-loss as challenge damage dealt by the attacker. */
function chResolvePendingReceived(player, db) {
    if (player == null || db == null) return false;
    var temp = null;
    try { temp = player.getTempdata(); } catch (e0) { return false; }
    if (!chTempHas(temp, CH_PENDING_UNTIL_KEY)) return false;

    var until = chTempGetNumber(temp, CH_PENDING_UNTIL_KEY, 0);
    if (chNow() < until) return false;

    var sample = chTempGetNumber(temp, CH_PENDING_SAMPLE_KEY, -1);
    var atkUuid = "";
    try { atkUuid = chString(temp.get(CH_PENDING_ATK_KEY)); } catch (e1) { atkUuid = ""; }
    var isKi = false;
    try { isKi = chString(temp.get(CH_PENDING_KI_KEY)) == "1"; } catch (e2) {}

    chClearPendingReceived(player);

    if (sample < 0 || atkUuid == "") {
        chSampleHealthPool(player);
        return false;
    }

    var nowPool = chGetHealthPool(player);
    var received = sample - nowPool;
    chSampleHealthPool(player);

    if (!(received > 0.01)) return false;

    var vicUuid = chUuid(player);
    var session = chGetSession(db, vicUuid);
    if (session == null || session.state !== "active") return false;
    if (atkUuid !== session.challengerUuid && atkUuid !== session.opponentUuid) return false;
    if (vicUuid !== session.challengerUuid && vicUuid !== session.opponentUuid) return false;

    chRecordHit(session, atkUuid, vicUuid, received, isKi);
    return true;
}

/* ========================= EVENTS ========================= */

function rivalChInit(event) {
    try {
        if (!chIsPlayer(event.player)) return;
        chLoadChallengeDb(event.player);
    } catch (error) {
        chLog("init failed: " + error);
    }
}

function rivalChTick(event) {
    try {
        var player = event.player;
        if (!chIsPlayer(player)) return;

        var temp = player.getTempdata();
        var now = chNow();

        /*
         * Resolve received-damage before the challenge tick throttle so
         * HP-loss samples are applied on the first tick after the hit.
         */
        try {
            var earlyDb = chLoadChallengeDb(player);
            if (chResolvePendingReceived(player, earlyDb)) {
                chSaveChallengeDb(player, earlyDb);
            } else {
                var earlySession = chGetSession(earlyDb, chUuid(player));
                if (earlySession != null && earlySession.state === "active") {
                    if (!chTempHas(temp, CH_PENDING_UNTIL_KEY)) {
                        chSampleHealthPool(player);
                    }
                }
            }
        } catch (eHp) {}

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

            /* Live scoreboard for the whole server (challenger tick only).
             * Short fights: every 15s. Longer than 2 minutes: every 1 minute. */
            if (CH_BROADCAST_ENABLED === true && chUuid(player) === session.challengerUuid) {
                var lastScore = chNumber(session.lastScoreBroadcastAt, 0);
                var scoreInterval = chScoreBroadcastIntervalMs(session);
                if (lastScore <= 0 || now - lastScore >= scoreInterval) {
                    session.lastScoreBroadcastAt = now;
                    chSaveChallengeDb(player, db);
                    chBroadcast(chScoreLine(session));
                }
            }
        }
    } catch (error) {
        chLog("tick failed: " + error);
    }
}

function rivalChDamagedEntity(event) {
    /*
     * Intentionally no scoring here.
     * DamagedEntityEvent uses LivingHurtEvent pre-mitigation DMZ damage and
     * previously double-counted with the victim damaged event.
     * Challenge damage is measured as HP/absorption actually lost on the victim.
     */
}

function rivalChDamaged(event) {
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

        /* Snapshot pool now (pre-mitigation); tick resolves real HP lost. */
        chQueueReceivedHit(victim, atkUuid, chIsKiDamage(event));
    } catch (error) {
        chLog("damaged failed: " + error);
    }
}

function rivalChKill(event) {
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

function rivalChResolveKiller(damageSource) {
    var attacker = null;
    try { attacker = damageSource; } catch (ignored) {}
    if (chIsPlayer(attacker)) return attacker;
    try {
        if (damageSource != null && damageSource.getSourceEntity) {
            attacker = damageSource.getSourceEntity();
            if (chIsPlayer(attacker)) return attacker;
        }
    } catch (e1) {}
    try {
        if (damageSource != null && damageSource.getTrueSource) {
            attacker = damageSource.getTrueSource();
            if (chIsPlayer(attacker)) return attacker;
        }
    } catch (e2) {}
    try {
        if (damageSource != null && damageSource.getImmediateSource) {
            attacker = damageSource.getImmediateSource();
            if (chIsPlayer(attacker)) return attacker;
        }
    } catch (e3) {}
    return null;
}

function rivalChDied(event) {
    try {
        var victim = event.player;
        if (!chIsPlayer(victim)) return;

        var db = chLoadChallengeDb(victim);
        var session = chGetSession(db, chUuid(victim));
        if (session === null || session.state !== "active") return;

        var source = null;
        try { source = rivalChResolveKiller(event.source); } catch (ignored) {}
        if (!chIsPlayer(source)) {
            /* Environment / unresolved death still counts as KO vs opponent. */
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

        var killerUuid = chUuid(source);
        if (killerUuid !== session.challengerUuid && killerUuid !== session.opponentUuid) {
            killerUuid = chUuid(victim) === session.challengerUuid
                ? session.opponentUuid
                : session.challengerUuid;
        }

        chEndSession(victim, db, session, {
            reason: "knockout",
            winnerUuid: killerUuid,
            loserUuid: chUuid(victim),
            knockout: true
        });
    } catch (error) {
        chLog("died failed: " + error);
    }
}

function rivalChLogout(event) {
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

/*
 Commands live in Rival Command Handler.js (script-slot),
 matching Sparring Command Handler. Global Player trigger unused.
*/
function rivalChTriggerUnused(event) {
    return;
}

/* ========================= INSTINCT ========================= */

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

var RI_COLOR = "\u00A7";
var RI_DB = "dlr.rivalry.v4.database";
var RI_CH_KEY = "dlr.rivalry.v4.challenges";
var RI_TICK_MS = 4000;
/* Quiet by default: arrive once, rare status pulses, event spikes only */
var RI_ALERT_COOLDOWN_MS = 45000;
var RI_ARRIVE_COOLDOWN_MS = 90000;
var RI_STATUS_COOLDOWN_MS = 120000;
var RI_EVENT_COOLDOWN_MS = 20000;
var RI_MUTE_DURING_CHALLENGE = true;

var RI_TIERS = [
    { min: 0,    range: 48,  relative: false, charging: false, battlePower: false, form: false, fusion: false, name: "Acquaintance" },
    { min: 100,  range: 64,  relative: true,  charging: false, battlePower: false, form: false, fusion: false, name: "Competitor" },
    { min: 300,  range: 80,  relative: true,  charging: true,  battlePower: false, form: false, fusion: false, name: "Adversary" },
    { min: 700,  range: 96,  relative: true,  charging: true,  battlePower: true,  form: false, fusion: false, name: "Rival" },
    { min: 1500, range: 128, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: false, name: "Vendetta" },
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

function riAlert(temp, key, message, player, cooldownMs) {
    var cd = riNum(cooldownMs, RI_ALERT_COOLDOWN_MS);
    var last = 0;
    try { if (temp.has(key)) last = riNum(temp.get(key), 0); } catch (e) {}
    if (riNow() - last < cd) return false;
    try { temp.put(key, String(riNow())); } catch (e2) {}
    riMsg(player, message);
    return true;
}

function riInChallenge(player) {
    if (RI_MUTE_DURING_CHALLENGE !== true) return false;
    try {
        var w = riWorld(player);
        if (w == null) return false;
        var stored = w.getStoreddata();
        if (stored == null || !stored.has(RI_CH_KEY)) return false;
        var ch = JSON.parse(String(stored.get(RI_CH_KEY)));
        if (ch == null || ch.playerSessions == null) return false;
        var sid = ch.playerSessions[riUuid(player)];
        if (sid == null) return false;
        var session = ch.sessions != null ? ch.sessions[String(sid)] : null;
        if (session == null) return false;
        var st = riStr(session.state);
        return st === "active" || st === "countdown";
    } catch (e) {
        return false;
    }
}

function riScan(player) {
    var db = riLoad(player);
    if (db == null) return;
    var record = db.players[riUuid(player)];
    if (record == null || record.rivals == null) return;
    if (riInChallenge(player)) return;

    var myData = riDMZ(player);
    var myReleased = riReleased(myData);
    var temp = player.getTempdata();

    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;
        var link = record.rivals[uuid];
        /* Real Rival Instinct unlocks with Mutual (Nemesis included). */
        if (link.mutual !== true) continue;

        var rival = riFind(uuid);
        if (rival == null) {
            try { temp.put("rival.v4.instinct.wasNear." + uuid, "0"); } catch (eAway) {}
            continue;
        }

        var tier = riTier(link.points);
        var dist = riDist(player, rival);
        var wasNear = false;
        try {
            if (temp.has("rival.v4.instinct.wasNear." + uuid)) {
                wasNear = riStr(temp.get("rival.v4.instinct.wasNear." + uuid)) === "1";
            }
        } catch (eWas) {}

        if (dist > tier.range) {
            try { temp.put("rival.v4.instinct.wasNear." + uuid, "0"); } catch (eClear) {}
            continue;
        }

        try { temp.put("rival.v4.instinct.wasNear." + uuid, "1"); } catch (eSet) {}

        var rivalData = riDMZ(rival);
        var status = riStatus(rivalData);
        var theirReleased = riReleased(rivalData);
        var tag = rcLinkStatus(link) === "nemesis" ? "Nemesis" : tier.name;

        /* Arrive: one combined ping when they enter range (not every few seconds). */
        if (!wasNear) {
            var arriveMsg = RI_COLOR + "6[Rival Instinct] " + RI_COLOR + "e" + link.name +
                RI_COLOR + "7 arrived (" + Math.floor(dist) + "m)";
            if (tier.relative) {
                arriveMsg += RI_COLOR + "7 - feels " + riRelative(myReleased, theirReleased);
            }
            arriveMsg += RI_COLOR + "8 [" + tag + "]";
            riAlert(temp, "rival.v4.instinct.arrive." + uuid, arriveMsg, player, RI_ARRIVE_COOLDOWN_MS);
            continue;
        }

        /* While already near: only rare status pulse + spike events. */
        if (tier.battlePower) {
            riAlert(
                temp,
                "rival.v4.instinct.bp." + uuid,
                RI_COLOR + "b[Rival Instinct] " + RI_COLOR + "e" + link.name +
                RI_COLOR + "7 still nearby - released BP ~ " + RI_COLOR + "f" + riFormat(theirReleased),
                player,
                RI_STATUS_COOLDOWN_MS
            );
        }

        if (tier.charging && status != null) {
            try {
                if (status.isChargingKi() === true || status.isActionCharging() === true) {
                    riAlert(
                        temp,
                        "rival.v4.instinct.charge." + uuid,
                        RI_COLOR + "c[Rival Instinct] " + RI_COLOR + "e" + link.name +
                        RI_COLOR + "c is charging ki!",
                        player,
                        RI_EVENT_COOLDOWN_MS
                    );
                }
            } catch (e) {}
        }

        if (tier.form && rivalData != null) {
            try {
                var formMult = 1.0;
                try { formMult = Number(rivalData.getFormMultiplier("STR")); } catch (eFm) { formMult = 1.0; }
                var auraOn = false;
                try { if (status != null) auraOn = status.isAuraActive() === true; } catch (eAu) {}
                if (auraOn || formMult > 1.05) {
                    riAlert(
                        temp,
                        "rival.v4.instinct.aura." + uuid,
                        RI_COLOR + "d[Rival Instinct] " + RI_COLOR + "e" + link.name +
                        RI_COLOR + "d transformation / aura surge!",
                        player,
                        RI_EVENT_COOLDOWN_MS
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
                        player,
                        RI_EVENT_COOLDOWN_MS
                    );
                }
            } catch (e4) {}
        }
    }
}

function rivalInstinctTick(event) {
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

function rivalInstinctLogin(event) {
    /* Silent login - no chat spam. Instinct starts on tick. */
    try { if (!riIsPlayer(event.player)) return; } catch (e) {}
}

/* ========================= PROGRESSION ========================= */

var RPROG_API = null;
var RPROG_Bukkit = null;

function rprogApi() {
    if (RPROG_API === null) RPROG_API = Java.type("noppes.npcs.api.NpcAPI");
    return RPROG_API;
}
function rprogBukkit() {
    if (RPROG_Bukkit === null) RPROG_Bukkit = Java.type("org.bukkit.Bukkit");
    return RPROG_Bukkit;
}

var RPROG_C = "\u00A7";
var RPROG_DB_KEY = "dlr.rivalry.v4.database";
var RPROG_CH_KEY = "dlr.rivalry.v4.challenges";
var RPROG_PROG_KEY = "dlr.rivalry.v4.progression";
var RPROG_PROG_BACKUP = "dlr.rivalry.v4.progression.backup";

var RPROG_TIERS = [
    { min: 0, name: "Acquaintance" },
    { min: 100, name: "Competitor" },
    { min: 300, name: "Adversary" },
    { min: 700, name: "Rival" },
    { min: 1500, name: "Vendetta" },
    { min: 3000, name: "Legendary" },
    { min: 5000, name: "Arch Rival" },
    { min: 7500, name: "Mortal Enemy" },
    { min: 10000, name: "Eternal Rival" },
    { min: 15000, name: "Mythic Rival" }
];

function rprogNow() {
    try { return Number(new Date().getTime()); }
    catch (e) { return Number(Java.type("java.lang.System").currentTimeMillis()); }
}
function rprogStr(v) { return v == null ? "" : String(v); }
function rprogNum(v, f) { var n = Number(v); return isNaN(n) || !isFinite(n) ? f : n; }
function rprogMsg(p, t) { try { p.message(t); } catch (e) {} }
function rprogIsPlayer(e) {
    if (e == null) return false;
    try { return Number(e.getType()) === 1; } catch (ex) { return false; }
}
function rprogUuid(p) { try { return rprogStr(p.getUUID()); } catch (e) { return ""; } }
function rprogPname(p) { try { return rprogStr(p.getName()); } catch (e) { return "Unknown"; } }

function rprogStore() {
    var names = ["minecraft:overworld", "overworld"];
    for (var i = 0; i < names.length; i++) {
        try {
            var w = rprogApi().Instance().getIWorld(names[i]);
            if (w != null) return w.getStoreddata();
        } catch (e) {}
    }
    return null;
}

function rprogLoad(key) {
    var s = rprogStore();
    if (s == null || !s.has(key)) return null;
    try { return JSON.parse(rprogStr(s.get(key))); } catch (e) { return null; }
}

function rprogSave(key, backup, obj) {
    var s = rprogStore();
    if (s == null) return;
    try {
        if (s.has(key)) s.put(backup, rprogStr(s.get(key)));
        obj.updatedAt = rprogNow();
        s.put(key, JSON.stringify(obj));
    } catch (e) {}
}

function rprogTierName(points) {
    var rp = Math.max(0, rprogNum(points, 0));
    var name = RPROG_TIERS[0].name;
    for (var i = 0; i < RPROG_TIERS.length; i++) if (rp >= RPROG_TIERS[i].min) name = RPROG_TIERS[i].name;
    return name;
}

function rprogEnsureProg() {
    var prog = rprogLoad(RPROG_PROG_KEY);
    if (prog == null || typeof prog != "object") {
        prog = {
            version: 4,
            season: {
                id: 1,
                name: "Season 1",
                startedAt: rprogNow(),
                endsAt: rprogNow() + (75 * 86400000),
                leaderboard: {}
            },
            achievements: {},
            quests: {},
            journal: {},
            hallOfFame: {},
            specialTitles: {},
            processedBattles: {},
            updatedAt: rprogNow()
        };
    }
    if (prog.season == null) prog.season = { id: 1, name: "Season 1", startedAt: rprogNow(), endsAt: rprogNow() + (75 * 86400000), leaderboard: {} };
    if (prog.achievements == null) prog.achievements = {};
    if (prog.quests == null) prog.quests = {};
    if (prog.journal == null) prog.journal = {};
    if (prog.hallOfFame == null) prog.hallOfFame = {};
    if (prog.specialTitles == null) prog.specialTitles = {};
    if (prog.processedBattles == null) prog.processedBattles = {};
    return prog;
}

function rprogWeekKey() { return String(Math.floor(rprogNow() / (7 * 86400000))); }

function rprogEnsureQuests(prog, id) {
    var key = rprogWeekKey();
    if (prog.quests[id] == null || prog.quests[id].week != key) {
        prog.quests[id] = {
            week: key,
            list: [
                { id: "defeat_rival", name: "Defeat your rival", goal: 1, progress: 0, rp: 40 },
                { id: "melee_hits", name: "Land 50 melee hits in challenges", goal: 50, progress: 0, rp: 25 },
                { id: "ki_damage", name: "Deal 20,000 Ki damage in challenges", goal: 20000, progress: 0, rp: 25 },
                { id: "three_battles", name: "Fight 3 official battles", goal: 3, progress: 0, rp: 30 },
                { id: "long_battle", name: "Finish a full 60s battle", goal: 1, progress: 0, rp: 20 }
            ]
        };
    }
    return prog.quests[id];
}

function rprogBumpQuest(q, id, amount) {
    for (var i = 0; i < q.list.length; i++) {
        if (q.list[i].id == id) {
            q.list[i].progress = rprogNum(q.list[i].progress, 0) + amount;
        }
    }
}

function rprogUnlock(prog, id, ach, player) {
    if (prog.achievements[id] == null) prog.achievements[id] = {};
    if (prog.achievements[id][ach] === true) return;
    prog.achievements[id][ach] = true;
    /* "nemesis" achievement id = RP Vendetta rank, not relationship Nemesis. */
    var achLabel = ach == "nemesis" ? "Vendetta Rank" : ach.replace(/_/g, " ");
    rprogMsg(player, RPROG_C + "6[Rival Achievement] " + RPROG_C + "e" + achLabel);
    if (ach == "legend_killer") prog.specialTitles[id] = "legend_killer";
    if (ach == "god_rival") prog.specialTitles[id] = "god_slayer";
}

function rprogSyncTitle(player, title) {
    try {
        var safe = rprogStr(title).replace(/[^A-Za-z0-9 _\-]/g, "");
        rprogBukkit().dispatchCommand(
            rprogBukkit().getConsoleSender(),
            "cmi usermeta " + rprogPname(player) + " set rival_title " + safe
        );
    } catch (e) {}
}

function recomputeHof(prog, db) {
    if (db == null || db.players == null) return;
    if (prog.hallOfFame == null || typeof prog.hallOfFame !== "object") prog.hallOfFame = {};

    var bestRp = null;
    var bestStreak = null;
    var bestBattles = null;
    var greatestRivals = null;
    var longestRivalry = null;
    var seenPairs = {};

    for (var id in db.players) {
        if (!db.players.hasOwnProperty(id)) continue;
        var rec = db.players[id];
        var career = rec.career || {};
        var rp = rprogNum(career.rivalPointsTotal, 0);
        var streak = rprogNum(career.bestStreak, 0);
        var battles = rprogNum(career.challengesPlayed, 0);
        if (bestRp == null || rp > bestRp.rp) bestRp = { name: rec.name + " (" + rp + " RP)", rp: rp };
        if (bestStreak == null || streak > bestStreak.v) bestStreak = { name: rec.name + " (" + streak + ")", v: streak };
        if (bestBattles == null || battles > bestBattles.v) bestBattles = { name: rec.name + " (" + battles + ")", v: battles };

        if (rec.rivals == null) continue;
        for (var rid in rec.rivals) {
            if (!rec.rivals.hasOwnProperty(rid)) continue;
            var link = rec.rivals[rid];
            if (link.mutual !== true) continue;
            var pairKey = id < rid ? id + "|" + rid : rid + "|" + id;
            if (seenPairs[pairKey]) continue;
            seenPairs[pairKey] = true;

            var fightCount = rprogNum(link.battles, 0);
            if (fightCount <= 0) {
                fightCount = rprogNum(link.wins, 0) + rprogNum(link.losses, 0) + rprogNum(link.draws, 0);
            }
            var realNemesis = link.isNemesis === true &&
                rprogNum(link.deathLosses, 0) >= RC_NEMESIS_DEATH_LOSSES;
            var pairScore = fightCount * 10 + rprogNum(link.points, 0) +
                (realNemesis ? 100 : 0);
            var pairName = rec.name + " vs " + link.name + " (" + fightCount + " battles)";
            if (greatestRivals == null || pairScore > greatestRivals.v) {
                greatestRivals = { name: pairName, v: pairScore };
            }

            var since = rprogNum(link.mutualSince, rprogNum(link.firstMetAt, 0));
            if (since > 0) {
                var age = rprogNow() - since;
                if (longestRivalry == null || age > longestRivalry.v) {
                    var days = Math.floor(age / (24 * 60 * 60 * 1000));
                    longestRivalry = {
                        name: rec.name + " and " + link.name + " (" + days + "d)",
                        v: age
                    };
                }
            }
        }
    }

    var seasonRows = [];
    if (prog.season != null && prog.season.leaderboard != null) {
        for (var sid in prog.season.leaderboard) {
            if (!prog.season.leaderboard.hasOwnProperty(sid)) continue;
            seasonRows.push(prog.season.leaderboard[sid]);
        }
    }
    seasonRows.sort(function (a, b) { return rprogNum(b.rp, 0) - rprogNum(a.rp, 0); });
    prog.hallOfFame.seasonChampion = seasonRows.length > 0 ? seasonRows[0].name + " (" + seasonRows[0].rp + " SRP)" : "-";
    prog.hallOfFame.highestRp = bestRp != null ? bestRp.name : "-";
    prog.hallOfFame.longestStreak = bestStreak != null ? bestStreak.name : "-";
    prog.hallOfFame.mostBattles = bestBattles != null ? bestBattles.name : "-";
    prog.hallOfFame.mostLegendary = prog.hallOfFame.mostBattles;
    prog.hallOfFame.greatestRivals = greatestRivals != null ? greatestRivals.name : "-";
    prog.hallOfFame.longestRivalry = longestRivalry != null ? longestRivalry.name : "-";
    if (prog.hallOfFame.mostLegendaryMatch == null) prog.hallOfFame.mostLegendaryMatch = "-";
    if (prog.hallOfFame.greatestComeback == null) prog.hallOfFame.greatestComeback = "-";
}

function processEndedSessions(player) {
    var ch = rprogLoad(RPROG_CH_KEY);
    var db = rprogLoad(RPROG_DB_KEY);
    var prog = rprogEnsureProg();
    if (ch == null || ch.sessions == null) {
        /* ended sessions are deleted by Challenge; use career deltas via temp marker */
        return;
    }
}

/*
 Challenge module deletes finished sessions. Progression is therefore applied
 from player career snapshots + combat temp export hooks below.
*/
function onLoginProgress(player) {
    var db = rprogLoad(RPROG_DB_KEY);
    var prog = rprogEnsureProg();
    if (db == null) return;
    var rec = db.players[rprogUuid(player)];
    if (rec == null) return;
    var rp = rprogNum((rec.career || {}).rivalPointsTotal, 0);
    var title = prog.specialTitles[rprogUuid(player)] || rprogTierName(rp);
    if (title == "legend_killer") title = "Legend Killer";
    if (title == "god_slayer") title = "God Slayer";
    if (title == "world_rival") title = "World Rival";
    if (title == "universe_rival") title = "Universe Rival";
    rprogSyncTitle(player, typeof title == "string" && title.indexOf(" ") >= 0 ? title : rprogTierName(rp));
    rprogEnsureQuests(prog, rprogUuid(player));
    recomputeHof(prog, db);
    rprogSave(RPROG_PROG_KEY, RPROG_PROG_BACKUP, prog);

    /* Achievement id kept as "nemesis" for save compat; it is RP-tier Vendetta, not relationship Nemesis. */
    if (rprogNum((rec.career || {}).rivalPointsTotal, 0) >= 1500) rprogUnlock(prog, rprogUuid(player), "nemesis", player);
    if (rprogNum((rec.career || {}).bestStreak, 0) >= 5) rprogUnlock(prog, rprogUuid(player), "unbreakable", player);
    if (rprogNum((rec.career || {}).challengesPlayed, 0) >= 25) rprogUnlock(prog, rprogUuid(player), "battle_hardened", player);
    if (rprogNum((rec.career || {}).highestCombo, 0) >= 20) rprogUnlock(prog, rprogUuid(player), "combo_master", player);
    if (rprogNum((rec.career || {}).rivalPointsTotal, 0) >= 15000) rprogUnlock(prog, rprogUuid(player), "god_rival", player);
    rprogSave(RPROG_PROG_KEY, RPROG_PROG_BACKUP, prog);
}

function trackChallengeCombat(player) {
    var ch = rprogLoad(RPROG_CH_KEY);
    if (ch == null || ch.playerSessions == null) return;
    var sid = ch.playerSessions[rprogUuid(player)];
    if (sid == null) return;
    var session = ch.sessions[String(sid)];
    if (session == null || session.state != "active") return;

    var combat = session.combat && session.combat[rprogUuid(player)] ? session.combat[rprogUuid(player)] : null;
    if (combat == null) return;

    var prog = rprogEnsureProg();
    var q = rprogEnsureQuests(prog, rprogUuid(player));
    var temp = player.getTempdata();
    var lastHits = 0;
    var lastKi = 0;
    try {
        if (temp.has("rival.v4.prog.hits")) lastHits = rprogNum(temp.get("rival.v4.prog.hits"), 0);
        if (temp.has("rival.v4.prog.ki")) lastKi = rprogNum(temp.get("rival.v4.prog.ki"), 0);
    } catch (e) {}

    var hits = rprogNum(combat.hits, 0);
    var ki = rprogNum(combat.ki, 0);
    var phy = rprogNum(combat.physical, 0);
    if (hits > lastHits) rprogBumpQuest(q, "melee_hits", hits - lastHits);
    if (ki > lastKi) rprogBumpQuest(q, "ki_damage", Math.floor(ki - lastKi));
    try {
        temp.put("rival.v4.prog.hits", String(hits));
        temp.put("rival.v4.prog.ki", String(ki));
    } catch (e2) {}

    if (ki >= 5000) rprogUnlock(prog, rprogUuid(player), "ki_dominator", player);
    if (rprogNum(combat.longestCombo, 0) >= 20) rprogUnlock(prog, rprogUuid(player), "combo_master", player);
    rprogSave(RPROG_PROG_KEY, RPROG_PROG_BACKUP, prog);
}

function noteBattleResult(player) {
    /*
     Detect win/loss messages already handled by Challenge.
     Use career counters + temp flag set by Challenge export if present.
    */
    var temp = player.getTempdata();
    if (!temp.has("rival.v4.battleResult")) return;
    var raw = rprogStr(temp.get("rival.v4.battleResult"));
    try { temp.remove("rival.v4.battleResult"); } catch (e) {}
    var data = null;
    try { data = JSON.parse(raw); } catch (e2) { return; }
    if (data == null) return;

    var prog = rprogEnsureProg();
    var db = rprogLoad(RPROG_DB_KEY);
    var id = rprogUuid(player);
    var q = rprogEnsureQuests(prog, id);
    rprogBumpQuest(q, "three_battles", 1);
    if (data.fullDuration === true) rprogBumpQuest(q, "long_battle", 1);
    if (data.won === true) rprogBumpQuest(q, "defeat_rival", 1);

    if (data.won === true && rprogNum(data.damageTaken, 0) <= 0) rprogUnlock(prog, id, "untouchable", player);
    if (data.won === true && rprogNum(data.remainingHpPct, 100) >= 90) rprogUnlock(prog, id, "perfect_victory", player);
    if (data.comeback === true) {
        rprogUnlock(prog, id, "comeback_king", player);
        prog.hallOfFame.greatestComeback = rprogPname(player);
    }
    if (data.firstWin === true) rprogUnlock(prog, id, "first_blood", player);
    if (data.beatHigherRp === true) rprogUnlock(prog, id, "legend_killer", player);

    var jKey = rprogStr(data.journalKey || "");
    if (jKey != "") {
        if (prog.journal[jKey] == null) prog.journal[jKey] = {};
        var j = prog.journal[jKey];
        if (j.firstBattleAt == null) j.firstBattleAt = rprogNow();
        if (data.won === true) {
            if (j.firstWinAt == null) j.firstWinAt = rprogNow();
            j.biggestWinDamage = Math.max(rprogNum(j.biggestWinDamage, 0), rprogNum(data.damageDealt, 0));
        } else {
            if (j.firstLossAt == null) j.firstLossAt = rprogNow();
            j.biggestLossDamage = Math.max(rprogNum(j.biggestLossDamage, 0), rprogNum(data.damageTaken, 0));
        }
        j.lastBattleAt = rprogNow();
        j.battlesThisSeason = rprogNum(j.battlesThisSeason, 0) + 1;
    }

    if (prog.season.leaderboard[id] == null) {
        prog.season.leaderboard[id] = { rprogUuid: id, name: rprogPname(player), rp: 0, wins: 0 };
    }
    prog.season.leaderboard[id].name = rprogPname(player);
    prog.season.leaderboard[id].rp = rprogNum(prog.season.leaderboard[id].rp, 0) + rprogNum(data.seasonRp, 0);
    if (data.won === true) prog.season.leaderboard[id].wins = rprogNum(prog.season.leaderboard[id].wins, 0) + 1;

    recomputeHof(prog, db);
    rprogSave(RPROG_PROG_KEY, RPROG_PROG_BACKUP, prog);
}

function rivalProgLogin(event) {
    try {
        if (!rprogIsPlayer(event.player)) return;
        onLoginProgress(event.player);
    } catch (e) {
        try { print("[RivalProgression] login " + e); } catch (e2) {}
    }
}

function rivalProgTick(event) {
    try {
        var player = event.player;
        if (!rprogIsPlayer(player)) return;
        var temp = player.getTempdata();
        var last = 0;
        try { if (temp.has("rival.v4.prog.tick")) last = rprogNum(temp.get("rival.v4.prog.tick"), 0); } catch (e) {}
        if (rprogNow() - last < 1000) return;
        try { temp.put("rival.v4.prog.tick", String(rprogNow())); } catch (e2) {}
        trackChallengeCombat(player);
        noteBattleResult(player);
    } catch (e3) {
        try { print("[RivalProgression] tick " + e3); } catch (e4) {}
    }
}

function rivalProgTrigger(event) {
    try {
        var player = event.entity != null ? event.entity : event.player;
        if (!rprogIsPlayer(player)) return;
        if (Number(event.id) != 240) return;
        onLoginProgress(player);
        rprogMsg(player, RPROG_C + "a[Rival] Titles / HOF refreshed.");
    } catch (e) {}
}

/* ========================= SPECTATOR ========================= */

var RS_API = null;
function rsApi() {
    if (RS_API === null) RS_API = Java.type("noppes.npcs.api.NpcAPI");
    return RS_API;
}

var RS_C = "\u00A7";
var RS_CH_KEY = "dlr.rivalry.v4.challenges";

function rsNow() {
    try { return Number(new Date().getTime()); }
    catch (e) { return Number(Java.type("java.lang.System").currentTimeMillis()); }
}
function rsStr(v) { return v == null ? "" : String(v); }
function rsNum(v, f) { var n = Number(v); return isNaN(n) || !isFinite(n) ? f : n; }
function rsMsg(p, t) { try { p.message(t); } catch (e) {} }
function rsIsPlayer(e) {
    if (e == null) return false;
    try { return Number(e.getType()) === 1; } catch (ex) { return false; }
}
function rsCommas(v) {
    var n = Math.floor(rsNum(v, 0));
    var raw = String(n);
    var out = "";
    while (raw.length > 3) {
        out = "," + raw.substring(raw.length - 3) + out;
        raw = raw.substring(0, raw.length - 3);
    }
    return raw + out;
}

function rsLoadCh() {
    try {
        var names = ["minecraft:overworld", "overworld"];
        for (var i = 0; i < names.length; i++) {
            var w = rsApi().Instance().getIWorld(names[i]);
            if (w == null) continue;
            var sd = w.getStoreddata();
            if (!sd.has(RS_CH_KEY)) return null;
            return JSON.parse(rsStr(sd.get(RS_CH_KEY)));
        }
    } catch (e) {}
    return null;
}

function rivalSpecTick(event) {
    try {
        var player = event.player;
        if (!rsIsPlayer(player)) return;
        var temp = player.getTempdata();
        if (!temp.has("rival.v4.spectateSession")) return;

        var until = rsNum(temp.get("rival.v4.spectateUntil"), 0);
        if (rsNow() > until) {
            try { temp.remove("rival.v4.spectateSession"); temp.remove("rival.v4.spectateUntil"); } catch (e) {}
            rsMsg(player, RS_C + "7Spectate ended.");
            return;
        }

        var last = 0;
        try { if (temp.has("rival.v4.spectate.tick")) last = rsNum(temp.get("rival.v4.spectate.tick"), 0); } catch (e2) {}
        if (rsNow() - last < 2000) return;
        try { temp.put("rival.v4.spectate.tick", String(rsNow())); } catch (e3) {}

        var sid = rsStr(temp.get("rival.v4.spectateSession"));
        var ch = rsLoadCh();
        if (ch == null || ch.sessions == null || ch.sessions[sid] == null) {
            rsMsg(player, RS_C + "eBattle ended.");
            try { temp.remove("rival.v4.spectateSession"); } catch (e4) {}
            return;
        }
        var session = ch.sessions[sid];
        var a = (session.combat && session.combat[session.challengerUuid]) || {};
        var b = (session.combat && session.combat[session.opponentUuid]) || {};
        var left = session.state == "active"
            ? Math.max(0, Math.ceil((rsNum(session.battleEndsAt, 0) - rsNow()) / 1000))
            : 0;
        rsMsg(player, RS_C + "8[Spec] " + RS_C + "f" + session.challengerName + " " + rsCommas(a.damage || 0) +
            RS_C + "8 vs " + RS_C + "f" + session.opponentName + " " + rsCommas(b.damage || 0) +
            (session.state == "active" ? RS_C + "7 (" + left + "s)" : RS_C + "7 [" + session.state + "]"));
    } catch (error) {
        try { print("[RivalSpectator] " + error); } catch (e) {}
    }
}

/* ========================= DMZ / FUSION ========================= */

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

var RF_C = "\u00A7";
var RF_DB_KEY = "dlr.rivalry.v4.database";
var RF_BONUS_NAME = "Rival Fusion";
var RF_TICK_MS = 1000;
var RF_KILL_TP = 650;
var RF_MAX_FUSION_BONUS = 0.25;

function rfNow() {
    try { return Number(new Date().getTime()); }
    catch (e) { return Number(Java.type("java.lang.System").currentTimeMillis()); }
}
function rfStr(v) { return v == null ? "" : String(v); }
function rfNum(v, f) { var n = Number(v); return isNaN(n) || !isFinite(n) ? f : n; }
function rfMsg(p, t) { try { p.message(t); } catch (e) {} }
function rfIsPlayer(e) {
    if (e == null) return false;
    try { return Number(e.getType()) === 1; } catch (ex) { return false; }
}
function rfUuid(p) { try { return rfStr(p.getUUID()); } catch (e) { return ""; } }

function rfLoadDb() {
    try {
        var names = ["minecraft:overworld", "overworld"];
        for (var i = 0; i < names.length; i++) {
            var w = rfApi().Instance().getIWorld(names[i]);
            if (w == null) continue;
            var sd = w.getStoreddata();
            if (!sd.has(RF_DB_KEY)) return null;
            return JSON.parse(rfStr(sd.get(RF_DB_KEY)));
        }
    } catch (e) {}
    return null;
}

function rfGetDmz(player) {
    try {
        return rfStatsProvider().get(rfStatsCap().INSTANCE, player.getMCEntity()).orElse(null);
    } catch (e) { return null; }
}

function rfClearBonus(data) {
    if (data == null) return;
    try {
        var b = data.getBonusStats();
        b.removeBonus("STR", RF_BONUS_NAME);
        b.removeBonus("SKP", RF_BONUS_NAME);
    } catch (e) {}
}

function rfApplyBonus(player, data, mult) {
    if (data == null) return;
    try {
        var b = data.getBonusStats();
        rfClearBonus(data);
        if (mult <= 1.001) {
            rfNetwork().sendToTrackingEntityAndSelf(new (rfSync())(player.getMCEntity()), player.getMCEntity());
            return;
        }
        var strVal = 0;
        var skpVal = 0;
        try { strVal = Number(data.getCurrentStatValue("STR")); } catch (e1) {}
        try { skpVal = Number(data.getCurrentStatValue("SKP")); } catch (e2) {}
        var key = skpVal > strVal ? "SKP" : "STR";
        b.addBonus(key, RF_BONUS_NAME, "*", mult);
        rfNetwork().sendToTrackingEntityAndSelf(new (rfSync())(player.getMCEntity()), player.getMCEntity());
    } catch (e) {}
}

function rfFindByUuid(id) {
    try {
        var worlds = rfApi().Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            var players = worlds[i].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                if (rfUuid(players[p]) === id) return players[p];
            }
        }
    } catch (e) {}
    return null;
}

function rfMutualPoints(db, a, b) {
    if (db == null || db.players == null) return 0;
    var ra = db.players[a];
    var rb = db.players[b];
    if (ra == null || rb == null) return 0;
    var la = ra.rivals && ra.rivals[b];
    var lb = rb.rivals && rb.rivals[a];
    if (la == null || lb == null) return 0;
    if (la.mutual !== true || lb.mutual !== true) return 0;
    return Math.max(0, rfNum(la.points, 0));
}

function rfFusionMult(points) {
    var bonus = Math.min(RF_MAX_FUSION_BONUS, 0.05 + (Math.max(0, points) / 15000) * 0.20);
    return 1.0 + bonus;
}

function rivalFusionTick(event) {
    try {
        var player = event.player;
        if (!rfIsPlayer(player)) return;
        var temp = player.getTempdata();
        var last = 0;
        try { if (temp.has("rival.v4.fusion.tick")) last = rfNum(temp.get("rival.v4.fusion.tick"), 0); } catch (e) {}
        if (rfNow() - last < RF_TICK_MS) return;
        try { temp.put("rival.v4.fusion.tick", String(rfNow())); } catch (e2) {}

        var data = rfGetDmz(player);
        if (data == null) return;
        var status = null;
        try { status = data.getStatus(); } catch (e3) { return; }
        if (status == null || status.isFused() !== true) {
            rfApplyBonus(player, data, 1.0);
            try { temp.put("rival.v4.fusion.partner", ""); } catch (e4) {}
            return;
        }

        var partnerId = "";
        try { partnerId = rfStr(status.getFusionPartnerUUID()); } catch (e5) {}
        if (partnerId === "") {
            rfApplyBonus(player, data, 1.0);
            return;
        }

        var db = rfLoadDb();
        var pts = rfMutualPoints(db, rfUuid(player), partnerId);
        if (pts <= 0) {
            rfApplyBonus(player, data, 1.0);
            return;
        }

        var mult = rfFusionMult(pts);
        rfApplyBonus(player, data, mult);
        try { temp.put("rival.v4.fusion.partner", partnerId); } catch (e6) {}
    } catch (error) {
        try { print("[RivalDMZHooks] tick " + error); } catch (e) {}
    }
}

function rivalFusionKill(event) {
    try {
        var killer = event.player;
        if (!rfIsPlayer(killer)) return;
        var temp = killer.getTempdata();
        if (!temp.has("rival.v4.fusion.partner")) return;
        var partnerId = rfStr(temp.get("rival.v4.fusion.partner"));
        if (partnerId === "") return;

        var data = rfGetDmz(killer);
        if (data == null) return;
        try {
            var killerTp = rivalScaleTpByLevel(data, RF_KILL_TP, "burst");
            data.getResources().addTrainingPoints(killerTp);
            rfNetwork().sendToTrackingEntityAndSelf(new (rfSync())(killer.getMCEntity()), killer.getMCEntity());
            var kNote = "";
            if (RIVAL_LEVEL_TP_SHOW_IN_REASON === true && RIVAL_LEVEL_TP_ENABLED === true) {
                kNote = RF_C + "7 (Lv" + rivalGetDmzLevel(data) + " " +
                    rivalFormatMult(rivalEffectiveTpMultiplier(data, "burst")) + ")";
            }
            rfMsg(killer, RF_C + "a[Rival Fusion] +" + killerTp + " TP" + kNote);
        } catch (e) {}

        var partner = rfFindByUuid(partnerId);
        if (partner == null) return;
        var pdata = rfGetDmz(partner);
        if (pdata == null) return;
        try {
            var partnerTp = rivalScaleTpByLevel(pdata, RF_KILL_TP, "burst");
            pdata.getResources().addTrainingPoints(partnerTp);
            rfNetwork().sendToTrackingEntityAndSelf(new (rfSync())(partner.getMCEntity()), partner.getMCEntity());
            var pNote = "";
            if (RIVAL_LEVEL_TP_SHOW_IN_REASON === true && RIVAL_LEVEL_TP_ENABLED === true) {
                pNote = RF_C + "7 (Lv" + rivalGetDmzLevel(pdata) + " " +
                    rivalFormatMult(rivalEffectiveTpMultiplier(pdata, "burst")) + ")";
            }
            rfMsg(partner, RF_C + "a[Rival Fusion] +" + partnerTp + " TP (partner kill)" + pNote);
        } catch (e2) {}
    } catch (error) {
        try { print("[RivalDMZHooks] kill " + error); } catch (e3) {}
    }
}

function rivalFusionLogout(event) {
    try {
        if (!rfIsPlayer(event.player)) return;
        rfApplyBonus(event.player, rfGetDmz(event.player), 1.0);
    } catch (e) {}
}

function rivalFusionDied(event) {
    try {
        if (!rfIsPlayer(event.player)) return;
        rfApplyBonus(event.player, rfGetDmz(event.player), 1.0);
    } catch (e) {}
}

/* ========================= UNIFIED EVENTS ========================= */

function init(event) {
    try { rivalCoreInit(event); } catch (e) { try { print("[RivalSystem] core init: " + e); } catch (x) {} }
    try { rivalChInit(event); } catch (e) { try { print("[RivalSystem] challenge init: " + e); } catch (x) {} }
}

function login(event) {
    try { rivalCoreLogin(event); } catch (e) { try { print("[RivalSystem] core login: " + e); } catch (x) {} }
    try { rivalInstinctLogin(event); } catch (e) { try { print("[RivalSystem] instinct login: " + e); } catch (x) {} }
    try { rivalProgLogin(event); } catch (e) { try { print("[RivalSystem] prog login: " + e); } catch (x) {} }
}

function tick(event) {
    try { rivalProxTick(event); } catch (e) { try { print("[RivalSystem] prox tick: " + e); } catch (x) {} }
    try { rivalChTick(event); } catch (e) { try { print("[RivalSystem] ch tick: " + e); } catch (x) {} }
    try { rivalInstinctTick(event); } catch (e) { try { print("[RivalSystem] instinct tick: " + e); } catch (x) {} }
    try { rivalProgTick(event); } catch (e) { try { print("[RivalSystem] prog tick: " + e); } catch (x) {} }
    try { rivalSpecTick(event); } catch (e) { try { print("[RivalSystem] spec tick: " + e); } catch (x) {} }
    try { rivalFusionTick(event); } catch (e) { try { print("[RivalSystem] fusion tick: " + e); } catch (x) {} }
}

function damagedEntity(event) {
    try { rivalChDamagedEntity(event); } catch (e) { try { print("[RivalSystem] ch damagedEntity: " + e); } catch (x) {} }
    try { rivalProxDamagedEntity(event); } catch (e) { try { print("[RivalSystem] prox damagedEntity: " + e); } catch (x) {} }
}

function damaged(event) {
    try { rivalChDamaged(event); } catch (e) { try { print("[RivalSystem] ch damaged: " + e); } catch (x) {} }
    try { rivalProxDamaged(event); } catch (e) { try { print("[RivalSystem] prox damaged: " + e); } catch (x) {} }
}

function kill(event) {
    try { rivalChKill(event); } catch (e) { try { print("[RivalSystem] ch kill: " + e); } catch (x) {} }
    try { rivalProxKill(event); } catch (e) { try { print("[RivalSystem] prox kill: " + e); } catch (x) {} }
    try { rivalFusionKill(event); } catch (e) { try { print("[RivalSystem] fusion kill: " + e); } catch (x) {} }
}

function died(event) {
    try { rivalChDied(event); } catch (e) { try { print("[RivalSystem] ch died: " + e); } catch (x) {} }
    try { rivalProxDied(event); } catch (e) { try { print("[RivalSystem] prox died: " + e); } catch (x) {} }
    try { rivalFusionDied(event); } catch (e) { try { print("[RivalSystem] fusion died: " + e); } catch (x) {} }
}

function logout(event) {
    try { rivalChLogout(event); } catch (e) { try { print("[RivalSystem] ch logout: " + e); } catch (x) {} }
    try { rivalProxLogout(event); } catch (e) { try { print("[RivalSystem] prox logout: " + e); } catch (x) {} }
    try { rivalFusionLogout(event); } catch (e) { try { print("[RivalSystem] fusion logout: " + e); } catch (x) {} }
}

function trigger(event) {
    /* Player commands are in Rival Command Handler.js.
       Progression keeps admin refresh trigger 240. */
    try { rivalProgTrigger(event); } catch (e) { try { print("[RivalSystem] prog trigger: " + e); } catch (x) {} }
}
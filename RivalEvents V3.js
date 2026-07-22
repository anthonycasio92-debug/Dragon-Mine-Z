/*
 DBZ LEGACY REBORN - RIVALRY SYSTEM V3
 PHASE 2A: RIVAL EVENTS / ENERGY SENSING

 Verified target:
 - DragonMineZ 2.1.3
 - CustomNPCs 1.20.1.20260227
 - Nashorn-compatible ES5 JavaScript

 Install as a SECOND Global Player Script.
 Keep RivalCore_v3 installed.

 Enable:
 - init
 - login
 - tick
 - logout
 - died
 - trigger

 Trigger:
 107 = live RivalEvents debug

 IMPORTANT:
 This build intentionally does NOT apply BonusStats yet. DragonMineZ's
 addBonus method is verified, but the exact internal stat/operation keys
 were not confirmed. No guessed keys are used in this file.
*/

/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 *
 * SUITE WARNING: RivalCore / RivalEvents / RivalBattle Manager / RivalBattle Combat Core must EACH be their own Player Script tab. All define init/trigger/login.
 */
var RE_COLOR = String.fromCharCode(167);
var RE_DATABASE_KEY = "dlr.rivalry.v3.database";

var RE_SCAN_INTERVAL_MS = 1000;
var RE_DEBUG_TRIGGER_ID = 107;
var RE_DEBUG_LOG = false;

/*
 Rival points currently come from RivalCore records. Phase 3 battles and
 progression will increase these values.
*/
var RE_TIERS = [
    { min: 0,    name: "Acquaintance", range: 48,  relative: false, charging: false, battlePower: false, form: false, fusion: false },
    { min: 100,  name: "Competitor",   range: 64,  relative: true,  charging: false, battlePower: false, form: false, fusion: false },
    { min: 300,  name: "Adversary",    range: 80,  relative: true,  charging: true,  battlePower: false, form: false, fusion: false },
    { min: 700,  name: "Rival",        range: 96,  relative: true,  charging: true,  battlePower: true,  form: false, fusion: false },
    { min: 1500, name: "Nemesis",      range: 128, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: false },
    { min: 3000, name: "Legendary",    range: 160, relative: true,  charging: true,  battlePower: true,  form: true,  fusion: true }
];

var RE_API = Java.type("noppes.npcs.api.NpcAPI");
var RE_SYSTEM = Java.type("java.lang.System");
var RE_StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var RE_StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");

/* -------------------------------------------------------------------------- */
/* BASIC HELPERS                                                              */
/* -------------------------------------------------------------------------- */

function reNow() {
    return Number(RE_SYSTEM.currentTimeMillis());
}

function reString(value) {
    if (value === null || value === undefined) return "";
    return String(value);
}

function reNumber(value, fallback) {
    var number = Number(value);
    return isNaN(number) ? fallback : number;
}

function reBool(value) {
    return value === true || reString(value).toLowerCase() === "true";
}

function reMessage(player, message) {
    try {
        if (player !== null && player !== undefined) player.message(message);
    } catch (ignored) {}
}

function reLog(message) {
    if (!RE_DEBUG_LOG) return;
    try {
        print("[RivalEvents v3] " + message);
    } catch (ignored) {}
}

function reIsPlayer(entity) {
    if (entity === null || entity === undefined) return false;
    try {
        return Number(entity.getType()) === 1;
    } catch (ignored) {
        return false;
    }
}

function reUuid(player) {
    try {
        return reString(player.getUUID());
    } catch (ignored) {
        return "";
    }
}

function reName(player) {
    try {
        return reString(player.getName());
    } catch (ignored) {
        return "Unknown";
    }
}

function reReadTempNumber(temp, key, fallback) {
    try {
        if (temp.has(key)) return reNumber(temp.get(key), fallback);
    } catch (ignored) {}
    return fallback;
}

function reReadTempString(temp, key, fallback) {
    try {
        if (temp.has(key)) return reString(temp.get(key));
    } catch (ignored) {}
    return fallback;
}

function rePutTemp(temp, key, value) {
    try {
        temp.put(key, reString(value));
    } catch (ignored) {}
}

function reRemoveTemp(temp, key) {
    try {
        if (temp.has(key)) temp.remove(key);
    } catch (ignored) {}
}

/* -------------------------------------------------------------------------- */
/* DATABASE                                                                   */
/* -------------------------------------------------------------------------- */

function reDataWorld(player) {
    try {
        var world = RE_API.Instance().getIWorld("minecraft:overworld");
        if (world !== null && world !== undefined) return world;
    } catch (ignored1) {}

    try {
        return player.getWorld();
    } catch (ignored2) {
        return null;
    }
}

function reLoadDatabase(player) {
    var world = reDataWorld(player);
    if (world === null) return null;

    try {
        var stored = world.getStoreddata();
        if (!stored.has(RE_DATABASE_KEY)) return null;

        var database = JSON.parse(reString(stored.get(RE_DATABASE_KEY)));
        if (database === null || typeof database !== "object") return null;
        if (database.players === null || typeof database.players !== "object") return null;

        return database;
    } catch (error) {
        reLog("Database read failed: " + error);
        return null;
    }
}

function rePlayerRecord(database, player) {
    if (database === null) return null;
    return database.players[reUuid(player)] || null;
}

function reMutualRivals(record) {
    var result = [];
    if (record === null || record.rivals === null || typeof record.rivals !== "object") return result;

    for (var uuid in record.rivals) {
        if (!record.rivals.hasOwnProperty(uuid)) continue;

        var rival = record.rivals[uuid];
        if (rival !== null && rival !== undefined && rival.mutual === true) {
            result.push(rival);
        }
    }

    return result;
}

/* -------------------------------------------------------------------------- */
/* ONLINE PLAYER LOOKUP                                                       */
/* -------------------------------------------------------------------------- */

function reFindOnlineByUuid(uuid) {
    var wanted = reString(uuid);
    if (wanted === "") return null;

    try {
        var worlds = RE_API.Instance().getIWorlds();

        for (var w = 0; w < worlds.length; w++) {
            var players;

            try {
                players = worlds[w].getAllPlayers();
            } catch (ignored1) {
                continue;
            }

            for (var p = 0; p < players.length; p++) {
                if (reUuid(players[p]) === wanted) return players[p];
            }
        }
    } catch (ignored2) {}

    return null;
}

function reWorldId(player) {
    try {
        return reString(player.getWorld().getName());
    } catch (ignored1) {}

    try {
        return reString(player.getMCEntity().level().dimension().location());
    } catch (ignored2) {}

    return "";
}

function reSameWorld(playerA, playerB) {
    return reWorldId(playerA) === reWorldId(playerB);
}

function reDistance(playerA, playerB) {
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
/* DRAGONMINEZ DATA                                                           */
/* -------------------------------------------------------------------------- */

function reStats(player) {
    try {
        var mcPlayer = player.getMCEntity();
        if (mcPlayer === null || mcPlayer === undefined) return null;

        return RE_StatsProvider
            .get(RE_StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);
    } catch (ignored) {
        return null;
    }
}

function reBattlePower(data) {
    if (data === null) return -1;

    try {
        return reNumber(data.getBattlePowerExact(), -1);
    } catch (ignored1) {}

    try {
        return reNumber(data.getBattlePower(), -1);
    } catch (ignored2) {}

    return -1;
}

function rePowerRelease(data) {
    if (data === null) return 100;

    try {
        return reNumber(data.getPowerRelease(), 100);
    } catch (ignored1) {}

    try {
        var resources = data.getResources();
        if (resources !== null) return reNumber(resources.getPowerRelease(), 100);
    } catch (ignored2) {}

    return 100;
}

function reReleasedBattlePower(data) {
    var bp = reBattlePower(data);
    if (bp < 0) return -1;

    var release = rePowerRelease(data);
    if (release < 0) release = 0;

    /*
     DragonMineZ power release is treated as a percentage here only for the
     displayed released-energy estimate. The full Battle Power remains the
     source used for relative-strength comparison.
    */
    return Math.floor(bp * (release / 100.0));
}

function reCharging(data) {
    try {
        var status = data.getStatus();
        return status !== null && Boolean(status.isChargingKi());
    } catch (ignored) {
        return false;
    }
}

function reFusion(data) {
    try {
        var status = data.getStatus();
        return status !== null && Boolean(status.isFused());
    } catch (ignored) {
        return false;
    }
}

function reFormState(data) {
    if (data === null) return "";

    var active = "";
    var stack = "";

    try {
        active = reString(data.getActiveForm());
    } catch (ignored1) {
        try {
            var character = data.getCharacter();
            if (character !== null) active = reString(character.getActiveForm());
        } catch (ignored2) {}
    }

    try {
        stack = reString(data.getActiveStackForm());
    } catch (ignored3) {
        try {
            var character2 = data.getCharacter();
            if (character2 !== null) stack = reString(character2.getActiveStackForm());
        } catch (ignored4) {}
    }

    return active + "|" + stack;
}

/* -------------------------------------------------------------------------- */
/* SENSING                                                                    */
/* -------------------------------------------------------------------------- */

function reTier(points) {
    var value = reNumber(points, 0);
    var selected = RE_TIERS[0];

    for (var i = 0; i < RE_TIERS.length; i++) {
        if (value >= RE_TIERS[i].min) selected = RE_TIERS[i];
    }

    return selected;
}

function reFormatNumber(value) {
    var text = String(Math.max(0, Math.floor(reNumber(value, 0))));
    return text.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function reRelativeStrength(myBp, rivalBp) {
    if (myBp <= 0 || rivalBp < 0) return "Unknown";

    var ratio = rivalBp / myBp;

    if (ratio >= 1.25) return "Stronger";
    if (ratio <= 0.80) return "Weaker";
    return "Comparable";
}

function reCachePrefix(rivalUuid) {
    return "dlr_rival_events_" + reString(rivalUuid).replace(/[^A-Za-z0-9_]/g, "_") + "_";
}

function reClearRivalCache(player, rivalUuid) {
    var temp = player.getTempdata();
    var prefix = reCachePrefix(rivalUuid);

    reRemoveTemp(temp, prefix + "near");
    reRemoveTemp(temp, prefix + "charging");
    reRemoveTemp(temp, prefix + "form");
    reRemoveTemp(temp, prefix + "fusion");
    reRemoveTemp(temp, prefix + "relative");
}

function reClearAllCache(player) {
    /*
     TempData is automatically discarded on logout. This marker forces the
     next scan to rebuild all per-rival state after init/login/death.
    */
    try {
        player.getTempdata().clear();
    } catch (ignored) {}
}

function reNotifyEntry(player, rival, tier, distance, myData, rivalData) {
    var message =
        RE_COLOR + "6[Rival Instinct] " +
        RE_COLOR + "e" + rival.name +
        RE_COLOR + "7 entered your sensing range " +
        RE_COLOR + "8(" + Math.floor(distance) + "m)";

    reMessage(player, message);

    if (tier.relative) {
        reMessage(
            player,
            RE_COLOR + "7Their energy feels " +
            RE_COLOR + "f" + reRelativeStrength(reBattlePower(myData), reBattlePower(rivalData)) +
            RE_COLOR + "7."
        );
    }

    if (tier.battlePower) {
        var released = reReleasedBattlePower(rivalData);
        if (released >= 0) {
            reMessage(
                player,
                RE_COLOR + "7Released Battle Power: " +
                RE_COLOR + "b" + reFormatNumber(released)
            );
        }
    }
}

function reScanRival(player, rivalRecord, myData) {
    var rivalPlayer = reFindOnlineByUuid(rivalRecord.uuid);
    var tier = reTier(rivalRecord.points);
    var temp = player.getTempdata();
    var prefix = reCachePrefix(rivalRecord.uuid);
    var wasNear = reReadTempString(temp, prefix + "near", "false") === "true";

    if (rivalPlayer === null || !reSameWorld(player, rivalPlayer)) {
        if (wasNear) {
            reMessage(
                player,
                RE_COLOR + "8[Rival Instinct] " +
                RE_COLOR + "7You can no longer sense " +
                RE_COLOR + "f" + rivalRecord.name +
                RE_COLOR + "7."
            );
            reClearRivalCache(player, rivalRecord.uuid);
        }
        return null;
    }

    var distance = reDistance(player, rivalPlayer);
    if (distance < 0 || distance > tier.range) {
        if (wasNear) {
            reMessage(
                player,
                RE_COLOR + "8[Rival Instinct] " +
                RE_COLOR + "7" + rivalRecord.name +
                RE_COLOR + "7 left your sensing range."
            );
            reClearRivalCache(player, rivalRecord.uuid);
        }
        return null;
    }

    var rivalData = reStats(rivalPlayer);
    if (rivalData === null) return null;

    if (!wasNear) {
        rePutTemp(temp, prefix + "near", "true");
        reNotifyEntry(player, rivalRecord, tier, distance, myData, rivalData);
    }

    var result = {
        name: rivalRecord.name,
        uuid: rivalRecord.uuid,
        distance: distance,
        tier: tier.name,
        points: reNumber(rivalRecord.points, 0),
        relative: reRelativeStrength(reBattlePower(myData), reBattlePower(rivalData)),
        releasedBp: reReleasedBattlePower(rivalData),
        charging: reCharging(rivalData),
        fused: reFusion(rivalData),
        form: reFormState(rivalData)
    };

    if (tier.relative) {
        var oldRelative = reReadTempString(temp, prefix + "relative", "");
        if (oldRelative !== "" && oldRelative !== result.relative) {
            reMessage(
                player,
                RE_COLOR + "6[Rival Instinct] " +
                RE_COLOR + "e" + rivalRecord.name +
                RE_COLOR + "7's energy now feels " +
                RE_COLOR + "f" + result.relative +
                RE_COLOR + "7."
            );
        }
        rePutTemp(temp, prefix + "relative", result.relative);
    }

    if (tier.charging) {
        var oldCharging = reReadTempString(temp, prefix + "charging", "false") === "true";
        if (result.charging !== oldCharging) {
            if (result.charging) {
                reMessage(
                    player,
                    RE_COLOR + "6[Rival Instinct] " +
                    RE_COLOR + "e" + rivalRecord.name +
                    RE_COLOR + "b is charging Ki!"
                );
            } else {
                reMessage(
                    player,
                    RE_COLOR + "8[Rival Instinct] " +
                    RE_COLOR + "7" + rivalRecord.name +
                    RE_COLOR + "7 stopped charging Ki."
                );
            }
        }
        rePutTemp(temp, prefix + "charging", result.charging);
    }

    if (tier.form) {
        var oldForm = reReadTempString(temp, prefix + "form", "");
        if (oldForm !== "" && oldForm !== result.form) {
            reMessage(
                player,
                RE_COLOR + "6[Rival Instinct] " +
                RE_COLOR + "e" + rivalRecord.name +
                RE_COLOR + "d changed transformation state!"
            );
        }
        rePutTemp(temp, prefix + "form", result.form);
    }

    if (tier.fusion) {
        var oldFusion = reReadTempString(temp, prefix + "fusion", "false") === "true";
        if (result.fused !== oldFusion) {
            reMessage(
                player,
                result.fused
                    ? RE_COLOR + "6[Rival Instinct] " + RE_COLOR + "e" + rivalRecord.name + RE_COLOR + "d has fused!"
                    : RE_COLOR + "8[Rival Instinct] " + RE_COLOR + "7" + rivalRecord.name + RE_COLOR + "7 is no longer fused."
            );
        }
        rePutTemp(temp, prefix + "fusion", result.fused);
    }

    return result;
}

function reScan(player) {
    var database = reLoadDatabase(player);
    var record = rePlayerRecord(database, player);

    if (record === null) return [];

    var rivals = reMutualRivals(record);
    if (rivals.length === 0) return [];

    var myData = reStats(player);
    if (myData === null) return [];

    var nearby = [];

    for (var i = 0; i < rivals.length; i++) {
        var state = reScanRival(player, rivals[i], myData);
        if (state !== null) nearby.push(state);
    }

    return nearby;
}

/* -------------------------------------------------------------------------- */
/* DEBUG                                                                      */
/* -------------------------------------------------------------------------- */

function reDebug(player) {
    var database = reLoadDatabase(player);
    var record = rePlayerRecord(database, player);

    reMessage(player, RE_COLOR + "d" + RE_COLOR + "lRIVAL EVENTS DEBUG");
    reMessage(player, RE_COLOR + "8------------------------------");

    if (database === null) {
        reMessage(player, RE_COLOR + "cRivalCore database was not found.");
        return;
    }

    if (record === null) {
        reMessage(player, RE_COLOR + "cYour RivalCore player record was not found.");
        return;
    }

    var rivals = reMutualRivals(record);
    reMessage(player, RE_COLOR + "7Mutual rivals: " + RE_COLOR + "f" + rivals.length);
    reMessage(player, RE_COLOR + "7Scan interval: " + RE_COLOR + "f" + RE_SCAN_INTERVAL_MS + "ms");

    var myData = reStats(player);
    reMessage(
        player,
        RE_COLOR + "7Your Battle Power: " +
        RE_COLOR + "b" + (myData === null ? "Unavailable" : reFormatNumber(reBattlePower(myData)))
    );

    if (rivals.length === 0) return;

    for (var i = 0; i < rivals.length; i++) {
        var rival = rivals[i];
        var tier = reTier(rival.points);
        var online = reFindOnlineByUuid(rival.uuid);

        reMessage(
            player,
            RE_COLOR + "e" + rival.name +
            RE_COLOR + "7 | RP " + RE_COLOR + "b" + reNumber(rival.points, 0) +
            RE_COLOR + "7 | " + tier.name +
            RE_COLOR + "7 | Range " + tier.range + "m"
        );

        if (online === null) {
            reMessage(player, RE_COLOR + "8  Offline");
            continue;
        }

        if (!reSameWorld(player, online)) {
            reMessage(player, RE_COLOR + "8  Online in another dimension");
            continue;
        }

        var rivalData = reStats(online);
        var distance = reDistance(player, online);

        reMessage(
            player,
            RE_COLOR + "7  Distance: " + RE_COLOR + "f" + Math.floor(distance) + "m" +
            RE_COLOR + "7 | In range: " + RE_COLOR + (distance <= tier.range ? "aYes" : "cNo")
        );

        if (rivalData !== null) {
            reMessage(
                player,
                RE_COLOR + "7  Relative: " + RE_COLOR + "f" +
                reRelativeStrength(reBattlePower(myData), reBattlePower(rivalData))
            );
            reMessage(
                player,
                RE_COLOR + "7  Charging: " + RE_COLOR + (reCharging(rivalData) ? "aYes" : "cNo") +
                RE_COLOR + "7 | Fused: " + RE_COLOR + (reFusion(rivalData) ? "aYes" : "cNo")
            );
            reMessage(
                player,
                RE_COLOR + "7  Released BP: " + RE_COLOR + "b" +
                reFormatNumber(reReleasedBattlePower(rivalData))
            );
        }
    }

    reMessage(player, RE_COLOR + "8BonusStats: intentionally disabled until exact keys are verified.");
}

/* -------------------------------------------------------------------------- */
/* EVENTS                                                                     */
/* -------------------------------------------------------------------------- */

function init(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    try {
        reClearAllCache(event.player);
        rePutTemp(event.player.getTempdata(), "dlr_rival_events_next_scan", 0);
    } catch (error) {
        print("[RivalEvents v3] init error: " + error);
    }
}

function login(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    try {
        reClearAllCache(event.player);
        rePutTemp(event.player.getTempdata(), "dlr_rival_events_next_scan", 0);
    } catch (error) {
        print("[RivalEvents v3] login error: " + error);
    }
}

function tick(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    var player = event.player;
    var temp = player.getTempdata();
    var now = reNow();
    var next = reReadTempNumber(temp, "dlr_rival_events_next_scan", 0);

    if (now < next) return;
    rePutTemp(temp, "dlr_rival_events_next_scan", now + RE_SCAN_INTERVAL_MS);

    try {
        reScan(player);
    } catch (error) {
        reLog("tick error for " + reName(player) + ": " + error);
    }
}

function died(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    try {
        reClearAllCache(event.player);
    } catch (error) {
        reLog("death cleanup failed: " + error);
    }
}

function logout(event) {
    if (event === null || event.player === null || event.player === undefined) return;

    try {
        reClearAllCache(event.player);
    } catch (error) {
        reLog("logout cleanup failed: " + error);
    }
}

function trigger(event) {
    if (event === null || !reIsPlayer(event.entity)) return;
    if (Number(event.id) !== RE_DEBUG_TRIGGER_ID) return;

    try {
        reDebug(event.entity);
    } catch (error) {
        reMessage(event.entity, RE_COLOR + "c[RivalEvents] Debug failed. Check the server log.");
        print("[RivalEvents v3] debug error: " + error);
    }
}

/*
 * DBZ Legacy Reborn - Dungeon Clone Ki Fix (KubeJS SERVER SCRIPT ONLY)
 *
 * Pure ASCII. No startup script required.
 *
 * On every spawn of SduDmzFighter clones from Advanced Spawners, restores
 * full ki damage / moves via SduDmzFighter.applySuSpawnNbt.
 *
 * Detection paths (server-only):
 *  1) EntityEvents.spawned
 *  2) Bounded tick retries (tag / TE race)
 *  3) Player nearby AABB scan (backup for continuous dungeon spawns)
 *
 * Install: copy to kubejs/server_scripts/
 * Apply:   /kubejs reload server_scripts
 * Keep CustomNPCs Global Forge Scripts OFF.
 */

var DEBUG = false;
var FIXED_SETTINGS_KEY = "sdd_clone_ki_fix_configured";
var FIXED_DAMAGE_KEY = "sdd_clone_ki_damage_fix_value";
var FIXED_MOVES_KEY = "sdd_clone_ki_moves_fix_csv";
var FIXED_ENABLED_KEY = "sdd_clone_ki_enabled_fix";
var FIXED_AI_TIER_KEY = "sdd_clone_ai_tier_fix";
var FIXED_BEHAVIOR_KEY = "sdd_clone_behavior_fix";
var FIXED_SCALE_KEY = "sdd_clone_scale_fix";

var RETRY_MAX_ATTEMPTS = 40;
var RETRY_EVERY_TICKS = 4;
var NEARBY_SCAN_EVERY = 40; /* player ticks ~= 2s */
var NEARBY_RANGE = 48.0;
var LOG_OK_LEFT = 16;
var LOG_FAIL_LEFT = 24;
var LOG_SEEN_LEFT = 16;

global.dungeonCloneKiRetry = global.dungeonCloneKiRetry || [];

console.info(
    "[Dungeon Clone Fix] server-only script loaded (spawned + tick retries + nearby scan)."
);

function dbg(msg) {
    if (!DEBUG) return;
    try {
        console.info("[Dungeon Clone Fix] " + msg);
    } catch (e) {}
}

function logOk(msg) {
    if (LOG_OK_LEFT <= 0) return;
    LOG_OK_LEFT--;
    try {
        console.info("[Dungeon Clone Fix] " + msg);
    } catch (e) {}
}

function logFail(msg) {
    if (LOG_FAIL_LEFT <= 0) return;
    LOG_FAIL_LEFT--;
    try {
        console.warn("[Dungeon Clone Fix] " + msg);
    } catch (e) {}
}

function logSeen(msg) {
    if (LOG_SEEN_LEFT <= 0) return;
    LOG_SEEN_LEFT--;
    try {
        console.info("[Dungeon Clone Fix] " + msg);
    } catch (e) {}
}

function loadClass(name) {
    try {
        return Java.loadClass(name);
    } catch (e1) {
        try {
            return Java.type(name);
        } catch (e2) {
            return null;
        }
    }
}

var LongClass = loadClass("java.lang.Long");
var BigInteger = loadClass("java.math.BigInteger");
var BlockPosClass = loadClass("net.minecraft.core.BlockPos");
var AABBClass = loadClass("net.minecraft.world.phys.AABB");
var CompoundTagClass = loadClass("net.minecraft.nbt.CompoundTag");
var KiMoveEntryClass = loadClass(
    "net.shurui.dev.shuruis_dmz_dungeons.block.KiMoveEntry"
);
var SduDmzFighterClass = loadClass("net.shurui.dev.sdu.entity.SduDmzFighter");
var AdvancedSpawnerClass = loadClass(
    "net.shurui.dev.shuruis_dmz_dungeons.block.AdvancedSpawnerBlockEntity"
);

var TWO_64 = BigInteger != null ? new BigInteger("18446744073709551616") : null;
var MASK_26 = BigInteger != null ? new BigInteger("67108863") : null;
var MASK_12 = BigInteger != null ? new BigInteger("4095") : null;

if (SduDmzFighterClass != null) {
    console.info("[Dungeon Clone Fix] SduDmzFighter class ready.");
} else {
    console.warn("[Dungeon Clone Fix] SduDmzFighter class missing at load.");
}
if (AdvancedSpawnerClass != null) {
    console.info("[Dungeon Clone Fix] AdvancedSpawnerBlockEntity class ready.");
} else {
    console.warn(
        "[Dungeon Clone Fix] AdvancedSpawnerBlockEntity class missing at load."
    );
}
if (KiMoveEntryClass != null) {
    console.info("[Dungeon Clone Fix] KiMoveEntry class ready.");
} else {
    console.warn("[Dungeon Clone Fix] KiMoveEntry class missing at load.");
}

function unwrapMc(entity) {
    if (entity == null) return null;
    try {
        if (entity.minecraftEntity != null) return entity.minecraftEntity;
    } catch (e1) {}
    try {
        if (entity.getMinecraftEntity) return entity.getMinecraftEntity();
    } catch (e2) {}
    try {
        if (entity.getMCEntity) return entity.getMCEntity();
    } catch (e3) {}
    try {
        if (entity.entity != null && entity.entity.getClass) return entity.entity;
    } catch (e4) {}
    return entity;
}

function className(obj) {
    try {
        return String(obj.getClass().getName());
    } catch (e) {
        return "";
    }
}

function typeIdOf(entity) {
    try {
        if (entity.type != null) return String(entity.type);
    } catch (e1) {}
    try {
        if (entity.getType) return String(entity.getType());
    } catch (e2) {}
    try {
        var mc = unwrapMc(entity);
        if (mc != null && mc.getType) {
            return String(mc.getType().toString());
        }
    } catch (e3) {}
    return "";
}

function isSduDmzFighter(mc) {
    if (mc == null) return false;
    var cn = className(mc);
    if (cn.indexOf("SduDmzFighter") >= 0) return true;
    if (SduDmzFighterClass != null) {
        try {
            return SduDmzFighterClass.isInstance(mc);
        } catch (e1) {
            try {
                return SduDmzFighterClass.class.isInstance(mc);
            } catch (e2) {}
        }
    }
    return false;
}

/*
 * Cheap spawn filter: class-name string check (no Class.forName per spawn).
 * Also accepts sdu fighter type ids and already-tagged dungeon clones.
 */
function isCloneCandidate(entity) {
    var mc = unwrapMc(entity);
    if (mc == null) return false;

    var cn = className(mc);
    if (cn.indexOf("SduDmzFighter") >= 0) return true;

    var tid = typeIdOf(entity).toLowerCase();
    if (tid.indexOf("dmz_fighter") >= 0) return true;
    if (tid.indexOf("sdu:dmz") >= 0) return true;
    if (tid.indexOf("sdu") >= 0 && tid.indexOf("fighter") >= 0) return true;

    if (cn.toLowerCase().indexOf("sdu") >= 0 || cn.indexOf("shurui") >= 0) {
        var tag = pd(mc);
        if (tagHas(tag, "sdd_spawner") || tagHas(tag, "sdu_clone_ref")) {
            return true;
        }
    }
    return false;
}

function isAdvancedSpawner(be) {
    if (be == null) return false;
    var cn = className(be);
    if (cn.indexOf("AdvancedSpawnerBlockEntity") >= 0) return true;
    if (AdvancedSpawnerClass != null) {
        try {
            return AdvancedSpawnerClass.isInstance(be);
        } catch (e1) {
            try {
                return AdvancedSpawnerClass.class.isInstance(be);
            } catch (e2) {}
        }
    }
    return false;
}

function getLevel(mc) {
    if (mc == null) return null;
    try {
        return mc.level();
    } catch (e1) {
        try {
            return mc.getLevel();
        } catch (e2) {
            try {
                return mc.m_9236_();
            } catch (e3) {
                return null;
            }
        }
    }
}

function isServerMc(mc) {
    if (mc == null) return false;
    try {
        var level = getLevel(mc);
        if (level == null) return false;
        try {
            if (typeof level.isClientSide === "function") {
                return !level.isClientSide();
            }
        } catch (e4) {}
        try {
            return !level.clientSide;
        } catch (e5) {}
        return true;
    } catch (e) {
        return false;
    }
}

function pd(mc) {
    try {
        return mc.getPersistentData();
    } catch (e) {
        return null;
    }
}

function tagHas(tag, key) {
    try {
        return tag != null && tag.contains(key);
    } catch (e) {
        return false;
    }
}

function tagBool(tag, key) {
    try {
        return !!tag.getBoolean(key);
    } catch (e) {
        return false;
    }
}

function tagFloat(tag, key, fallback) {
    try {
        if (tagHas(tag, key)) return parseFloat("" + tag.getFloat(key));
    } catch (e) {}
    return fallback;
}

function tagInt(tag, key, fallback) {
    try {
        if (tagHas(tag, key)) return parseInt("" + tag.getInt(key), 10);
    } catch (e) {}
    return fallback;
}

function tagString(tag, key) {
    try {
        if (tagHas(tag, key)) return "" + tag.getString(key);
    } catch (e) {}
    return "";
}

function tagSetBool(tag, key, value) {
    try {
        tag.putBoolean(key, !!value);
    } catch (e) {}
}

function tagSetFloat(tag, key, value) {
    try {
        tag.putFloat(key, value);
    } catch (e) {}
}

function tagSetInt(tag, key, value) {
    try {
        tag.putInt(key, value);
    } catch (e) {}
}

function tagSetString(tag, key, value) {
    try {
        tag.putString(key, "" + value);
    } catch (e) {}
}

function readPackedSpawnerLongString(tag) {
    if (tag == null || !tagHas(tag, "sdd_spawner")) return null;
    try {
        if (LongClass != null) {
            return LongClass.toString(tag.getLong("sdd_spawner"));
        }
    } catch (e1) {}
    try {
        return "" + tag.getLong("sdd_spawner");
    } catch (e2) {
        return null;
    }
}

/*
 * Unpack BlockPos long WITHOUT JS Number coercion (precision loss far from origin).
 * Same bit layout as Minecraft BlockPos.asLong / of.
 */
function unpackSpawnerPos(tag) {
    if (BlockPosClass == null) return null;
    var packedText = readPackedSpawnerLongString(tag);
    if (packedText == null) return null;

    if (BigInteger != null && TWO_64 != null) {
        try {
            var packed = new BigInteger("" + packedText);
            if (packed.signum() < 0) packed = packed.add(TWO_64);

            var blockX = packed.shiftRight(38).and(MASK_26).intValue();
            var blockZ = packed.shiftRight(12).and(MASK_26).intValue();
            var blockY = packed.and(MASK_12).intValue();

            if (blockX >= 33554432) blockX = blockX - 67108864;
            if (blockZ >= 33554432) blockZ = blockZ - 67108864;
            if (blockY >= 2048) blockY = blockY - 4096;

            try {
                return new BlockPosClass(blockX, blockY, blockZ);
            } catch (eNew) {
                try {
                    return BlockPosClass.containing(blockX, blockY, blockZ);
                } catch (eCont) {}
            }
        } catch (eBi) {
            dbg("BigInteger unpack failed: " + eBi);
        }
    }

    /* Last resort - may be wrong far from spawn. */
    try {
        return BlockPosClass.of(tag.getLong("sdd_spawner"));
    } catch (e1) {
        try {
            return BlockPosClass.m_122022_(tag.getLong("sdd_spawner"));
        } catch (e2) {
            return null;
        }
    }
}

function findApplyMethod(mc) {
    try {
        var cls = mc.getClass();
        while (cls != null) {
            var methods = cls.getDeclaredMethods();
            for (var i = 0; i < methods.length; i++) {
                if (String(methods[i].getName()) === "applySuSpawnNbt") {
                    methods[i].setAccessible(true);
                    return methods[i];
                }
            }
            cls = cls.getSuperclass();
        }
    } catch (e) {}
    try {
        var methods2 = mc.getClass().getMethods();
        for (var j = 0; j < methods2.length; j++) {
            if (String(methods2[j].getName()) === "applySuSpawnNbt") {
                methods2[j].setAccessible(true);
                return methods2[j];
            }
        }
    } catch (e2) {}
    return null;
}

function invokeApply(method, mc, raw) {
    try {
        /* Pass CompoundTag directly - do NOT wrap for Rhino. */
        method.invoke(mc, raw);
        return true;
    } catch (e1) {}
    try {
        method.invoke(mc, [raw]);
        return true;
    } catch (e2) {}
    try {
        var ArrayCls = loadClass("java.lang.reflect.Array");
        var ObjectCls = loadClass("java.lang.Object");
        var arr = ArrayCls.newInstance(ObjectCls, 1);
        ArrayCls.set(arr, 0, raw);
        method.invoke(mc, arr);
        return true;
    } catch (e3) {
        logFail("applySuSpawnNbt invoke failed: " + e3);
        return false;
    }
}

function rollKiDamage(configuredMin, configuredMax, configuredFallback) {
    var damageMin = Math.max(0, Math.min(configuredMin, configuredMax));
    var damageMax = Math.max(0, Math.max(configuredMin, configuredMax));
    if (damageMax <= 0) return configuredFallback;
    if (damageMin >= damageMax) return damageMin;
    return (
        damageMin +
        Math.floor(Math.random() * (damageMax - damageMin + 1))
    );
}

function rollMovesCsv(configuredMoveList) {
    var csv = "";
    var size = 0;
    if (configuredMoveList == null) return { csv: "", size: 0 };
    try {
        size = configuredMoveList.size();
    } catch (e) {
        size = 0;
    }
    if (KiMoveEntryClass == null) return { csv: "", size: size };

    for (var i = 0; i < size; i++) {
        var tokenObj = null;
        try {
            tokenObj = configuredMoveList.get(i);
        } catch (eGet) {
            continue;
        }
        if (tokenObj == null) continue;
        var token = ("" + tokenObj).trim();
        if (!token) continue;

        var entry = null;
        try {
            entry = KiMoveEntryClass.fromToken(token);
        } catch (eParse) {
            continue;
        }
        if (entry == null) continue;

        var cdMin = Math.max(
            1,
            Math.min(
                parseInt("" + entry.cdMin, 10),
                parseInt("" + entry.cdMax, 10)
            )
        );
        var cdMax = Math.max(
            1,
            Math.max(
                parseInt("" + entry.cdMin, 10),
                parseInt("" + entry.cdMax, 10)
            )
        );
        var rolledCd = cdMin;
        if (cdMax > cdMin) {
            rolledCd = cdMin + Math.floor(Math.random() * (cdMax - cdMin + 1));
        }

        var piece =
            "" +
            entry.type +
            ":" +
            rolledCd +
            ":" +
            parseFloat("" + entry.size) +
            ":" +
            (parseInt("" + entry.colorMain, 10) & 16777215);
        if (csv) csv += ",";
        csv += piece;
    }
    return { csv: csv, size: size };
}

function entityUuid(mc) {
    try {
        return String(mc.getUUID());
    } catch (e1) {
        try {
            return String(mc.m_20148_());
        } catch (e2) {
            return "";
        }
    }
}

function resolveEntityByUuid(mcHint, uuid) {
    if (mcHint != null) {
        try {
            if (mcHint.isAlive && mcHint.isAlive()) return mcHint;
        } catch (e1) {
            try {
                if (mcHint.isAlive) return mcHint;
            } catch (e2) {}
        }
    }
    if (!uuid) return mcHint;
    try {
        var level = getLevel(mcHint);
        if (level == null) return mcHint;
        var server = null;
        try {
            server = level.getServer();
        } catch (eS1) {
            try {
                server = level.m_7654_();
            } catch (eS2) {}
        }
        if (server == null) return mcHint;
        var UUID = loadClass("java.util.UUID");
        var id = UUID.fromString(uuid);
        var levels = null;
        try {
            levels = server.getAllLevels();
        } catch (eL) {
            try {
                levels = server.getAllLevels;
            } catch (eL2) {
                return mcHint;
            }
        }
        if (levels == null) return mcHint;
        var it = levels.iterator();
        while (it.hasNext()) {
            var lvl = it.next();
            var found = null;
            try {
                found = lvl.getEntity(id);
            } catch (eG1) {
                try {
                    found = lvl.m_6815_(id);
                } catch (eG2) {}
            }
            if (found != null) return found;
        }
    } catch (e) {}
    return mcHint;
}

function queueRetry(mc, reason) {
    if (mc == null) return;
    var id = entityUuid(mc);
    if (!id) return;
    var q = global.dungeonCloneKiRetry;
    for (var i = 0; i < q.length; i++) {
        if (q[i].uuid === id) {
            q[i].mc = mc;
            q[i].reason = reason || q[i].reason;
            return;
        }
    }
    if (q.length >= 256) {
        q.splice(0, q.length - 255);
    }
    q.push({ uuid: id, mc: mc, attempts: 0, reason: reason || "" });
    dbg("queued retry uuid=" + id + " reason=" + reason);
}

function looksAlreadyApplied(mc, tag) {
    if (!tagHas(tag, FIXED_SETTINGS_KEY) || !tagBool(tag, FIXED_SETTINGS_KEY)) {
        return false;
    }
    var wantEnabled = tagBool(tag, FIXED_ENABLED_KEY);
    var wantDmg = tagFloat(tag, FIXED_DAMAGE_KEY, 0);
    var wantMoves = tagString(tag, FIXED_MOVES_KEY);
    if (!wantEnabled && wantDmg <= 0 && (!wantMoves || !wantMoves.length)) {
        return true;
    }
    var curDmg = 0;
    try {
        curDmg = parseFloat("" + mc.getKiBlastDamage());
    } catch (e1) {}
    var curMoves = 0;
    try {
        curMoves = mc.getSkillPool().size();
    } catch (e2) {}
    return curDmg > 0 || curMoves > 0;
}

function tryApplyCloneFix(entityOrMc) {
    var mc = unwrapMc(entityOrMc);
    if (!isSduDmzFighter(mc)) return { ok: false, reason: "not_fighter" };
    if (!isServerMc(mc)) return { ok: false, reason: "not_server" };

    try {
        if (!mc.isAlive()) return { ok: false, reason: "dead" };
    } catch (eAlive) {}

    var tag = pd(mc);
    if (tag == null) return { ok: false, reason: "no_persistent" };

    if (looksAlreadyApplied(mc, tag)) {
        return { ok: true, reason: "already_fixed" };
    }

    if (!tagHas(tag, "sdd_spawner")) {
        return { ok: false, reason: "no_sdd_spawner", retry: true };
    }
    if (!tagHas(tag, "sdu_clone_ref")) {
        return { ok: false, reason: "no_sdu_clone_ref", retry: true };
    }

    var isBoss = tagHas(tag, "sdd_boss") && tagBool(tag, "sdd_boss");
    var desiredKiDamage = 0.0;
    var desiredMovesCsv = "";
    var desiredKiEnabled = false;
    var desiredAiTier = 0;
    var desiredBehavior = 0;
    var desiredScale = 1.0;

    var hasStoredRoll =
        tagHas(tag, FIXED_DAMAGE_KEY) && tagHas(tag, FIXED_MOVES_KEY);

    if (hasStoredRoll) {
        desiredKiDamage = tagFloat(tag, FIXED_DAMAGE_KEY, 0);
        desiredMovesCsv = tagString(tag, FIXED_MOVES_KEY);
        desiredKiEnabled = tagBool(tag, FIXED_ENABLED_KEY);
        desiredAiTier = tagInt(tag, FIXED_AI_TIER_KEY, 0);
        desiredBehavior = tagInt(tag, FIXED_BEHAVIOR_KEY, 0);
        desiredScale = tagFloat(tag, FIXED_SCALE_KEY, 1.0);
    } else {
        var pos = unpackSpawnerPos(tag);
        if (pos == null) {
            return { ok: false, reason: "bad_spawner_pos", retry: true };
        }

        var level = getLevel(mc);
        if (level == null) {
            return { ok: false, reason: "no_level", retry: true };
        }

        var be = null;
        try {
            be = level.getBlockEntity(pos);
        } catch (eBE) {
            try {
                be = level.m_7702_(pos);
            } catch (eBE2) {
                be = null;
            }
        }
        if (!isAdvancedSpawner(be)) {
            var px = "?";
            var py = "?";
            var pz = "?";
            try {
                px = pos.getX();
                py = pos.getY();
                pz = pos.getZ();
            } catch (eP) {}
            return {
                ok: false,
                reason: "no_spawner_te@" + px + "," + py + "," + pz,
                retry: true
            };
        }

        var config = null;
        try {
            config = be.getConfig();
        } catch (eCfg) {
            config = null;
        }
        if (config == null) {
            return { ok: false, reason: "no_config", retry: true };
        }

        desiredAiTier = parseInt("" + config.aiTier, 10);
        desiredBehavior = parseInt("" + config.behavior, 10);

        var configuredMin = 0;
        var configuredMax = 0;
        var configuredFallback = 0.0;
        var configuredMoveList = null;

        if (isBoss) {
            configuredMin = parseInt("" + config.bossKiDmgMin, 10);
            configuredMax = parseInt("" + config.bossKiDmgMax, 10);
            configuredFallback = parseFloat("" + config.bossKiPower);
            configuredMoveList = config.bossKiMoves;
            desiredScale = parseFloat("" + config.bossScale);
        } else {
            configuredMin = parseInt("" + config.kiDmgMin, 10);
            configuredMax = parseInt("" + config.kiDmgMax, 10);
            configuredFallback = parseFloat("" + config.kiPower);
            configuredMoveList = config.kiMoves;
            desiredScale = parseFloat("" + config.scale);
        }

        desiredKiDamage = rollKiDamage(
            configuredMin,
            configuredMax,
            configuredFallback
        );
        var rolled = rollMovesCsv(configuredMoveList);
        desiredMovesCsv = rolled.csv;

        if (isBoss) {
            desiredKiEnabled =
                desiredKiDamage > 0 || desiredMovesCsv.length > 0;
        } else {
            var kiBox = false;
            try {
                kiBox = !!config.kiEnabled;
            } catch (eEn) {
                kiBox = false;
            }
            desiredKiEnabled = kiBox || rolled.size > 0;
        }

        tagSetFloat(tag, FIXED_DAMAGE_KEY, desiredKiDamage);
        tagSetString(tag, FIXED_MOVES_KEY, desiredMovesCsv);
        tagSetBool(tag, FIXED_ENABLED_KEY, desiredKiEnabled);
        tagSetInt(tag, FIXED_AI_TIER_KEY, desiredAiTier);
        tagSetInt(tag, FIXED_BEHAVIOR_KEY, desiredBehavior);
        tagSetFloat(tag, FIXED_SCALE_KEY, desiredScale);
    }

    var applyMethod = findApplyMethod(mc);
    if (applyMethod == null) {
        return { ok: false, reason: "no_applySuSpawnNbt" };
    }

    if (CompoundTagClass == null) {
        return { ok: false, reason: "no_CompoundTag" };
    }

    var raw = new CompoundTagClass();
    try {
        raw.putInt("AiTier", desiredAiTier);
        raw.putInt("Behavior", desiredBehavior);
        raw.putFloat("KiPower", desiredKiDamage);
        raw.putBoolean("KiEnabled", desiredKiEnabled);
        raw.putFloat("ModelScale", desiredScale);
        if (desiredMovesCsv.length > 0) {
            raw.putString("SduKiMovesCsv", desiredMovesCsv);
        }
    } catch (eNbt) {
        return { ok: false, reason: "nbt_build:" + eNbt };
    }

    try {
        mc.getSkillPool().clear();
    } catch (eClear) {}

    if (!invokeApply(applyMethod, mc, raw)) {
        return { ok: false, reason: "invoke_failed", retry: true };
    }

    tagSetBool(tag, FIXED_SETTINGS_KEY, true);

    try {
        mc.setKiBlastDamage(desiredKiDamage);
    } catch (eSet) {}

    logOk(
        "OK ki=" +
            desiredKiDamage +
            " moves=" +
            (desiredMovesCsv || "(none)") +
            " enabled=" +
            desiredKiEnabled +
            (isBoss ? " boss" : "")
    );
    return { ok: true, reason: "applied" };
}

function handleCandidate(entity, source) {
    if (!isCloneCandidate(entity)) return;
    var mc = unwrapMc(entity);
    if (!isServerMc(mc)) return;

    var tag = pd(mc);
    logSeen(
        "seen source=" +
            source +
            " type=" +
            typeIdOf(entity) +
            " class=" +
            className(mc) +
            " sdd_spawner=" +
            tagHas(tag, "sdd_spawner") +
            " sdu_clone_ref=" +
            tagHas(tag, "sdu_clone_ref")
    );

    var result = tryApplyCloneFix(mc);
    if (result.ok) {
        dbg("source=" + source + " " + result.reason);
        return;
    }
    if (result.retry) {
        queueRetry(mc, result.reason);
        dbg("source=" + source + " retry=" + result.reason);
    } else {
        logFail("source=" + source + " fail=" + result.reason);
    }
}

function scanNearbyPlayer(player) {
    var mcPlayer = unwrapMc(player);
    if (!isServerMc(mcPlayer)) return;

    var level = getLevel(mcPlayer);
    if (level == null || AABBClass == null) return;

    var x = 0;
    var y = 0;
    var z = 0;
    try {
        x = mcPlayer.getX();
        y = mcPlayer.getY();
        z = mcPlayer.getZ();
    } catch (ePos) {
        try {
            x = mcPlayer.m_20185_();
            y = mcPlayer.m_20186_();
            z = mcPlayer.m_20189_();
        } catch (ePos2) {
            return;
        }
    }

    var r = NEARBY_RANGE;
    var box = null;
    try {
        box = new AABBClass(x - r, y - r, z - r, x + r, y + r, z + r);
    } catch (eBox) {
        return;
    }

    var list = null;
    try {
        list = level.getEntities(mcPlayer, box);
    } catch (e1) {
        try {
            list = level.m_45933_(mcPlayer, box);
        } catch (e2) {
            list = null;
        }
    }
    if (list == null) return;

    var it = null;
    try {
        it = list.iterator();
    } catch (eIt) {
        return;
    }
    while (it.hasNext()) {
        var ent = it.next();
        if (ent == null) continue;
        if (!isCloneCandidate(ent)) continue;
        handleCandidate(ent, "nearby");
    }
}

/* Every continuous spawn. */
EntityEvents.spawned(function (event) {
    try {
        handleCandidate(event.entity, "spawned");
    } catch (err) {
        logFail("spawned error: " + err);
    }
});

/* Nearby backup - catches clones if spawn-event timing misses tags. */
PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        var age = 0;
        try {
            age = player.age;
        } catch (eA) {
            try {
                age = unwrapMc(player).tickCount;
            } catch (eA2) {
                return;
            }
        }
        if (age % NEARBY_SCAN_EVERY !== 0) return;
        scanNearbyPlayer(player);
    } catch (err) {
        logFail("nearby scan error: " + err);
    }
});

/* Retry when sdd_* tags / spawner TE are not ready on the spawn tick. */
ServerEvents.tick(function (event) {
    try {
        if (event.server == null) return;
        var tick = 0;
        try {
            tick = event.server.getTickCount();
        } catch (eT) {
            try {
                tick = event.server.tickCount;
            } catch (eT2) {
                return;
            }
        }
        if (tick % RETRY_EVERY_TICKS !== 0) return;

        var q = global.dungeonCloneKiRetry;
        if (!q.length) return;

        var next = [];
        for (var i = 0; i < q.length; i++) {
            var item = q[i];
            item.attempts++;
            var live = resolveEntityByUuid(item.mc, item.uuid);
            item.mc = live;
            var result = tryApplyCloneFix(live);
            if (result.ok) continue;
            if (result.retry && item.attempts < RETRY_MAX_ATTEMPTS) {
                item.reason = result.reason;
                next.push(item);
            } else if (!result.ok) {
                logFail(
                    "give up uuid=" +
                        item.uuid +
                        " reason=" +
                        result.reason +
                        " after " +
                        item.attempts
                );
            }
        }
        global.dungeonCloneKiRetry = next;
    } catch (err) {
        logFail("tick error: " + err);
    }
});

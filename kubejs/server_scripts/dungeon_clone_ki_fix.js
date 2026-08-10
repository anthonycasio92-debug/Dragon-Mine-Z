/*
 * DBZ Legacy Reborn - Dungeon Clone Ki Fix (KubeJS SERVER SCRIPT ONLY)
 *
 * Pure ASCII. No startup script required.
 *
 * On every spawn of sdu:dmz_fighter clones from Advanced Spawners, restores
 * full ki damage / moves via SduDmzFighter.applySuSpawnNbt.
 *
 * Continuous spawns: EntityEvents.spawned + short tick retries for tag race.
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

var RETRY_MAX_ATTEMPTS = 30;
var RETRY_EVERY_TICKS = 4;
var LOG_OK_LEFT = 8;
var LOG_FAIL_LEFT = 16;

global.dungeonCloneKiRetry = global.dungeonCloneKiRetry || [];

console.info(
    "[Dungeon Clone Fix] server-only script loaded (EntityEvents.spawned + tick retries)."
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

function unwrapMc(entity) {
    if (entity == null) return null;
    try {
        if (entity.minecraftEntity != null) return entity.minecraftEntity;
    } catch (e1) {}
    try {
        if (entity.getMinecraftEntity) return entity.getMinecraftEntity();
    } catch (e2) {}
    try {
        if (entity.entity != null && entity.entity.getClass) return entity.entity;
    } catch (e3) {}
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
    try {
        var cls = loadClass("net.shurui.dev.sdu.entity.SduDmzFighter");
        if (cls != null) {
            try {
                return cls.isInstance(mc);
            } catch (e1) {
                try {
                    return cls.class.isInstance(mc);
                } catch (e2) {}
            }
        }
    } catch (e3) {}
    return false;
}

function isCloneCandidate(entity) {
    var tid = typeIdOf(entity).toLowerCase();
    /* Fast path for continuous spawn volume — only touch SDU fighters. */
    if (tid.indexOf("dmz_fighter") >= 0) return true;
    if (tid.indexOf("sdu:dmz") >= 0) return true;
    if (tid.indexOf("sdu") >= 0 && tid.indexOf("fighter") >= 0) return true;
    /* Do not instanceof-check every pig/zombie spawn. */
    return false;
}

function isAdvancedSpawner(be) {
    if (be == null) return false;
    var cn = className(be);
    if (cn.indexOf("AdvancedSpawnerBlockEntity") >= 0) return true;
    try {
        var cls = loadClass(
            "net.shurui.dev.shuruis_dmz_dungeons.block.AdvancedSpawnerBlockEntity"
        );
        if (cls != null) {
            try {
                return cls.isInstance(be);
            } catch (e1) {
                try {
                    return cls.class.isInstance(be);
                } catch (e2) {}
            }
        }
    } catch (e3) {}
    return false;
}

function isServerMc(mc) {
    if (mc == null) return false;
    try {
        var level = null;
        try {
            level = mc.level();
        } catch (e1) {
            try {
                level = mc.getLevel();
            } catch (e2) {
                try {
                    level = mc.m_9236_();
                } catch (e3) {}
            }
        }
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

function unpackSpawnerPos(tag) {
    if (tag == null || !tagHas(tag, "sdd_spawner")) return null;
    var BlockPos = loadClass("net.minecraft.core.BlockPos");
    if (BlockPos == null) return null;
    try {
        return BlockPos.of(tag.getLong("sdd_spawner"));
    } catch (e1) {
        try {
            return BlockPos.m_122022_(tag.getLong("sdd_spawner"));
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
    var KiMoveEntry = loadClass(
        "net.shurui.dev.shuruis_dmz_dungeons.block.KiMoveEntry"
    );
    if (KiMoveEntry == null) return { csv: "", size: size };

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
            entry = KiMoveEntry.fromToken(token);
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

function queueRetry(mc, reason) {
    if (mc == null) return;
    var id = entityUuid(mc);
    if (!id) return;
    var q = global.dungeonCloneKiRetry;
    for (var i = 0; i < q.length; i++) {
        if (q[i].uuid === id) {
            q[i].mc = mc;
            return;
        }
    }
    /* Cap queue under continuous spawn pressure. */
    if (q.length >= 256) {
        q.splice(0, q.length - 255);
    }
    q.push({ uuid: id, mc: mc, attempts: 0, reason: reason || "" });
    dbg("queued retry uuid=" + id + " reason=" + reason);
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

    /* Already done for this clone. */
    if (tagHas(tag, FIXED_SETTINGS_KEY) && tagBool(tag, FIXED_SETTINGS_KEY)) {
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

        var level = null;
        try {
            level = mc.level();
        } catch (eL1) {
            try {
                level = mc.getLevel();
            } catch (eL2) {
                try {
                    level = mc.m_9236_();
                } catch (eL3) {}
            }
        }
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
            return { ok: false, reason: "no_spawner_te", retry: true };
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

    var CompoundTag = loadClass("net.minecraft.nbt.CompoundTag");
    if (CompoundTag == null) {
        return { ok: false, reason: "no_CompoundTag" };
    }

    var raw = new CompoundTag();
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

    var result = tryApplyCloneFix(mc);
    if (result.ok) {
        dbg("source=" + source + " " + result.reason);
        return;
    }
    if (result.retry) {
        queueRetry(mc, result.reason);
    } else {
        logFail("source=" + source + " fail=" + result.reason);
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
            var result = tryApplyCloneFix(item.mc);
            if (result.ok) continue;
            if (result.retry && item.attempts < RETRY_MAX_ATTEMPTS) {
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

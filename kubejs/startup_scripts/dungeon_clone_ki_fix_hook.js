/*
 * DBZ Legacy Reborn - Dungeon Clone Ki Fix (KubeJS startup)
 *
 * Pure ASCII. Replaces CustomNPCs Global Forge script
 * Dungeon-Clone-Ki-Fix-Forge.js so CNPC forge scripts can stay OFF
 * (avoids CNPC EntityConstructing/Size NPE spam).
 *
 * Restores full Advanced Spawner ki damage / moves on sdu:dmz_fighter
 * clones via SduDmzFighter.applySuSpawnNbt.
 *
 * Requires a FULL server restart (startup ForgeEvents).
 */

var DEBUG = false;
var FIXED_SETTINGS_KEY = "sdd_clone_ki_fix_configured";
var FIXED_DAMAGE_KEY = "sdd_clone_ki_damage_fix_value";
var FIXED_MOVES_KEY = "sdd_clone_ki_moves_fix_csv";
var FIXED_ENABLED_KEY = "sdd_clone_ki_enabled_fix";
var FIXED_AI_TIER_KEY = "sdd_clone_ai_tier_fix";
var FIXED_BEHAVIOR_KEY = "sdd_clone_behavior_fix";
var FIXED_SCALE_KEY = "sdd_clone_scale_fix";
var RETRY_DELAYS = [5, 15, 30, 60, 100];

console.info("[Dungeon Clone Fix] startup hook evaluating...");

function dbg(msg) {
    if (DEBUG) {
        try {
            console.info("[Dungeon Clone Fix] " + msg);
        } catch (e) {}
    }
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

var BlockPos = loadClass("net.minecraft.core.BlockPos");
var CompoundTag = loadClass("net.minecraft.nbt.CompoundTag");
var KiMoveEntry = loadClass(
    "net.shurui.dev.shuruis_dmz_dungeons.block.KiMoveEntry"
);
var SduDmzFighter = loadClass("net.shurui.dev.sdu.entity.SduDmzFighter");
var AdvancedSpawnerBE = loadClass(
    "net.shurui.dev.shuruis_dmz_dungeons.block.AdvancedSpawnerBlockEntity"
);

function isServerEntity(entity) {
    if (entity == null) return false;
    try {
        var level = entity.getLevel ? entity.getLevel() : entity.level();
        if (level == null) return false;
        try {
            if (typeof level.isClientSide === "function") {
                return !level.isClientSide();
            }
        } catch (e1) {}
        try {
            return !level.clientSide;
        } catch (e2) {}
        return true;
    } catch (err) {
        return false;
    }
}

function isSduDmzFighter(entity) {
    if (entity == null) return false;
    try {
        if (SduDmzFighter != null) {
            return SduDmzFighter.isInstance(entity);
        }
    } catch (e1) {
        try {
            if (SduDmzFighter != null && SduDmzFighter.class) {
                return SduDmzFighter.class.isInstance(entity);
            }
        } catch (e2) {}
    }
    try {
        return (
            String(entity.getClass().getName()) ===
            "net.shurui.dev.sdu.entity.SduDmzFighter"
        );
    } catch (e3) {
        return false;
    }
}

function isAdvancedSpawner(be) {
    if (be == null) return false;
    try {
        if (AdvancedSpawnerBE != null) {
            return AdvancedSpawnerBE.isInstance(be);
        }
    } catch (e1) {
        try {
            if (AdvancedSpawnerBE != null && AdvancedSpawnerBE.class) {
                return AdvancedSpawnerBE.class.isInstance(be);
            }
        } catch (e2) {}
    }
    try {
        return (
            String(be.getClass().getName()) ===
            "net.shurui.dev.shuruis_dmz_dungeons.block.AdvancedSpawnerBlockEntity"
        );
    } catch (e3) {
        return false;
    }
}

function pd(entity) {
    try {
        return entity.getPersistentData();
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
    if (BlockPos == null || tag == null || !tagHas(tag, "sdd_spawner")) {
        return null;
    }
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

function findApplyMethod(entity) {
    try {
        var methods = entity.getClass().getDeclaredMethods();
        for (var i = 0; i < methods.length; i++) {
            var m = methods[i];
            if (String(m.getName()) === "applySuSpawnNbt") {
                m.setAccessible(true);
                return m;
            }
        }
    } catch (e) {}
    return null;
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

function scheduleRetry(entity, delayTicks) {
    try {
        if (Utils && Utils.server && Utils.server.scheduleInTicks) {
            Utils.server.scheduleInTicks(delayTicks, function () {
                try {
                    tryApplyCloneFix(entity);
                } catch (e) {}
            });
            return true;
        }
    } catch (e1) {}

    try {
        var server = entity.getServer();
        if (server == null) return false;
        var TickTask = loadClass("net.minecraft.server.TickTask");
        var Runnable = loadClass("java.lang.Runnable");
        if (TickTask == null || Runnable == null) return false;
        var tickNow = 0;
        try {
            tickNow = server.getTickCount();
        } catch (eT) {
            tickNow = server.m_129791_();
        }
        var runAt = tickNow + Math.max(1, delayTicks | 0);
        var ref = entity;
        var runner = new (Java.extend(Runnable, {
            run: function () {
                try {
                    tryApplyCloneFix(ref);
                } catch (e) {}
            }
        }))();
        server.tell(new TickTask(runAt, runner));
        return true;
    } catch (e2) {
        return false;
    }
}

function scheduleAllRetries(entity) {
    for (var i = 0; i < RETRY_DELAYS.length; i++) {
        scheduleRetry(entity, RETRY_DELAYS[i]);
    }
}

function tryApplyCloneFix(entity) {
    if (!isSduDmzFighter(entity)) return false;
    if (!isServerEntity(entity)) return false;
    try {
        if (!entity.isAlive()) return false;
    } catch (eAlive) {}

    var tag = pd(entity);
    if (tag == null) return false;
    if (!tagHas(tag, "sdd_spawner")) return false;
    if (!tagHas(tag, "sdu_clone_ref")) return false;

    if (tagHas(tag, FIXED_SETTINGS_KEY) && tagBool(tag, FIXED_SETTINGS_KEY)) {
        /* Already applied successfully; still ok to re-apply after chunk load. */
    }

    var isBoss = tagHas(tag, "sdd_boss") && tagBool(tag, "sdd_boss");
    var desiredKiDamage = 0.0;
    var desiredMovesCsv = "";
    var desiredKiEnabled = false;
    var desiredAiTier = 0;
    var desiredBehavior = 0;
    var desiredScale = 1.0;

    var loaded =
        (tagHas(tag, FIXED_SETTINGS_KEY) && tagBool(tag, FIXED_SETTINGS_KEY)) ||
        (tagHas(tag, FIXED_DAMAGE_KEY) && tagHas(tag, FIXED_MOVES_KEY));

    if (loaded) {
        desiredKiDamage = tagFloat(tag, FIXED_DAMAGE_KEY, 0);
        desiredMovesCsv = tagString(tag, FIXED_MOVES_KEY);
        desiredKiEnabled = tagBool(tag, FIXED_ENABLED_KEY);
        desiredAiTier = tagInt(tag, FIXED_AI_TIER_KEY, 0);
        desiredBehavior = tagInt(tag, FIXED_BEHAVIOR_KEY, 0);
        desiredScale = tagFloat(tag, FIXED_SCALE_KEY, 1.0);
    } else {
        var pos = unpackSpawnerPos(tag);
        if (pos == null) return false;

        var level = null;
        try {
            level = entity.getLevel ? entity.getLevel() : entity.level();
        } catch (eL) {}
        if (level == null) return false;

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
        if (!isAdvancedSpawner(be)) return false;

        var config = null;
        try {
            config = be.getConfig();
        } catch (eCfg) {
            return false;
        }
        if (config == null) return false;

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

        if (tagHas(tag, FIXED_DAMAGE_KEY)) {
            desiredKiDamage = tagFloat(tag, FIXED_DAMAGE_KEY, 0);
        } else {
            desiredKiDamage = rollKiDamage(
                configuredMin,
                configuredMax,
                configuredFallback
            );
        }

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

    var applyMethod = findApplyMethod(entity);
    if (applyMethod == null) {
        dbg("applySuSpawnNbt missing");
        return false;
    }
    if (CompoundTag == null) return false;

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
        return false;
    }

    try {
        entity.getSkillPool().clear();
    } catch (eClear) {
        dbg("skill pool clear failed: " + eClear);
        return false;
    }

    try {
        applyMethod.invoke(entity, raw);
    } catch (eInv) {
        dbg("applySuSpawnNbt failed: " + eInv);
        return false;
    }

    tagSetBool(tag, FIXED_SETTINGS_KEY, true);

    try {
        entity.setKiBlastDamage(desiredKiDamage);
    } catch (eSet) {}

    dbg(
        "applied ki=" +
            desiredKiDamage +
            " moves=" +
            desiredMovesCsv +
            " enabled=" +
            desiredKiEnabled
    );
    return true;
}

function onEntityJoin(event) {
    try {
        var entity = null;
        try {
            entity = event.getEntity();
        } catch (e1) {
            entity = event.entity;
        }
        if (!isSduDmzFighter(entity)) return;
        if (!isServerEntity(entity)) return;

        var ok = false;
        try {
            ok = !!tryApplyCloneFix(entity);
        } catch (eApply) {
            ok = false;
        }

        if (!ok) {
            scheduleAllRetries(entity);
        } else {
            scheduleRetry(entity, 20);
        }
    } catch (err) {
        dbg("join error: " + err);
    }
}

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.EntityJoinLevelEvent",
        onEntityJoin
    );
    console.info(
        "[Dungeon Clone Fix] EntityJoinLevelEvent registered (KubeJS). Keep CNPC Global Forge Scripts DISABLED."
    );
} catch (err) {
    console.error("[Dungeon Clone Fix] ForgeEvents register failed: " + err);
}

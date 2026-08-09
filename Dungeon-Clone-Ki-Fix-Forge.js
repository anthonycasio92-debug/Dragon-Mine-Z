/*
 * ============================================================
 * Shurui's DMZ Dungeons - Cloned NPC Full Spawner Fix (CNPC Forge)
 * Version: 1.2.1 — DEPRECATED for installs that want no CNPC spam
 * ============================================================
 *
 * PREFERRED INSTALL (no CNPC forge NPE spam):
 *   Use kubejs/startup_scripts/dungeon_clone_ki_fix_hook.js
 *   and DISABLE CustomNPCs -> Global -> Forge Scripts entirely.
 *
 * This CNPC Forge file is kept only as a fallback. Enabling ANY
 * CNPC Global Forge Scripts causes EntityConstructing/Size NPE spam
 * inside CustomNPCs GBPort (not fixable from script code).
 *
 * Intended versions:
 * - Shurui's DMZ Dungeons 2.0.5
 * - SDU 3.0.5
 * - Dragon Mine Z 2.1.3
 * - CustomNPCs GBPort 1.20.1
 *
 * Fallback install (will spam CNPC SEVERE logs):
 *   CustomNPCs -> Global -> Forge Scripts (own tab)
 *   Enable ONLY: init, entityJoinLevelEvent
 *
 * Do NOT run older player-tick or ki-damage-only versions with this.
 *
 * ABOUT CNPC "Error in EntityEvent$Size / EntityConstructing" NPEs:
 * Those are thrown INSIDE CustomNPCs (ForgeEventHandler.forgeEntity ->
 * EventHooks.onForgeEntityEvent -> NpcAPI.getIEntity) whenever Global
 * Forge Scripts are enabled. CNPC wraps EVERY server EntityEvent before
 * checking which script handlers exist. Our script cannot stop that spam.
 * It is caught by CNPC (no crash). Same spam appears with only
 * ShadowDummyForgeProtect / EndDragon-Forge-Trigger enabled.
 * Shulker "Unable to get EntityData" warnings are the same CNPC path.
 *
 * Fixes vs 1.0:
 * - Find applySuSpawnNbt BEFORE clearing the skill pool
 * - Correct Method.invoke arg packing (pass CompoundTag directly)
 * - Server-side only
 * - Safer BlockPos long unpack (avoid JS number precision loss)
 * - Robust entity unwrap (event.entity / event.event.getEntity)
 * - Persist FIXED_* keys onto MC persistent data
 * - Join-race retries via server TickTask (no living tick event)
 * - Mark FIXED_SETTINGS only AFTER successful apply
 * ============================================================
 */

var DEBUG = false;

var FIXED_SETTINGS_KEY = "sdd_clone_ki_fix_configured";
var FIXED_DAMAGE_KEY = "sdd_clone_ki_damage_fix_value";
var FIXED_MOVES_KEY = "sdd_clone_ki_moves_fix_csv";
var FIXED_ENABLED_KEY = "sdd_clone_ki_enabled_fix";
var FIXED_AI_TIER_KEY = "sdd_clone_ai_tier_fix";
var FIXED_BEHAVIOR_KEY = "sdd_clone_behavior_fix";
var FIXED_SCALE_KEY = "sdd_clone_scale_fix";

/* Join-race retries (server TickTask delays, in ticks). */
var RETRY_DELAYS = [5, 15, 30, 60, 100];

var LongClass = null;
var BigInteger = null;
var CompoundTag = null;
var NpcAPIClass = null;
var TickTaskClass = null;
var RunnableClass = null;

try { LongClass = Java.type("java.lang.Long"); } catch (e0) {}
try { BigInteger = Java.type("java.math.BigInteger"); } catch (e1) {}
try { CompoundTag = Java.type("net.minecraft.nbt.CompoundTag"); } catch (e2) {}
try { NpcAPIClass = Java.type("noppes.npcs.api.NpcAPI"); } catch (e3) {}
try { TickTaskClass = Java.type("net.minecraft.server.TickTask"); } catch (e4) {}
try { RunnableClass = Java.type("java.lang.Runnable"); } catch (e5) {}

var KiMoveEntry = null;
try {
    KiMoveEntry = Java.type(
        "net.shurui.dev.shuruis_dmz_dungeons.block.KiMoveEntry"
    );
} catch (eKi) {
    KiMoveEntry = null;
}

var SduDmzFighterClass = null;
try {
    SduDmzFighterClass = Java.type(
        "net.shurui.dev.sdu.entity.SduDmzFighter"
    );
} catch (eF) {
    SduDmzFighterClass = null;
}

var AdvancedSpawnerBEClass = null;
try {
    AdvancedSpawnerBEClass = Java.type(
        "net.shurui.dev.shuruis_dmz_dungeons.block.AdvancedSpawnerBlockEntity"
    );
} catch (eS) {
    AdvancedSpawnerBEClass = null;
}

var TWO_64 = BigInteger != null ? new BigInteger("18446744073709551616") : null;
var MASK_26 = BigInteger != null ? new BigInteger("67108863") : null;
var MASK_12 = BigInteger != null ? new BigInteger("4095") : null;

var APPLY_METHOD_NAME = "applySuSpawnNbt";

function init(event) {
    try {
        print(
            "[Dungeon Clone Fix] v1.2.1 loaded (CNPC Forge). Enable ONLY init + entityJoinLevelEvent."
        );
    } catch (e) {}
}

function dbg(msg) {
    if (DEBUG) {
        try {
            print("[Dungeon Clone Fix] " + msg);
        } catch (e) {}
    }
}

function isServerMcEntity(mcEntity) {
    if (mcEntity == null) return false;
    try {
        var level = null;
        try {
            level = mcEntity.level();
        } catch (e1) {
            try {
                level = mcEntity.getLevel();
            } catch (e2) {
                try {
                    level = mcEntity.m_9236_();
                } catch (e3) {}
            }
        }
        if (level == null) return false;
        try {
            if (typeof level.isClientSide === "function") {
                if (level.isClientSide()) return false;
            } else if (level.isClientSide) {
                return false;
            }
        } catch (e4) {
            try {
                if (level.m_5776_()) return false;
            } catch (e5) {}
        }
        return true;
    } catch (err) {
        return false;
    }
}

function unwrapMcEntity(event) {
    if (event == null) return null;
    var entity = null;
    try {
        if (event.entity != null) entity = event.entity;
    } catch (e1) {}
    try {
        if (
            entity == null &&
            event.event != null &&
            event.event.getEntity
        ) {
            entity = event.event.getEntity();
        }
    } catch (e2) {}
    try {
        if (entity == null && event.getEntity) {
            entity = event.getEntity();
        }
    } catch (e3) {}

    if (entity == null) return null;

    try {
        if (entity.getMCEntity) return entity.getMCEntity();
    } catch (e4) {}
    return entity;
}

function unwrapIEntity(event) {
    if (event == null) return null;
    try {
        if (event.entity != null && event.entity.getMCEntity) {
            return event.entity;
        }
    } catch (e1) {}
    return null;
}

function isSduDmzFighter(mcEntity) {
    if (mcEntity == null) return false;
    try {
        if (SduDmzFighterClass != null) {
            return SduDmzFighterClass.class.isInstance(mcEntity);
        }
    } catch (e1) {}
    try {
        return (
            String(mcEntity.getClass().getName()) ===
            "net.shurui.dev.sdu.entity.SduDmzFighter"
        );
    } catch (e2) {
        return false;
    }
}

function isAdvancedSpawnerBE(blockEntity) {
    if (blockEntity == null) return false;
    try {
        if (AdvancedSpawnerBEClass != null) {
            return AdvancedSpawnerBEClass.class.isInstance(blockEntity);
        }
    } catch (e1) {}
    try {
        return (
            String(blockEntity.getClass().getName()) ===
            "net.shurui.dev.shuruis_dmz_dungeons.block.AdvancedSpawnerBlockEntity"
        );
    } catch (e2) {
        return false;
    }
}

function getINbt(entity, mcEntity) {
    try {
        if (entity != null && entity.getNbt) {
            var nbt = entity.getNbt();
            if (nbt != null) return nbt;
        }
    } catch (e1) {}
    try {
        if (mcEntity != null && NpcAPIClass != null) {
            return NpcAPIClass.Instance().getINbt(
                mcEntity.getPersistentData()
            );
        }
    } catch (e2) {}
    return null;
}

function getMcCompound(nbt, mcEntity) {
    try {
        if (nbt != null && nbt.getMCNBT) {
            var tag = nbt.getMCNBT();
            if (tag != null) return tag;
        }
    } catch (e1) {}
    try {
        if (mcEntity != null) return mcEntity.getPersistentData();
    } catch (e2) {}
    return null;
}

function nbtHas(nbt, mcEntity, key) {
    try {
        if (nbt != null && nbt.has(key)) return true;
    } catch (e1) {}
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null && tag.contains(key)) return true;
    } catch (e2) {}
    return false;
}

function nbtGetBoolean(nbt, mcEntity, key) {
    try {
        if (nbt != null && nbt.has(key)) return !!nbt.getBoolean(key);
    } catch (e1) {}
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null && tag.contains(key)) return !!tag.getBoolean(key);
    } catch (e2) {}
    return false;
}

function nbtGetFloat(nbt, mcEntity, key, fallback) {
    try {
        if (nbt != null && nbt.has(key)) {
            return parseFloat("" + nbt.getFloat(key));
        }
    } catch (e1) {}
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null && tag.contains(key)) {
            return parseFloat("" + tag.getFloat(key));
        }
    } catch (e2) {}
    return fallback;
}

function nbtGetInt(nbt, mcEntity, key, fallback) {
    try {
        if (nbt != null && nbt.has(key)) {
            return parseInt("" + nbt.getInteger(key), 10);
        }
    } catch (e1) {}
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null && tag.contains(key)) {
            return parseInt("" + tag.getInt(key), 10);
        }
    } catch (e2) {}
    return fallback;
}

function nbtGetString(nbt, mcEntity, key) {
    try {
        if (nbt != null && nbt.has(key)) return "" + nbt.getString(key);
    } catch (e1) {}
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null && tag.contains(key)) return "" + tag.getString(key);
    } catch (e2) {}
    return "";
}

function nbtSetBoolean(nbt, mcEntity, key, value) {
    try {
        if (nbt != null) nbt.setBoolean(key, !!value);
    } catch (e1) {}
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null) tag.putBoolean(key, !!value);
    } catch (e2) {}
}

function nbtSetFloat(nbt, mcEntity, key, value) {
    try {
        if (nbt != null) nbt.setFloat(key, value);
    } catch (e1) {}
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null) tag.putFloat(key, value);
    } catch (e2) {}
}

function nbtSetInt(nbt, mcEntity, key, value) {
    try {
        if (nbt != null) nbt.setInteger(key, value);
    } catch (e1) {}
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null) tag.putInt(key, value);
    } catch (e2) {}
}

function nbtSetString(nbt, mcEntity, key, value) {
    var text = "" + value;
    try {
        if (nbt != null && nbt.setString) nbt.setString(key, text);
    } catch (e1) {
        try {
            if (nbt != null && nbt.putString) nbt.putString(key, text);
        } catch (e1b) {}
    }
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null) tag.putString(key, text);
    } catch (e2) {}
}

/*
 * Read packed BlockPos long as decimal string without JS Number coercion.
 */
function readPackedSpawnerLongString(nbt, mcEntity) {
    try {
        var tag = getMcCompound(nbt, mcEntity);
        if (tag != null && tag.contains("sdd_spawner")) {
            return LongClass.toString(tag.getLong("sdd_spawner"));
        }
    } catch (e1) {}
    try {
        if (nbt != null && nbt.has("sdd_spawner") && nbt.getMCNBT) {
            var mc = nbt.getMCNBT();
            if (mc != null && mc.contains("sdd_spawner")) {
                return LongClass.toString(mc.getLong("sdd_spawner"));
            }
        }
    } catch (e2) {}
    try {
        /* Last resort - may lose precision on some Rhino builds. */
        return LongClass.toString(nbt.getLong("sdd_spawner"));
    } catch (e3) {}
    return null;
}

function unpackBlockPos(packedText) {
    if (BigInteger == null || TWO_64 == null) return null;
    var packed = new BigInteger("" + packedText);
    if (packed.signum() < 0) {
        packed = packed.add(TWO_64);
    }

    var blockX = packed.shiftRight(38).and(MASK_26).intValue();
    var blockZ = packed.shiftRight(12).and(MASK_26).intValue();
    var blockY = packed.and(MASK_12).intValue();

    if (blockX >= 33554432) blockX = blockX - 67108864;
    if (blockZ >= 33554432) blockZ = blockZ - 67108864;
    if (blockY >= 2048) blockY = blockY - 4096;

    return { x: blockX, y: blockY, z: blockZ };
}

function getServerFromEntity(mcEntity) {
    if (mcEntity == null) return null;
    try {
        var s = mcEntity.getServer();
        if (s != null) return s;
    } catch (e1) {}
    try {
        var level = null;
        try {
            level = mcEntity.level();
        } catch (e2) {
            try {
                level = mcEntity.getLevel();
            } catch (e3) {
                try {
                    level = mcEntity.m_9236_();
                } catch (e4) {}
            }
        }
        if (level != null) {
            try {
                return level.getServer();
            } catch (e5) {
                try {
                    return level.m_7654_();
                } catch (e6) {}
            }
        }
    } catch (e7) {}
    return null;
}

/*
 * Schedule a server-thread retry without livingTickEvent / EntityEvent.Size.
 * Those CNPC forge events NPE while entities are still constructing.
 */
function scheduleCloneRetry(mcEntity, delayTicks) {
    if (mcEntity == null || TickTaskClass == null || RunnableClass == null) {
        return false;
    }
    try {
        var server = getServerFromEntity(mcEntity);
        if (server == null) return false;

        var tickNow = 0;
        try {
            tickNow = server.getTickCount();
        } catch (eT) {
            try {
                tickNow = server.m_129791_();
            } catch (eT2) {
                return false;
            }
        }

        var runAt = tickNow + Math.max(1, delayTicks | 0);
        var entityRef = mcEntity;

        var runner = new (Java.extend(RunnableClass, {
            run: function () {
                try {
                    if (entityRef == null || !entityRef.isAlive()) return;
                    if (!isSduDmzFighter(entityRef)) return;
                    if (!isServerMcEntity(entityRef)) return;

                    var iEntity = null;
                    try {
                        if (NpcAPIClass != null) {
                            iEntity = NpcAPIClass.Instance().getIEntity(
                                entityRef
                            );
                        }
                    } catch (eI) {
                        iEntity = null;
                    }

                    var nbt = getINbt(iEntity, entityRef);
                    if (nbt == null) return;
                    if (!nbtHas(nbt, entityRef, "sdd_spawner")) return;
                    if (!nbtHas(nbt, entityRef, "sdu_clone_ref")) return;
                    if (
                        nbtHas(nbt, entityRef, FIXED_SETTINGS_KEY) &&
                        nbtGetBoolean(nbt, entityRef, FIXED_SETTINGS_KEY)
                    ) {
                        return;
                    }

                    applyCloneFix(iEntity, entityRef, false);
                } catch (err) {
                    dbg("scheduled retry error: " + err);
                }
            }
        }))();

        server.tell(new TickTaskClass(runAt, runner));
        return true;
    } catch (err) {
        dbg("scheduleCloneRetry failed: " + err);
        return false;
    }
}

function scheduleAllCloneRetries(mcEntity) {
    for (var i = 0; i < RETRY_DELAYS.length; i++) {
        scheduleCloneRetry(mcEntity, RETRY_DELAYS[i]);
    }
}

function findApplySuSpawnNbt(mcEntity) {
    try {
        var declaredMethods = mcEntity.getClass().getDeclaredMethods();
        for (var i = 0; i < declaredMethods.length; i++) {
            var m = declaredMethods[i];
            if (String(m.getName()) === APPLY_METHOD_NAME) {
                m.setAccessible(true);
                return m;
            }
        }
    } catch (err) {}
    return null;
}

function entityAge(mcEntity) {
    try {
        return parseInt("" + mcEntity.tickCount, 10);
    } catch (e1) {
        try {
            return parseInt("" + mcEntity.f_19797_, 10);
        } catch (e2) {
            return 0;
        }
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
    var desiredMovesCsv = "";
    var originalMoveListSize = 0;

    if (configuredMoveList == null) {
        return { csv: "", size: 0 };
    }

    try {
        originalMoveListSize = configuredMoveList.size();
    } catch (eSize) {
        originalMoveListSize = 0;
    }

    if (KiMoveEntry == null) {
        dbg("KiMoveEntry class missing; cannot parse move tokens.");
        return { csv: "", size: originalMoveListSize };
    }

    for (var moveIndex = 0; moveIndex < originalMoveListSize; moveIndex++) {
        var moveTokenObject = null;
        try {
            moveTokenObject = configuredMoveList.get(moveIndex);
        } catch (eGet) {
            continue;
        }
        if (moveTokenObject == null) continue;

        var moveToken = ("" + moveTokenObject).trim();
        if (moveToken.length === 0) continue;

        var moveEntry = null;
        try {
            moveEntry = KiMoveEntry.fromToken(moveToken);
        } catch (eParse) {
            continue;
        }
        if (moveEntry == null) continue;

        var cooldownMin = Math.max(
            1,
            Math.min(
                parseInt("" + moveEntry.cdMin, 10),
                parseInt("" + moveEntry.cdMax, 10)
            )
        );
        var cooldownMax = Math.max(
            1,
            Math.max(
                parseInt("" + moveEntry.cdMin, 10),
                parseInt("" + moveEntry.cdMax, 10)
            )
        );

        var rolledCooldown = cooldownMin;
        if (cooldownMax > cooldownMin) {
            rolledCooldown =
                cooldownMin +
                Math.floor(Math.random() * (cooldownMax - cooldownMin + 1));
        }

        var moveType = "" + moveEntry.type;
        var moveSize = parseFloat("" + moveEntry.size);
        var moveColor = parseInt("" + moveEntry.colorMain, 10) & 16777215;

        var rolledMove =
            moveType + ":" + rolledCooldown + ":" + moveSize + ":" + moveColor;

        if (desiredMovesCsv.length > 0) desiredMovesCsv += ",";
        desiredMovesCsv += rolledMove;
    }

    return { csv: desiredMovesCsv, size: originalMoveListSize };
}

function applyCloneFix(iEntity, mcEntity, allowRetryLater) {
    if (!isSduDmzFighter(mcEntity)) return false;
    if (!isServerMcEntity(mcEntity)) return false;

    var nbt = getINbt(iEntity, mcEntity);
    if (nbt == null) return false;

    if (!nbtHas(nbt, mcEntity, "sdd_spawner")) {
        return false;
    }
    if (!nbtHas(nbt, mcEntity, "sdu_clone_ref")) {
        return false;
    }

    var isBoss =
        nbtHas(nbt, mcEntity, "sdd_boss") &&
        nbtGetBoolean(nbt, mcEntity, "sdd_boss");

    var desiredKiDamage = 0.0;
    var desiredMovesCsv = "";
    var desiredKiEnabled = false;
    var desiredAiTier = 0;
    var desiredBehavior = 0;
    var desiredScale = 1.0;

    var loadedStoredSettings =
        nbtHas(nbt, mcEntity, FIXED_SETTINGS_KEY) &&
        nbtGetBoolean(nbt, mcEntity, FIXED_SETTINGS_KEY);
    var hasStoredRoll =
        nbtHas(nbt, mcEntity, FIXED_DAMAGE_KEY) &&
        nbtHas(nbt, mcEntity, FIXED_MOVES_KEY);

    if (loadedStoredSettings || hasStoredRoll) {
        /* Re-apply after chunk reload, or retry after a failed apply. */
        desiredKiDamage = nbtGetFloat(nbt, mcEntity, FIXED_DAMAGE_KEY, 0);
        desiredMovesCsv = nbtGetString(nbt, mcEntity, FIXED_MOVES_KEY);
        desiredKiEnabled = nbtGetBoolean(nbt, mcEntity, FIXED_ENABLED_KEY);
        desiredAiTier = nbtGetInt(nbt, mcEntity, FIXED_AI_TIER_KEY, 0);
        desiredBehavior = nbtGetInt(nbt, mcEntity, FIXED_BEHAVIOR_KEY, 0);
        desiredScale = nbtGetFloat(nbt, mcEntity, FIXED_SCALE_KEY, 1.0);
    } else {
        var packedText = readPackedSpawnerLongString(nbt, mcEntity);
        if (packedText == null) {
            dbg("Missing/unreadable sdd_spawner long.");
            return false;
        }

        var pos = unpackBlockPos(packedText);
        if (pos == null) {
            dbg("Failed to unpack sdd_spawner BlockPos.");
            return false;
        }
        var world = null;
        try {
            if (iEntity != null) world = iEntity.getWorld();
        } catch (eW) {}
        if (world == null) {
            dbg("No IWorld on entity.");
            return false;
        }

        var spawnerBlock = null;
        try {
            spawnerBlock = world.getBlock(pos.x, pos.y, pos.z);
        } catch (eB) {
            spawnerBlock = null;
        }

        if (spawnerBlock == null) {
            dbg(
                "No block at " +
                    pos.x +
                    "," +
                    pos.y +
                    "," +
                    pos.z +
                    (allowRetryLater ? " (will retry)" : "")
            );
            return false;
        }

        var hasTE = false;
        try {
            hasTE = !!spawnerBlock.hasTileEntity();
        } catch (eTE) {
            try {
                hasTE = spawnerBlock.getMCTileEntity() != null;
            } catch (eTE2) {
                hasTE = false;
            }
        }
        if (!hasTE) {
            dbg("Block has no tile entity at spawner pos.");
            return false;
        }

        var blockEntity = null;
        try {
            blockEntity = spawnerBlock.getMCTileEntity();
        } catch (eBE) {
            blockEntity = null;
        }
        if (!isAdvancedSpawnerBE(blockEntity)) {
            dbg("Tile at packed pos is not AdvancedSpawnerBlockEntity.");
            return false;
        }

        var config = null;
        try {
            config = blockEntity.getConfig();
        } catch (eCfg) {
            config = null;
        }
        if (config == null) return false;

        var configuredMin = 0;
        var configuredMax = 0;
        var configuredFallback = 0.0;
        var configuredMoveList = null;

        desiredAiTier = parseInt("" + config.aiTier, 10);
        desiredBehavior = parseInt("" + config.behavior, 10);

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

        if (nbtHas(nbt, mcEntity, FIXED_DAMAGE_KEY)) {
            desiredKiDamage = nbtGetFloat(
                nbt,
                mcEntity,
                FIXED_DAMAGE_KEY,
                0
            );
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

        /* Persist rolled values for chunk reload / retry, but do NOT mark
         * FIXED_SETTINGS until applySuSpawnNbt succeeds (below). */
        nbtSetFloat(nbt, mcEntity, FIXED_DAMAGE_KEY, desiredKiDamage);
        nbtSetString(nbt, mcEntity, FIXED_MOVES_KEY, desiredMovesCsv);
        nbtSetBoolean(nbt, mcEntity, FIXED_ENABLED_KEY, desiredKiEnabled);
        nbtSetInt(nbt, mcEntity, FIXED_AI_TIER_KEY, desiredAiTier);
        nbtSetInt(nbt, mcEntity, FIXED_BEHAVIOR_KEY, desiredBehavior);
        nbtSetFloat(nbt, mcEntity, FIXED_SCALE_KEY, desiredScale);
    }

    /* Resolve apply method BEFORE clearing moves. */
    var applyMethod = findApplySuSpawnNbt(mcEntity);
    if (applyMethod == null) {
        dbg(
            "Could not find SduDmzFighter.applySuSpawnNbt(). SDU version mismatch?"
        );
        return false;
    }

    var rawSpawnNbt = new CompoundTag();
    var spawnNbt = NpcAPIClass.Instance().getINbt(rawSpawnNbt);

    spawnNbt.setInteger("AiTier", desiredAiTier);
    spawnNbt.setInteger("Behavior", desiredBehavior);
    spawnNbt.setFloat("KiPower", desiredKiDamage);
    spawnNbt.setBoolean("KiEnabled", desiredKiEnabled);
    spawnNbt.setFloat("ModelScale", desiredScale);
    if (desiredMovesCsv.length > 0) {
        try {
            spawnNbt.setString("SduKiMovesCsv", desiredMovesCsv);
        } catch (eStr) {
            try {
                spawnNbt.putString("SduKiMovesCsv", desiredMovesCsv);
            } catch (eStr2) {}
        }
    }

    var previousKiDamage = 0;
    var previousMoveCount = 0;
    try {
        previousKiDamage = parseFloat("" + mcEntity.getKiBlastDamage());
    } catch (eDmg) {}
    try {
        previousMoveCount = mcEntity.getSkillPool().size();
    } catch (ePool) {
        previousMoveCount = 0;
    }

    try {
        mcEntity.getSkillPool().clear();
    } catch (eClear) {
        dbg("getSkillPool().clear() failed: " + eClear);
        return false;
    }

    try {
        /* Pass CompoundTag directly - do NOT wrap in Object[] for Rhino. */
        applyMethod.invoke(mcEntity, rawSpawnNbt);
    } catch (eInv) {
        dbg("applySuSpawnNbt invoke failed: " + eInv);
        return false;
    }

    /* Success: mark configured so livingTickEvent stops retrying. */
    nbtSetBoolean(nbt, mcEntity, FIXED_SETTINGS_KEY, true);

    try {
        mcEntity.setKiBlastDamage(desiredKiDamage);
    } catch (eSet) {
        dbg("setKiBlastDamage failed: " + eSet);
    }

    var newMoveCount = 0;
    try {
        newMoveCount = mcEntity.getSkillPool().size();
    } catch (eNew) {
        newMoveCount = 0;
    }

    var name = "?";
    try {
        if (iEntity != null) name = "" + iEntity.getName();
        else name = "" + mcEntity.getName().getString();
    } catch (eN) {}

    dbg(
        name +
            (isBoss ? " [BOSS]" : "") +
            " | Ki damage: " +
            previousKiDamage +
            " -> " +
            desiredKiDamage +
            " | Ki moves: " +
            previousMoveCount +
            " -> " +
            newMoveCount +
            " | Ki enabled: " +
            desiredKiEnabled +
            " | AI tier: " +
            desiredAiTier +
            " | Behavior: " +
            desiredBehavior
    );
    if (desiredMovesCsv.length > 0) {
        dbg("Applied moves: " + desiredMovesCsv);
    }

    return true;
}

function entityJoinLevelEvent(event) {
    try {
        var mcEntity = unwrapMcEntity(event);
        var iEntity = unwrapIEntity(event);
        if (mcEntity == null) return;
        if (!isSduDmzFighter(mcEntity)) return;
        if (!isServerMcEntity(mcEntity)) return;

        var ok = false;
        try {
            ok = !!applyCloneFix(iEntity, mcEntity, true);
        } catch (eApply) {
            ok = false;
            dbg("join apply error: " + eApply);
        }

        /* Always schedule light retries for join-race (tags/spawner TE). */
        if (!ok) {
            scheduleAllCloneRetries(mcEntity);
        } else {
            /* Still schedule one late pass in case pool was overwritten. */
            scheduleCloneRetry(mcEntity, 20);
        }
    } catch (error) {
        dbg("entityJoinLevelEvent error: " + error);
    }
}

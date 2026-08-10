/*
 * DBZ Legacy Reborn - Dungeon Clone Ki Fix (KubeJS SERVER SCRIPT ONLY)
 *
 * Pure ASCII. No startup script / no CNPC Forge Scripts required.
 *
 * Port of Dungeon-Clone-Ki-Fix-Forge.js (v1.2.1) apply logic:
 *   - Read clone tags via CNPC NpcAPI IEntity.getNbt() (same as working forge)
 *   - Fallback: Forge persistent data + full entity save NBT deep search
 *   - Fallback: nearest AdvancedSpawnerBlockEntity in nearby chunks
 *   - BigInteger BlockPos unpack (no JS long precision loss)
 *   - applySuSpawnNbt BEFORE/with skill-pool clear; CompoundTag passed directly
 *   - FIXED_* persisted on MC persistent data; mark only after successful apply
 *
 * Events (server-only continuous spawns):
 *   EntityEvents.spawned + tick retries (mirrors forge RETRY_DELAYS) + nearby scan
 *
 * Install: copy to kubejs/server_scripts/
 * Apply:   /kubejs reload server_scripts
 * Keep CustomNPCs Global Forge Scripts OFF (API is fine; forge event hooks spam).
 */

var DEBUG = false;
var FIXED_SETTINGS_KEY = "sdd_clone_ki_fix_configured";
var FIXED_DAMAGE_KEY = "sdd_clone_ki_damage_fix_value";
var FIXED_MOVES_KEY = "sdd_clone_ki_moves_fix_csv";
var FIXED_ENABLED_KEY = "sdd_clone_ki_enabled_fix";
var FIXED_AI_TIER_KEY = "sdd_clone_ai_tier_fix";
var FIXED_BEHAVIOR_KEY = "sdd_clone_behavior_fix";
var FIXED_SCALE_KEY = "sdd_clone_scale_fix";

/* Same delays as Dungeon-Clone-Ki-Fix-Forge.js scheduleAllCloneRetries. */
var RETRY_DELAYS = [5, 15, 30, 60, 100];
var RETRY_EVERY_TICKS = 1;
var NEARBY_SCAN_EVERY = 40;
var NEARBY_RANGE = 48.0;
var NEAREST_SPAWNER_RANGE = 24;
var LOG_OK_LEFT = 16;
var LOG_FAIL_LEFT = 24;
var LOG_SEEN_LEFT = 20;
var LOG_NBT_LEFT = 8;

global.dungeonCloneKiRetry = global.dungeonCloneKiRetry || [];

console.info(
    "[Dungeon Clone Fix] server script loaded (CNPC-NBT port + spawned/retries/nearby)."
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

function logNbt(msg) {
    if (LOG_NBT_LEFT <= 0) return;
    LOG_NBT_LEFT--;
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
var NpcAPIClass = loadClass("noppes.npcs.api.NpcAPI");
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

if (NpcAPIClass != null) {
    console.info("[Dungeon Clone Fix] NpcAPI ready (CNPC NBT path).");
} else {
    console.warn(
        "[Dungeon Clone Fix] NpcAPI missing - using MC NBT / nearest-spawner only."
    );
}
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
    try {
        if (SduDmzFighterClass != null) {
            try {
                return SduDmzFighterClass.class.isInstance(mc);
            } catch (e0) {
                return SduDmzFighterClass.isInstance(mc);
            }
        }
    } catch (e1) {}
    return className(mc).indexOf("SduDmzFighter") >= 0;
}

function isCloneCandidate(entity) {
    var mc = unwrapMc(entity);
    if (mc == null) return false;
    if (isSduDmzFighter(mc)) return true;
    var tid = typeIdOf(entity).toLowerCase();
    if (tid.indexOf("dmz_fighter") >= 0) return true;
    if (tid.indexOf("sdu") >= 0 && tid.indexOf("fighter") >= 0) return true;
    return false;
}

function isAdvancedSpawner(be) {
    if (be == null) return false;
    try {
        if (AdvancedSpawnerClass != null) {
            try {
                return AdvancedSpawnerClass.class.isInstance(be);
            } catch (e0) {
                return AdvancedSpawnerClass.isInstance(be);
            }
        }
    } catch (e1) {}
    return className(be).indexOf("AdvancedSpawnerBlockEntity") >= 0;
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
    } catch (e) {
        return false;
    }
}

/* ---- CNPC NBT helpers (same contract as Dungeon-Clone-Ki-Fix-Forge.js) ---- */

function getIEntity(mc) {
    if (mc == null || NpcAPIClass == null) return null;
    try {
        return NpcAPIClass.Instance().getIEntity(mc);
    } catch (e) {
        return null;
    }
}

function getINbt(iEntity, mc) {
    try {
        if (iEntity != null && iEntity.getNbt) {
            var nbt = iEntity.getNbt();
            if (nbt != null) return nbt;
        }
    } catch (e1) {}
    try {
        if (mc != null && NpcAPIClass != null) {
            return NpcAPIClass.Instance().getINbt(mc.getPersistentData());
        }
    } catch (e2) {}
    return null;
}

function getMcCompound(iNbt, mc) {
    try {
        if (iNbt != null && iNbt.getMCNBT) {
            var tag = iNbt.getMCNBT();
            if (tag != null) return tag;
        }
    } catch (e1) {}
    try {
        if (mc != null) return mc.getPersistentData();
    } catch (e2) {}
    return null;
}

function nbtHas(iNbt, mc, key) {
    try {
        if (iNbt != null && iNbt.has(key)) return true;
    } catch (e1) {}
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null && tag.contains(key)) return true;
    } catch (e2) {}
    return false;
}

function nbtGetBoolean(iNbt, mc, key) {
    try {
        if (iNbt != null && iNbt.has(key)) return !!iNbt.getBoolean(key);
    } catch (e1) {}
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null && tag.contains(key)) return !!tag.getBoolean(key);
    } catch (e2) {}
    return false;
}

function nbtGetFloat(iNbt, mc, key, fallback) {
    try {
        if (iNbt != null && iNbt.has(key)) {
            return parseFloat("" + iNbt.getFloat(key));
        }
    } catch (e1) {}
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null && tag.contains(key)) {
            return parseFloat("" + tag.getFloat(key));
        }
    } catch (e2) {}
    return fallback;
}

function nbtGetInt(iNbt, mc, key, fallback) {
    try {
        if (iNbt != null && iNbt.has(key)) {
            return parseInt("" + iNbt.getInteger(key), 10);
        }
    } catch (e1) {}
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null && tag.contains(key)) {
            return parseInt("" + tag.getInt(key), 10);
        }
    } catch (e2) {}
    return fallback;
}

function nbtGetString(iNbt, mc, key) {
    try {
        if (iNbt != null && iNbt.has(key)) return "" + iNbt.getString(key);
    } catch (e1) {}
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null && tag.contains(key)) return "" + tag.getString(key);
    } catch (e2) {}
    return "";
}

function nbtSetBoolean(iNbt, mc, key, value) {
    try {
        if (iNbt != null) iNbt.setBoolean(key, !!value);
    } catch (e1) {}
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null) tag.putBoolean(key, !!value);
    } catch (e2) {}
    try {
        if (mc != null) mc.getPersistentData().putBoolean(key, !!value);
    } catch (e3) {}
}

function nbtSetFloat(iNbt, mc, key, value) {
    try {
        if (iNbt != null) iNbt.setFloat(key, value);
    } catch (e1) {}
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null) tag.putFloat(key, value);
    } catch (e2) {}
    try {
        if (mc != null) mc.getPersistentData().putFloat(key, value);
    } catch (e3) {}
}

function nbtSetInt(iNbt, mc, key, value) {
    try {
        if (iNbt != null) iNbt.setInteger(key, value);
    } catch (e1) {}
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null) tag.putInt(key, value);
    } catch (e2) {}
    try {
        if (mc != null) mc.getPersistentData().putInt(key, value);
    } catch (e3) {}
}

function nbtSetString(iNbt, mc, key, value) {
    var text = "" + value;
    try {
        if (iNbt != null && iNbt.setString) iNbt.setString(key, text);
    } catch (e1) {
        try {
            if (iNbt != null && iNbt.putString) iNbt.putString(key, text);
        } catch (e1b) {}
    }
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null) tag.putString(key, text);
    } catch (e2) {}
    try {
        if (mc != null) mc.getPersistentData().putString(key, text);
    } catch (e3) {}
}

function serializeEntityNbt(mc) {
    if (mc == null || CompoundTagClass == null) return null;
    var tag = new CompoundTagClass();
    try {
        mc.saveWithoutId(tag);
        return tag;
    } catch (e1) {
        try {
            mc.m_20223_(tag);
            return tag;
        } catch (e2) {
            try {
                return mc.serializeNBT();
            } catch (e3) {
                return null;
            }
        }
    }
}

function findCompoundWithKey(tag, key, depth) {
    if (tag == null || depth > 5) return null;
    try {
        if (tag.contains(key)) return tag;
    } catch (e1) {}
    try {
        var keys = tag.getAllKeys();
        var it = keys.iterator();
        while (it.hasNext()) {
            var k = String(it.next());
            var type = -1;
            try {
                type = tag.getTagType(k);
            } catch (eT) {
                try {
                    type = tag.m_128425_(k);
                } catch (eT2) {
                    type = -1;
                }
            }
            if (type === 10) {
                var child = null;
                try {
                    child = tag.getCompound(k);
                } catch (eC) {
                    child = null;
                }
                var found = findCompoundWithKey(child, key, depth + 1);
                if (found != null) return found;
            }
        }
    } catch (e2) {}
    return null;
}

function compoundKeySample(tag, limit) {
    if (tag == null) return "(null)";
    var out = [];
    try {
        var keys = tag.getAllKeys();
        var it = keys.iterator();
        var n = 0;
        while (it.hasNext() && n < limit) {
            out.push(String(it.next()));
            n++;
        }
    } catch (e) {
        return "(unreadable)";
    }
    return out.length ? out.join(",") : "(empty)";
}

/*
 * Mirror forge readPackedSpawnerLongString, plus entity-save-NBT deep search.
 */
function readPackedSpawnerLongString(iNbt, mc) {
    try {
        var tag = getMcCompound(iNbt, mc);
        if (tag != null && tag.contains("sdd_spawner") && LongClass != null) {
            return LongClass.toString(tag.getLong("sdd_spawner"));
        }
    } catch (e1) {}
    try {
        if (iNbt != null && iNbt.has("sdd_spawner") && iNbt.getMCNBT) {
            var mcTag = iNbt.getMCNBT();
            if (mcTag != null && mcTag.contains("sdd_spawner") && LongClass != null) {
                return LongClass.toString(mcTag.getLong("sdd_spawner"));
            }
        }
    } catch (e2) {}
    try {
        if (iNbt != null && iNbt.has("sdd_spawner") && LongClass != null) {
            return LongClass.toString(iNbt.getLong("sdd_spawner"));
        }
    } catch (e3) {}

    /* Extra vs forge: entity save NBT (addAdditionalSaveData). */
    try {
        var full = serializeEntityNbt(mc);
        var host = findCompoundWithKey(full, "sdd_spawner", 0);
        if (host != null && LongClass != null) {
            return LongClass.toString(host.getLong("sdd_spawner"));
        }
        if (full != null) {
            logNbt(
                "entity_nbt keys=" +
                    compoundKeySample(full, 24) +
                    " forge=" +
                    compoundKeySample(
                        full.contains("ForgeData")
                            ? full.getCompound("ForgeData")
                            : null,
                        16
                    )
            );
        }
    } catch (e4) {}
    return null;
}

function unpackBlockPos(packedText) {
    if (BigInteger == null || TWO_64 == null || packedText == null) return null;
    var packed = new BigInteger("" + packedText);
    if (packed.signum() < 0) packed = packed.add(TWO_64);

    var blockX = packed.shiftRight(38).and(MASK_26).intValue();
    var blockZ = packed.shiftRight(12).and(MASK_26).intValue();
    var blockY = packed.and(MASK_12).intValue();

    if (blockX >= 33554432) blockX = blockX - 67108864;
    if (blockZ >= 33554432) blockZ = blockZ - 67108864;
    if (blockY >= 2048) blockY = blockY - 4096;

    return { x: blockX, y: blockY, z: blockZ };
}

function entityBlockPos(mc) {
    if (BlockPosClass == null || mc == null) return null;
    try {
        return mc.blockPosition();
    } catch (e1) {
        try {
            return mc.m_20183_();
        } catch (e2) {
            try {
                return new BlockPosClass(
                    Math.floor(mc.getX()),
                    Math.floor(mc.getY()),
                    Math.floor(mc.getZ())
                );
            } catch (e3) {
                return null;
            }
        }
    }
}

function dist2ToBlock(mc, pos) {
    try {
        var x = mc.getX() - (pos.getX() + 0.5);
        var y = mc.getY() - (pos.getY() + 0.5);
        var z = mc.getZ() - (pos.getZ() + 0.5);
        return x * x + y * y + z * z;
    } catch (e) {
        return 1e18;
    }
}

function findNearestAdvancedSpawner(mc, rangeBlocks) {
    var level = getLevel(mc);
    var origin = entityBlockPos(mc);
    if (level == null || origin == null) return null;

    var best = null;
    var bestD2 = rangeBlocks * rangeBlocks;
    var chunkR = Math.ceil(rangeBlocks / 16);
    if (chunkR < 1) chunkR = 1;
    if (chunkR > 3) chunkR = 3;

    var cx = origin.getX() >> 4;
    var cz = origin.getZ() >> 4;

    for (var dx = -chunkR; dx <= chunkR; dx++) {
        for (var dz = -chunkR; dz <= chunkR; dz++) {
            var chunk = null;
            try {
                chunk = level.getChunk(cx + dx, cz + dz);
            } catch (eCh) {
                try {
                    chunk = level.m_6325_(cx + dx, cz + dz);
                } catch (eCh2) {
                    chunk = null;
                }
            }
            if (chunk == null) continue;

            var map = null;
            try {
                map = chunk.getBlockEntities();
            } catch (eM1) {
                try {
                    map = chunk.blockEntities;
                } catch (eM2) {
                    map = null;
                }
            }
            if (map == null) continue;

            var values = null;
            try {
                values = map.values();
            } catch (eV) {
                continue;
            }
            var it = null;
            try {
                it = values.iterator();
            } catch (eIt) {
                continue;
            }
            while (it.hasNext()) {
                var be = it.next();
                if (!isAdvancedSpawner(be)) continue;
                var pos = null;
                try {
                    pos = be.getBlockPos();
                } catch (eP1) {
                    try {
                        pos = be.m_58899_();
                    } catch (eP2) {
                        pos = null;
                    }
                }
                if (pos == null) continue;
                var d2 = dist2ToBlock(mc, pos);
                if (d2 <= bestD2) {
                    bestD2 = d2;
                    best = be;
                }
            }
        }
    }
    return best;
}

/*
 * Resolve AdvancedSpawner TE the same way as forge when possible:
 * CNPC IWorld.getBlock(x,y,z).getMCTileEntity(), else level.getBlockEntity.
 */
function resolveSpawnerTE(iEntity, mc, posXYZ) {
    if (posXYZ == null) return null;

    try {
        if (iEntity != null && iEntity.getWorld) {
            var world = iEntity.getWorld();
            if (world != null) {
                var spawnerBlock = world.getBlock(posXYZ.x, posXYZ.y, posXYZ.z);
                if (spawnerBlock != null) {
                    var te = null;
                    try {
                        te = spawnerBlock.getMCTileEntity();
                    } catch (eTE) {
                        te = null;
                    }
                    if (isAdvancedSpawner(te)) return te;
                }
            }
        }
    } catch (eW) {}

    var level = getLevel(mc);
    if (level == null || BlockPosClass == null) return null;
    var pos = null;
    try {
        pos = new BlockPosClass(posXYZ.x, posXYZ.y, posXYZ.z);
    } catch (eP) {
        try {
            pos = BlockPosClass.containing(posXYZ.x, posXYZ.y, posXYZ.z);
        } catch (eP2) {
            return null;
        }
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
    return isAdvancedSpawner(be) ? be : null;
}

function findApplySuSpawnNbt(mc) {
    try {
        var declaredMethods = mc.getClass().getDeclaredMethods();
        for (var i = 0; i < declaredMethods.length; i++) {
            var m = declaredMethods[i];
            if (String(m.getName()) === "applySuSpawnNbt") {
                m.setAccessible(true);
                return m;
            }
        }
    } catch (err) {}
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
    if (configuredMoveList == null) return { csv: "", size: 0 };
    try {
        originalMoveListSize = configuredMoveList.size();
    } catch (eSize) {
        originalMoveListSize = 0;
    }
    if (KiMoveEntryClass == null) {
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
            moveEntry = KiMoveEntryClass.fromToken(moveToken);
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

        var rolledMove =
            "" +
            moveEntry.type +
            ":" +
            rolledCooldown +
            ":" +
            parseFloat("" + moveEntry.size) +
            ":" +
            (parseInt("" + moveEntry.colorMain, 10) & 16777215);

        if (desiredMovesCsv.length > 0) desiredMovesCsv += ",";
        desiredMovesCsv += rolledMove;
    }
    return { csv: desiredMovesCsv, size: originalMoveListSize };
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

function queueForgeStyleRetries(mc) {
    if (mc == null) return;
    var id = entityUuid(mc);
    if (!id) return;
    var q = global.dungeonCloneKiRetry;
    var serverTick = 0;
    try {
        var level = getLevel(mc);
        var server = level.getServer();
        serverTick = server.getTickCount();
    } catch (eT) {
        try {
            serverTick = getLevel(mc).getServer().tickCount;
        } catch (eT2) {
            serverTick = 0;
        }
    }

    /* Replace existing schedule for this uuid. */
    var kept = [];
    for (var i = 0; i < q.length; i++) {
        if (q[i].uuid !== id) kept.push(q[i]);
    }

    for (var d = 0; d < RETRY_DELAYS.length; d++) {
        kept.push({
            uuid: id,
            mc: mc,
            runAt: serverTick + RETRY_DELAYS[d],
            attempts: 0,
            reason: "forge_retry"
        });
    }
    /* Cap */
    if (kept.length > 512) {
        kept.splice(0, kept.length - 512);
    }
    global.dungeonCloneKiRetry = kept;
}

function rollFromSpawnerConfig(blockEntity, isBoss, iNbt, mc) {
    var config = null;
    try {
        config = blockEntity.getConfig();
    } catch (eCfg) {
        return null;
    }
    if (config == null) return null;

    var desiredAiTier = parseInt("" + config.aiTier, 10);
    var desiredBehavior = parseInt("" + config.behavior, 10);
    var desiredScale = 1.0;
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

    var desiredKiDamage;
    if (nbtHas(iNbt, mc, FIXED_DAMAGE_KEY)) {
        desiredKiDamage = nbtGetFloat(iNbt, mc, FIXED_DAMAGE_KEY, 0);
    } else {
        desiredKiDamage = rollKiDamage(
            configuredMin,
            configuredMax,
            configuredFallback
        );
    }

    var rolled = rollMovesCsv(configuredMoveList);
    var desiredMovesCsv = rolled.csv;
    var desiredKiEnabled = false;
    if (isBoss) {
        desiredKiEnabled = desiredKiDamage > 0 || desiredMovesCsv.length > 0;
    } else {
        var kiBox = false;
        try {
            kiBox = !!config.kiEnabled;
        } catch (eEn) {
            kiBox = false;
        }
        desiredKiEnabled = kiBox || rolled.size > 0;
    }

    return {
        desiredAiTier: desiredAiTier,
        desiredBehavior: desiredBehavior,
        desiredKiDamage: desiredKiDamage,
        desiredMovesCsv: desiredMovesCsv,
        desiredKiEnabled: desiredKiEnabled,
        desiredScale: desiredScale
    };
}

/*
 * Core apply - mirrors Dungeon-Clone-Ki-Fix-Forge.js applyCloneFix.
 */
function applyCloneFix(mc, allowRetryLater) {
    if (!isSduDmzFighter(mc)) return { ok: false, reason: "not_fighter" };
    if (!isServerMc(mc)) return { ok: false, reason: "not_server" };

    try {
        if (!mc.isAlive()) return { ok: false, reason: "dead" };
    } catch (eAlive) {}

    var iEntity = getIEntity(mc);
    var iNbt = getINbt(iEntity, mc);

    var hasSpawner = nbtHas(iNbt, mc, "sdd_spawner");
    var hasCloneRef = nbtHas(iNbt, mc, "sdu_clone_ref");
    var tagSource = "cnpc_or_persistent";

    /* If CNPC/persistent miss tags, probe entity save NBT (extra vs forge). */
    if (!hasSpawner || !hasCloneRef) {
        var full = serializeEntityNbt(mc);
        var host = findCompoundWithKey(full, "sdd_spawner", 0);
        if (host != null) {
            hasSpawner = true;
            tagSource = "entity_nbt";
            if (host.contains("sdu_clone_ref")) hasCloneRef = true;
        }
        var refHost = findCompoundWithKey(full, "sdu_clone_ref", 0);
        if (refHost != null) hasCloneRef = true;
    }

    var isBoss =
        nbtHas(iNbt, mc, "sdd_boss") && nbtGetBoolean(iNbt, mc, "sdd_boss");

    var desiredKiDamage = 0.0;
    var desiredMovesCsv = "";
    var desiredKiEnabled = false;
    var desiredAiTier = 0;
    var desiredBehavior = 0;
    var desiredScale = 1.0;
    var via = tagSource;

    var loadedStoredSettings =
        nbtHas(iNbt, mc, FIXED_SETTINGS_KEY) &&
        nbtGetBoolean(iNbt, mc, FIXED_SETTINGS_KEY);
    var hasStoredRoll =
        nbtHas(iNbt, mc, FIXED_DAMAGE_KEY) && nbtHas(iNbt, mc, FIXED_MOVES_KEY);

    /* Forge: if already marked, still re-apply from stored rolls. */
    if (loadedStoredSettings || hasStoredRoll) {
        desiredKiDamage = nbtGetFloat(iNbt, mc, FIXED_DAMAGE_KEY, 0);
        desiredMovesCsv = nbtGetString(iNbt, mc, FIXED_MOVES_KEY);
        desiredKiEnabled = nbtGetBoolean(iNbt, mc, FIXED_ENABLED_KEY);
        desiredAiTier = nbtGetInt(iNbt, mc, FIXED_AI_TIER_KEY, 0);
        desiredBehavior = nbtGetInt(iNbt, mc, FIXED_BEHAVIOR_KEY, 0);
        desiredScale = nbtGetFloat(iNbt, mc, FIXED_SCALE_KEY, 1.0);
        via = "stored";

        /* Skip if already looks applied (avoid clearing pool every nearby tick). */
        if (loadedStoredSettings) {
            var curDmg = 0;
            var curMoves = 0;
            try {
                curDmg = parseFloat("" + mc.getKiBlastDamage());
            } catch (eD) {}
            try {
                curMoves = mc.getSkillPool().size();
            } catch (eM) {}
            if (
                (!desiredKiEnabled &&
                    desiredKiDamage <= 0 &&
                    !desiredMovesCsv) ||
                curDmg > 0 ||
                curMoves > 0
            ) {
                return { ok: true, reason: "already_fixed" };
            }
        }
    } else {
        var blockEntity = null;

        if (hasSpawner) {
            var packedText = readPackedSpawnerLongString(iNbt, mc);
            if (packedText == null) {
                return {
                    ok: false,
                    reason: "bad_spawner_long",
                    retry: !!allowRetryLater
                };
            }
            var pos = unpackBlockPos(packedText);
            if (pos == null) {
                return {
                    ok: false,
                    reason: "bad_spawner_pos",
                    retry: !!allowRetryLater
                };
            }
            blockEntity = resolveSpawnerTE(iEntity, mc, pos);
            if (!isAdvancedSpawner(blockEntity)) {
                blockEntity = findNearestAdvancedSpawner(
                    mc,
                    NEAREST_SPAWNER_RANGE
                );
                via = tagSource + "+nearest";
            }
            if (!isAdvancedSpawner(blockEntity)) {
                return {
                    ok: false,
                    reason:
                        "no_spawner_te@" + pos.x + "," + pos.y + "," + pos.z,
                    retry: !!allowRetryLater
                };
            }
        } else {
            /* Forge required tags; we add nearest-spawner fallback for tagless clones. */
            blockEntity = findNearestAdvancedSpawner(mc, NEAREST_SPAWNER_RANGE);
            if (!isAdvancedSpawner(blockEntity)) {
                return {
                    ok: false,
                    reason:
                        "no_sdd_spawner" +
                        (hasCloneRef ? "" : "+no_sdu_clone_ref") +
                        "+no_nearby_spawner",
                    retry: !!allowRetryLater
                };
            }
            via = "nearest_spawner";
        }

        var rolledCfg = rollFromSpawnerConfig(blockEntity, isBoss, iNbt, mc);
        if (rolledCfg == null) {
            return {
                ok: false,
                reason: "no_config",
                retry: !!allowRetryLater
            };
        }
        desiredAiTier = rolledCfg.desiredAiTier;
        desiredBehavior = rolledCfg.desiredBehavior;
        desiredKiDamage = rolledCfg.desiredKiDamage;
        desiredMovesCsv = rolledCfg.desiredMovesCsv;
        desiredKiEnabled = rolledCfg.desiredKiEnabled;
        desiredScale = rolledCfg.desiredScale;

        /* Persist rolled values (forge: before apply; mark FIXED only after). */
        nbtSetFloat(iNbt, mc, FIXED_DAMAGE_KEY, desiredKiDamage);
        nbtSetString(iNbt, mc, FIXED_MOVES_KEY, desiredMovesCsv);
        nbtSetBoolean(iNbt, mc, FIXED_ENABLED_KEY, desiredKiEnabled);
        nbtSetInt(iNbt, mc, FIXED_AI_TIER_KEY, desiredAiTier);
        nbtSetInt(iNbt, mc, FIXED_BEHAVIOR_KEY, desiredBehavior);
        nbtSetFloat(iNbt, mc, FIXED_SCALE_KEY, desiredScale);
    }

    /* Resolve apply method BEFORE clearing moves (forge fix). */
    var applyMethod = findApplySuSpawnNbt(mc);
    if (applyMethod == null) {
        return { ok: false, reason: "no_applySuSpawnNbt" };
    }
    if (CompoundTagClass == null) {
        return { ok: false, reason: "no_CompoundTag" };
    }

    var rawSpawnNbt = new CompoundTagClass();
    try {
        /* Prefer CNPC INbt writers when available (exact forge path). */
        if (NpcAPIClass != null) {
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
        } else {
            rawSpawnNbt.putInt("AiTier", desiredAiTier);
            rawSpawnNbt.putInt("Behavior", desiredBehavior);
            rawSpawnNbt.putFloat("KiPower", desiredKiDamage);
            rawSpawnNbt.putBoolean("KiEnabled", desiredKiEnabled);
            rawSpawnNbt.putFloat("ModelScale", desiredScale);
            if (desiredMovesCsv.length > 0) {
                rawSpawnNbt.putString("SduKiMovesCsv", desiredMovesCsv);
            }
        }
    } catch (eNbt) {
        return { ok: false, reason: "nbt_build:" + eNbt };
    }

    try {
        mc.getSkillPool().clear();
    } catch (eClear) {
        return { ok: false, reason: "skillPool_clear:" + eClear };
    }

    try {
        /* Pass CompoundTag directly - do NOT wrap in Object[] for Rhino. */
        applyMethod.invoke(mc, rawSpawnNbt);
    } catch (eInv) {
        logFail("applySuSpawnNbt invoke failed: " + eInv);
        return { ok: false, reason: "invoke_failed", retry: !!allowRetryLater };
    }

    nbtSetBoolean(iNbt, mc, FIXED_SETTINGS_KEY, true);

    try {
        mc.setKiBlastDamage(desiredKiDamage);
    } catch (eSet) {}

    var newMoveCount = 0;
    try {
        newMoveCount = mc.getSkillPool().size();
    } catch (eNew) {}

    logOk(
        "OK via=" +
            via +
            " ki=" +
            desiredKiDamage +
            " moves=" +
            (desiredMovesCsv || "(none)") +
            " pool=" +
            newMoveCount +
            " enabled=" +
            desiredKiEnabled +
            (isBoss ? " boss" : "") +
            " cnpc=" +
            (iEntity != null)
    );
    return { ok: true, reason: "applied" };
}

function handleCandidate(entity, source) {
    if (!isCloneCandidate(entity)) return;
    var mc = unwrapMc(entity);
    if (!isServerMc(mc)) return;

    var iEntity = getIEntity(mc);
    var iNbt = getINbt(iEntity, mc);
    logSeen(
        "seen source=" +
            source +
            " type=" +
            typeIdOf(entity) +
            " cnpc=" +
            (iEntity != null) +
            " sdd_spawner=" +
            nbtHas(iNbt, mc, "sdd_spawner") +
            " sdu_clone_ref=" +
            nbtHas(iNbt, mc, "sdu_clone_ref")
    );

    var result = applyCloneFix(mc, true);
    if (result.ok) {
        /* Forge schedules one late pass even on success. */
        if (result.reason === "applied") {
            var q = global.dungeonCloneKiRetry;
            var tick = 0;
            try {
                tick = getLevel(mc).getServer().getTickCount();
            } catch (eT) {}
            q.push({
                uuid: entityUuid(mc),
                mc: mc,
                runAt: tick + 20,
                attempts: 0,
                reason: "late_pass"
            });
        }
        return;
    }
    if (result.retry) {
        queueForgeStyleRetries(mc);
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
        return;
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
            return;
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

EntityEvents.spawned(function (event) {
    try {
        handleCandidate(event.entity, "spawned");
    } catch (err) {
        logFail("spawned error: " + err);
    }
});

PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        var age = 0;
        try {
            age = player.age;
        } catch (eA) {
            return;
        }
        if (age % NEARBY_SCAN_EVERY !== 0) return;
        scanNearbyPlayer(player);
    } catch (err) {
        logFail("nearby scan error: " + err);
    }
});

/* Drain forge-style delayed retries. */
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
            if (item.runAt != null && tick < item.runAt) {
                next.push(item);
                continue;
            }
            item.attempts++;
            var mc = item.mc;
            try {
                if (mc == null || !mc.isAlive()) continue;
            } catch (eDead) {
                continue;
            }
            var result = applyCloneFix(mc, false);
            if (result.ok) continue;
            /* One-shot delayed tasks like forge TickTask - do not loop forever. */
            if (result.retry && item.reason === "forge_retry" && item.attempts < 1) {
                next.push(item);
            } else if (!result.ok && item.reason !== "late_pass") {
                /* Only log once per schedule wave end. */
                if (item.attempts >= 1) {
                    logFail(
                        "retry done uuid=" +
                            item.uuid +
                            " reason=" +
                            result.reason
                    );
                }
            }
        }
        global.dungeonCloneKiRetry = next;
    } catch (err) {
        logFail("tick error: " + err);
    }
});

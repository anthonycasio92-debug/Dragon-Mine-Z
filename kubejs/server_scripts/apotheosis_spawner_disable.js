/*
 * DBZ Legacy Reborn - Disable Apotheosis Spawner Upgrades
 *
 * Pure ASCII file so KubeJS UTF-8 reader never hits MalformedInputException.
 *
 * 1) Removes ALL apotheosis:spawner_modifier recipes, then re-adds only
 *    redstone_control (+ inverted). Also handles comparator right-click
 *    directly so redstone control works even if recipe reload fails.
 * 2) Converts EXISTING world spawners back to vanilla stats while keeping
 *    the spawned mob type (SpawnData) AND redstone_control if enabled.
 * 3) Strips other upgrade NBT from spawner items in inventories / ground.
 *
 * Still allowed:
 * - Changing spawner mob type with spawn eggs
 * - Redstone control (right-click spawner with comparator)
 *   Offhand quartz + comparator removes redstone control.
 *
 * Reload: /reload  or  /kubejs reload server_scripts
 */

console.info("[Apotheosis Spawner] Loading recipe disable + world vanillaizer...");

/* Vanilla BaseSpawner defaults (1.20.1). */
var VANILLA_MIN_DELAY = 200;
var VANILLA_MAX_DELAY = 800;
var VANILLA_SPAWN_COUNT = 4;
var VANILLA_MAX_NEARBY = 6;
var VANILLA_PLAYER_RANGE = 16;
var VANILLA_SPAWN_RANGE = 4;

/* Cleared on vanillaize. redstone_control is intentionally preserved. */
var APOTH_BOOL_KEYS_CLEAR = [
    "ignore_players",
    "ignore_conditions",
    "ignore_light",
    "no_ai",
    "silent",
    "baby"
];

/* Java field names on ApothSpawnerTile (not NBT keys). */
var APOTH_BOOL_FIELDS_CLEAR = [
    "ignoresPlayers",
    "ignoresConditions",
    "ignoresLight",
    "hasNoAI",
    "silent",
    "baby"
];

var PLAYER_SCAN_INTERVAL = 100; /* 5s */
var PLAYER_SCAN_CHUNK_RADIUS = 3; /* chunks around player */
var DEBUG_SPAWNER = false;

var ApothSpawnerTileClass = null;
var ApothTried = false;
var ApothFieldCache = {};

function getApothSpawnerTileClass() {
    if (ApothTried) return ApothSpawnerTileClass;
    ApothTried = true;
    try {
        ApothSpawnerTileClass = Java.loadClass(
            "dev.shadowsoffire.apotheosis.spawn.spawner.ApothSpawnerTile"
        );
        console.info("[Apotheosis Spawner] ApothSpawnerTile class loaded.");
    } catch (err) {
        ApothSpawnerTileClass = null;
        console.info(
            "[Apotheosis Spawner] ApothSpawnerTile missing (NBT fallback only): " +
                err
        );
    }
    return ApothSpawnerTileClass;
}

function getApothJavaClass(be) {
    var cls = getApothSpawnerTileClass();
    if (cls == null || be == null) return null;
    try {
        if (be instanceof cls) return cls;
    } catch (e1) {}
    try {
        var raw = be;
        try {
            if (typeof be.getClass === "function") {
                var cn = String(be.getClass().getName());
                if (cn.indexOf("ApothSpawnerTile") >= 0) return cls;
            }
        } catch (e2) {}
        try {
            if (be.blockEntity != null) raw = be.blockEntity;
        } catch (e3) {}
        try {
            if (raw instanceof cls) return cls;
        } catch (e4) {}
    } catch (e5) {}
    return null;
}

function getDeclaredField(cls, name) {
    if (cls == null || !name) return null;
    var key = String(name);
    if (ApothFieldCache[key] !== undefined) return ApothFieldCache[key];
    var field = null;
    try {
        field = cls.getDeclaredField(key);
        field.setAccessible(true);
    } catch (e1) {
        try {
            field = cls.getField(key);
        } catch (e2) {
            try {
                /* Some KubeJS wraps expose .class */
                field = cls.class.getDeclaredField(key);
                field.setAccessible(true);
            } catch (e3) {
                field = null;
            }
        }
    }
    ApothFieldCache[key] = field;
    return field;
}

function reflectGetBoolean(be, fieldName) {
    var cls = getApothJavaClass(be);
    if (cls == null) return null;
    try {
        var field = getDeclaredField(cls, fieldName);
        if (field == null) return null;
        return !!field.getBoolean(be);
    } catch (e1) {
        try {
            return !!be[fieldName];
        } catch (e2) {
            return null;
        }
    }
}

function reflectSetBoolean(be, fieldName, value) {
    var cls = getApothJavaClass(be);
    if (cls == null) return false;
    try {
        var field = getDeclaredField(cls, fieldName);
        if (field != null) {
            field.setBoolean(be, !!value);
            return true;
        }
    } catch (e1) {}
    try {
        be[fieldName] = !!value;
        return true;
    } catch (e2) {
        return false;
    }
}

function syncSpawnerTile(be) {
    if (be == null) return;
    try {
        be.setChanged();
    } catch (e1) {}
    try {
        var level = be.getLevel();
        var pos = be.getBlockPos();
        if (level != null && pos != null) {
            var state = level.getBlockState(pos);
            level.sendBlockUpdated(pos, state, state, 3);
        }
    } catch (e2) {}
}

function isSpawnerBlockId(id) {
    return String(id || "") === "minecraft:spawner";
}

function nbtGetInt(tag, key, fallback) {
    try {
        if (tag.contains && tag.contains(key)) return Number(tag.getInt(key));
    } catch (e1) {}
    try {
        if (tag[key] !== undefined && tag[key] !== null) return Number(tag[key]);
    } catch (e2) {}
    return fallback;
}

function nbtGetBool(tag, key) {
    try {
        if (tag.contains && tag.contains(key)) return !!tag.getBoolean(key);
    } catch (e1) {}
    try {
        return !!tag[key];
    } catch (e2) {}
    return false;
}

function nbtPutInt(tag, key, value) {
    try {
        tag.putInt(key, value);
        return true;
    } catch (e1) {
        try {
            tag[key] = value;
            return true;
        } catch (e2) {
            return false;
        }
    }
}

function nbtPutBool(tag, key, value) {
    try {
        tag.putBoolean(key, value);
        return true;
    } catch (e1) {
        try {
            tag[key] = value;
            return true;
        } catch (e2) {
            return false;
        }
    }
}

function nbtRemove(tag, key) {
    try {
        if (tag.contains && tag.contains(key)) {
            tag.remove(key);
            return true;
        }
    } catch (e1) {}
    try {
        delete tag[key];
        return true;
    } catch (e2) {}
    return false;
}

/*
 * True if this spawner NBT is not plain vanilla (banned Apotheosis upgrades
 * or non-default numeric stats). SpawnData / redstone_control ignored.
 */
function nbtNeedsVanillaReset(tag) {
    if (tag == null) return false;

    for (var i = 0; i < APOTH_BOOL_KEYS_CLEAR.length; i++) {
        if (nbtGetBool(tag, APOTH_BOOL_KEYS_CLEAR[i])) return true;
    }

    if (nbtGetInt(tag, "MinSpawnDelay", VANILLA_MIN_DELAY) !== VANILLA_MIN_DELAY) {
        return true;
    }
    if (nbtGetInt(tag, "MaxSpawnDelay", VANILLA_MAX_DELAY) !== VANILLA_MAX_DELAY) {
        return true;
    }
    if (nbtGetInt(tag, "SpawnCount", VANILLA_SPAWN_COUNT) !== VANILLA_SPAWN_COUNT) {
        return true;
    }
    if (
        nbtGetInt(tag, "MaxNearbyEntities", VANILLA_MAX_NEARBY) !==
        VANILLA_MAX_NEARBY
    ) {
        return true;
    }
    if (
        nbtGetInt(tag, "RequiredPlayerRange", VANILLA_PLAYER_RANGE) !==
        VANILLA_PLAYER_RANGE
    ) {
        return true;
    }
    if (nbtGetInt(tag, "SpawnRange", VANILLA_SPAWN_RANGE) !== VANILLA_SPAWN_RANGE) {
        return true;
    }
    return false;
}

function readTileRedstoneControl(be) {
    if (be == null) return false;
    var reflected = reflectGetBoolean(be, "redstoneControl");
    if (reflected !== null) return reflected;
    try {
        if (be.redstoneControl === true) return true;
    } catch (e1) {}
    try {
        if (be.redstone_control === true) return true;
    } catch (e2) {}
    return false;
}

function writeTileRedstoneControl(be, value) {
    if (be == null) return false;
    if (reflectSetBoolean(be, "redstoneControl", value)) return true;
    try {
        be.redstoneControl = !!value;
        return true;
    } catch (e1) {
        try {
            be.redstone_control = !!value;
            return true;
        } catch (e2) {
            return false;
        }
    }
}

/* Resolve the live ApothSpawnerTile from a KubeJS block or Java BE. */
function resolveApothTile(blockOrBe) {
    if (blockOrBe == null) return null;
    var candidates = [];
    candidates.push(blockOrBe);
    try {
        if (blockOrBe.entity != null) candidates.push(blockOrBe.entity);
    } catch (e1) {}
    try {
        if (typeof blockOrBe.getEntity === "function") {
            candidates.push(blockOrBe.getEntity());
        }
    } catch (e2) {}
    try {
        if (blockOrBe.blockEntity != null) candidates.push(blockOrBe.blockEntity);
    } catch (e3) {}
    try {
        if (blockOrBe.level != null && blockOrBe.pos != null) {
            candidates.push(blockOrBe.level.getBlockEntity(blockOrBe.pos));
        }
    } catch (e4) {}
    try {
        if (
            typeof blockOrBe.getLevel === "function" &&
            typeof blockOrBe.getBlockPos === "function"
        ) {
            candidates.push(blockOrBe); /* already a BE */
        }
    } catch (e5) {}

    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (c == null) continue;
        if (getApothJavaClass(c) != null) return c;
    }
    return null;
}

/*
 * Direct comparator apply (does not depend on recipe manager).
 * Returns true if the redstone_control flag changed or was forced.
 */
function applyComparatorRedstone(block, enable) {
    var be = resolveApothTile(block);
    var before = readTileRedstoneControl(be);
    var ok = false;

    if (be != null) {
        ok = writeTileRedstoneControl(be, enable) || ok;
        syncSpawnerTile(be);
    }

    try {
        var tag = readBlockEntityNbt(block);
        if (tag != null) {
            nbtPutBool(tag, "redstone_control", !!enable);
            if (writeBlockEntityNbt(block, tag)) ok = true;
        }
    } catch (eNbt) {}

    /* Re-assert on live tile after NBT write (NBT load can clobber fields). */
    if (be != null) {
        writeTileRedstoneControl(be, enable);
        syncSpawnerTile(be);
        ok = true;
    }

    var after = readTileRedstoneControl(be);
    if (DEBUG_SPAWNER) {
        console.info(
            "[Apotheosis Spawner] comparator apply enable=" +
                enable +
                " before=" +
                before +
                " after=" +
                after +
                " ok=" +
                ok
        );
    }
    return ok || before !== after || (enable && after === true);
}

/*
 * Mutate tag in place to vanilla stats. Keeps SpawnData + redstone_control.
 * forceKeepRedstone: when true, always write redstone_control=true even if the
 * tag omitted it (KubeJS entityData can drop Apotheosis fields).
 */
function applyVanillaStatsToNbt(tag, forceKeepRedstone) {
    if (tag == null) return false;
    var changed = false;
    var keepRedstone =
        !!forceKeepRedstone || nbtGetBool(tag, "redstone_control");

    for (var i = 0; i < APOTH_BOOL_KEYS_CLEAR.length; i++) {
        var key = APOTH_BOOL_KEYS_CLEAR[i];
        if (nbtGetBool(tag, key)) {
            nbtPutBool(tag, key, false);
            changed = true;
        }
        /* Only remove when present so we do not mark unchanged tags dirty. */
        try {
            if (tag.contains && tag.contains(key)) {
                tag.remove(key);
                changed = true;
            }
        } catch (eRem) {
            if (nbtRemove(tag, key)) changed = true;
        }
    }

    /* Restore preserved redstone_control after cleanup. */
    if (keepRedstone) {
        if (!nbtGetBool(tag, "redstone_control")) changed = true;
        nbtPutBool(tag, "redstone_control", true);
    }

    if (nbtGetInt(tag, "MinSpawnDelay", VANILLA_MIN_DELAY) !== VANILLA_MIN_DELAY) {
        nbtPutInt(tag, "MinSpawnDelay", VANILLA_MIN_DELAY);
        changed = true;
    }
    if (nbtGetInt(tag, "MaxSpawnDelay", VANILLA_MAX_DELAY) !== VANILLA_MAX_DELAY) {
        nbtPutInt(tag, "MaxSpawnDelay", VANILLA_MAX_DELAY);
        changed = true;
    }
    if (nbtGetInt(tag, "SpawnCount", VANILLA_SPAWN_COUNT) !== VANILLA_SPAWN_COUNT) {
        nbtPutInt(tag, "SpawnCount", VANILLA_SPAWN_COUNT);
        changed = true;
    }
    if (
        nbtGetInt(tag, "MaxNearbyEntities", VANILLA_MAX_NEARBY) !==
        VANILLA_MAX_NEARBY
    ) {
        nbtPutInt(tag, "MaxNearbyEntities", VANILLA_MAX_NEARBY);
        changed = true;
    }
    if (
        nbtGetInt(tag, "RequiredPlayerRange", VANILLA_PLAYER_RANGE) !==
        VANILLA_PLAYER_RANGE
    ) {
        nbtPutInt(tag, "RequiredPlayerRange", VANILLA_PLAYER_RANGE);
        changed = true;
    }
    if (nbtGetInt(tag, "SpawnRange", VANILLA_SPAWN_RANGE) !== VANILLA_SPAWN_RANGE) {
        nbtPutInt(tag, "SpawnRange", VANILLA_SPAWN_RANGE);
        changed = true;
    }

    return changed;
}

function readLogicInt(logic, name) {
    if (logic == null || !name) return null;
    try {
        var v = logic[name];
        if (v != null && v !== undefined) {
            var n = Number(v);
            if (!isNaN(n)) return n;
        }
    } catch (e1) {}
    try {
        var f = getDeclaredField(logic.getClass(), name);
        if (f != null) {
            var fv = f.get(logic);
            if (fv != null) {
                var n2 = Number(fv);
                if (!isNaN(n2)) return n2;
            }
        }
    } catch (e2) {}
    return null;
}

function setLogicIntIfNonVanilla(logic, name, want) {
    var cur = readLogicInt(logic, name);
    if (cur == null) return false; /* unreadable - do not fake a change */
    if (cur === want) return false;
    try {
        logic[name] = want;
    } catch (eSet) {
        try {
            var f = getDeclaredField(logic.getClass(), name);
            if (f != null) f.setInt(logic, want);
            else return false;
        } catch (eSet2) {
            return false;
        }
    }
    var after = readLogicInt(logic, name);
    return after === want || after == null;
}

function vanillaizeApothTileFields(be) {
    be = resolveApothTile(be) || be;
    if (be == null || getApothJavaClass(be) == null) return false;

    var keepRedstone = readTileRedstoneControl(be);
    var changed = false;

    for (var i = 0; i < APOTH_BOOL_FIELDS_CLEAR.length; i++) {
        var fname = APOTH_BOOL_FIELDS_CLEAR[i];
        var cur = reflectGetBoolean(be, fname);
        if (cur === true) {
            if (reflectSetBoolean(be, fname, false)) changed = true;
        } else {
            try {
                if (be[fname] === true) {
                    be[fname] = false;
                    changed = true;
                }
            } catch (eProp) {}
        }
    }

    /* Never clear redstoneControl here; restore if somehow lost mid-edit. */
    if (keepRedstone) {
        writeTileRedstoneControl(be, true);
    }

    try {
        var logic = null;
        try {
            logic = be.spawner;
        } catch (eSp) {
            try {
                var sf = getDeclaredField(getApothJavaClass(be), "spawner");
                if (sf != null) logic = sf.get(be);
            } catch (eSf) {}
        }
        /* SpawnerBlockEntity uses private final BaseSpawner spawner in vanilla;
         * Apotheosis replaces it - also try getSpawner() if present. */
        try {
            if (logic == null && typeof be.getSpawner === "function") {
                logic = be.getSpawner();
            }
        } catch (eGs) {}

        if (logic != null) {
            /*
             * Only count a change when we can READ a real non-vanilla value.
             * Obfuscated BaseSpawner fields often yield undefined/NaN in KubeJS;
             * treating that as "needs reset" re-touches every scan and floods logs.
             */
            if (setLogicIntIfNonVanilla(logic, "minSpawnDelay", VANILLA_MIN_DELAY)) {
                changed = true;
            }
            if (setLogicIntIfNonVanilla(logic, "maxSpawnDelay", VANILLA_MAX_DELAY)) {
                changed = true;
            }
            if (setLogicIntIfNonVanilla(logic, "spawnCount", VANILLA_SPAWN_COUNT)) {
                changed = true;
            }
            if (
                setLogicIntIfNonVanilla(
                    logic,
                    "maxNearbyEntities",
                    VANILLA_MAX_NEARBY
                )
            ) {
                changed = true;
            }
            if (
                setLogicIntIfNonVanilla(
                    logic,
                    "requiredPlayerRange",
                    VANILLA_PLAYER_RANGE
                )
            ) {
                changed = true;
            }
            if (setLogicIntIfNonVanilla(logic, "spawnRange", VANILLA_SPAWN_RANGE)) {
                changed = true;
            }
        }
    } catch (eLogic) {}

    if (keepRedstone) {
        writeTileRedstoneControl(be, true);
    }

    if (changed) {
        syncSpawnerTile(be);
    }
    return changed;
}

function readBlockEntityNbt(block) {
    try {
        if (typeof block.getEntityData === "function") return block.getEntityData();
    } catch (e1) {}
    try {
        if (block.entityData != null) return block.entityData;
    } catch (e2) {}
    try {
        var be = block.entity;
        if (be != null && typeof be.serializeNBT === "function") {
            return be.serializeNBT();
        }
    } catch (e3) {}
    try {
        var be2 = block.getEntity();
        if (be2 != null && typeof be2.saveWithoutMetadata === "function") {
            return be2.saveWithoutMetadata();
        }
    } catch (e4) {}
    return null;
}

function writeBlockEntityNbt(block, tag) {
    try {
        if (typeof block.setEntityData === "function") {
            block.setEntityData(tag);
            return true;
        }
    } catch (e1) {}
    try {
        if (typeof block.mergeEntityData === "function") {
            block.mergeEntityData(tag);
            return true;
        }
    } catch (e2) {}
    try {
        var be = block.entity || (block.getEntity && block.getEntity());
        if (be != null && typeof be.load === "function") {
            be.load(tag);
            try {
                be.setChanged();
            } catch (e3) {}
            return true;
        }
    } catch (e4) {}
    return false;
}

function vanillaizeSpawnerBlock(block) {
    if (block == null) return false;
    try {
        if (!isSpawnerBlockId(block.id)) return false;
    } catch (eId) {
        return false;
    }

    var changed = false;
    var be = null;
    var keepRedstone = false;
    var usedReflection = false;

    /* Fast path: live Apotheosis tile fields via reflection. */
    try {
        be = resolveApothTile(block);
        if (be == null) {
            be = block.entity;
            if (be == null && typeof block.getEntity === "function") {
                be = block.getEntity();
            }
        }
        keepRedstone = readTileRedstoneControl(be);
        if (getApothJavaClass(be) != null) {
            if (vanillaizeApothTileFields(be)) changed = true;
            usedReflection = true;
            keepRedstone = keepRedstone || readTileRedstoneControl(be);
        }
    } catch (eTile) {}

    /*
     * NBT path only when we could not touch the live Apoth tile.
     * Writing incomplete KubeJS entityData is what previously wiped
     * redstone_control after a successful comparator apply.
     */
    if (!usedReflection) {
        try {
            var tag = readBlockEntityNbt(block);
            keepRedstone = keepRedstone || nbtGetBool(tag, "redstone_control");
            if (tag != null && nbtNeedsVanillaReset(tag)) {
                if (applyVanillaStatsToNbt(tag, keepRedstone)) {
                    if (writeBlockEntityNbt(block, tag)) changed = true;
                }
            }
        } catch (eNbt) {}
    }

    /* Always re-assert redstone on the live tile after any edit. */
    if (keepRedstone) {
        writeTileRedstoneControl(be, true);
        syncSpawnerTile(be);
    }

    if (changed && DEBUG_SPAWNER) {
        try {
            console.info(
                "[Apotheosis Spawner] Vanillaized spawner at " +
                    block.x +
                    "," +
                    block.y +
                    "," +
                    block.z +
                    (keepRedstone ? " (redstone kept)" : "")
            );
        } catch (eLog) {}
    }
    return changed;
}

function vanillaizeSpawnerBlockEntity(be) {
    if (be == null) return false;
    var tile = resolveApothTile(be) || be;
    var changed = false;
    var keepRedstone = readTileRedstoneControl(tile);
    var usedReflection = false;

    try {
        if (getApothJavaClass(tile) != null) {
            if (vanillaizeApothTileFields(tile)) changed = true;
            usedReflection = true;
            keepRedstone = keepRedstone || readTileRedstoneControl(tile);
        }
    } catch (e1) {}

    /* NBT round-trip only when reflection path unavailable. */
    if (!usedReflection) {
        try {
            var tag = null;
            try {
                if (typeof tile.saveWithoutMetadata === "function") {
                    tag = tile.saveWithoutMetadata();
                }
            } catch (eSave) {}
            try {
                if (tag == null && typeof tile.serializeNBT === "function") {
                    tag = tile.serializeNBT();
                }
            } catch (eSer) {}

            keepRedstone = keepRedstone || nbtGetBool(tag, "redstone_control");

            if (tag != null && nbtNeedsVanillaReset(tag)) {
                if (applyVanillaStatsToNbt(tag, keepRedstone)) {
                    try {
                        tile.load(tag);
                        changed = true;
                    } catch (eLoad) {
                        try {
                            tile.deserializeNBT(tag);
                            changed = true;
                        } catch (eLoad2) {}
                    }
                    try {
                        tile.setChanged();
                    } catch (eCh) {}
                }
            }
        } catch (eNbt) {}
    }

    if (keepRedstone) {
        writeTileRedstoneControl(tile, true);
        syncSpawnerTile(tile);
    }
    return changed;
}

function vanillaizeSpawnersInChunk(level, chunkX, chunkZ) {
    if (level == null) return 0;
    var count = 0;
    try {
        var chunk = null;
        try {
            chunk = level.getChunk(chunkX, chunkZ);
        } catch (e1) {
            try {
                chunk = level.minecraftLevel.getChunk(chunkX, chunkZ);
            } catch (e2) {}
        }
        if (chunk == null) return 0;

        var map = null;
        try {
            map = chunk.getBlockEntities();
        } catch (eMap) {
            try {
                map = chunk.blockEntities;
            } catch (eMap2) {}
        }
        if (map == null) return 0;

        var entries = null;
        try {
            entries = map.entrySet();
        } catch (eEnt) {
            try {
                entries = map.values();
            } catch (eVal) {}
        }
        if (entries == null) return 0;

        var it = entries.iterator();
        while (it.hasNext()) {
            var next = it.next();
            var be = null;
            var pos = null;
            try {
                be = next.getValue();
                pos = next.getKey();
            } catch (eEntry) {
                be = next;
                try {
                    pos = be.getBlockPos();
                } catch (ePos) {}
            }
            if (be == null) continue;

            var did = false;
            try {
                if (pos != null && typeof level.getBlock === "function") {
                    var block = level.getBlock(pos.x, pos.y, pos.z);
                    if (vanillaizeSpawnerBlock(block)) did = true;
                }
            } catch (eBlock) {}
            if (!did) {
                try {
                    if (vanillaizeSpawnerBlockEntity(be)) did = true;
                } catch (eTile) {}
            }
            if (did) count++;
        }
    } catch (err) {
        if (DEBUG_SPAWNER) {
            console.error("[Apotheosis Spawner] chunk scan error: " + err);
        }
    }
    return count;
}

function vanillaizeNearPlayer(player) {
    if (player == null) return 0;
    var level = null;
    try {
        level = player.level;
    } catch (e1) {
        try {
            level = player.getLevel();
        } catch (e2) {
            return 0;
        }
    }
    if (level == null) return 0;

    var cx = Math.floor(player.x / 16);
    var cz = Math.floor(player.z / 16);
    var total = 0;
    for (var dx = -PLAYER_SCAN_CHUNK_RADIUS; dx <= PLAYER_SCAN_CHUNK_RADIUS; dx++) {
        for (var dz = -PLAYER_SCAN_CHUNK_RADIUS; dz <= PLAYER_SCAN_CHUNK_RADIUS; dz++) {
            total += vanillaizeSpawnersInChunk(level, cx + dx, cz + dz);
        }
    }
    return total;
}

/* -------- Spawner ITEM stacks (silk-touched upgraded spawners) -------- */

function isSpawnerStack(stack) {
    if (stack == null) return false;
    try {
        if (stack.isEmpty()) return false;
    } catch (e) {
        return false;
    }
    try {
        if (stack.is && stack.is("minecraft:spawner")) return true;
    } catch (eIs) {}
    try {
        return String(stack.id) === "minecraft:spawner";
    } catch (eId) {
        return false;
    }
}

function getStackTag(stack) {
    try {
        if (stack.nbt != null) return stack.nbt;
    } catch (e1) {}
    try {
        if (typeof stack.getOrCreateTag === "function") return stack.getOrCreateTag();
    } catch (e2) {}
    return null;
}

function stripSpawnerItemNbt(stack) {
    if (!isSpawnerStack(stack)) return false;
    var tag = getStackTag(stack);
    if (tag == null) return false;

    /* BlockEntityTag is used when placing the spawner. */
    var bet = null;
    try {
        if (tag.contains && tag.contains("BlockEntityTag")) {
            bet = tag.getCompound("BlockEntityTag");
        }
    } catch (e1) {}
    try {
        if (bet == null && tag.BlockEntityTag != null) bet = tag.BlockEntityTag;
    } catch (e2) {}

    var changed = false;
    if (bet != null && nbtNeedsVanillaReset(bet)) {
        var keepItemRedstone = nbtGetBool(bet, "redstone_control");
        changed = applyVanillaStatsToNbt(bet, keepItemRedstone) || changed;
        try {
            tag.put("BlockEntityTag", bet);
        } catch (ePut) {
            try {
                tag.BlockEntityTag = bet;
            } catch (ePut2) {}
        }
    }

    /* Some stacks store stats on the root tag too. */
    if (nbtNeedsVanillaReset(tag)) {
        var keepRootRedstone = nbtGetBool(tag, "redstone_control");
        changed = applyVanillaStatsToNbt(tag, keepRootRedstone) || changed;
    }
    return changed;
}

function recipeIdString(recipe) {
    try {
        return String(recipe.getId());
    } catch (e1) {
        try {
            return String(recipe.id);
        } catch (e2) {
            return "";
        }
    }
}

/*
 * Keep Apotheosis comparator recipes:
 *   apotheosis:spawner/redstone_control
 *   apotheosis:spawner/redstone_control_inverted
 * ID match is authoritative; stat_changes parse is a secondary check.
 */
function isRedstoneControlModifierRecipe(recipe) {
    var rid = recipeIdString(recipe).toLowerCase();
    if (rid.indexOf("redstone_control") >= 0) return true;

    try {
        var json = recipe.json;
        var changes = null;
        try {
            changes = json.get("stat_changes");
        } catch (e1) {
            try {
                changes = json.stat_changes;
            } catch (e2) {}
        }
        if (changes == null) return false;

        var size = 0;
        try {
            size = changes.size();
        } catch (eSize) {
            try {
                size = changes.length;
            } catch (eLen) {
                size = 0;
            }
        }
        if (size <= 0) return false;

        for (var i = 0; i < size; i++) {
            var entry = null;
            try {
                entry = changes.get(i);
            } catch (eGet) {
                entry = changes[i];
            }
            var text = String(entry);
            try {
                if (entry != null && entry.get) {
                    var id = entry.get("id");
                    if (id != null) text = String(id);
                }
            } catch (eId) {}
            try {
                if (entry != null && entry.id != null) text = String(entry.id);
            } catch (eId2) {}
            if (String(text).toLowerCase().indexOf("redstone_control") < 0) {
                return false;
            }
        }
        return true;
    } catch (eParse) {
        return false;
    }
}

function containerSize(container) {
    try {
        if (typeof container.getContainerSize === "function") {
            return Number(container.getContainerSize());
        }
    } catch (e1) {}
    try {
        if (container.size != null) return Number(container.size);
    } catch (e2) {}
    return 41;
}

function readSlot(container, slot) {
    try {
        if (typeof container.getItem === "function") return container.getItem(slot);
    } catch (e1) {}
    try {
        if (typeof container.getStackInSlot === "function") {
            return container.getStackInSlot(slot);
        }
    } catch (e2) {}
    return null;
}

function writeSlot(container, slot, stack) {
    try {
        if (typeof container.setItem === "function") {
            container.setItem(slot, stack);
            return true;
        }
    } catch (e1) {}
    try {
        if (typeof container.setStackInSlot === "function") {
            container.setStackInSlot(slot, stack);
            return true;
        }
    } catch (e2) {}
    return false;
}

function purgeSpawnerItems(player) {
    if (player == null) return 0;
    var changed = 0;
    var containers = [];
    try {
        containers.push(player.getInventory());
    } catch (e1) {
        try {
            containers.push(player.inventory);
        } catch (e2) {}
    }
    try {
        containers.push(player.getEnderChestInventory());
    } catch (e3) {
        try {
            containers.push(player.enderChestInventory);
        } catch (e4) {}
    }

    for (var c = 0; c < containers.length; c++) {
        var container = containers[c];
        if (container == null) continue;
        var size = containerSize(container);
        for (var slot = 0; slot < size; slot++) {
            var stack = readSlot(container, slot);
            if (stripSpawnerItemNbt(stack)) {
                writeSlot(container, slot, stack);
                changed++;
            }
        }
    }
    return changed;
}

/* ========================= EVENTS ========================= */

ServerEvents.recipes(function (event) {
    var removed = 0;

    /* Remove every Apotheosis spawner modifier, then re-add redstone only. */
    try {
        event.remove({ type: "apotheosis:spawner_modifier" });
        removed = -1; /* unknown count when using type remove */
    } catch (eTypeRem) {
        event.forEachRecipe({ type: "apotheosis:spawner_modifier" }, function (recipe) {
            var rid = recipeIdString(recipe);
            try {
                event.remove({ id: rid });
                removed++;
            } catch (eRem) {
                try {
                    recipe.remove();
                    removed++;
                } catch (eRem2) {}
            }
        });
    }

    var added = 0;
    try {
        event
            .custom({
                type: "apotheosis:spawner_modifier",
                conditions: [
                    { type: "apotheosis:module", module: "spawner" }
                ],
                mainhand: { item: "minecraft:comparator" },
                stat_changes: [{ id: "redstone_control", value: true }]
            })
            .id("kubejs:apoth_spawner_redstone_control");
        added++;
        console.info(
            "[Apotheosis Spawner] Re-added recipe kubejs:apoth_spawner_redstone_control"
        );
    } catch (eAdd1) {
        console.error(
            "[Apotheosis Spawner] Failed to re-add redstone_control recipe: " +
                eAdd1
        );
    }

    try {
        event
            .custom({
                type: "apotheosis:spawner_modifier",
                conditions: [
                    { type: "apotheosis:module", module: "spawner" }
                ],
                mainhand: { item: "minecraft:comparator" },
                offhand: { item: "minecraft:quartz" },
                consumes_offhand: false,
                stat_changes: [{ id: "redstone_control", value: false }]
            })
            .id("kubejs:apoth_spawner_redstone_control_inverted");
        added++;
        console.info(
            "[Apotheosis Spawner] Re-added recipe kubejs:apoth_spawner_redstone_control_inverted"
        );
    } catch (eAdd2) {
        console.error(
            "[Apotheosis Spawner] Failed to re-add redstone_control_inverted: " +
                eAdd2
        );
    }

    console.info(
        "[DBZ Legacy Reborn] Apotheosis spawner modifiers: cleared type, re-added " +
            added +
            " redstone_control recipe(s). Comparator right-click handler is also registered."
    );
});

/*
 * Bulletproof redstone control: right-click spawner with comparator.
 * Does not depend on Apotheosis recipe matching.
 */
BlockEvents.rightClicked("minecraft:spawner", function (event) {
    try {
        if (event.hand != null && String(event.hand) !== "MAIN_HAND") {
            /* Allow OFF_HAND only when that hand holds the comparator. */
        }

        var player = event.player;
        if (player == null) return;

        var main = null;
        var off = null;
        try {
            main = player.getMainHandItem();
        } catch (eM) {
            try {
                main = player.mainHandItem;
            } catch (eM2) {}
        }
        try {
            off = player.getOffhandItem();
        } catch (eO) {
            try {
                off = player.offHandItem;
            } catch (eO2) {
                try {
                    off = player.getOffHandItem();
                } catch (eO3) {}
            }
        }

        function stackId(stack) {
            if (stack == null) return "";
            try {
                if (stack.isEmpty && stack.isEmpty()) return "";
            } catch (eE) {}
            try {
                return String(stack.id);
            } catch (eI) {
                try {
                    return String(stack.getItem());
                } catch (eI2) {
                    return "";
                }
            }
        }

        var hand = null;
        try {
            hand = String(event.hand);
        } catch (eH) {
            hand = "MAIN_HAND";
        }

        var used = null;
        if (hand.indexOf("OFF") >= 0) {
            used = off;
        } else {
            used = main;
        }

        if (stackId(used) !== "minecraft:comparator") return;

        var enable = true;
        var other = hand.indexOf("OFF") >= 0 ? main : off;
        if (stackId(other) === "minecraft:quartz") {
            enable = false;
        }

        var be = resolveApothTile(event.block);
        var before = readTileRedstoneControl(be);
        if (before === enable) {
            try {
                player.tell(
                    enable
                        ? "\u00A77This spawner already has redstone control. Power it to spawn."
                        : "\u00A77This spawner already has no redstone control."
                );
            } catch (eTell0) {}
            try {
                event.cancel();
            } catch (eCancel0) {}
            return;
        }

        var ok = applyComparatorRedstone(event.block, enable);
        if (!ok && readTileRedstoneControl(resolveApothTile(event.block)) !== enable) {
            if (DEBUG_SPAWNER) {
                console.info(
                    "[Apotheosis Spawner] Comparator right-click failed to set redstone_control"
                );
            }
            return;
        }

        try {
            if (!player.isCreative()) {
                used.count = Number(used.count) - 1;
            }
        } catch (eCount) {
            try {
                used.shrink(1);
            } catch (eSh) {}
        }

        try {
            player.tell(
                enable
                    ? "\u00A7aSpawner redstone control enabled. Power it to spawn."
                    : "\u00A77Spawner redstone control removed."
            );
        } catch (eTell) {}

        try {
            event.cancel();
        } catch (eCancel) {}
        try {
            event.success();
        } catch (eSuc) {}

        if (DEBUG_SPAWNER) {
            console.info(
                "[Apotheosis Spawner] Comparator set redstone_control=" +
                    enable +
                    " for " +
                    player.username
            );
        }
    } catch (err) {
        console.error("[Apotheosis Spawner] rightClicked error: " + err);
    }
});

/*
 * Chunk load is queued by startup_scripts/apotheosis_spawner_chunk_hook.js
 * (ForgeEvents only works from startup on this KubeJS build).
 * Server tick drains that queue; player nearby scan is the fallback.
 */
function drainQueuedChunks(server) {
    if (server == null) return 0;
    try {
        if (typeof global === "undefined" || global.apothSpawnerChunkQueue == null) {
            return 0;
        }
    } catch (eG) {
        return 0;
    }

    var queue = global.apothSpawnerChunkQueue;
    if (queue.length <= 0) return 0;

    var processed = 0;
    var converted = 0;
    var maxPerTick = 8;

    while (queue.length > 0 && processed < maxPerTick) {
        var item = queue.shift();
        processed++;
        if (item == null) continue;

        var level = null;
        try {
            var levels = server.getAllLevels();
            var it = levels.iterator();
            while (it.hasNext()) {
                var lvl = it.next();
                var dim = "";
                try {
                    dim = String(lvl.dimension);
                } catch (e1) {
                    try {
                        dim = String(lvl.dimension.toString());
                    } catch (e2) {
                        try {
                            dim = String(lvl.registryKey().location());
                        } catch (e3) {}
                    }
                }
                if (dim === String(item.dim) || dim.indexOf(String(item.dim)) >= 0) {
                    level = lvl;
                    break;
                }
                /* Overworld default match helpers */
                if (
                    String(item.dim).indexOf("overworld") >= 0 &&
                    dim.indexOf("overworld") >= 0
                ) {
                    level = lvl;
                    break;
                }
            }
        } catch (eLevels) {
            try {
                level = server.overworld();
            } catch (eOw) {}
        }

        /* Prefer KubeJS wrapped level when available. */
        try {
            if (level != null && server.getLevel) {
                /* keep Java level; vanillaizeSpawnersInChunk uses getChunk/getBlock */
            }
        } catch (eWrap) {}

        if (level == null) continue;
        var n = vanillaizeSpawnersInChunk(level, item.x, item.z);
        if (n > 0) {
            converted += n;
            if (DEBUG_SPAWNER) {
                console.info(
                    "[Apotheosis Spawner] Vanillaized " +
                        n +
                        " spawner(s) in chunk " +
                        item.x +
                        "," +
                        item.z +
                        " (" +
                        item.dim +
                        ")"
                );
            }
        }
    }
    return converted;
}

/* Remove obsolete server-side ForgeEvents attempts (startup owns chunk load). */

/* When an upgraded spawner is placed, immediately vanillaize it. */
BlockEvents.placed("minecraft:spawner", function (event) {
    try {
        vanillaizeSpawnerBlock(event.block);
    } catch (err) {}
});

PlayerEvents.loggedIn(function (event) {
    try {
        getApothSpawnerTileClass();
        var n = vanillaizeNearPlayer(event.player);
        purgeSpawnerItems(event.player);
        /* No player.tell - silent background reset. */
        if (n > 0 && DEBUG_SPAWNER) {
            console.info(
                "[Apotheosis Spawner] Login scan vanillaized " +
                    n +
                    " spawner(s) for " +
                    event.player.username
            );
        }
    } catch (err) {
        console.error("[Apotheosis Spawner] loggedIn error: " + err);
    }
});

PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        if (player.age % PLAYER_SCAN_INTERVAL !== 0) return;
        var n = vanillaizeNearPlayer(player);
        purgeSpawnerItems(player);
        /* No player.tell - nearby scan must stay silent (was spamming chat). */
        if (n > 0 && DEBUG_SPAWNER) {
            console.info(
                "[Apotheosis Spawner] Nearby scan vanillaized " +
                    n +
                    " spawner(s) near " +
                    player.username
            );
        }
    } catch (err) {}
});

ServerEvents.tick(function (event) {
    try {
        if (event.server.tickCount % 20 !== 0) return;
        drainQueuedChunks(event.server);
    } catch (err) {}
});

EntityEvents.spawned("minecraft:item", function (event) {
    try {
        var stack = event.entity.item;
        stripSpawnerItemNbt(stack);
    } catch (err) {}
});

console.info(
    "[DBZ Legacy Reborn] Apotheosis spawner upgrades disabled; redstone control via comparator right-click + recipe; world spawners vanillaized via chunk queue + nearby scan."
);

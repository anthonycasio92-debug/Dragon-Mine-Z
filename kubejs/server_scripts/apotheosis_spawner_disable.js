/*
 * DBZ Legacy Reborn - Disable Apotheosis Spawner Upgrades
 *
 * 1) Removes every apotheosis:spawner_modifier recipe so players cannot
 *    upgrade spawners (spawn count, delays, ignore light, no AI, etc.).
 * 2) Converts EXISTING world spawners back to vanilla stats while keeping
 *    the spawned mob type (SpawnData).
 * 3) Strips upgrade NBT from spawner items in inventories / on the ground
 *    so silk-touched upgraded spawners place as vanilla again.
 *
 * Still allowed:
 * - Changing spawner mob type with spawn eggs
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

var APOTH_BOOL_KEYS = [
    "ignore_players",
    "ignore_conditions",
    "redstone_control",
    "ignore_light",
    "no_ai",
    "silent",
    "baby"
];

var PLAYER_SCAN_INTERVAL = 100; /* 5s */
var PLAYER_SCAN_CHUNK_RADIUS = 2; /* chunks around player */
var DEBUG_SPAWNER = false;

var ApothSpawnerTileClass = null;
var ApothTried = false;

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
 * True if this spawner NBT is not plain vanilla (Apotheosis upgrades or
 * non-default numeric stats). SpawnData / mob type is ignored.
 */
function nbtNeedsVanillaReset(tag) {
    if (tag == null) return false;

    for (var i = 0; i < APOTH_BOOL_KEYS.length; i++) {
        if (nbtGetBool(tag, APOTH_BOOL_KEYS[i])) return true;
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

/* Mutate tag in place to vanilla stats. Keeps SpawnData / SpawnPotentials. */
function applyVanillaStatsToNbt(tag) {
    if (tag == null) return false;
    var changed = false;

    for (var i = 0; i < APOTH_BOOL_KEYS.length; i++) {
        var key = APOTH_BOOL_KEYS[i];
        if (nbtGetBool(tag, key)) {
            nbtPutBool(tag, key, false);
            changed = true;
        }
        /* Also drop the keys so future reads are clean. */
        if (nbtRemove(tag, key)) changed = true;
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

function vanillaizeApothTileFields(be) {
    var cls = getApothSpawnerTileClass();
    if (cls == null || be == null) return false;
    try {
        if (!(be instanceof cls)) return false;
    } catch (eInst) {
        return false;
    }

    var changed = false;
    try {
        if (be.ignoresPlayers === true) {
            be.ignoresPlayers = false;
            changed = true;
        }
        if (be.ignoresConditions === true) {
            be.ignoresConditions = false;
            changed = true;
        }
        if (be.redstoneControl === true) {
            be.redstoneControl = false;
            changed = true;
        }
        if (be.ignoresLight === true) {
            be.ignoresLight = false;
            changed = true;
        }
        if (be.hasNoAI === true) {
            be.hasNoAI = false;
            changed = true;
        }
        if (be.silent === true) {
            be.silent = false;
            changed = true;
        }
        if (be.baby === true) {
            be.baby = false;
            changed = true;
        }
    } catch (eBool) {}

    try {
        var logic = be.spawner;
        if (logic != null) {
            if (Number(logic.minSpawnDelay) !== VANILLA_MIN_DELAY) {
                logic.minSpawnDelay = VANILLA_MIN_DELAY;
                changed = true;
            }
            if (Number(logic.maxSpawnDelay) !== VANILLA_MAX_DELAY) {
                logic.maxSpawnDelay = VANILLA_MAX_DELAY;
                changed = true;
            }
            if (Number(logic.spawnCount) !== VANILLA_SPAWN_COUNT) {
                logic.spawnCount = VANILLA_SPAWN_COUNT;
                changed = true;
            }
            if (Number(logic.maxNearbyEntities) !== VANILLA_MAX_NEARBY) {
                logic.maxNearbyEntities = VANILLA_MAX_NEARBY;
                changed = true;
            }
            if (Number(logic.requiredPlayerRange) !== VANILLA_PLAYER_RANGE) {
                logic.requiredPlayerRange = VANILLA_PLAYER_RANGE;
                changed = true;
            }
            if (Number(logic.spawnRange) !== VANILLA_SPAWN_RANGE) {
                logic.spawnRange = VANILLA_SPAWN_RANGE;
                changed = true;
            }
        }
    } catch (eLogic) {}

    if (changed) {
        try {
            be.setChanged();
        } catch (eSave) {}
        try {
            var level = be.getLevel();
            var pos = be.getBlockPos();
            if (level != null && pos != null) {
                var state = level.getBlockState(pos);
                level.sendBlockUpdated(pos, state, state, 3);
            }
        } catch (eSync) {}
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

    /* Fast path: live Apotheosis tile fields. */
    try {
        var be = block.entity;
        if (be == null && typeof block.getEntity === "function") be = block.getEntity();
        if (vanillaizeApothTileFields(be)) changed = true;
    } catch (eTile) {}

    /* NBT path: works even if field names are remapped oddly. */
    try {
        var tag = readBlockEntityNbt(block);
        if (tag != null && nbtNeedsVanillaReset(tag)) {
            if (applyVanillaStatsToNbt(tag)) {
                if (writeBlockEntityNbt(block, tag)) changed = true;
            }
        }
    } catch (eNbt) {}

    if (changed && DEBUG_SPAWNER) {
        try {
            console.info(
                "[Apotheosis Spawner] Vanillaized spawner at " +
                    block.x +
                    "," +
                    block.y +
                    "," +
                    block.z
            );
        } catch (eLog) {}
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
                chunk = level.getChunkAt(
                    chunkX * 16,
                    64,
                    chunkZ * 16
                );
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

        if (map != null) {
            var values = null;
            try {
                values = map.values();
            } catch (eVal) {}
            if (values != null) {
                var it = values.iterator();
                while (it.hasNext()) {
                    var be = it.next();
                    try {
                        var pos = be.getBlockPos();
                        var block = level.getBlock(pos.x, pos.y, pos.z);
                        if (vanillaizeSpawnerBlock(block)) count++;
                    } catch (eOne) {
                        /* Fallback: vanillaize via tile fields directly. */
                        try {
                            if (vanillaizeApothTileFields(be)) count++;
                        } catch (eTwo) {}
                    }
                }
                return count;
            }
        }
    } catch (err) {}

    /* Slow fallback: scan chunk volume for spawner blocks. */
    try {
        var minY = -64;
        var maxY = 320;
        try {
            minY = level.minBuildHeight;
            maxY = level.maxBuildHeight;
        } catch (eY) {}
        var x0 = chunkX * 16;
        var z0 = chunkZ * 16;
        for (var x = x0; x < x0 + 16; x++) {
            for (var z = z0; z < z0 + 16; z++) {
                for (var y = minY; y < maxY; y += 1) {
                    try {
                        var b = level.getBlock(x, y, z);
                        if (isSpawnerBlockId(b.id) && vanillaizeSpawnerBlock(b)) {
                            count++;
                        }
                    } catch (eB) {}
                }
            }
        }
    } catch (eScan) {}
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
        changed = applyVanillaStatsToNbt(bet) || changed;
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
        changed = applyVanillaStatsToNbt(tag) || changed;
    }
    return changed;
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
    event.remove({ type: "apotheosis:spawner_modifier" });
    console.info(
        "[DBZ Legacy Reborn] Apotheosis spawner upgrade recipes removed."
    );
});

/* Convert spawners in a chunk as soon as it loads (covers existing world). */
try {
    LevelEvents.loadedChunk(function (event) {
        try {
            var level = event.level;
            var chunk = event.chunk;
            var cx = 0;
            var cz = 0;
            try {
                cx = chunk.x;
                cz = chunk.z;
            } catch (ePos) {
                try {
                    var pos = chunk.getPos();
                    cx = pos.x;
                    cz = pos.z;
                } catch (ePos2) {
                    return;
                }
            }
            var n = vanillaizeSpawnersInChunk(level, cx, cz);
            if (n > 0) {
                console.info(
                    "[Apotheosis Spawner] Vanillaized " +
                        n +
                        " spawner(s) in chunk " +
                        cx +
                        "," +
                        cz
                );
            }
        } catch (err) {
            if (DEBUG_SPAWNER) {
                console.error("[Apotheosis Spawner] loadedChunk error: " + err);
            }
        }
    });
    console.info("[Apotheosis Spawner] LevelEvents.loadedChunk handler registered.");
} catch (eChunkEvt) {
    console.info(
        "[Apotheosis Spawner] loadedChunk event unavailable; using player scan only."
    );
}

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
        if (n > 0) {
            try {
                event.player.tell(
                    "\u00A77Reset " +
                        n +
                        " nearby spawner(s) to vanilla stats (mob type kept)."
                );
            } catch (eTell) {}
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
        vanillaizeNearPlayer(player);
        purgeSpawnerItems(player);
    } catch (err) {}
});

EntityEvents.spawned("minecraft:item", function (event) {
    try {
        var stack = event.entity.item;
        stripSpawnerItemNbt(stack);
    } catch (err) {}
});

console.info(
    "[DBZ Legacy Reborn] Apotheosis spawner upgrades disabled; world spawners vanillaized on chunk load / nearby scan."
);

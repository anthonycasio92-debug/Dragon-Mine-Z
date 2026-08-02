/*
 * DBZ Legacy Reborn - Disable Apotheosis Spawner Upgrades
 *
 * Pure ASCII file so KubeJS UTF-8 reader never hits MalformedInputException.
 *
 * 1) Removes apotheosis:spawner_modifier recipes EXCEPT redstone control
 *    (comparator) so spawners can still be toggled with redstone.
 * 2) Converts EXISTING world spawners back to vanilla stats while keeping
 *    the spawned mob type (SpawnData) AND redstone_control if enabled.
 * 3) Strips other upgrade NBT from spawner items in inventories / ground.
 *
 * Still allowed:
 * - Changing spawner mob type with spawn eggs
 * - Redstone control (Apotheosis comparator modifier)
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
var APOTH_BOOL_PRESERVE = ["redstone_control"];

var PLAYER_SCAN_INTERVAL = 100; /* 5s */
var PLAYER_SCAN_CHUNK_RADIUS = 3; /* chunks around player */
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
        /* Keep be.redstoneControl as-is so redstone toggling still works. */
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
    var be = null;
    var keepRedstone = false;

    /* Fast path: live Apotheosis tile fields. */
    try {
        be = block.entity;
        if (be == null && typeof block.getEntity === "function") be = block.getEntity();
        keepRedstone = readTileRedstoneControl(be);
        if (vanillaizeApothTileFields(be)) changed = true;
        /* Re-read after field clears; never lose an already-enabled flag. */
        keepRedstone = keepRedstone || readTileRedstoneControl(be);
    } catch (eTile) {}

    /* NBT path: works even if field names are remapped oddly. */
    try {
        var tag = readBlockEntityNbt(block);
        keepRedstone = keepRedstone || nbtGetBool(tag, "redstone_control");
        if (tag != null && nbtNeedsVanillaReset(tag)) {
            if (applyVanillaStatsToNbt(tag, keepRedstone)) {
                if (writeBlockEntityNbt(block, tag)) changed = true;
            }
        }
    } catch (eNbt) {}

    /* Always re-assert redstone on the live tile after any NBT write. */
    if (keepRedstone) {
        writeTileRedstoneControl(be, true);
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
    var changed = false;
    var keepRedstone = readTileRedstoneControl(be);
    try {
        if (vanillaizeApothTileFields(be)) changed = true;
        keepRedstone = keepRedstone || readTileRedstoneControl(be);
    } catch (e1) {}

    /* NBT round-trip for Java levels without KubeJS block wrappers. */
    try {
        var tag = null;
        try {
            if (typeof be.saveWithoutMetadata === "function") {
                tag = be.saveWithoutMetadata();
            }
        } catch (eSave) {}
        try {
            if (tag == null && typeof be.serializeNBT === "function") {
                tag = be.serializeNBT();
            }
        } catch (eSer) {}

        keepRedstone = keepRedstone || nbtGetBool(tag, "redstone_control");

        if (tag != null && nbtNeedsVanillaReset(tag)) {
            if (applyVanillaStatsToNbt(tag, keepRedstone)) {
                try {
                    be.load(tag);
                    changed = true;
                } catch (eLoad) {
                    try {
                        be.deserializeNBT(tag);
                        changed = true;
                    } catch (eLoad2) {}
                }
                try {
                    be.setChanged();
                } catch (eCh) {}
            }
        }
    } catch (eNbt) {}

    if (keepRedstone) {
        writeTileRedstoneControl(be, true);
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
    var kept = 0;
    var keptIds = [];

    /*
     * Keep only redstone_control (+ inverted) comparator modifiers.
     * Everything else (ignore light, no AI, delays, spawn count, etc.) goes.
     */
    event.forEachRecipe({ type: "apotheosis:spawner_modifier" }, function (recipe) {
        var rid = recipeIdString(recipe);
        var keep = false;
        try {
            keep = isRedstoneControlModifierRecipe(recipe);
        } catch (eParse) {
            keep = rid.toLowerCase().indexOf("redstone_control") >= 0;
        }

        if (keep) {
            kept++;
            keptIds.push(rid);
            console.info(
                "[Apotheosis Spawner] Keeping redstone modifier: " + rid
            );
        } else {
            try {
                event.remove({ id: rid });
                removed++;
            } catch (eRem) {
                try {
                    recipe.remove();
                    removed++;
                } catch (eRem2) {}
            }
        }
    });

    console.info(
        "[DBZ Legacy Reborn] Apotheosis spawner modifiers: removed " +
            removed +
            ", kept " +
            kept +
            " redstone_control" +
            (keptIds.length > 0 ? " [" + keptIds.join(", ") + "]" : " (NONE - comparator upgrade broken)") +
            "."
    );
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
        if (n > 0) {
            try {
                event.player.tell(
                    "\u00A77Reset " +
                        n +
                        " nearby spawner(s) to vanilla stats (mob type kept)."
                );
            } catch (eTell) {}
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
        if (n > 0) {
            console.info(
                "[Apotheosis Spawner] Nearby scan vanillaized " +
                    n +
                    " spawner(s) near " +
                    player.username
            );
            try {
                player.tell(
                    "\u00A77Reset " +
                        n +
                        " nearby spawner(s) to vanilla stats (redstone control kept)."
                );
            } catch (eTell) {}
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
    "[DBZ Legacy Reborn] Apotheosis spawner upgrades disabled (redstone control kept); world spawners vanillaized via startup chunk queue + nearby scan."
);

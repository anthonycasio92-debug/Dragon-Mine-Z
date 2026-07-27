/*
 * DBZ Legacy Reborn - Capsule Disable
 *
 * Disables blueprint + overpowered Capsule items and recipes.
 * Replaces the old pair of scripts that both scanned every player
 * every second and ran global clear/kill commands.
 *
 * Performance:
 * - Recipe removals run once at recipe load
 * - Ground items are discarded on spawn (no command spam)
 * - Inventories are checked on login and every 5s (not every second)
 * - No minecraft:clear @a loops
 */

const CapsuleItem = Java.loadClass("capsule.items.CapsuleItem");

const PLAYER_PURGE_INTERVAL = 100; // 5 seconds
const GROUND_BACKUP_INTERVAL = 200; // 10 seconds

let groundBackupTicks = 0;

function isBannedCapsule(stack) {
    if (stack == null || stack.isEmpty() || stack.id !== "capsule:capsule") {
        return false;
    }

    try {
        if (CapsuleItem.isBlueprint(stack) || CapsuleItem.isOverpowered(stack)) {
            return true;
        }
    } catch (apiErr) {}

    try {
        const tag = stack.nbt;
        if (tag == null) return false;

        if (tag.getBoolean && tag.getBoolean("overpowered")) return true;
        if (tag.getInt && tag.getInt("overpowered") === 1) return true;
        if (tag.overpowered === 1 || tag.overpowered === true) return true;

        // Blueprint capsules store a source inventory template.
        if (tag.contains && tag.contains("sourceInventory")) return true;
        if (tag.sourceInventory != null) return true;
    } catch (nbtErr) {}

    return false;
}

function purgeContainer(container) {
    let removed = 0;
    if (container == null) return 0;

    for (let slot = 0; slot < container.getContainerSize(); slot++) {
        const stack = container.getItem(slot);
        if (!isBannedCapsule(stack)) continue;
        removed += stack.count;
        container.setItem(slot, Item.empty);
    }
    return removed;
}

function purgePlayerCapsules(player, announce) {
    if (player == null || player.level.clientSide) return;

    let removed = 0;
    removed += purgeContainer(player.getInventory());
    removed += purgeContainer(player.getEnderChestInventory());

    if (removed > 0 && announce) {
        player.tell(
            "\u00A7cBlueprint / Overpowered capsules are disabled and were removed."
        );
        console.log(
            "[Capsule Disable] Removed " +
                removed +
                " banned capsule(s) from " +
                player.username
        );
    }
}

ServerEvents.recipes(function (event) {
    event.remove({ id: "capsule:blueprint" });
    event.remove({ type: "capsule:blueprint_capsule" });
    event.remove({ id: "capsule:blueprint_change" });
    event.remove({ type: "capsule:blueprint_change" });
    event.remove({ id: "capsule:aggregate_all_prefabs" });
    event.remove({ type: "capsule:aggregate_all_prefabs" });
    event.remove({ id: "capsule:capsule_op" });

    console.log(
        "[DBZ Legacy Reborn] Capsule blueprint + overpowered recipes disabled."
    );
});

PlayerEvents.loggedIn(function (event) {
    purgePlayerCapsules(event.player, true);
});

PlayerEvents.tick(function (event) {
    const player = event.player;
    if (player == null || player.level.clientSide) return;
    if (player.age % PLAYER_PURGE_INTERVAL !== 0) return;
    purgePlayerCapsules(player, true);
});

EntityEvents.spawned(function (event) {
    const entity = event.entity;
    if (entity.type !== "minecraft:item") return;

    const stack = entity.item;
    if (isBannedCapsule(stack)) {
        entity.discard();
    }
});

// Rare backup for any ground item that slipped past spawn (e.g. loaded chunks).
ServerEvents.tick(function (event) {
    groundBackupTicks++;
    if (groundBackupTicks < GROUND_BACKUP_INTERVAL) return;
    groundBackupTicks = 0;

    const server = event.server;
    server.runCommandSilent(
        'minecraft:kill @e[type=minecraft:item,nbt={Item:{id:"capsule:capsule",tag:{sourceInventory:{}}}}]'
    );
    server.runCommandSilent(
        'minecraft:kill @e[type=minecraft:item,nbt={Item:{id:"capsule:capsule",tag:{overpowered:1}}}]'
    );
    server.runCommandSilent(
        'minecraft:kill @e[type=minecraft:item,nbt={Item:{id:"capsule:capsule",tag:{overpowered:1b}}}]'
    );
});

ServerEvents.loaded(function () {
    console.log(
        "[DBZ Legacy Reborn] Capsule disable loaded (merged + optimized)."
    );
});

/*
 * DBZ Legacy Reborn - Capsule Disable
 *
 * Disables blueprint + overpowered Capsule crafting, and removes ONLY
 * those banned capsule stacks from player inventories / ender chests /
 * ground item entities.
 *
 * SAFETY (important):
 * - NEVER runs minecraft:clear (that wiped inventories before)
 * - NEVER runs kill/clear against players
 * - Only empties a slot after re-checking it is still a banned capsule
 * - Normal capsules are left alone
 * - No broad NBT guesses like "has sourceInventory"
 */

const CapsuleItem = Java.loadClass("capsule.items.CapsuleItem");

const PLAYER_PURGE_INTERVAL = 100; // 5 seconds

function capsuleId(stack) {
    try {
        return String(stack.id);
    } catch (e) {
        return "";
    }
}

function isCapsuleItem(stack) {
    return stack != null && !stack.isEmpty() && capsuleId(stack) === "capsule:capsule";
}

function isOverpoweredCapsule(stack) {
    if (!isCapsuleItem(stack)) return false;

    try {
        if (CapsuleItem.isOverpowered(stack)) return true;
    } catch (apiErr) {}

    try {
        const tag = stack.nbt;
        if (tag == null) return false;

        // Strict OP flag only. Do not match other capsule NBT.
        if (tag.getBoolean && tag.getBoolean("overpowered") === true) return true;
        if (tag.getInt && tag.getInt("overpowered") === 1) return true;
        if (tag.overpowered === 1 || tag.overpowered === true) return true;
    } catch (nbtErr) {}

    return false;
}

function isBlueprintCapsule(stack) {
    if (!isCapsuleItem(stack)) return false;

    // Use Capsule API only. Do NOT treat sourceInventory / content NBT
    // as proof of blueprint — normal capsules can carry structure data.
    try {
        return CapsuleItem.isBlueprint(stack) === true;
    } catch (apiErr) {
        return false;
    }
}

function isBannedCapsule(stack) {
    return isBlueprintCapsule(stack) || isOverpoweredCapsule(stack);
}

function removeBannedSlot(container, slot) {
    if (container == null) return 0;

    const stack = container.getItem(slot);
    if (!isBannedCapsule(stack)) return 0;

    // Re-check immediately before write so we never blank the wrong item.
    const again = container.getItem(slot);
    if (!isBannedCapsule(again)) return 0;
    if (capsuleId(again) !== "capsule:capsule") return 0;

    const count = again.count;
    container.setItem(slot, Item.empty);
    return count;
}

function purgeContainer(container) {
    let removed = 0;
    if (container == null) return 0;

    const size = container.getContainerSize();
    for (let slot = 0; slot < size; slot++) {
        removed += removeBannedSlot(container, slot);
    }
    return removed;
}

function purgePlayerCapsules(player, announce) {
    if (player == null) return;
    try {
        if (player.level.clientSide) return;
    } catch (sideErr) {}

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
                " banned capsule item(s) from " +
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
    if (player == null) return;
    try {
        if (player.level.clientSide) return;
    } catch (sideErr) {
        return;
    }
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

ServerEvents.loaded(function () {
    console.log(
        "[DBZ Legacy Reborn] Capsule disable loaded (slot-safe, no clear/kill commands)."
    );
});

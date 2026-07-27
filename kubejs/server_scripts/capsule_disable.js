// kubejs/server_scripts/capsule_disable.js
// DBZ Legacy Reborn - Capsule Disable (load-safe)
//
// Disables blueprint + overpowered Capsule recipes and removes ONLY
// those banned capsule stacks from inventories / ender chests / ground.
//
// SAFETY:
// - Never runs minecraft:clear (that wiped inventories before)
// - Never runs kill/clear against players
// - Only empties a slot after confirming it is a banned capsule

console.info("[Capsule Disable] script file evaluating...");

var CapsuleItemClass = null;
var PLAYER_PURGE_INTERVAL = 100; // 5 seconds

function getCapsuleItemClass() {
    if (CapsuleItemClass != null) return CapsuleItemClass;
    try {
        CapsuleItemClass = Java.loadClass("capsule.items.CapsuleItem");
    } catch (err) {
        console.error("[Capsule Disable] Could not load CapsuleItem class: " + err);
        CapsuleItemClass = null;
    }
    return CapsuleItemClass;
}

function getNativeStack(stack) {
    if (stack == null) return null;
    try {
        if (stack.getItemStack) return stack.getItemStack();
    } catch (e1) {}
    try {
        if (stack.itemStack) return stack.itemStack;
    } catch (e2) {}
    return stack;
}

function isCapsuleStack(stack) {
    if (stack == null) return false;
    try {
        if (stack.isEmpty()) return false;
    } catch (e) {
        return false;
    }
    try {
        return String(stack.id) === "capsule:capsule";
    } catch (e2) {
        return false;
    }
}

function isBannedCapsule(stack) {
    if (!isCapsuleStack(stack)) return false;

    var CapsuleItem = getCapsuleItemClass();
    var nativeStack = getNativeStack(stack);

    // Prefer Capsule mod API (same as your old working scripts).
    if (CapsuleItem != null && nativeStack != null) {
        try {
            if (CapsuleItem.isBlueprint(nativeStack)) return true;
        } catch (eBlueprint) {}
        try {
            if (CapsuleItem.isOverpowered(nativeStack)) return true;
        } catch (eOp) {}
    }

    // Strict NBT fallback only (overpowered is a BYTE in Capsule).
    try {
        var tag = stack.nbt;
        if (tag == null) return false;

        try {
            if (tag.getByte && tag.getByte("overpowered") === 1) return true;
        } catch (eByte) {}
        try {
            if (tag.getInt && tag.getInt("overpowered") === 1) return true;
        } catch (eInt) {}

        // Blueprint marker used by CapsuleItem.isBlueprint:
        // sourceInventory compound with coordinates (not every capsule NBT).
        try {
            if (
                tag.contains &&
                tag.contains("sourceInventory") &&
                tag.getCompound
            ) {
                var src = tag.getCompound("sourceInventory");
                if (src != null && src.contains && src.contains("x")) {
                    return true;
                }
            }
        } catch (eSrc) {}
    } catch (eNbt) {}

    return false;
}

function emptyItem() {
    try {
        return Item.empty;
    } catch (e1) {}
    try {
        return Item.of("minecraft:air");
    } catch (e2) {}
    return null;
}

function purgeContainer(container) {
    var removed = 0;
    if (container == null) return 0;

    var empty = emptyItem();
    if (empty == null) return 0;

    var size = container.getContainerSize();
    for (var slot = 0; slot < size; slot++) {
        var stack = container.getItem(slot);
        if (!isBannedCapsule(stack)) continue;

        // Re-check right before write.
        var again = container.getItem(slot);
        if (!isBannedCapsule(again)) continue;
        if (String(again.id) !== "capsule:capsule") continue;

        removed += again.count;
        container.setItem(slot, empty);
    }
    return removed;
}

function purgePlayerCapsules(player, announce) {
    if (player == null) return;

    var removed = 0;
    try {
        removed += purgeContainer(player.getInventory());
    } catch (eInv) {
        try {
            removed += purgeContainer(player.inventory);
        } catch (eInv2) {}
    }

    try {
        removed += purgeContainer(player.getEnderChestInventory());
    } catch (eEnder) {}

    if (removed > 0 && announce) {
        try {
            player.tell(
                "\u00A7cBlueprint / Overpowered capsules are disabled and were removed."
            );
        } catch (eTell) {}
        console.info(
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

    console.info(
        "[DBZ Legacy Reborn] Capsule blueprint + overpowered recipes disabled."
    );
});

PlayerEvents.loggedIn(function (event) {
    try {
        purgePlayerCapsules(event.player, true);
    } catch (err) {
        console.error("[Capsule Disable] loggedIn error: " + err);
    }
});

PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        if (player.age % PLAYER_PURGE_INTERVAL !== 0) return;
        purgePlayerCapsules(player, true);
    } catch (err) {
        console.error("[Capsule Disable] tick error: " + err);
    }
});

EntityEvents.spawned(function (event) {
    try {
        var entity = event.entity;
        if (entity.type !== "minecraft:item") return;
        if (isBannedCapsule(entity.item)) {
            entity.discard();
        }
    } catch (err) {
        // ignore spawn-hook failures
    }
});

console.info(
    "[DBZ Legacy Reborn] Capsule disable handlers registered (slot-safe)."
);

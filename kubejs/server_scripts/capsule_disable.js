// kubejs/server_scripts/capsule_disable.js
// DBZ Legacy Reborn - Capsule Disable
//
// Recipes ARE removed (see logs: "removed 4 recipes").
// This version fixes inventory purge so blueprint / overpowered
// capsules are actually detected and removed slot-by-slot.
//
// SAFETY:
// - Never runs minecraft:clear
// - Never clears a whole inventory
// - Only replaces a slot after confirming that slot is a banned capsule

console.info("[Capsule Disable] script file evaluating...");

var CapsuleItemClass = null;
var CapsuleClassTried = false;
var PLAYER_PURGE_INTERVAL = 100; // 5 seconds
var DEBUG_CAPSULE = false;

function getCapsuleItemClass() {
    if (CapsuleClassTried) return CapsuleItemClass;
    CapsuleClassTried = true;
    try {
        CapsuleItemClass = Java.loadClass("capsule.items.CapsuleItem");
        console.info("[Capsule Disable] CapsuleItem class loaded.");
    } catch (err) {
        CapsuleItemClass = null;
        console.error("[Capsule Disable] CapsuleItem class missing: " + err);
    }
    return CapsuleItemClass;
}

function stackId(stack) {
    try {
        return String(stack.id);
    } catch (e) {
        return "";
    }
}

function isCapsuleStack(stack) {
    if (stack == null) return false;
    try {
        if (stack.isEmpty()) return false;
    } catch (eEmpty) {
        return false;
    }

    // KubeJS-friendly matchers first.
    try {
        if (stack.is && stack.is("capsule:capsule")) return true;
    } catch (eIs) {}

    return stackId(stack) === "capsule:capsule";
}

function nbtHasKey(tag, key) {
    if (tag == null) return false;
    try {
        if (tag.contains && tag.contains(key)) return true;
    } catch (e1) {}
    try {
        if (tag[key] !== undefined && tag[key] !== null) return true;
    } catch (e2) {}
    return false;
}

function nbtOverpoweredByte(tag) {
    if (tag == null) return 0;
    try {
        if (tag.getByte) return Number(tag.getByte("overpowered"));
    } catch (e1) {}
    try {
        return Number(tag.overpowered);
    } catch (e2) {}
    return 0;
}

/*
 * Matches Capsule mod rules exactly:
 * - blueprint = NBT has "sourceInventory" (even empty {})
 * - overpowered = NBT byte overpowered == 1
 */
function isBannedCapsule(stack) {
    if (!isCapsuleStack(stack)) return false;

    var CapsuleItem = getCapsuleItemClass();
    if (CapsuleItem != null) {
        try {
            if (CapsuleItem.isBlueprint(stack)) return true;
        } catch (e1) {}
        try {
            if (CapsuleItem.isOverpowered(stack)) return true;
        } catch (e2) {}
    }

    var tag = null;
    try {
        tag = stack.nbt;
    } catch (eNbt) {
        tag = null;
    }
    if (tag == null) return false;

    // Overpowered: Capsule stores this as a BYTE.
    var op = nbtOverpoweredByte(tag);
    if (op == 1) return true;

    // Blueprint: ANY sourceInventory key, including empty compound.
    if (nbtHasKey(tag, "sourceInventory")) return true;

    return false;
}

function emptyStack() {
    try {
        return Item.empty;
    } catch (e1) {}
    return Item.of("minecraft:air");
}

function readSlot(container, slot) {
    try {
        if (container.getItem) return container.getItem(slot);
    } catch (e1) {}
    try {
        if (container.get) return container.get(slot);
    } catch (e2) {}
    return null;
}

function writeSlot(container, slot, stack) {
    try {
        if (container.setItem) {
            container.setItem(slot, stack);
            return true;
        }
    } catch (e1) {}
    try {
        if (container.set) {
            container.set(slot, stack);
            return true;
        }
    } catch (e2) {}
    return false;
}

function containerSize(container) {
    try {
        if (container.getContainerSize) return Number(container.getContainerSize());
    } catch (e1) {}
    try {
        if (container.getSlots) return Number(container.getSlots());
    } catch (e2) {}
    try {
        if (container.slots != null) return Number(container.slots);
    } catch (e3) {}
    // Player inventory fallback: 41 slots (main + armor + offhand).
    return 41;
}

function purgeContainer(container, label) {
    var removed = 0;
    if (container == null) return 0;

    var empty = emptyStack();
    var size = containerSize(container);

    for (var slot = 0; slot < size; slot++) {
        var stack = readSlot(container, slot);
        if (stack == null) continue;
        if (!isBannedCapsule(stack)) continue;

        var again = readSlot(container, slot);
        if (!isBannedCapsule(again)) continue;
        if (!isCapsuleStack(again)) continue;

        var count = 1;
        try {
            count = Number(again.count);
            if (isNaN(count) || count < 1) count = 1;
        } catch (eCount) {}

        if (writeSlot(container, slot, empty)) {
            removed += count;
            if (DEBUG_CAPSULE) {
                console.info(
                    "[Capsule Disable] Cleared " +
                        count +
                        "x banned capsule from " +
                        label +
                        " slot " +
                        slot
                );
            }
        }
    }
    return removed;
}

function purgePlayerCapsules(player, announce) {
    if (player == null) return;

    var removed = 0;

    // Prefer vanilla inventory APIs, then KubeJS inventory wrapper.
    try {
        removed += purgeContainer(player.getInventory(), "inventory");
    } catch (eInv) {
        if (DEBUG_CAPSULE) console.error("[Capsule Disable] getInventory failed: " + eInv);
    }

    try {
        removed += purgeContainer(player.inventory, "inventoryKJS");
    } catch (eInv2) {
        if (DEBUG_CAPSULE) console.error("[Capsule Disable] player.inventory failed: " + eInv2);
    }

    try {
        removed += purgeContainer(player.getEnderChestInventory(), "ender");
    } catch (eEnder) {
        try {
            removed += purgeContainer(player.enderChestInventory, "enderKJS");
        } catch (eEnder2) {}
    }

    // Cursor / offhand extras on some wrappers.
    try {
        if (player.mainHandItem && isBannedCapsule(player.mainHandItem)) {
            player.setMainHandItem(emptyStack());
            removed += 1;
        }
    } catch (eHand) {}
    try {
        if (player.offHandItem && isBannedCapsule(player.offHandItem)) {
            player.setOffHandItem(emptyStack());
            removed += 1;
        }
    } catch (eOff) {}

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
        getCapsuleItemClass();
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

// Stop banned capsules from being used even if one slips through.
ItemEvents.rightClicked("capsule:capsule", function (event) {
    try {
        if (isBannedCapsule(event.item)) {
            event.cancel();
            try {
                event.item.count = 0;
            } catch (eCount) {
                try {
                    event.player.setMainHandItem(emptyStack());
                } catch (eHand) {}
            }
            event.player.tell(
                "\u00A7cBlueprint / Overpowered capsules are disabled on this server."
            );
        }
    } catch (err) {
        console.error("[Capsule Disable] rightClicked error: " + err);
    }
});

EntityEvents.spawned("minecraft:item", function (event) {
    try {
        var entity = event.entity;
        var stack = entity.item;
        if (isBannedCapsule(stack)) {
            event.cancel();
            try {
                entity.discard();
            } catch (eDisc) {}
        }
    } catch (err) {}
});

console.info(
    "[DBZ Legacy Reborn] Capsule disable handlers registered (slot-safe purge)."
);

// kubejs/server_scripts/remove_silk_touch.js
// DBZ Legacy Reborn - Remove Silk Touch Enchant
//
// Pure ASCII so KubeJS UTF-8 reader never hits MalformedInputException.
//
// Removes ONLY the Silk Touch enchantment from items / enchanted books.
// The item itself is always kept (books with no enchants left become a book).
//
// Covers:
// - player inventory + armor + offhand
// - ender chest
// - items on the ground
//
// Reload: /reload  or  /kubejs reload server_scripts

console.info("[Silk Touch Remove] script file evaluating...");

var EnchantmentHelper = null;
var Enchantments = null;
var SilkTouchEnchant = null;
var JAVA_READY = false;

var PLAYER_SCAN_INTERVAL = 100; // 5 seconds at 20 tps
var DEBUG_SILK = false;

function initJava() {
    if (JAVA_READY) return true;
    try {
        EnchantmentHelper = Java.loadClass(
            "net.minecraft.world.item.enchantment.EnchantmentHelper"
        );
        Enchantments = Java.loadClass(
            "net.minecraft.world.item.enchantment.Enchantments"
        );

        /* Try common mapping names for SILK_TOUCH on 1.20.1 Forge. */
        var fieldNames = ["SILK_TOUCH", "f_44985_", "silk_touch"];
        for (var i = 0; i < fieldNames.length; i++) {
            try {
                var f = Enchantments.class.getDeclaredField(fieldNames[i]);
                f.setAccessible(true);
                SilkTouchEnchant = f.get(null);
                if (SilkTouchEnchant != null) break;
            } catch (eField) {}
            try {
                SilkTouchEnchant = Enchantments[fieldNames[i]];
                if (SilkTouchEnchant != null) break;
            } catch (eProp) {}
        }

        /* Last resort: scan static fields for silk_touch description id. */
        if (SilkTouchEnchant == null) {
            try {
                var fields = Enchantments.class.getDeclaredFields();
                for (var fi = 0; fi < fields.length; fi++) {
                    try {
                        fields[fi].setAccessible(true);
                        var val = fields[fi].get(null);
                        if (val == null) continue;
                        var desc = "";
                        try {
                            desc = String(val.getDescriptionId());
                        } catch (eDesc) {
                            desc = String(val);
                        }
                        if (desc.toLowerCase().indexOf("silk_touch") >= 0) {
                            SilkTouchEnchant = val;
                            break;
                        }
                    } catch (eOne) {}
                }
            } catch (eScan) {}
        }

        JAVA_READY = EnchantmentHelper != null;
        if (JAVA_READY) {
            console.info(
                "[Silk Touch Remove] EnchantmentHelper ready. SILK_TOUCH=" +
                    (SilkTouchEnchant != null ? "ok" : "nbt-fallback")
            );
        } else {
            console.error("[Silk Touch Remove] EnchantmentHelper missing.");
        }
    } catch (err) {
        JAVA_READY = false;
        console.error("[Silk Touch Remove] Java init failed: " + err);
    }
    return JAVA_READY;
}

function emptyStack() {
    try {
        return Item.empty;
    } catch (e1) {
        try {
            return Item.of("minecraft:air");
        } catch (e2) {
            return null;
        }
    }
}

function isEmptyStack(stack) {
    if (stack == null) return true;
    try {
        if (stack.isEmpty()) return true;
    } catch (e) {}
    try {
        if (String(stack.id) === "minecraft:air") return true;
    } catch (e2) {}
    return false;
}

function stackId(stack) {
    try {
        return String(stack.id);
    } catch (e) {
        return "";
    }
}

function getMcItemStack(stack) {
    if (stack == null) return null;
    try {
        if (stack.itemStack != null) return stack.itemStack;
    } catch (e1) {}
    try {
        if (typeof stack.getItemStack === "function") return stack.getItemStack();
    } catch (e2) {}
    /* KubeJS ItemStackJS often IS / wraps the MC stack closely enough. */
    return stack;
}

function enchantIdOf(entryKey) {
    try {
        if (entryKey == null) return "";
        if (typeof entryKey.getDescriptionId === "function") {
            var desc = String(entryKey.getDescriptionId());
            /* enchantment.minecraft.silk_touch */
            if (desc.indexOf("silk_touch") >= 0) return "minecraft:silk_touch";
        }
    } catch (e1) {}
    try {
        var s = String(entryKey);
        if (s.indexOf("silk_touch") >= 0) return "minecraft:silk_touch";
        return s.toLowerCase();
    } catch (e2) {
        return "";
    }
}

function nbtHasSilkTouch(stack) {
    if (isEmptyStack(stack)) return false;
    try {
        var snbt = "";
        if (stack.nbtString) snbt = String(stack.nbtString);
        else if (stack.nbt) snbt = String(stack.nbt);
        if (snbt === "") return false;
        return (
            snbt.indexOf("silk_touch") >= 0 ||
            snbt.indexOf("minecraft:silk_touch") >= 0
        );
    } catch (e) {
        return false;
    }
}

function mapHasSilkTouch(map) {
    if (map == null) return false;
    try {
        if (SilkTouchEnchant != null && map.containsKey(SilkTouchEnchant)) {
            return true;
        }
    } catch (e1) {}
    try {
        var it = map.entrySet().iterator();
        while (it.hasNext()) {
            var entry = it.next();
            if (enchantIdOf(entry.getKey()) === "minecraft:silk_touch") {
                return true;
            }
        }
    } catch (e2) {}
    return false;
}

function removeSilkFromMap(map) {
    if (map == null) return false;
    var changed = false;
    try {
        if (SilkTouchEnchant != null && map.containsKey(SilkTouchEnchant)) {
            map.remove(SilkTouchEnchant);
            changed = true;
        }
    } catch (e1) {}
    try {
        var toRemove = [];
        var it = map.entrySet().iterator();
        while (it.hasNext()) {
            var entry = it.next();
            if (enchantIdOf(entry.getKey()) === "minecraft:silk_touch") {
                toRemove.push(entry.getKey());
            }
        }
        for (var i = 0; i < toRemove.length; i++) {
            try {
                map.remove(toRemove[i]);
                changed = true;
            } catch (eRem) {}
        }
    } catch (e2) {}
    return changed;
}

/*
 * Strip Silk Touch from a stack IN PLACE when possible.
 * Returns true if the enchant was removed (item kept).
 */
function stripSilkTouchFromStack(stack) {
    if (!initJava()) return false;
    if (isEmptyStack(stack)) return false;

    var mc = getMcItemStack(stack);
    if (mc == null) return false;

    var hadHint = nbtHasSilkTouch(stack);
    var map = null;
    try {
        map = EnchantmentHelper.getEnchantments(mc);
    } catch (eGet) {
        map = null;
    }

    if (!mapHasSilkTouch(map) && !hadHint) return false;

    var changed = false;
    if (map != null && mapHasSilkTouch(map)) {
        changed = removeSilkFromMap(map);
        try {
            EnchantmentHelper.setEnchantments(map, mc);
        } catch (eSet) {
            changed = false;
        }
    }

    /* Fallback: rewrite Enchantments / StoredEnchantments NBT lists. */
    if (!changed && hadHint) {
        changed = stripSilkTouchViaNbt(stack) || stripSilkTouchViaNbt(mc);
    }

    /* Enchanted book with no stored enchants left -> normal book (keep item). */
    try {
        if (stackId(stack) === "minecraft:enchanted_book") {
            var left = null;
            try {
                left = EnchantmentHelper.getEnchantments(getMcItemStack(stack));
            } catch (eLeft) {}
            var empty = true;
            try {
                if (left != null && !left.isEmpty()) empty = false;
            } catch (eEmpty) {
                try {
                    empty = !(left != null && left.size() > 0);
                } catch (eSize) {}
            }
            if (empty) {
                try {
                    stack.count = 0;
                } catch (eCount) {}
                return true; /* caller replaces slot with a book */
            }
        }
    } catch (eBook) {}

    return changed || hadHint;
}

function stripSilkTouchViaNbt(stack) {
    if (stack == null) return false;
    var tag = null;
    try {
        tag = stack.nbt;
    } catch (e1) {
        try {
            tag = stack.getOrCreateTag ? stack.getOrCreateTag() : null;
        } catch (e2) {
            tag = null;
        }
    }
    if (tag == null) return false;

    var changed = false;
    changed = filterEnchantListTag(tag, "Enchantments") || changed;
    changed = filterEnchantListTag(tag, "StoredEnchantments") || changed;
    return changed;
}

function filterEnchantListTag(tag, key) {
    if (tag == null || key == null) return false;
    try {
        if (!(tag.contains && tag.contains(key))) return false;
    } catch (eHas) {
        return false;
    }

    try {
        var list = tag.getList(key, 10); /* 10 = compound */
        if (list == null) return false;
        var removed = false;
        for (var i = list.size() - 1; i >= 0; i--) {
            var compound = list.getCompound(i);
            var id = "";
            try {
                id = String(compound.getString("id"));
            } catch (eId) {}
            if (id.indexOf("silk_touch") >= 0) {
                list.remove(i);
                removed = true;
            }
        }
        if (removed) {
            if (list.size() <= 0) {
                try {
                    tag.remove(key);
                } catch (eRem) {}
            } else {
                try {
                    tag.put(key, list);
                } catch (ePut) {}
            }
        }
        return removed;
    } catch (err) {
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
    try {
        if (typeof container.getSlots === "function") {
            return Number(container.getSlots());
        }
    } catch (e3) {}
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
    try {
        return container[slot];
    } catch (e3) {}
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

function processStackInSlot(container, slot, label) {
    var stack = readSlot(container, slot);
    if (isEmptyStack(stack)) return 0;
    if (!nbtHasSilkTouch(stack) && !mapWouldHaveSilk(stack)) return 0;

    var idBefore = stackId(stack);
    var stripped = stripSilkTouchFromStack(stack);

    /* Book that lost its only enchant -> replace with normal book. */
    if (idBefore === "minecraft:enchanted_book") {
        var stillBook = stackId(stack) === "minecraft:enchanted_book";
        var leftMap = null;
        try {
            leftMap = EnchantmentHelper.getEnchantments(getMcItemStack(stack));
        } catch (e) {}
        var emptyEnchants = true;
        try {
            if (leftMap != null && !leftMap.isEmpty()) emptyEnchants = false;
        } catch (e2) {
            try {
                emptyEnchants = !(leftMap != null && leftMap.size() > 0);
            } catch (e3) {}
        }
        if (stillBook && emptyEnchants) {
            var count = 1;
            try {
                count = Number(stack.count);
                if (isNaN(count) || count < 1) count = 1;
            } catch (eCount) {}
            var book = Item.of("minecraft:book");
            try {
                book.count = count;
            } catch (eSet) {}
            if (writeSlot(container, slot, book)) {
                if (DEBUG_SILK) {
                    console.info(
                        "[Silk Touch Remove] Replaced empty enchanted book in " +
                            label +
                            " slot " +
                            slot
                    );
                }
                return 1;
            }
        }
    }

    if (stripped) {
        /* Re-write same stack so NBT changes persist in some containers. */
        writeSlot(container, slot, stack);
        if (DEBUG_SILK) {
            console.info(
                "[Silk Touch Remove] Stripped silk_touch from " +
                    idBefore +
                    " in " +
                    label +
                    " slot " +
                    slot
            );
        }
        return 1;
    }
    return 0;
}

function mapWouldHaveSilk(stack) {
    if (!JAVA_READY && !initJava()) return false;
    try {
        var map = EnchantmentHelper.getEnchantments(getMcItemStack(stack));
        return mapHasSilkTouch(map);
    } catch (e) {
        return false;
    }
}

function purgeContainer(container, label) {
    var changed = 0;
    if (container == null) return 0;
    var size = containerSize(container);
    for (var slot = 0; slot < size; slot++) {
        try {
            changed += processStackInSlot(container, slot, label);
        } catch (eSlot) {}
    }
    return changed;
}

function purgePlayerSilkTouch(player, announce) {
    if (player == null) return;
    if (!initJava()) return;

    var changed = 0;

    try {
        changed += purgeContainer(player.getInventory(), "inventory");
    } catch (eInv) {
        try {
            changed += purgeContainer(player.inventory, "inventoryKJS");
        } catch (eInv2) {}
    }

    try {
        changed += purgeContainer(player.getEnderChestInventory(), "ender");
    } catch (eEnder) {
        try {
            changed += purgeContainer(player.enderChestInventory, "enderKJS");
        } catch (eEnder2) {}
    }

    /* Hands (some inventory APIs skip current item quirks). */
    try {
        if (player.mainHandItem && stripSilkTouchFromStack(player.mainHandItem)) {
            if (
                stackId(player.mainHandItem) === "minecraft:enchanted_book" &&
                !mapWouldHaveSilk(player.mainHandItem) &&
                !nbtHasSilkTouch(player.mainHandItem)
            ) {
                /* leave; container pass handles book conversion next tick */
            }
            changed += 1;
        }
    } catch (eHand) {}
    try {
        if (player.offHandItem && stripSilkTouchFromStack(player.offHandItem)) {
            changed += 1;
        }
    } catch (eOff) {}

    if (changed > 0 && announce) {
        try {
            player.tell(
                "\u00A77Silk Touch was removed from " +
                    changed +
                    " item(s). The items were kept."
            );
        } catch (eTell) {}
        console.info(
            "[Silk Touch Remove] Stripped silk_touch from " +
                changed +
                " stack(s) for " +
                player.username
        );
    }
}

PlayerEvents.loggedIn(function (event) {
    try {
        purgePlayerSilkTouch(event.player, true);
    } catch (err) {
        console.error("[Silk Touch Remove] loggedIn error: " + err);
    }
});

PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        if (player.age % PLAYER_SCAN_INTERVAL !== 0) return;
        purgePlayerSilkTouch(player, true);
    } catch (err) {
        console.error("[Silk Touch Remove] tick error: " + err);
    }
});

EntityEvents.spawned("minecraft:item", function (event) {
    try {
        if (!initJava()) return;
        var entity = event.entity;
        var stack = entity.item;
        if (isEmptyStack(stack)) return;
        if (!nbtHasSilkTouch(stack) && !mapWouldHaveSilk(stack)) return;

        stripSilkTouchFromStack(stack);

        /* Ground enchanted book that only had silk touch -> normal book. */
        if (stackId(stack) === "minecraft:enchanted_book") {
            var left = null;
            try {
                left = EnchantmentHelper.getEnchantments(getMcItemStack(stack));
            } catch (e) {}
            var empty = true;
            try {
                if (left != null && !left.isEmpty()) empty = false;
            } catch (e2) {
                try {
                    empty = !(left != null && left.size() > 0);
                } catch (e3) {}
            }
            if (empty || (!mapWouldHaveSilk(stack) && !nbtHasSilkTouch(stack) && empty)) {
                try {
                    var count = Number(stack.count);
                    if (isNaN(count) || count < 1) count = 1;
                    entity.item = Item.of(count + "x minecraft:book");
                } catch (eBook) {
                    try {
                        entity.item = Item.of("minecraft:book");
                    } catch (eBook2) {}
                }
            }
        }
    } catch (err) {}
});

console.info(
    "[DBZ Legacy Reborn] Silk Touch enchant strip handlers registered (items kept)."
);

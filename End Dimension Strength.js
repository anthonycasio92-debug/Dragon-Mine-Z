/*
============================================================
 End Dimension Strength
 Version: 1.0.0

 Makes the Ender Dragon and End mobs tougher (more HP + damage),
 and awards the Dragon Egg as an item instead of leaving the
 vanilla egg block on the exit podium.

 PLACE AS:
 CustomNPCs Global Player Script

 REQUIRED EVENTS:
 - tick
 - kill

 CONFIG:
 Tune the multipliers below for your server difficulty.
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");

/* ========================= CONFIG ========================= */

/* How often each player scans nearby End entities (ms). */
var SCAN_INTERVAL_MS = 1500;

/* Scan radius around the player (blocks). Use -1 for whole player world. */
var SCAN_RADIUS = 96;

/* Ender Dragon */
var DRAGON_HEALTH_MULT = 8.0;
var DRAGON_DAMAGE_MULT = 3.0;

/* Other End mobs (Enderman, Shulker, Endermite, Phantom in The End) */
var END_MOB_HEALTH_MULT = 4.0;
var END_MOB_DAMAGE_MULT = 2.5;

/* Give the Dragon Egg item to the player who lands the killing blow. */
var GIVE_EGG_TO_KILLER = true;

/* Also try to give egg to nearby players in The End (participation). */
var GIVE_EGG_TO_NEARBY = false;
var EGG_SHARE_RADIUS = 128;

/* Remove vanilla dragon_egg blocks near the exit portal after the kill. */
var REMOVE_EGG_BLOCK = true;
var EGG_CLEAR_RADIUS = 8;
var EGG_CLEAR_Y_MIN = 50;
var EGG_CLEAR_Y_MAX = 120;
var EGG_CLEAR_ATTEMPTS = 8; /* ticks/scans after kill to keep clearing */

/* Chat announce when the egg is awarded. */
var ANNOUNCE_EGG = true;

var COLOR = "\u00A7";
var BUFF_TAG = "end_strength_v1";
var TEMP_SCAN = "end.strength.scan";
var TEMP_EGG_CLEAR = "end.strength.eggClear";
var WORLD_EGG_LOCK = "end.strength.eggLock.";

/* ========================= HELPERS ========================= */

function nowMs() {
    try { return Number(new Date().getTime()); }
    catch (e) {
        try { return Number(Java.type("java.lang.System").currentTimeMillis()); }
        catch (e2) { return 0; }
    }
}

function str(v) { return v == null ? "" : String(v); }

function msg(player, text) {
    try { if (player != null) player.message(text); } catch (e) {}
}

function broadcast(text) {
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            var players = worlds[i].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                msg(players[p], text);
            }
        }
    } catch (e) {}
}

function isPlayer(entity) {
    try { return entity != null && entity.getType() == 1; } catch (e) { return false; }
}

function isInTheEnd(world) {
    try {
        var id = str(world.getDimension().getId()).toLowerCase();
        if (id.indexOf("the_end") >= 0 || id === "minecraft:the_end") return true;
        if (id.indexOf(":end") >= 0 && id.indexOf("endermi") < 0) return true;
    } catch (e1) {}
    try {
        var name = str(world.getName()).toLowerCase();
        if (name.indexOf("the_end") >= 0 || name === "end") return true;
    } catch (e2) {}
    return false;
}

function entityKey(entity) {
    var parts = [];
    try { parts.push(str(entity.getTypeName()).toLowerCase()); } catch (e1) {}
    try { parts.push(str(entity.getEntityName()).toLowerCase()); } catch (e2) {}
    try { parts.push(str(entity.getName()).toLowerCase()); } catch (e3) {}
    try {
        var mc = entity.getMCEntity();
        if (mc != null) {
            try { parts.push(str(mc.getType().toString()).toLowerCase()); } catch (e4) {}
            try { parts.push(str(mc.m_6095_().toString()).toLowerCase()); } catch (e5) {}
        }
    } catch (e6) {}
    return parts.join("|");
}

function classifyEndEntity(entity) {
    if (entity == null || isPlayer(entity)) return null;
    var key = entityKey(entity);
    if (key.indexOf("ender_dragon") >= 0 || key.indexOf("enderdragon") >= 0) return "dragon";
    if (key.indexOf("enderman") >= 0) return "enderman";
    if (key.indexOf("shulker") >= 0) return "shulker";
    if (key.indexOf("endermite") >= 0) return "endermite";
    if (key.indexOf("phantom") >= 0) return "phantom";
    return null;
}

function alreadyBuffed(entity) {
    try {
        var temp = entity.getTempdata();
        if (temp != null && temp.has(BUFF_TAG)) return true;
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return false;
        var nbt = mc.getPersistentData();
        try {
            if (nbt.contains(BUFF_TAG)) return nbt.getBoolean(BUFF_TAG) === true;
        } catch (e2) {
            try {
                if (nbt.m_128441_(BUFF_TAG)) return nbt.m_128471_(BUFF_TAG) === true;
            } catch (e3) {}
        }
    } catch (e4) {}
    return false;
}

function markBuffed(entity) {
    try {
        var temp = entity.getTempdata();
        if (temp != null) temp.put(BUFF_TAG, "1");
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return;
        var nbt = mc.getPersistentData();
        try { nbt.putBoolean(BUFF_TAG, true); }
        catch (e2) {
            try { nbt.m_128379_(BUFF_TAG, true); } catch (e3) {}
        }
    } catch (e4) {}
}

function scaleMaxHealth(entity, mult) {
    if (!(mult > 1.001)) return false;
    try {
        var maxHp = Number(entity.getMaxHealth());
        if (!(maxHp > 0) || !isFinite(maxHp)) return false;
        var next = maxHp * mult;
        if (!(next > maxHp)) return false;
        entity.setMaxHealth(next);
        entity.setHealth(next);
        return true;
    } catch (e) {
        /* MC attribute fallback */
        try {
            var mc = entity.getMCEntity();
            var Attributes = Java.type("net.minecraft.world.entity.ai.attributes.Attributes");
            var attr = null;
            try { attr = mc.getAttribute(Attributes.MAX_HEALTH); } catch (e1) {
                try { attr = mc.m_21051_(Attributes.f_22276_); } catch (e2) {}
            }
            if (attr == null) return false;
            var base = Number(attr.getBaseValue());
            if (!(base > 0)) return false;
            attr.setBaseValue(base * mult);
            try { mc.setHealth(mc.getMaxHealth()); } catch (e3) {
                try { mc.m_21153_(mc.m_21233_()); } catch (e4) {}
            }
            return true;
        } catch (e5) {
            return false;
        }
    }
}

function scaleAttackDamage(entity, mult) {
    if (!(mult > 1.001)) return false;
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return false;
        var Attributes = Java.type("net.minecraft.world.entity.ai.attributes.Attributes");
        var attr = null;
        try { attr = mc.getAttribute(Attributes.ATTACK_DAMAGE); } catch (e1) {
            try { attr = mc.m_21051_(Attributes.f_22281_); } catch (e2) {}
        }
        if (attr == null) return false;
        var base = Number(attr.getBaseValue());
        if (!(base > 0) || !isFinite(base)) return false;
        attr.setBaseValue(base * mult);
        return true;
    } catch (e) {
        return false;
    }
}

function buffEntity(entity) {
    if (alreadyBuffed(entity)) return false;
    var kind = classifyEndEntity(entity);
    if (kind == null) return false;

    var hpMult = END_MOB_HEALTH_MULT;
    var dmgMult = END_MOB_DAMAGE_MULT;
    if (kind === "dragon") {
        hpMult = DRAGON_HEALTH_MULT;
        dmgMult = DRAGON_DAMAGE_MULT;
    }

    markBuffed(entity);
    scaleMaxHealth(entity, hpMult);
    scaleAttackDamage(entity, dmgMult);
    return true;
}

function giveDragonEgg(player) {
    if (player == null) return false;
    try {
        if (player.giveItem("minecraft:dragon_egg", 1) === true) return true;
    } catch (e1) {}
    try {
        if (player.giveItem("dragon_egg", 1) === true) return true;
    } catch (e2) {}
    try {
        NpcAPI.Instance().executeCommand(player.getWorld(),
            "give " + str(player.getName()) + " minecraft:dragon_egg 1");
        return true;
    } catch (e3) {
        return false;
    }
}

function clearDragonEggBlocks(world) {
    if (world == null || REMOVE_EGG_BLOCK !== true) return 0;
    var removed = 0;
    try {
        for (var x = -EGG_CLEAR_RADIUS; x <= EGG_CLEAR_RADIUS; x++) {
            for (var z = -EGG_CLEAR_RADIUS; z <= EGG_CLEAR_RADIUS; z++) {
                for (var y = EGG_CLEAR_Y_MIN; y <= EGG_CLEAR_Y_MAX; y++) {
                    try {
                        var block = world.getBlock(x, y, z);
                        if (block == null) continue;
                        var name = str(block.getName()).toLowerCase();
                        if (name.indexOf("dragon_egg") < 0) continue;
                        try { block.remove(); }
                        catch (e1) {
                            try { world.setBlock(x, y, z, "minecraft:air", 0); } catch (e2) {}
                        }
                        removed++;
                    } catch (e3) {}
                }
            }
        }
    } catch (e) {}
    return removed;
}

function claimEggReward(player, victim) {
    if (GIVE_EGG_TO_KILLER !== true && GIVE_EGG_TO_NEARBY !== true) return;

    var lockKey = WORLD_EGG_LOCK;
    try { lockKey = WORLD_EGG_LOCK + str(victim.getUUID()); } catch (e1) {
        lockKey = WORLD_EGG_LOCK + str(nowMs());
    }

    try {
        var stored = player.getWorld().getStoreddata();
        if (stored.has(lockKey)) return;
        stored.put(lockKey, "" + nowMs());
    } catch (e2) {
        /* If lock fails, still attempt once via player temp. */
        try {
            var temp = player.getTempdata();
            if (temp.has(lockKey)) return;
            temp.put(lockKey, "1");
        } catch (e3) {}
    }

    var recipients = [];
    if (GIVE_EGG_TO_KILLER === true) recipients.push(player);

    if (GIVE_EGG_TO_NEARBY === true) {
        try {
            var nearby = player.getWorld().getNearbyEntities(
                Math.floor(player.getX()),
                Math.floor(player.getY()),
                Math.floor(player.getZ()),
                EGG_SHARE_RADIUS,
                1
            );
            for (var i = 0; i < nearby.length; i++) {
                if (!isPlayer(nearby[i])) continue;
                var same = false;
                try { same = str(nearby[i].getUUID()) === str(player.getUUID()); } catch (e4) {}
                if (same) continue;
                recipients.push(nearby[i]);
            }
        } catch (e5) {}
    }

    var given = 0;
    for (var r = 0; r < recipients.length; r++) {
        if (giveDragonEgg(recipients[r])) {
            given++;
            msg(recipients[r], COLOR + "6[The End] " + COLOR + "eYou received the " +
                COLOR + "dDragon Egg" + COLOR + "e!");
        }
    }

    if (ANNOUNCE_EGG === true && given > 0) {
        broadcast(COLOR + "5[The End] " + COLOR + "d" + str(player.getName()) +
            COLOR + "7 defeated the Ender Dragon and claimed the egg!");
    }

    /* Keep clearing the podium egg block for a short window. */
    if (REMOVE_EGG_BLOCK === true) {
        try {
            player.getTempdata().put(TEMP_EGG_CLEAR, "" + EGG_CLEAR_ATTEMPTS);
        } catch (e6) {}
        clearDragonEggBlocks(player.getWorld());
    }
}

/* ========================= EVENTS ========================= */

function tick(event) {
    try {
        var player = event.player;
        if (!isPlayer(player)) return;

        var world = player.getWorld();
        if (!isInTheEnd(world)) return;

        var temp = player.getTempdata();
        var t = nowMs();

        /* Clear leftover egg blocks after a recent dragon kill. */
        try {
            if (temp.has(TEMP_EGG_CLEAR)) {
                var left = Number(temp.get(TEMP_EGG_CLEAR));
                if (!isNaN(left) && left > 0) {
                    clearDragonEggBlocks(world);
                    left--;
                    if (left <= 0) temp.remove(TEMP_EGG_CLEAR);
                    else temp.put(TEMP_EGG_CLEAR, "" + left);
                } else {
                    temp.remove(TEMP_EGG_CLEAR);
                }
            }
        } catch (eClear) {}

        var last = 0;
        try {
            if (temp.has(TEMP_SCAN)) last = Number(temp.get(TEMP_SCAN));
        } catch (e1) {}
        if (t - last < SCAN_INTERVAL_MS) return;
        try { temp.put(TEMP_SCAN, "" + t); } catch (e2) {}

        var list = null;
        try {
            if (SCAN_RADIUS < 0) {
                list = world.getAllEntities(-1);
            } else {
                list = world.getNearbyEntities(
                    Math.floor(player.getX()),
                    Math.floor(player.getY()),
                    Math.floor(player.getZ()),
                    SCAN_RADIUS,
                    -1
                );
            }
        } catch (e3) {
            try { list = world.getAllEntities(-1); } catch (e4) { return; }
        }
        if (list == null) return;

        for (var i = 0; i < list.length; i++) {
            try { buffEntity(list[i]); } catch (e5) {}
        }
    } catch (error) {
        try { print("[EndStrength] tick: " + error); } catch (e) {}
    }
}

function kill(event) {
    try {
        var player = event.player;
        var victim = event.entity;
        if (!isPlayer(player) || victim == null) return;

        var world = null;
        try { world = player.getWorld(); } catch (e1) {}
        if (world == null || !isInTheEnd(world)) {
            /* Still allow if the victim itself is clearly the dragon. */
            if (classifyEndEntity(victim) !== "dragon") return;
        } else if (classifyEndEntity(victim) !== "dragon") {
            return;
        }

        claimEggReward(player, victim);
    } catch (error) {
        try { print("[EndStrength] kill: " + error); } catch (e) {}
    }
}

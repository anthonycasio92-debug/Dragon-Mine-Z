/*
============================================================
 End Dimension Strength
 Version: 2.5.2

 - Stronger End mobs (high HP + DMZ defense, scaled to player power)
 - Ender Dragon + End mobs use DMZ defense mitigation
 - Virtual HP pool (vanilla MAX_HEALTH caps ~1024; real End HP is NBT)
 - Never rewrite dragon/enderman max-health attributes (keeps AI working)
 - Dragon spawned via EndDragonFight (not orphan /summon)
 - Dragon + End mobs tuned for matched hit-count fights (not immortal)
 - Ender Dragon scales with player melee/DEF and re-scales while alive
 - /enddragon command spawn (CMI alias -> trigger 50)
 - Natural dragon respawn every 5 minutes if none exists
 - Dragon Egg item reward (clears podium egg block)
 - End crystals destroyed after each dragon kill
 - Kill announce fires once (no chat spam)

 PLACE AS:
 CustomNPCs Global Player Script

 REQUIRED EVENTS:
 - tick
 - kill
 - trigger
 - damagedEntity

 COMMAND:
   noppes script trigger 50 <playerName>
 CMI alias example:
   enddragon:
     Cmds:
     - asFakeOp! noppes script trigger 50 [playerName]
     ExactMatch: true
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var ConfigManager = Java.type("com.dragonminez.common.config.ConfigManager");

/* ========================= CONFIG ========================= */

var TRIGGER_ID = 50;

var SCAN_INTERVAL_MS = 1500;
var SCAN_RADIUS = 96;
var NATURAL_CHECK_MS = 10000;

/* Natural dragon spawn if none alive. */
var NATURAL_SPAWN_ENABLED = true;
var NATURAL_SPAWN_INTERVAL_MS = 5 * 60 * 1000; /* 5 minutes */
var NATURAL_SPAWN_X = 0;
var NATURAL_SPAWN_Y = 128;
var NATURAL_SPAWN_Z = 0;

/*
 * Dragon virtual HP/DEF — boss-length fight (~80–120 matched hits),
 * not immortal. Soft-capped to summoner / strongest End player melee.
 */
var DRAGON_BASE_HP = 250000;
var DRAGON_HP_PER_LEVEL = 2500;
var DRAGON_HP_PER_BP = 0.25;
var DRAGON_HP_FROM_MELEE = 8.0;
var DRAGON_HP_FROM_PLAYER_HP = 5.0;
var DRAGON_HP_CAP = 15000000;
var DRAGON_DAMAGE_BASE = 120;
var DRAGON_DAMAGE_PER_LEVEL = 2.5;
var DRAGON_TARGET_HITS = 100;
var DRAGON_HP_CAP_FROM_MELEE = 0.12; /* hp <= melee * hits * this */

/*
 * Virtual DMZ defense (StatsData only exists on players).
 * DEF stays below nearby melee so hits always chip the pool.
 */
var DRAGON_DEF_ENABLED = true;
var DRAGON_DEF_BASE = 80000;
var DRAGON_DEF_FROM_PLAYER = 1.5;
var DRAGON_DEF_FROM_MELEE = 1.0;
var DRAGON_DEF_PER_LEVEL = 500;
var DRAGON_DEF_PER_BP = 0.1;
var DRAGON_DEF_CAP = 5000000;
var DRAGON_DEF_NBT = "end_strength_entity_def";
var DRAGON_MIN_DAMAGE_FRACTION = 0.015;

/* Re-scale living dragons upward if a stronger End player is present. */
var DRAGON_RESCALE_MS = 8000;

/*
 * Vanilla Attributes.MAX_HEALTH hard-caps near 1024. End content uses a
 * virtual HP pool in persistent NBT. Do NOT force a 1024 shell on living
 * mobs/dragon — rewriting max-health breaks Enderman teleport AI and the
 * dragon's EndDragonFight phase machine.
 */
var VANILLA_HP_SHELL = 1024; /* detection threshold only */
var VHP_NBT = "end_strength_vhp";
var VMAX_NBT = "end_strength_vmax";
var VHP_ENABLED = true;
var PRESERVE_VANILLA_MAX_HP = true;
var VANILLA_MOB_MAX_HP = {
    endermite: 8,
    phantom: 20,
    enderman: 40,
    shulker: 30,
    dragon: 200
};
/* Enderman melee attribute — keep modest so pathing/teleport AI stays sane. */
var ENDERMAN_ATTACK_DAMAGE = 12;

/*
 * End mob tiers — tough, but killable (~20–40 hits for a matched player).
 * Dragon keeps the hard mitigation; mobs use END_MOB_* absorb/cap below.
 */
var END_MOB_DEF_ENABLED = true;
var END_MOB_TIERS = {
    endermite: { tier: 1, hp: 40000,  damage: 40, defense: 15000, label: "Endermite" },
    phantom:   { tier: 2, hp: 70000,  damage: 70, defense: 25000, label: "Phantom" },
    enderman:  { tier: 3, hp: 100000, damage: 12, defense: 40000, label: "Enderman" },
    shulker:   { tier: 4, hp: 160000, damage: 80, defense: 60000, label: "Shulker" }
};
var END_MOB_LEVEL_HP_PER_LEVEL = 800;
var END_MOB_LEVEL_SCALE_CAP = 4.0;
var END_MOB_HP_FROM_MELEE = 3.0;
var END_MOB_HP_FROM_PLAYER_HP = 2.0;
var END_MOB_DEF_FROM_PLAYER = 1.0;
var END_MOB_DEF_FROM_MELEE = 0.75;
var END_MOB_DEF_PER_LEVEL = 200;
var END_MOB_DEF_SCALE_CAP = 6.0;
var END_MOB_MIN_DAMAGE_FRACTION = 0.025;
/* Rough hit-count target used to soft-cap mob virtual HP vs nearby melee. */
var END_MOB_TARGET_HITS = 30;
var END_MOB_HP_CAP_FROM_MELEE = 0.20; /* hp <= melee * hits * this (post-mitigation share) */

/* Dragon mitigation — harder than End mobs, but still finishable. */
var END_FLAT_ABSORB_FRAC = 0.45;
var END_REDUCTION_CAP = 0.88;
var END_DEF_SCALE = 15.0;

/* End-mob mitigation (softer — must remain killable). */
var END_MOB_FLAT_ABSORB_FRAC = 0.35;
var END_MOB_REDUCTION_CAP = 0.80;
var END_MOB_DEF_SCALE = 25.0;

/* Egg reward */
var GIVE_EGG_TO_KILLER = true;
var GIVE_EGG_TO_NEARBY = false;
var EGG_SHARE_RADIUS = 128;
var REMOVE_EGG_BLOCK = true;
var EGG_CLEAR_RADIUS = 8;
var EGG_CLEAR_Y_MIN = 50;
var EGG_CLEAR_Y_MAX = 120;
var EGG_CLEAR_ATTEMPTS = 10;

/* Destroy all End Crystals when the dragon dies (retries for a few ticks). */
var DESTROY_CRYSTALS_ON_KILL = true;
var CRYSTAL_CLEAR_ATTEMPTS = 12;

/* Announce once per dragon kill only (to killer + optional server line). */
var ANNOUNCE_EGG_TO_KILLER = true;
var ANNOUNCE_EGG_SERVER = true;

var COLOR = "\u00A7";
var BUFF_TAG = "end_strength_v7";
var TEMP_SCAN = "end.strength.scan";
var TEMP_EGG_CLEAR = "end.strength.eggClear";
var TEMP_CRYSTAL_CLEAR = "end.strength.crystalClear";
var TEMP_NATURAL = "end.strength.naturalCheck";
var TEMP_DRAGON_RESCALE = "end.strength.dragonRescale";
var WORLD_EGG_LOCK = "end.strength.eggClaimed.";
var WORLD_LAST_NATURAL = "end.strength.lastNaturalSpawn";
var WORLD_NATURAL_LOCK = "end.strength.naturalLock";
var WORLD_ANNOUNCE_LOCK = "end.strength.announce.";
var WORLD_PENDING_DRAGON_BUFF = "end.strength.pendingDragonBuff";

/* ========================= HELPERS ========================= */

function nowMs() {
    try { return Number(new Date().getTime()); }
    catch (e) {
        try { return Number(Java.type("java.lang.System").currentTimeMillis()); }
        catch (e2) { return 0; }
    }
}

function str(v) { return v == null ? "" : String(v); }
function num(v, f) {
    var n = Number(v);
    return isNaN(n) || !isFinite(n) ? f : n;
}
function msg(player, text) {
    try { if (player != null) player.message(text); } catch (e) {}
}

function broadcastOnce(world, lockKey, text) {
    if (world == null) return;
    try {
        var stored = world.getStoreddata();
        if (stored.has(lockKey)) return;
        stored.put(lockKey, "" + nowMs());
    } catch (e1) {
        return;
    }
    try {
        var players = world.getAllPlayers();
        for (var i = 0; i < players.length; i++) msg(players[i], text);
    } catch (e2) {}
}

function isPlayer(entity) {
    try { return entity != null && entity.getType() == 1; } catch (e) { return false; }
}

function getEndWorld() {
    var names = ["minecraft:the_end", "the_end", "end"];
    for (var i = 0; i < names.length; i++) {
        try {
            var w = NpcAPI.Instance().getIWorld(names[i]);
            if (w != null) return w;
        } catch (e1) {}
    }
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var j = 0; j < worlds.length; j++) {
            if (isInTheEnd(worlds[j])) return worlds[j];
        }
    } catch (e2) {}
    return null;
}

function isInTheEnd(world) {
    if (world == null) return false;
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

function getDmz(player) {
    try {
        var mc = player.getMCEntity();
        if (mc == null) return null;
        return StatsProvider.get(StatsCapability.INSTANCE, mc).orElse(null);
    } catch (e) {
        return null;
    }
}

function readPlayerPower(player) {
    var out = {
        level: 1, bp: 0, melee: 0, maxHp: 20, defense: 0,
        name: str(player != null ? player.getName() : "?")
    };
    if (player == null) return out;
    var data = getDmz(player);
    if (data == null) return out;
    try { out.level = Math.max(1, Math.floor(num(data.getLevel(), 1))); } catch (e1) {}
    try { out.bp = Math.max(0, num(data.getBattlePowerExact(), num(data.getBattlePower(), 0))); } catch (e2) {
        try { out.bp = Math.max(0, num(data.getBattlePower(), 0)); } catch (e3) {}
    }
    try { out.melee = Math.max(0, num(data.getMeleeDamage(), 0)); } catch (e4) {}
    try { out.maxHp = Math.max(20, num(data.getMaxHealth(), 20)); } catch (e5) {}
    try { out.defense = Math.max(0, num(data.getDefense(), 0)); } catch (e6) {}
    return out;
}

function strongestPlayerInEnd(world) {
    var best = null;
    var bestScore = -1;
    try {
        var players = world.getAllPlayers();
        for (var i = 0; i < players.length; i++) {
            if (!isPlayer(players[i])) continue;
            var p = readPlayerPower(players[i]);
            var score = p.level * 1000 + p.bp + p.melee * 10 + p.maxHp;
            if (score > bestScore) {
                bestScore = score;
                best = players[i];
            }
        }
    } catch (e) {}
    return best;
}

function calcDragonHp(power) {
    var hp = DRAGON_BASE_HP
        + power.level * DRAGON_HP_PER_LEVEL
        + power.bp * DRAGON_HP_PER_BP
        + num(power.melee, 0) * DRAGON_HP_FROM_MELEE
        + num(power.maxHp, 0) * DRAGON_HP_FROM_PLAYER_HP;
    if (hp < DRAGON_BASE_HP) hp = DRAGON_BASE_HP;

    /* Soft-cap: ~DRAGON_TARGET_HITS for a matched melee player. */
    var melee = num(power.melee, 0);
    if (melee > 0) {
        var cap = melee * DRAGON_TARGET_HITS * DRAGON_HP_CAP_FROM_MELEE;
        if (cap < DRAGON_BASE_HP) cap = DRAGON_BASE_HP;
        if (hp > cap) hp = cap;
        var floorFromMelee = melee * DRAGON_HP_FROM_MELEE;
        if (hp < floorFromMelee && floorFromMelee <= cap) hp = floorFromMelee;
    }

    if (hp > DRAGON_HP_CAP) hp = DRAGON_HP_CAP;
    return Math.floor(hp);
}

function calcDragonDamage(power) {
    var dmg = DRAGON_DAMAGE_BASE + power.level * DRAGON_DAMAGE_PER_LEVEL;
    if (dmg < DRAGON_DAMAGE_BASE) dmg = DRAGON_DAMAGE_BASE;
    return Math.floor(dmg);
}

function calcDragonDefense(power) {
    var def = DRAGON_DEF_BASE
        + num(power.defense, 0) * DRAGON_DEF_FROM_PLAYER
        + num(power.melee, 0) * DRAGON_DEF_FROM_MELEE
        + power.level * DRAGON_DEF_PER_LEVEL
        + power.bp * DRAGON_DEF_PER_BP;
    if (def < DRAGON_DEF_BASE) def = DRAGON_DEF_BASE;

    /* Keep DEF under nearby melee so every hit still chips virtual HP. */
    var meleeCap = num(power.melee, 0) * 0.85 + DRAGON_DEF_BASE;
    if (meleeCap > DRAGON_DEF_BASE && def > meleeCap) def = meleeCap;
    if (def > DRAGON_DEF_CAP) def = DRAGON_DEF_CAP;
    return Math.floor(def);
}

/*
 * Port of DMZ StatsData.calculatePostMitigationDamage core math.
 * opts: { flatAbsorb, reductionCap, defScale, useConfigBoost }
 * Dragon uses hard End defaults; mobs pass softer END_MOB_* values.
 */
function mitigateWithDmzDefense(rawDamage, defense, minFraction, opts) {
    var raw = Math.max(0, num(rawDamage, 0));
    var def = Math.max(0, num(defense, 0));
    var minFrac = num(minFraction, DRAGON_MIN_DAMAGE_FRACTION);
    if (minFrac < 0) minFrac = 0;
    if (minFrac > 0.5) minFrac = 0.5;
    if (!(raw > 0)) return 0;
    if (!(def > 0)) return raw;

    opts = opts || {};
    var flatMaxFrac = num(opts.flatAbsorb, END_FLAT_ABSORB_FRAC);
    var defScale = num(opts.defScale, END_DEF_SCALE);
    var reductionCap = num(opts.reductionCap, END_REDUCTION_CAP);
    var useConfigBoost = opts.useConfigBoost !== false;

    if (useConfigBoost === true) {
        try {
            var cfg = ConfigManager.getCombatConfig();
            try {
                var cfgFlat = num(cfg.getFlatMitigationMaxAbsorbFraction(), flatMaxFrac);
                if (cfgFlat > flatMaxFrac) flatMaxFrac = cfgFlat;
            } catch (e1) {}
            try {
                var cfgScale = num(cfg.getDefenseReductionScale(), defScale);
                if (cfgScale > 0 && cfgScale < defScale) defScale = cfgScale;
            } catch (e2) {}
            try {
                var capObj = cfg.getBaseDamageReductionCap();
                var cfgCap = num(capObj != null && capObj.doubleValue ? capObj.doubleValue() : capObj, reductionCap);
                if (cfgCap > reductionCap) reductionCap = cfgCap;
            } catch (e3) {}
        } catch (eCfg) {}
    }

    if (defScale < 1) defScale = 1;
    if (flatMaxFrac < 0) flatMaxFrac = 0;
    if (flatMaxFrac > 0.95) flatMaxFrac = 0.95;
    if (reductionCap < 0) reductionCap = 0;
    if (reductionCap > 0.99) reductionCap = 0.99;

    var flatCap = raw * flatMaxFrac;
    var flatAbsorb = def < flatCap ? def : flatCap;
    var remaining = raw - flatAbsorb;
    if (remaining < 0) remaining = 0;

    var ratio = def / (defScale + def);
    if (ratio > reductionCap) ratio = reductionCap;
    if (ratio < 0) ratio = 0;

    var taken = remaining * (1.0 - ratio);
    var minTaken = raw * minFrac;
    if (taken < minTaken) taken = minTaken;
    if (!isFinite(taken) || taken < 0) taken = minTaken;
    return taken;
}

function storeEntityDefense(entity, defense) {
    defense = Math.max(0, Math.floor(num(defense, 0)));
    try {
        var temp = entity.getTempdata();
        if (temp != null) temp.put(DRAGON_DEF_NBT, "" + defense);
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return;
        var nbt = mc.getPersistentData();
        try { nbt.putDouble(DRAGON_DEF_NBT, defense); }
        catch (e2) {
            try { nbt.m_128347_(DRAGON_DEF_NBT, defense); } catch (e3) {}
        }
    } catch (e4) {}
}

function readEntityDefense(entity) {
    try {
        var temp = entity.getTempdata();
        if (temp != null && temp.has(DRAGON_DEF_NBT)) {
            var t = num(temp.get(DRAGON_DEF_NBT), -1);
            if (t >= 0) return t;
        }
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return 0;
        var nbt = mc.getPersistentData();
        var has = false;
        try { has = nbt.contains(DRAGON_DEF_NBT) === true; } catch (e2) {
            try { has = nbt.m_128441_(DRAGON_DEF_NBT) === true; } catch (e3) {}
        }
        if (!has) return 0;
        try { return Math.max(0, num(nbt.getDouble(DRAGON_DEF_NBT), 0)); }
        catch (e4) {
            try { return Math.max(0, num(nbt.m_128459_(DRAGON_DEF_NBT), 0)); } catch (e5) {}
        }
    } catch (e6) {}
    return 0;
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

function markBuffed(entity, meta) {
    try {
        var temp = entity.getTempdata();
        if (temp != null) {
            temp.put(BUFF_TAG, "1");
            if (meta != null) temp.put(BUFF_TAG + ".meta", str(meta));
        }
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return;
        var nbt = mc.getPersistentData();
        try { nbt.putBoolean(BUFF_TAG, true); }
        catch (e2) {
            try { nbt.m_128379_(BUFF_TAG, true); } catch (e3) {}
        }
        if (meta != null) {
            try { nbt.putString(BUFF_TAG + "_meta", str(meta)); }
            catch (e4) {
                try { nbt.m_128359_(BUFF_TAG + "_meta", str(meta)); } catch (e5) {}
            }
        }
    } catch (e6) {}
}

function setEntityMaxHealthSafe(entity, maxHp) {
    maxHp = Math.max(1, Math.floor(num(maxHp, 1)));
    try {
        entity.setMaxHealth(maxHp);
        return true;
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        var Attributes = Java.type("net.minecraft.world.entity.ai.attributes.Attributes");
        var attr = null;
        try { attr = mc.getAttribute(Attributes.MAX_HEALTH); } catch (e2) {
            try { attr = mc.m_21051_(Attributes.f_22276_); } catch (e3) {}
        }
        if (attr == null) return false;
        attr.setBaseValue(maxHp);
        return true;
    } catch (e4) {
        return false;
    }
}

function setEntityHealthSafe(entity, hp) {
    hp = Math.max(0, num(hp, 0));
    try {
        entity.setHealth(hp);
        return true;
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        try { mc.setHealth(hp); return true; } catch (e2) {
            try { mc.m_21153_(hp); return true; } catch (e3) {}
        }
    } catch (e4) {}
    return false;
}

function getEntityMaxHealthSafe(entity) {
    try { return Math.max(1, num(entity.getMaxHealth(), 1)); } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        try { return Math.max(1, num(mc.getMaxHealth(), 1)); } catch (e2) {
            try { return Math.max(1, num(mc.m_21233_(), 1)); } catch (e3) {}
        }
    } catch (e4) {}
    return 1;
}

function getEntityHealthSafe(entity) {
    try { return Math.max(0, num(entity.getHealth(), 0)); } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        try { return Math.max(0, num(mc.getHealth(), 0)); } catch (e2) {
            try { return Math.max(0, num(mc.m_21223_(), 0)); } catch (e3) {}
        }
    } catch (e4) {}
    return 0;
}

function restoreKindVanillaMaxHp(entity, kind) {
    var defHp = VANILLA_MOB_MAX_HP[kind];
    if (!(defHp > 0)) return;
    var cur = getEntityMaxHealthSafe(entity);
    /* Only repair inflated shells from older script versions. */
    if (cur > defHp + 1) {
        setEntityMaxHealthSafe(entity, defHp);
        setEntityHealthSafe(entity, defHp);
    }
}

/*
 * Virtual HP only — never inflate Attributes.MAX_HEALTH.
 * Inflating max HP to 1024 breaks Enderman AI and dragon fight phases.
 */
function setAbsoluteHealth(entity, targetHp, kind) {
    targetHp = Math.max(1, Math.floor(num(targetHp, 1)));
    if (kind != null) restoreKindVanillaMaxHp(entity, kind);

    if (VHP_ENABLED === true && (PRESERVE_VANILLA_MAX_HP === true || targetHp > VANILLA_HP_SHELL)) {
        applyVirtualHealth(entity, targetHp, targetHp, kind);
        return true;
    }

    if (!setEntityMaxHealthSafe(entity, targetHp)) return false;
    setEntityHealthSafe(entity, targetHp);
    var applied = getEntityMaxHealthSafe(entity);
    if (VHP_ENABLED === true && applied + 1 < targetHp) {
        applyVirtualHealth(entity, targetHp, targetHp, kind);
        return true;
    }
    clearVirtualHealth(entity);
    return true;
}

function putNbtNumber(entity, key, value) {
    value = Math.max(0, num(value, 0));
    try {
        var temp = entity.getTempdata();
        if (temp != null) temp.put(key, "" + value);
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return;
        var nbt = mc.getPersistentData();
        try { nbt.putDouble(key, value); }
        catch (e2) {
            try { nbt.m_128347_(key, value); } catch (e3) {}
        }
    } catch (e4) {}
}

function readNbtNumber(entity, key) {
    try {
        var temp = entity.getTempdata();
        if (temp != null && temp.has(key)) {
            var t = num(temp.get(key), -1);
            if (t >= 0) return t;
        }
    } catch (e1) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return -1;
        var nbt = mc.getPersistentData();
        var has = false;
        try { has = nbt.contains(key) === true; } catch (e2) {
            try { has = nbt.m_128441_(key) === true; } catch (e3) {}
        }
        if (!has) return -1;
        try { return Math.max(0, num(nbt.getDouble(key), 0)); }
        catch (e4) {
            try { return Math.max(0, num(nbt.m_128459_(key), 0)); } catch (e5) {}
        }
    } catch (e6) {}
    return -1;
}

function clearVirtualHealth(entity) {
    try {
        var temp = entity.getTempdata();
        if (temp != null) {
            try { temp.remove(VHP_NBT); } catch (e1) {}
            try { temp.remove(VMAX_NBT); } catch (e2) {}
        }
    } catch (e3) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return;
        var nbt = mc.getPersistentData();
        try { nbt.remove(VHP_NBT); } catch (e4) {
            try { nbt.m_128473_(VHP_NBT); } catch (e5) {}
        }
        try { nbt.remove(VMAX_NBT); } catch (e6) {
            try { nbt.m_128473_(VMAX_NBT); } catch (e7) {}
        }
    } catch (e8) {}
}

function readVirtualHp(entity) { return readNbtNumber(entity, VHP_NBT); }
function readVirtualMax(entity) { return readNbtNumber(entity, VMAX_NBT); }

function storeVirtualHp(entity, hp) { putNbtNumber(entity, VHP_NBT, hp); }
function storeVirtualMax(entity, maxHp) { putNbtNumber(entity, VMAX_NBT, maxHp); }

function syncVanillaHealthFromVirtual(entity, vhp, vmax, kind) {
    if (PRESERVE_VANILLA_MAX_HP !== true) return;
    var maxH = getEntityMaxHealthSafe(entity);
    if (kind != null && VANILLA_MOB_MAX_HP[kind] > 0) {
        /* Keep natural max; repair only if previously inflated. */
        var natural = VANILLA_MOB_MAX_HP[kind];
        if (maxH > natural + 1) {
            setEntityMaxHealthSafe(entity, natural);
            maxH = natural;
        }
    }
    if (!(maxH > 0) || !(vmax > 0)) return;
    if (vhp <= 0) return;
    var ratio = vhp / vmax;
    if (ratio > 1) ratio = 1;
    if (ratio < 0) ratio = 0;
    var display = Math.max(1, Math.min(maxH, Math.ceil(maxH * ratio)));
    setEntityHealthSafe(entity, display);
}

function applyVirtualHealth(entity, currentHp, maxHp, kind) {
    maxHp = Math.max(1, Math.floor(num(maxHp, 1)));
    currentHp = Math.max(0, Math.floor(num(currentHp, maxHp)));
    if (currentHp > maxHp) currentHp = maxHp;
    storeVirtualMax(entity, maxHp);
    storeVirtualHp(entity, currentHp);
    if (kind != null) restoreKindVanillaMaxHp(entity, kind);
    syncVanillaHealthFromVirtual(entity, currentHp, maxHp, kind);
}

function hasVirtualHealth(entity) {
    return readVirtualMax(entity) > 0;
}

function formatHpLabel(hp) {
    hp = Math.max(0, Math.floor(num(hp, 0)));
    if (hp >= 1000000) return (Math.floor(hp / 100000) / 10) + "M";
    if (hp >= 1000) return Math.floor(hp / 1000) + "k";
    return "" + hp;
}

function updateDragonName(entity, power, vhp, vmax, def) {
    try {
        var pct = vmax > 0 ? Math.max(0, Math.min(100, Math.floor((vhp / vmax) * 100))) : 100;
        entity.setName(COLOR + "cEnder Dragon " + COLOR + "8[Lv" + power.level +
            " / " + formatHpLabel(vhp) + "/" + formatHpLabel(vmax) +
            " HP " + pct + "% / DEF " + formatHpLabel(def) + "]");
    } catch (e) {}
}

function setAttackDamage(entity, targetDmg) {
    targetDmg = Math.max(1, num(targetDmg, 1));
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return false;
        var Attributes = Java.type("net.minecraft.world.entity.ai.attributes.Attributes");
        var attr = null;
        try { attr = mc.getAttribute(Attributes.ATTACK_DAMAGE); } catch (e1) {
            try { attr = mc.m_21051_(Attributes.f_22281_); } catch (e2) {}
        }
        if (attr == null) return false;
        attr.setBaseValue(targetDmg);
        return true;
    } catch (e) {
        return false;
    }
}

function nearbyPlayerPower(entity, world) {
    var best = { level: 1, defense: 0, bp: 0, melee: 0, maxHp: 20, name: "?" };
    var bestScore = -1;
    try {
        var players = world.getNearbyEntities(
            Math.floor(entity.getX()),
            Math.floor(entity.getY()),
            Math.floor(entity.getZ()),
            96,
            1
        );
        for (var i = 0; i < players.length; i++) {
            if (!isPlayer(players[i])) continue;
            var p = readPlayerPower(players[i]);
            var score = p.level * 1000 + p.defense + p.bp * 0.01 + p.melee * 10 + p.maxHp;
            if (score > bestScore) {
                bestScore = score;
                best = p;
            }
        }
    } catch (e) {}
    return best;
}

function calcMobDefense(tier, power) {
    var base = num(tier.defense, 0);
    var tierFactor = num(tier.tier, 1);
    var def = base
        + num(power.defense, 0) * END_MOB_DEF_FROM_PLAYER * (tierFactor / 2.0)
        + num(power.melee, 0) * END_MOB_DEF_FROM_MELEE * (tierFactor / 2.0)
        + num(power.level, 1) * END_MOB_DEF_PER_LEVEL * tierFactor;
    if (def < base) def = base;
    var maxDef = base * END_MOB_DEF_SCALE_CAP
        + num(power.defense, 0) * END_MOB_DEF_FROM_PLAYER
        + num(power.melee, 0) * END_MOB_DEF_FROM_MELEE;
    /* Keep DEF below nearby melee so hits always matter. */
    var meleeCap = num(power.melee, 0) * 0.9 + base;
    if (meleeCap > base && maxDef > meleeCap) maxDef = meleeCap;
    if (def > maxDef) def = maxDef;
    return Math.floor(def);
}

function calcMobHp(tier, power) {
    var base = num(tier.hp, 1);
    var tierFactor = num(tier.tier, 1);
    var levelScale = 1 + (power.level * END_MOB_LEVEL_HP_PER_LEVEL) / Math.max(1, base);
    if (levelScale > END_MOB_LEVEL_SCALE_CAP) levelScale = END_MOB_LEVEL_SCALE_CAP;
    var hp = base * levelScale
        + num(power.melee, 0) * END_MOB_HP_FROM_MELEE * (tierFactor / 2.0)
        + num(power.maxHp, 0) * END_MOB_HP_FROM_PLAYER_HP;
    var floorFromMelee = num(power.melee, 0) * END_MOB_HP_FROM_MELEE;
    if (hp < floorFromMelee) hp = floorFromMelee;
    if (hp < base) hp = base;

    /*
     * Soft-cap so a matched player clears the mob in roughly END_MOB_TARGET_HITS
     * assuming ~END_MOB_HP_CAP_FROM_MELEE of raw melee lands after mitigation.
     */
    var melee = num(power.melee, 0);
    if (melee > 0) {
        var cap = melee * END_MOB_TARGET_HITS * END_MOB_HP_CAP_FROM_MELEE;
        if (cap < base) cap = base;
        if (hp > cap) hp = cap;
    }
    return Math.floor(hp);
}

function buffMob(entity, world) {
    var kind = classifyEndEntity(entity);
    if (kind == null || kind === "dragon") return false;
    var tier = END_MOB_TIERS[kind];
    if (tier == null) return false;

    /*
     * Buff once per entity. Do NOT re-apply every scan just because virtual
     * HP NBT looked missing — that heal/reset loop breaks Enderman AI.
     */
    var needsBuff = !alreadyBuffed(entity) || !(readEntityDefense(entity) > 0);
    if (!needsBuff) {
        /* One-time repair: restore natural max HP if an older build inflated it. */
        restoreKindVanillaMaxHp(entity, kind);
        if (VHP_ENABLED === true && readVirtualMax(entity) <= 0) {
            var powerFix = nearbyPlayerPower(entity, world);
            var hpFix = calcMobHp(tier, powerFix);
            applyVirtualHealth(entity, hpFix, hpFix, kind);
        }
        return false;
    }

    var power = nearbyPlayerPower(entity, world);
    var hp = calcMobHp(tier, power);
    var dmg = Math.floor(tier.damage * Math.min(4.0, 1 + power.level / 100));
    if (kind === "enderman") dmg = ENDERMAN_ATTACK_DAMAGE;
    var def = calcMobDefense(tier, power);

    markBuffed(entity, kind + ":t" + tier.tier + ":hp" + hp + ":def" + def);
    setAbsoluteHealth(entity, hp, kind);
    if (kind !== "enderman") setAttackDamage(entity, dmg);
    else setAttackDamage(entity, ENDERMAN_ATTACK_DAMAGE);
    if (END_MOB_DEF_ENABLED === true) storeEntityDefense(entity, def);
    return true;
}

function applyDragonStats(entity, power, sourceLabel) {
    var hp = calcDragonHp(power);
    var def = calcDragonDefense(power);
    var prevMax = readVirtualMax(entity);
    var prevHp = readVirtualHp(entity);
    var keepRatio = false;
    var newCurrent = hp;

    /* Mid-fight rescale: keep remaining % when raising the pool. */
    if (prevMax > 0 && prevHp >= 0 && (sourceLabel === "rescale" || sourceLabel === "onhit")) {
        keepRatio = true;
        var ratio = prevHp / prevMax;
        if (!(ratio >= 0)) ratio = 1;
        if (ratio > 1) ratio = 1;
        newCurrent = Math.max(1, Math.floor(hp * ratio));
        /* Only grow the fight — never shrink the remaining pool mid-combat. */
        if (hp > prevMax) {
            newCurrent = Math.max(newCurrent, prevHp + (hp - prevMax));
        } else {
            newCurrent = prevHp;
            hp = prevMax;
        }
        if (newCurrent > hp) newCurrent = hp;
    }

    markBuffed(entity, "dragon:" + sourceLabel + ":hp" + hp + ":def" + def);
    /* Never rewrite dragon max-health / attack attributes — breaks phase AI. */
    applyVirtualHealth(entity, newCurrent, hp, "dragon");
    storeEntityDefense(entity, def);
    if (sourceLabel !== "onhit") {
        updateDragonName(entity, power, newCurrent, hp, def);
    }
    return { hp: hp, current: newCurrent, damage: 0, defense: def };
}

function maybeRescaleDragon(entity, world, player) {
    if (entity == null || world == null) return false;
    var now = nowMs();
    try {
        var temp = entity.getTempdata();
        if (temp != null && temp.has(TEMP_DRAGON_RESCALE)) {
            var last = num(temp.get(TEMP_DRAGON_RESCALE), 0);
            if (now - last < DRAGON_RESCALE_MS) return false;
        }
        if (temp != null) temp.put(TEMP_DRAGON_RESCALE, "" + now);
    } catch (e1) {}

    var powerPlayer = strongestPlayerInEnd(world) || player;
    if (powerPlayer == null) return false;
    var power = readPlayerPower(powerPlayer);
    var desiredHp = calcDragonHp(power);
    var desiredDef = calcDragonDefense(power);
    var curMax = readVirtualMax(entity);
    var curDef = readEntityDefense(entity);

    var needs = !alreadyBuffed(entity)
        || !(curDef > 0)
        || (VHP_ENABLED === true && readVirtualMax(entity) <= 0)
        || desiredHp > curMax + 1000
        || desiredDef > curDef + 1000
        || (curMax > 0 && curMax > desiredHp * 1.25 + 1000);
    if (!needs) {
        /* Keep boss-bar health proportional; do not touch max-health. */
        if (hasVirtualHealth(entity) && readVirtualHp(entity) > 0) {
            syncVanillaHealthFromVirtual(entity, readVirtualHp(entity), readVirtualMax(entity), "dragon");
        }
        return false;
    }
    var label = "scan";
    if (alreadyBuffed(entity) && !(curMax > desiredHp * 1.25 + 1000)) label = "rescale";
    applyDragonStats(entity, power, label);
    return true;
}

function findDragons(world) {
    var found = [];
    if (world == null) return found;
    try {
        var list = world.getAllEntities(-1);
        for (var i = 0; i < list.length; i++) {
            if (classifyEndEntity(list[i]) === "dragon") found.push(list[i]);
        }
    } catch (e) {}
    return found;
}

function wrapMcEntity(mcEntity) {
    if (mcEntity == null) return null;
    try { return NpcAPI.Instance().getIEntity(mcEntity); } catch (e1) {}
    try { return NpcAPI.Instance().getIEntity(mcEntity.getUUID ? mcEntity.getUUID() : null); } catch (e2) {}
    return null;
}

function getMcServerLevel(world) {
    if (world == null) return null;
    try {
        var lvl = world.getMCLevel();
        if (lvl != null) return lvl;
    } catch (e1) {}
    try {
        var w = world.getMCWorld();
        if (w != null) return w;
    } catch (e2) {}
    try {
        var players = world.getAllPlayers();
        if (players != null && players.length > 0) {
            var mc = players[0].getMCEntity();
            try { return mc.level(); } catch (e3) {
                try { return mc.m_9236_(); } catch (e4) {
                    try { return mc.getCommandSenderWorld(); } catch (e5) {}
                }
            }
        }
    } catch (e6) {}
    return null;
}

function getEndDragonFight(world) {
    var level = getMcServerLevel(world);
    if (level == null) return null;
    try {
        var fight = level.getDragonFight();
        if (fight != null) return fight;
    } catch (e1) {}
    try {
        var fight2 = level.m_8850_();
        if (fight2 != null) return fight2;
    } catch (e2) {}
    try {
        var fight3 = level.dragonFight();
        if (fight3 != null) return fight3;
    } catch (e3) {}
    return null;
}

function setFightBoolean(fight, names, value) {
    if (fight == null) return false;
    var flag = value === true;
    for (var i = 0; i < names.length; i++) {
        try {
            var f = fight.getClass().getDeclaredField(names[i]);
            f.setAccessible(true);
            try { f.setBoolean(fight, flag); return true; } catch (e1) {
                try { f.set(fight, flag); return true; } catch (e2) {}
            }
        } catch (e3) {}
    }
    return false;
}

function invokeFightMethod(fight, names) {
    if (fight == null) return null;
    for (var i = 0; i < names.length; i++) {
        try {
            var m = fight.getClass().getDeclaredMethod(names[i]);
            m.setAccessible(true);
            return m.invoke(fight);
        } catch (e1) {}
        try {
            var m0 = fight.getClass().getMethod(names[i]);
            return m0.invoke(fight);
        } catch (e2) {}
    }
    return null;
}

function despawnDragonEntity(entity) {
    if (entity == null) return;
    try { entity.despawn(); return; } catch (e1) {}
    try { entity.kill(); return; } catch (e2) {}
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return;
        try { mc.discard(); } catch (e3) {
            try { mc.m_146870_(); } catch (e4) {}
        }
    } catch (e5) {}
}

function clearAllDragons(world) {
    var list = findDragons(world);
    for (var i = 0; i < list.length; i++) despawnDragonEntity(list[i]);
    return list.length;
}

function restoreTowerCrystals(world) {
    if (world == null) return 0;
    var level = getMcServerLevel(world);
    var placed = 0;
    try {
        var Feature = Java.type("net.minecraft.world.level.levelgen.feature.EndSpikeFeature");
        var spikes = null;
        try { spikes = Feature.getSpikesForLevel(level); } catch (e1) {
            try { spikes = Feature.m_66819_(level); } catch (e2) {
                try { spikes = Feature.getSpikes(level); } catch (e3) {}
            }
        }
        if (spikes == null) return 0;
        var it = spikes.iterator();
        while (it.hasNext()) {
            var spike = it.next();
            var cx = 0;
            var cz = 0;
            var height = 0;
            try { cx = spike.getCenterX(); } catch (e4) {
                try { cx = spike.m_66805_(); } catch (e5) {}
            }
            try { cz = spike.getCenterZ(); } catch (e6) {
                try { cz = spike.m_66806_(); } catch (e7) {}
            }
            try { height = spike.getHeight(); } catch (e8) {
                try { height = spike.m_66808_(); } catch (e9) {}
            }
            var y = Math.max(70, num(height, 70) + 1);
            try {
                NpcAPI.Instance().executeCommand(world,
                    "execute in minecraft:the_end run summon minecraft:end_crystal " +
                    cx + " " + y + " " + cz + " {ShowBottom:1b}");
                placed++;
            } catch (e10) {
                try {
                    var crystal = world.createEntity("minecraft:end_crystal");
                    if (crystal != null) {
                        try { crystal.setPosition(cx, y, cz); } catch (e11) {}
                        world.spawnEntity(crystal);
                        placed++;
                    }
                } catch (e12) {}
            }
        }
    } catch (e) {}
    return placed;
}

/*
 * Spawn through EndDragonFight so the dragon has a linked fight manager.
 * Raw /summon or createEntity orphans break perch/charge/crystal phase AI.
 */
function spawnDragonViaFight(world) {
    if (world == null) return null;
    clearAllDragons(world);

    var fight = getEndDragonFight(world);
    if (fight == null) return null;

    try { fight.skipArenaLoadedCheck(); } catch (e1) {
        try { invokeFightMethod(fight, ["skipArenaLoadedCheck", "m_287277_", "setSkipChunksLoadedCheck"]); } catch (e2) {}
    }

    /* Ensure fight will track a living dragon. */
    setFightBoolean(fight,
        ["dragonKilled", "f_64068_", "field_13115"],
        false);
    setFightBoolean(fight,
        ["previouslyKilled", "f_64069_", "field_13114"],
        true);

    /* Fresh crystal set for a proper fight (avoid duplicates / empty towers). */
    try { clearEndCrystals(world); } catch (eClr) {}
    try { fight.resetSpikeCrystals(); } catch (e3) {
        try { invokeFightMethod(fight, ["resetSpikeCrystals", "m_64101_", "resetEndCrystals"]); } catch (e4) {}
    }

    /* Re-place tower crystals so the dragon keeps normal heal/perch AI. */
    try { restoreTowerCrystals(world); } catch (eCrystal) {}

    var mcDragon = null;
    try {
        mcDragon = invokeFightMethod(fight, ["createNewDragon", "m_64110_"]);
    } catch (e5) {
        mcDragon = null;
    }

    if (mcDragon == null) {
        /* Fallback: findOrCreateDragon private path */
        try {
            mcDragon = invokeFightMethod(fight, ["findOrCreateDragon", "m_64103_", "checkDragonSeen"]);
        } catch (e6) {}
    }

    if (mcDragon == null) return null;

    setFightBoolean(fight,
        ["dragonKilled", "f_64068_", "field_13115"],
        false);

    var wrapped = wrapMcEntity(mcDragon);
    if (wrapped != null) return wrapped;

    /* Wrapper may lag one tick — re-find. */
    var found = findDragons(world);
    return found.length > 0 ? found[found.length - 1] : null;
}

function spawnDragonEntityFallback(world, x, y, z) {
    if (world == null) return null;
    try {
        var ent = world.createEntity("minecraft:ender_dragon");
        if (ent == null) return null;
        try { ent.setPosition(x, y, z); } catch (e1) {
            try { ent.setPos(x, y, z); } catch (e2) {}
        }
        world.spawnEntity(ent);
        return ent;
    } catch (e3) {
        try {
            NpcAPI.Instance().executeCommand(world,
                "summon minecraft:ender_dragon " + x + " " + y + " " + z);
            var dragons = findDragons(world);
            if (dragons.length > 0) return dragons[dragons.length - 1];
        } catch (e4) {}
    }
    return null;
}

function spawnDragonEntity(world, x, y, z) {
    var viaFight = spawnDragonViaFight(world);
    if (viaFight != null) return viaFight;
    try {
        print("[EndStrength] EndDragonFight spawn failed; using fallback summon (AI may be limited).");
    } catch (e1) {}
    clearAllDragons(world);
    return spawnDragonEntityFallback(world, x, y, z);
}

function spawnScaledDragon(world, powerPlayer, sourceLabel, x, y, z) {
    if (world == null) return null;
    var existing = findDragons(world);
    if (existing.length > 0) return null;

    var power = readPlayerPower(powerPlayer);
    var dragon = spawnDragonEntity(world, x, y, z);
    if (dragon == null) {
        /* Fight/command summon may lag one tick */
        existing = findDragons(world);
        if (existing.length > 0) dragon = existing[0];
    }
    if (dragon == null) {
        try {
            var stored = world.getStoreddata();
            stored.put(WORLD_PENDING_DRAGON_BUFF, sourceLabel + "|" +
                (powerPlayer != null ? str(powerPlayer.getName()) : "") + "|" + nowMs());
        } catch (e1) {}
        return null;
    }

    var stats = applyDragonStats(dragon, power, sourceLabel);
    return {
        dragon: dragon,
        hp: stats.hp,
        defense: stats.defense,
        power: power
    };
}

function applyPendingDragonBuff(world, player) {
    if (world == null) return;
    var raw = "";
    try {
        var stored = world.getStoreddata();
        if (!stored.has(WORLD_PENDING_DRAGON_BUFF)) return;
        raw = str(stored.get(WORLD_PENDING_DRAGON_BUFF));
        var dragons = findDragons(world);
        if (dragons.length <= 0) {
            /* Wait a bit for fight respawn animation / delayed summon. */
            var partsWait = raw.split("|");
            var at = partsWait.length > 2 ? num(partsWait[2], 0) : 0;
            if (at > 0 && nowMs() - at > 60000) stored.remove(WORLD_PENDING_DRAGON_BUFF);
            return;
        }
        stored.remove(WORLD_PENDING_DRAGON_BUFF);
        var parts = raw.split("|");
        var label = parts.length > 0 ? parts[0] : "pending";
        var powerPlayer = strongestPlayerInEnd(world) || player;
        applyDragonStats(dragons[0], readPlayerPower(powerPlayer), label);
    } catch (e) {}
}

/* ========================= EGG REWARD ========================= */

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

function isEndCrystal(entity) {
    if (entity == null || isPlayer(entity)) return false;
    var key = entityKey(entity);
    if (key.indexOf("end_crystal") >= 0) return true;
    if (key.indexOf("endercrystal") >= 0) return true;
    if (key.indexOf("ender_crystal") >= 0) return true;
    return false;
}

function clearEndCrystals(world) {
    if (world == null || DESTROY_CRYSTALS_ON_KILL !== true) return 0;
    var removed = 0;
    try {
        var list = world.getAllEntities(-1);
        for (var i = 0; i < list.length; i++) {
            var ent = list[i];
            if (!isEndCrystal(ent)) continue;
            try { ent.despawn(); removed++; }
            catch (e1) {
                try { ent.kill(); removed++; }
                catch (e2) {
                    try {
                        var mc = ent.getMCEntity();
                        if (mc != null) {
                            try { mc.discard(); removed++; }
                            catch (e3) {
                                try { mc.m_146870_(); removed++; } catch (e4) {}
                            }
                        }
                    } catch (e5) {}
                }
            }
        }
    } catch (e) {}

    /* Fallback: killall via command if entity scan missed any. */
    if (removed <= 0) {
        try {
            NpcAPI.Instance().executeCommand(world,
                "execute in minecraft:the_end run kill @e[type=minecraft:end_crystal]");
            removed = 1;
        } catch (e6) {
            try {
                NpcAPI.Instance().executeCommand(world, "kill @e[type=minecraft:end_crystal]");
                removed = 1;
            } catch (e7) {}
        }
    }
    return removed;
}

function scheduleCrystalClear(player) {
    if (DESTROY_CRYSTALS_ON_KILL !== true || player == null) return;
    try {
        player.getTempdata().put(TEMP_CRYSTAL_CLEAR, "" + CRYSTAL_CLEAR_ATTEMPTS);
    } catch (e) {}
    try {
        var world = getEndWorld() || player.getWorld();
        clearEndCrystals(world);
    } catch (e2) {}
}

function claimEggReward(player, victim) {
    var world = null;
    try { world = player.getWorld(); } catch (e0) {}
    if (world == null) return;

    var lockKey = WORLD_EGG_LOCK + "global";
    try { lockKey = WORLD_EGG_LOCK + str(victim.getUUID()); } catch (e1) {}

    try {
        var stored = world.getStoreddata();
        if (stored.has(lockKey)) return;
        stored.put(lockKey, "" + nowMs());
    } catch (e2) {
        try {
            var temp = player.getTempdata();
            if (temp.has(lockKey)) return;
            temp.put(lockKey, "1");
        } catch (e3) { return; }
    }

    var recipients = [];
    if (GIVE_EGG_TO_KILLER === true) recipients.push(player);

    if (GIVE_EGG_TO_NEARBY === true) {
        try {
            var nearby = world.getNearbyEntities(
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
                if (!same) recipients.push(nearby[i]);
            }
        } catch (e5) {}
    }

    var given = 0;
    for (var r = 0; r < recipients.length; r++) {
        if (giveDragonEgg(recipients[r])) {
            given++;
            if (ANNOUNCE_EGG_TO_KILLER === true) {
                msg(recipients[r], COLOR + "6[The End] " + COLOR + "eYou received the " +
                    COLOR + "dDragon Egg" + COLOR + "e!");
            }
        }
    }

    if (ANNOUNCE_EGG_SERVER === true && given > 0) {
        broadcastOnce(world, WORLD_ANNOUNCE_LOCK + lockKey,
            COLOR + "5[The End] " + COLOR + "d" + str(player.getName()) +
            COLOR + "7 defeated the Ender Dragon and claimed the egg!");
    }

    if (REMOVE_EGG_BLOCK === true) {
        try { player.getTempdata().put(TEMP_EGG_CLEAR, "" + EGG_CLEAR_ATTEMPTS); } catch (e6) {}
        clearDragonEggBlocks(world);
    }
}

/* ========================= NATURAL / COMMAND SPAWN ========================= */

function tryNaturalDragonSpawn(player) {
    if (NATURAL_SPAWN_ENABLED !== true) return;
    var world = getEndWorld();
    if (world == null) return;
    if (!isInTheEnd(player.getWorld())) return;

    var dragons = findDragons(world);
    if (dragons.length > 0) {
        /* Keep existing dragons scaled / virtual-HP ready. */
        for (var d = 0; d < dragons.length; d++) {
            maybeRescaleDragon(dragons[d], world, player);
        }
        return;
    }

    var stored = null;
    try { stored = world.getStoreddata(); } catch (e1) { return; }
    var now = nowMs();
    var last = 0;
    try {
        if (stored.has(WORLD_LAST_NATURAL)) last = num(stored.get(WORLD_LAST_NATURAL), 0);
    } catch (e2) {}

    /* First boot: wait a full interval before first natural spawn. */
    if (last <= 0) {
        try { stored.put(WORLD_LAST_NATURAL, "" + now); } catch (e3) {}
        return;
    }
    if (now - last < NATURAL_SPAWN_INTERVAL_MS) return;

    /* Single-flight lock so multiple players don't multi-spawn. */
    try {
        var lockAt = 0;
        if (stored.has(WORLD_NATURAL_LOCK)) lockAt = num(stored.get(WORLD_NATURAL_LOCK), 0);
        if (now - lockAt < 8000) return;
        stored.put(WORLD_NATURAL_LOCK, "" + now);
    } catch (e4) { return; }

    var powerPlayer = strongestPlayerInEnd(world) || player;
    var result = spawnScaledDragon(world, powerPlayer, "natural",
        NATURAL_SPAWN_X, NATURAL_SPAWN_Y, NATURAL_SPAWN_Z);
    try { stored.put(WORLD_LAST_NATURAL, "" + now); } catch (e5) {}

    if (result != null) {
        broadcastOnce(world, "end.strength.naturalAnnounce." + now,
            COLOR + "5[The End] " + COLOR + "cAn Ender Dragon has appeared! " +
            COLOR + "8(" + Math.floor(result.hp / 1000) + "k HP / " +
            Math.floor(result.defense / 1000) + "k DEF, scaled to " +
            result.power.name + ")");
    }
}

function cmdSpawnDragon(player) {
    if (!isPlayer(player)) return;
    var world = getEndWorld();
    if (world == null) {
        msg(player, COLOR + "c[The End] Could not find The End world.");
        return;
    }

    var existing = findDragons(world);
    if (existing.length > 0) {
        msg(player, COLOR + "c[The End] A dragon is already alive.");
        return;
    }

    var x = NATURAL_SPAWN_X;
    var y = NATURAL_SPAWN_Y;
    var z = NATURAL_SPAWN_Z;
    try {
        if (isInTheEnd(player.getWorld())) {
            x = Math.floor(player.getX());
            y = Math.floor(player.getY() + 12);
            z = Math.floor(player.getZ());
        }
    } catch (e1) {}

    var result = spawnScaledDragon(world, player, "command", x, y, z);
    if (result == null) {
        msg(player, COLOR + "c[The End] Failed to spawn the dragon.");
        return;
    }

    msg(player, COLOR + "6[The End] " + COLOR + "eSpawned Ender Dragon with " +
        COLOR + "c" + result.hp + COLOR + "e HP / " +
        COLOR + "b" + result.defense + COLOR + "e DEF " +
        COLOR + "8(Lv" + result.power.level + " / player DEF " +
        Math.floor(result.power.defense) + ")");
    broadcastOnce(world, "end.strength.cmdAnnounce." + nowMs(),
        COLOR + "5[The End] " + COLOR + "d" + str(player.getName()) +
        COLOR + "7 summoned an Ender Dragon! " +
        COLOR + "8(" + Math.floor(result.hp / 1000) + "k HP / " +
        Math.floor(result.defense / 1000) + "k DEF)");
}

function findOnlinePlayer(name) {
    var wanted = str(name).toLowerCase();
    if (wanted === "") return null;
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var w = 0; w < worlds.length; w++) {
            var players = worlds[w].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                if (str(players[p].getName()).toLowerCase() === wanted) return players[p];
            }
        }
    } catch (e) {}
    return null;
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

        /* Clear podium egg after a recent kill. */
        try {
            if (temp.has(TEMP_EGG_CLEAR)) {
                var left = num(temp.get(TEMP_EGG_CLEAR), 0);
                if (left > 0) {
                    clearDragonEggBlocks(world);
                    left--;
                    if (left <= 0) temp.remove(TEMP_EGG_CLEAR);
                    else temp.put(TEMP_EGG_CLEAR, "" + left);
                } else temp.remove(TEMP_EGG_CLEAR);
            }
        } catch (eClear) {}

        /* Keep destroying End Crystals for a few ticks after dragon death. */
        try {
            if (temp.has(TEMP_CRYSTAL_CLEAR)) {
                var cLeft = num(temp.get(TEMP_CRYSTAL_CLEAR), 0);
                if (cLeft > 0) {
                    clearEndCrystals(getEndWorld() || world);
                    cLeft--;
                    if (cLeft <= 0) temp.remove(TEMP_CRYSTAL_CLEAR);
                    else temp.put(TEMP_CRYSTAL_CLEAR, "" + cLeft);
                } else temp.remove(TEMP_CRYSTAL_CLEAR);
            }
        } catch (eCrystal) {}

        /* Natural spawn check (throttled per player, locked world-wide). */
        try {
            var lastNat = 0;
            if (temp.has(TEMP_NATURAL)) lastNat = num(temp.get(TEMP_NATURAL), 0);
            if (t - lastNat >= NATURAL_CHECK_MS) {
                temp.put(TEMP_NATURAL, "" + t);
                tryNaturalDragonSpawn(player);
            }
        } catch (eNat) {}

        /* Buff a dragon that appeared after a delayed fight spawn. */
        try { applyPendingDragonBuff(getEndWorld() || world, player); } catch (ePend) {}

        var last = 0;
        try { if (temp.has(TEMP_SCAN)) last = num(temp.get(TEMP_SCAN), 0); } catch (e1) {}
        if (t - last < SCAN_INTERVAL_MS) return;
        try { temp.put(TEMP_SCAN, "" + t); } catch (e2) {}

        var list = null;
        try {
            if (SCAN_RADIUS < 0) list = world.getAllEntities(-1);
            else {
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
            try {
                var ent = list[i];
                var kind = classifyEndEntity(ent);
                if (kind === "dragon") {
                    maybeRescaleDragon(ent, world, player);
                } else if (kind != null) {
                    buffMob(ent, world);
                }
            } catch (e5) {}
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
        if (classifyEndEntity(victim) !== "dragon") return;

        /* Reset natural spawn timer so next dragon waits the full interval. */
        try {
            var endWorld = getEndWorld() || player.getWorld();
            if (endWorld != null) {
                endWorld.getStoreddata().put(WORLD_LAST_NATURAL, "" + nowMs());
            }
        } catch (e1) {}

        claimEggReward(player, victim);
        scheduleCrystalClear(player);
    } catch (error) {
        try { print("[EndStrength] kill: " + error); } catch (e) {}
    }
}

/*
 * Apply stored DMZ-style defense when players hit the dragon or End mobs.
 * CustomNPCs damagedEntity is LivingHurt RAW damage — we rewrite event.damage
 * to the post-mitigation amount before it continues.
 * Virtual HP absorbs mitigated damage; vanilla max-health is left alone so
 * Enderman teleport AI and dragon fight phases keep working.
 */
function damagedEntity(event) {
    try {
        var target = event.target;
        if (target == null) return;
        var kind = classifyEndEntity(target);
        if (kind == null) return;

        var isDragon = kind === "dragon";
        if (isDragon && DRAGON_DEF_ENABLED !== true) return;
        if (!isDragon && END_MOB_DEF_ENABLED !== true) return;

        var raw = Number(event.damage);
        if (isNaN(raw) || !isFinite(raw) || raw <= 0) return;

        var def = readEntityDefense(target);
        if (!(def > 0) || (VHP_ENABLED === true && readVirtualMax(target) <= 0)) {
            try {
                var world = target.getWorld();
                if (isDragon) {
                    var powerPlayer = strongestPlayerInEnd(world);
                    if (powerPlayer == null && isPlayer(event.player)) powerPlayer = event.player;
                    if (powerPlayer != null) {
                        applyDragonStats(target, readPlayerPower(powerPlayer), "onhit");
                        def = readEntityDefense(target);
                    }
                } else {
                    buffMob(target, world);
                    def = readEntityDefense(target);
                }
            } catch (e1) {}
        }
        if (!(def > 0)) return;

        var minFrac = isDragon ? DRAGON_MIN_DAMAGE_FRACTION : END_MOB_MIN_DAMAGE_FRACTION;
        var mitOpts = isDragon
            ? { flatAbsorb: END_FLAT_ABSORB_FRAC, reductionCap: END_REDUCTION_CAP, defScale: END_DEF_SCALE, useConfigBoost: true }
            : { flatAbsorb: END_MOB_FLAT_ABSORB_FRAC, reductionCap: END_MOB_REDUCTION_CAP, defScale: END_MOB_DEF_SCALE, useConfigBoost: false };
        var mitigated = mitigateWithDmzDefense(raw, def, minFrac, mitOpts);

        if (VHP_ENABLED === true && readVirtualMax(target) > 0) {
            var vhp = readVirtualHp(target);
            var vmax = readVirtualMax(target);
            if (!(vhp >= 0)) vhp = vmax;
            /* Always chip at least a meaningful fraction of raw into the pool. */
            if (!(mitigated > 0)) mitigated = raw * minFrac;
            var next = vhp - mitigated;
            if (next > 0) {
                storeVirtualHp(target, next);
                /* Re-assert stored value so a failed NBT write can't soft-lock immortality. */
                var check = readVirtualHp(target);
                if (check > next + 1) storeVirtualHp(target, next);
                syncVanillaHealthFromVirtual(target, next, vmax, kind);
                event.damage = 0;
                return;
            }
            /* Virtual pool depleted — allow a killing blow. */
            storeVirtualHp(target, 0);
            var shellHp = Math.max(1, getEntityHealthSafe(target));
            event.damage = Math.max(mitigated, shellHp + 1000);
            return;
        }

        event.damage = mitigated;
    } catch (error) {
        try { print("[EndStrength] damagedEntity: " + error); } catch (e) {}
    }
}

function trigger(event) {
    try {
        if (event == null || event.id != TRIGGER_ID) return;

        var playerName = "";
        try {
            if (event.arguments != null && event.arguments.length > 0) {
                playerName = str(event.arguments[0]);
            }
        } catch (e1) {}
        try {
            if (playerName === "" && event.args != null && event.args.length > 0) {
                playerName = str(event.args[0]);
            }
        } catch (e2) {}

        var player = findOnlinePlayer(playerName);
        if (player == null) {
            try {
                if (event.entity != null && isPlayer(event.entity)) player = event.entity;
            } catch (e3) {}
        }
        if (player == null) {
            try { print("[EndStrength] trigger 50: player not found (" + playerName + ")"); } catch (e4) {}
            return;
        }

        cmdSpawnDragon(player);
    } catch (error) {
        try { print("[EndStrength] trigger: " + error); } catch (e) {}
    }
}

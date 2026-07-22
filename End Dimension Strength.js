/*
============================================================
 End Dimension Strength
 Version: 2.3.0

 - Stronger End mobs (high HP + DMZ defense, scaled to player power)
 - Ender Dragon + End mobs use DMZ defense mitigation
 - Ender Dragon starts at 200,000 HP and scales with player stats
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

/* Dragon base HP, then scaled by summoner / strongest End player stats. */
var DRAGON_BASE_HP = 500000;
var DRAGON_HP_PER_LEVEL = 5000;
var DRAGON_HP_PER_BP = 0.5;
var DRAGON_HP_PER_MELEE = 20;
var DRAGON_HP_PER_PLAYER_HP = 3.0;
var DRAGON_HP_CAP = 25000000;
var DRAGON_DAMAGE_BASE = 120;
var DRAGON_DAMAGE_PER_LEVEL = 2.5;

/*
 * Virtual DMZ defense (StatsData only exists on players).
 * DEF must track player melee or DMZ hits still 3–4 shot everything.
 */
var DRAGON_DEF_ENABLED = true;
var DRAGON_DEF_BASE = 200000;
var DRAGON_DEF_FROM_PLAYER = 5.0;
var DRAGON_DEF_FROM_MELEE = 2.5;
var DRAGON_DEF_PER_LEVEL = 2000;
var DRAGON_DEF_PER_BP = 0.2;
var DRAGON_DEF_CAP = 20000000;
var DRAGON_DEF_NBT = "end_strength_entity_def";
var DRAGON_MIN_DAMAGE_FRACTION = 0.005;

/*
 * End mob tiers — high floors, then scaled to nearby player power.
 */
var END_MOB_DEF_ENABLED = true;
var END_MOB_TIERS = {
    endermite: { tier: 1, hp: 250000,  damage: 40,  defense: 150000, label: "Endermite" },
    phantom:   { tier: 2, hp: 450000,  damage: 70,  defense: 250000, label: "Phantom" },
    enderman:  { tier: 3, hp: 800000,  damage: 100, defense: 450000, label: "Enderman" },
    shulker:   { tier: 4, hp: 1200000, damage: 80,  defense: 600000, label: "Shulker" }
};
var END_MOB_LEVEL_HP_PER_LEVEL = 2000;
var END_MOB_LEVEL_SCALE_CAP = 8.0;
var END_MOB_HP_FROM_MELEE = 12.0;
var END_MOB_HP_FROM_PLAYER_HP = 10.0;
var END_MOB_DEF_FROM_PLAYER = 5.0;
var END_MOB_DEF_FROM_MELEE = 3.0;
var END_MOB_DEF_PER_LEVEL = 1000;
var END_MOB_DEF_SCALE_CAP = 15.0;
var END_MOB_MIN_DAMAGE_FRACTION = 0.005;

/* Harder mitigation than default DMZ PvP for End content. */
var END_FLAT_ABSORB_FRAC = 0.60;
var END_REDUCTION_CAP = 0.97;
var END_DEF_SCALE = 6.0;

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
var BUFF_TAG = "end_strength_v3";
var TEMP_SCAN = "end.strength.scan";
var TEMP_EGG_CLEAR = "end.strength.eggClear";
var TEMP_CRYSTAL_CLEAR = "end.strength.crystalClear";
var TEMP_NATURAL = "end.strength.naturalCheck";
var WORLD_EGG_LOCK = "end.strength.eggClaimed.";
var WORLD_LAST_NATURAL = "end.strength.lastNaturalSpawn";
var WORLD_NATURAL_LOCK = "end.strength.naturalLock";
var WORLD_ANNOUNCE_LOCK = "end.strength.announce.";

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
        + power.melee * DRAGON_HP_PER_MELEE
        + power.maxHp * DRAGON_HP_PER_PLAYER_HP;
    if (hp < DRAGON_BASE_HP) hp = DRAGON_BASE_HP;
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
    if (def > DRAGON_DEF_CAP) def = DRAGON_DEF_CAP;
    return Math.floor(def);
}

/*
 * Port of DMZ StatsData.calculatePostMitigationDamage core math,
 * with End-specific harder absorb/reduction caps.
 */
function mitigateWithDmzDefense(rawDamage, defense, minFraction) {
    var raw = Math.max(0, num(rawDamage, 0));
    var def = Math.max(0, num(defense, 0));
    var minFrac = num(minFraction, DRAGON_MIN_DAMAGE_FRACTION);
    if (minFrac < 0) minFrac = 0;
    if (minFrac > 0.5) minFrac = 0.5;
    if (!(raw > 0)) return 0;
    if (!(def > 0)) return raw;

    var flatMaxFrac = END_FLAT_ABSORB_FRAC;
    var defScale = END_DEF_SCALE;
    var reductionCap = END_REDUCTION_CAP;
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

function setAbsoluteHealth(entity, targetHp) {
    targetHp = Math.max(1, Math.floor(num(targetHp, 1)));
    try {
        entity.setMaxHealth(targetHp);
        entity.setHealth(targetHp);
        return true;
    } catch (e) {
        try {
            var mc = entity.getMCEntity();
            var Attributes = Java.type("net.minecraft.world.entity.ai.attributes.Attributes");
            var attr = null;
            try { attr = mc.getAttribute(Attributes.MAX_HEALTH); } catch (e1) {
                try { attr = mc.m_21051_(Attributes.f_22276_); } catch (e2) {}
            }
            if (attr == null) return false;
            attr.setBaseValue(targetHp);
            try { mc.setHealth(targetHp); } catch (e3) {
                try { mc.m_21153_(targetHp); } catch (e4) {}
            }
            return true;
        } catch (e5) {
            return false;
        }
    }
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
            var score = p.level * 1000 + p.defense + p.bp * 0.01;
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
    var floorFromMelee = num(power.melee, 0) * END_MOB_DEF_FROM_MELEE;
    if (def < floorFromMelee) def = floorFromMelee;
    if (def < base) def = base;
    var maxDef = base * END_MOB_DEF_SCALE_CAP
        + num(power.defense, 0) * END_MOB_DEF_FROM_PLAYER
        + num(power.melee, 0) * END_MOB_DEF_FROM_MELEE * 2;
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
    return Math.floor(hp);
}

function buffMob(entity, world) {
    var kind = classifyEndEntity(entity);
    if (kind == null || kind === "dragon") return false;
    var tier = END_MOB_TIERS[kind];
    if (tier == null) return false;

    /* Re-buff if old tag / missing DEF so v3 stats always apply. */
    var needsBuff = !alreadyBuffed(entity) || !(readEntityDefense(entity) > 0);
    if (!needsBuff) return false;

    var power = nearbyPlayerPower(entity, world);
    var hp = calcMobHp(tier, power);
    var dmg = Math.floor(tier.damage * Math.min(4.0, 1 + power.level / 100));
    var def = calcMobDefense(tier, power);

    markBuffed(entity, kind + ":t" + tier.tier + ":hp" + hp + ":def" + def);
    setAbsoluteHealth(entity, hp);
    setAttackDamage(entity, dmg);
    if (END_MOB_DEF_ENABLED === true) storeEntityDefense(entity, def);
    return true;
}

function applyDragonStats(entity, power, sourceLabel) {
    var hp = calcDragonHp(power);
    var dmg = calcDragonDamage(power);
    var def = calcDragonDefense(power);
    markBuffed(entity, "dragon:" + sourceLabel + ":hp" + hp + ":def" + def);
    setAbsoluteHealth(entity, hp);
    setAttackDamage(entity, dmg);
    storeEntityDefense(entity, def);
    try {
        entity.setName(COLOR + "cEnder Dragon " + COLOR + "8[Lv" + power.level +
            " / " + Math.floor(hp / 1000) + "k HP / DEF " + Math.floor(def / 1000) + "k]");
    } catch (e) {}
    return { hp: hp, damage: dmg, defense: def };
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

function spawnDragonEntity(world, x, y, z) {
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
            /* Re-find shortly after summon */
            var dragons = findDragons(world);
            if (dragons.length > 0) return dragons[dragons.length - 1];
        } catch (e4) {}
    }
    return null;
}

function spawnScaledDragon(world, powerPlayer, sourceLabel, x, y, z) {
    if (world == null) return null;
    var existing = findDragons(world);
    if (existing.length > 0) return null;

    var power = readPlayerPower(powerPlayer);
    var dragon = spawnDragonEntity(world, x, y, z);
    if (dragon == null) {
        /* Command summon may lag one tick; scan again */
        existing = findDragons(world);
        if (existing.length > 0) dragon = existing[0];
    }
    if (dragon == null) return null;

    var stats = applyDragonStats(dragon, power, sourceLabel);
    return {
        dragon: dragon,
        hp: stats.hp,
        defense: stats.defense,
        power: power
    };
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
        /* Keep existing dragons scaled if somehow unbuffed. */
        for (var d = 0; d < dragons.length; d++) {
            if (!alreadyBuffed(dragons[d])) {
                var powerPlayer = strongestPlayerInEnd(world) || player;
                applyDragonStats(dragons[d], readPlayerPower(powerPlayer), "existing");
            }
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
                    if (!alreadyBuffed(ent) || !(readEntityDefense(ent) > 0)) {
                        applyDragonStats(ent, readPlayerPower(strongestPlayerInEnd(world) || player), "scan");
                    }
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
        if (!(def > 0)) {
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
        event.damage = mitigateWithDmzDefense(raw, def, minFrac);
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

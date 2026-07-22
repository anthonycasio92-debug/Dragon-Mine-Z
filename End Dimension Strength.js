/*
============================================================
 End Dimension Strength
 Version: 2.6.0

 - End mobs/dragon use REAL vanilla max_health (DMZ uncaps generic.max_health)
 - DMZ StatsData is player-only — mobs cannot use DMZ HP capability
 - DEF mitigation still applied on hit; damage actually chips the health bar
 - Dragon spawned via EndDragonFight (not orphan /summon)
 - Dragon HP targets ~200–300 matched hits (derived from mitigation)
 - End mobs target ~10–22 matched hits
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
 * Dragon virtual HP/DEF — sized for ~200–300 matched melee hits.
 * HP = playerMelee * targetHits * expectedPostMitigationFraction
 * so the fight length stays stable as player power grows.
 */
var DRAGON_BASE_HP = 400000;
var DRAGON_HP_PER_LEVEL = 1500;
var DRAGON_HP_PER_BP = 0.15;
var DRAGON_HP_FROM_PLAYER_HP = 2.0;
var DRAGON_HP_CAP = 40000000;
var DRAGON_DAMAGE_BASE = 120;
var DRAGON_DAMAGE_PER_LEVEL = 2.5;
var DRAGON_MIN_HITS = 200;
var DRAGON_TARGET_HITS = 250;
var DRAGON_MAX_HITS = 300;

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
 * REAL vanilla health — DMZ GenericAttributes raises minecraft:generic.max_health
 * to Float.MAX, so multi-million HP works on LivingEntities.
 * StatsData / DMZ HP capability attaches to players ONLY, so End mobs/dragon
 * cannot use DMZ health; they use Attributes.MAX_HEALTH instead.
 * Virtual HP nameplates are disabled.
 */
var USE_REAL_VANILLA_HEALTH = true;
var VHP_ENABLED = false;
var SHOW_VIRTUAL_HP_NAME = false;
var END_STRENGTH_HEALTH_MOD_UUID = "e5d57e10-6c3a-4f2b-9a11-end57ren9th1";
var END_STRENGTH_HEALTH_MOD_NAME = "End Strength Health";

/* Enderman melee attribute — keep modest so pathing/teleport AI stays sane. */
var ENDERMAN_ATTACK_DAMAGE = 12;

/*
 * End mob tiers — short fights; HP is real vanilla max_health.
 * Sized from nearby player melee × hit-target × post-mitigation fraction.
 */
var END_MOB_DEF_ENABLED = true;
var END_MOB_TIERS = {
    endermite: { tier: 1, hp: 10000, damage: 40, defense: 2000, hits: 10, label: "Endermite" },
    phantom:   { tier: 2, hp: 16000, damage: 70, defense: 4000, hits: 14, label: "Phantom" },
    enderman:  { tier: 3, hp: 28000, damage: 12, defense: 7000, hits: 18, label: "Enderman" },
    shulker:   { tier: 4, hp: 40000, damage: 80, defense: 9000, hits: 22, label: "Shulker" }
};
var END_MOB_LEVEL_HP_PER_LEVEL = 200;
var END_MOB_DEF_FROM_PLAYER = 0.25;
var END_MOB_DEF_FROM_MELEE = 0.20;
var END_MOB_DEF_PER_LEVEL = 50;
var END_MOB_DEF_SCALE_CAP = 3.0;
var END_MOB_MIN_DAMAGE_FRACTION = 0.05;
var END_MOB_HIT_BAND = 0.25; /* allow ±25% around tier hit target */

/* Dragon mitigation — harder than End mobs, but still finishable. */
var END_FLAT_ABSORB_FRAC = 0.45;
var END_REDUCTION_CAP = 0.88;
var END_DEF_SCALE = 15.0;

/* End-mob mitigation (light — trash packs must die quickly). */
var END_MOB_FLAT_ABSORB_FRAC = 0.25;
var END_MOB_REDUCTION_CAP = 0.65;
var END_MOB_DEF_SCALE = 40.0;

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
var BUFF_TAG = "end_strength_v11";
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

/*
 * Expected fraction of raw melee that lands on the dragon when DEF is
 * high enough to hit the reduction cap (the usual End-fight case).
 * Used to size virtual HP for a stable hit-count target.
 */
function expectedDragonThroughFraction() {
    var absorb = num(END_FLAT_ABSORB_FRAC, 0.45);
    if (absorb < 0) absorb = 0;
    if (absorb > 0.95) absorb = 0.95;
    var cap = num(END_REDUCTION_CAP, 0.88);
    if (cap < 0) cap = 0;
    if (cap > 0.99) cap = 0.99;
    var through = (1.0 - absorb) * (1.0 - cap);
    var minFrac = num(DRAGON_MIN_DAMAGE_FRACTION, 0.015);
    if (through < minFrac) through = minFrac;
    if (through < 0.01) through = 0.01;
    return through;
}

function calcDragonHp(power) {
    var melee = num(power.melee, 0);
    var through = expectedDragonThroughFraction();
    var bonus = power.level * DRAGON_HP_PER_LEVEL
        + power.bp * DRAGON_HP_PER_BP
        + num(power.maxHp, 0) * DRAGON_HP_FROM_PLAYER_HP;

    var hp;
    if (melee > 0) {
        /* Primary: ~250 matched hits; clamp into the 200–300 band. */
        var targetHp = melee * DRAGON_TARGET_HITS * through;
        var minHp = melee * DRAGON_MIN_HITS * through;
        var maxHp = melee * DRAGON_MAX_HITS * through;
        hp = targetHp + bonus * 0.25;
        if (hp < minHp) hp = minHp;
        if (hp > maxHp) hp = maxHp;
    } else {
        hp = DRAGON_BASE_HP + bonus;
    }

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

/*
 * DMZ GenericAttributes already raises generic.max_health to Float.MAX.
 * Re-assert via mixin accessor / reflection in case load order differs.
 */
function ensureMaxHealthAttributeUncapped() {
    try {
        var ForgeRegistries = Java.type("net.minecraftforge.registries.ForgeRegistries");
        var ResourceLocation = Java.type("net.minecraft.resources.ResourceLocation");
        var attr = ForgeRegistries.ATTRIBUTES.getValue(ResourceLocation.parse("minecraft:generic.max_health"));
        if (attr == null) {
            try { attr = ForgeRegistries.ATTRIBUTES.getValue(new ResourceLocation("minecraft", "generic.max_health")); } catch (e0) {}
        }
        if (attr == null) return false;
        var RangedAttributeMixin = Java.type("com.dragonminez.mixin.common.RangedAttributeMixin");
        if (RangedAttributeMixin != null && RangedAttributeMixin.class.isInstance(attr)) {
            RangedAttributeMixin.class.cast(attr).setMaxValue(3.4028234663852886E38);
            return true;
        }
    } catch (e1) {}
    try {
        var Attributes = Java.type("net.minecraft.world.entity.ai.attributes.Attributes");
        var attr2 = Attributes.MAX_HEALTH;
        var f = null;
        try { f = attr2.getClass().getDeclaredField("maxValue"); } catch (e2) {
            try { f = attr2.getClass().getDeclaredField("f_22308_"); } catch (e3) {}
        }
        if (f != null) {
            f.setAccessible(true);
            f.setDouble(attr2, 3.4028234663852886E38);
            return true;
        }
    } catch (e4) {}
    return false;
}

function getMaxHealthAttributeInstance(entity) {
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return null;
        var Attributes = Java.type("net.minecraft.world.entity.ai.attributes.Attributes");
        try { return mc.getAttribute(Attributes.MAX_HEALTH); } catch (e1) {
            try { return mc.m_21051_(Attributes.f_22276_); } catch (e2) {}
        }
    } catch (e3) {}
    return null;
}

function applyRealMaxHealth(entity, targetHp) {
    targetHp = Math.max(1, Math.floor(num(targetHp, 1)));
    ensureMaxHealthAttributeUncapped();

    /* Prefer AttributeModifier (same pattern DMZ uses for player HP). */
    try {
        var attr = getMaxHealthAttributeInstance(entity);
        if (attr != null) {
            var UUID = Java.type("java.util.UUID");
            var AttributeModifier = Java.type("net.minecraft.world.entity.ai.attributes.AttributeModifier");
            var Operation = Java.type("net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation");
            var uuid = UUID.fromString(END_STRENGTH_HEALTH_MOD_UUID);
            try { attr.removeModifier(uuid); } catch (e1) {
                try { attr.m_22127_(uuid); } catch (e2) {}
            }
            /* Keep a sane vanilla base, put End HP on the modifier. */
            try { attr.setBaseValue(20.0); } catch (e3) {}
            var bonus = Math.max(0, targetHp - 20.0);
            var mod = new AttributeModifier(uuid, END_STRENGTH_HEALTH_MOD_NAME, bonus, Operation.ADDITION);
            try { attr.addPermanentModifier(mod); } catch (e4) {
                try { attr.m_22125_(mod); } catch (e5) {
                    try { attr.addTransientModifier(mod); } catch (e6) {}
                }
            }
            setEntityHealthSafe(entity, targetHp);
            var applied = getEntityMaxHealthSafe(entity);
            if (applied + 1 >= targetHp) return true;
        }
    } catch (eMod) {}

    /* Fallback: set base value directly. */
    if (!setEntityMaxHealthSafe(entity, targetHp)) return false;
    setEntityHealthSafe(entity, targetHp);
    return getEntityMaxHealthSafe(entity) + 1 >= targetHp;
}

/*
 * Set real vanilla max_health. DMZ uncaps the attribute, so large values work
 * and the normal health / dragon boss bar updates as damage lands.
 */
function setAbsoluteHealth(entity, targetHp, kind) {
    targetHp = Math.max(1, Math.floor(num(targetHp, 1)));
    if (USE_REAL_VANILLA_HEALTH === true || VHP_ENABLED !== true) {
        return applyRealMaxHealth(entity, targetHp);
    }
    /* Legacy virtual path kept disabled by default. */
    return applyRealMaxHealth(entity, targetHp);
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

function formatHpLabel(hp) {
    hp = Math.max(0, Math.floor(num(hp, 0)));
    if (hp >= 1000000) return (Math.floor(hp / 100000) / 10) + "M";
    if (hp >= 1000) return Math.floor(hp / 1000) + "k";
    return "" + hp;
}

function updateDragonName(entity, power, hp, def) {
    try {
        entity.setName(COLOR + "cEnder Dragon " + COLOR + "8[Lv" +
            (power != null ? power.level : 1) + " / " + formatHpLabel(hp) +
            " HP / DEF " + formatHpLabel(def) + "]");
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

function expectedMobThroughFraction() {
    var absorb = num(END_MOB_FLAT_ABSORB_FRAC, 0.25);
    if (absorb < 0) absorb = 0;
    if (absorb > 0.95) absorb = 0.95;
    var cap = num(END_MOB_REDUCTION_CAP, 0.65);
    if (cap < 0) cap = 0;
    if (cap > 0.99) cap = 0.99;
    var through = (1.0 - absorb) * (1.0 - cap);
    var minFrac = num(END_MOB_MIN_DAMAGE_FRACTION, 0.05);
    if (through < minFrac) through = minFrac;
    if (through < 0.02) through = 0.02;
    return through;
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
    /* Keep DEF well below nearby melee so trash dies in a short burst. */
    var meleeCap = num(power.melee, 0) * 0.45 + base;
    if (meleeCap > base && maxDef > meleeCap) maxDef = meleeCap;
    if (def > maxDef) def = maxDef;
    return Math.floor(def);
}

function calcMobHp(tier, power) {
    var base = num(tier.hp, 1);
    var targetHits = Math.max(3, num(tier.hits, 10));
    var melee = num(power.melee, 0);
    var through = expectedMobThroughFraction();
    var bonus = num(power.level, 1) * END_MOB_LEVEL_HP_PER_LEVEL * (num(tier.tier, 1) / 2.0);

    var hp;
    if (melee > 0) {
        var targetHp = melee * targetHits * through;
        var minHp = melee * targetHits * (1.0 - END_MOB_HIT_BAND) * through;
        var maxHp = melee * targetHits * (1.0 + END_MOB_HIT_BAND) * through;
        hp = targetHp + bonus * 0.15;
        if (hp < minHp) hp = minHp;
        if (hp > maxHp) hp = maxHp;
    } else {
        hp = base + bonus;
    }

    if (hp < base) hp = base;
    return Math.floor(hp);
}

function buffMob(entity, world) {
    var kind = classifyEndEntity(entity);
    if (kind == null || kind === "dragon") return false;
    var tier = END_MOB_TIERS[kind];
    if (tier == null) return false;

    /*
     * Buff once per entity. Do NOT re-apply every scan — that heal/reset
     * loop breaks Enderman AI.
     */
    var needsBuff = !alreadyBuffed(entity) || !(readEntityDefense(entity) > 0);
    if (!needsBuff) return false;

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
    var prevMax = getEntityMaxHealthSafe(entity);
    var prevHp = getEntityHealthSafe(entity);
    var newCurrent = hp;

    /* Mid-fight rescale: keep remaining % when raising the pool. */
    if (prevMax > 20 && prevHp > 0 && (sourceLabel === "rescale" || sourceLabel === "onhit") && alreadyBuffed(entity)) {
        var ratio = prevHp / prevMax;
        if (!(ratio >= 0)) ratio = 1;
        if (ratio > 1) ratio = 1;
        if (hp > prevMax) {
            newCurrent = Math.max(1, Math.floor(hp * ratio));
            newCurrent = Math.max(newCurrent, prevHp + (hp - prevMax));
        } else if (hp < prevMax * 0.8) {
            /* Balance nerf / rebuff — apply new max, keep ratio. */
            newCurrent = Math.max(1, Math.floor(hp * ratio));
        } else {
            newCurrent = prevHp;
            hp = prevMax;
        }
        if (newCurrent > hp) newCurrent = hp;
        ensureMaxHealthAttributeUncapped();
        applyRealMaxHealth(entity, hp);
        setEntityHealthSafe(entity, newCurrent);
    } else {
        setAbsoluteHealth(entity, hp, "dragon");
        newCurrent = hp;
    }

    markBuffed(entity, "dragon:" + sourceLabel + ":hp" + hp + ":def" + def);
    storeEntityDefense(entity, def);
    updateDragonName(entity, power, hp, def);
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
    var curMax = getEntityMaxHealthSafe(entity);
    var curDef = readEntityDefense(entity);

    var needs = !alreadyBuffed(entity)
        || !(curDef > 0)
        || desiredHp > curMax + 1000
        || desiredDef > curDef + 1000
        || (curMax > 0 && curMax > desiredHp * 1.25 + 1000);
    if (!needs) return false;
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
 * to the post-mitigation amount. With real vanilla HP (DMZ-uncapped), that
 * mitigated value actually chips the health / boss bar.
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
        var mitOpts = isDragon
            ? { flatAbsorb: END_FLAT_ABSORB_FRAC, reductionCap: END_REDUCTION_CAP, defScale: END_DEF_SCALE, useConfigBoost: true }
            : { flatAbsorb: END_MOB_FLAT_ABSORB_FRAC, reductionCap: END_MOB_REDUCTION_CAP, defScale: END_MOB_DEF_SCALE, useConfigBoost: false };
        var mitigated = mitigateWithDmzDefense(raw, def, minFrac, mitOpts);
        if (!(mitigated > 0)) mitigated = raw * minFrac;

        /* Real HP path: let mitigated damage reduce vanilla health / boss bar. */
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

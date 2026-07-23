/*
============================================================
 End Dimension Strength
 Version: 2.10.0

 DESIGN (why this exists):
 - DMZ StatsData / DMZ HP attaches to PLAYERS ONLY. Mobs/dragon cannot hold
   real DMZ health capability, so we MIRROR the strongest End player's DMZ
   HP + DEF onto the entity:
     • vanilla max_health = TP-safe mapped copy of player DMZ maxHealth
     • NBT defense     = strong DMZ-style DEF (this is the real toughness)
 - DMZ kill TP = entity.getMaxHealth() * tpHealthRatio (default 0.25) then
   TP boosts. Absurd vanilla HP → billions of TP. So HP stays modest and
   DEF carries the fight (flat absorb + % reduction like DMZ).
 - End kill TP is SETTLED with dampened BP scaling + per-mob level softcaps
   (e.g. ~200k enderman at level ~4000).
 - Per-hit damage caps remain as a safety net vs one-shot skills.
 - Dragon max_health is applied ONCE (spawn / real HP change only).

 FEATURES:
 - Dragon always scales DEF to the strongest End player; HP grows only when needed
 - Spawn prefers EndDragonFight; falls back to createEntity/summon if needed
 - Extra dragon attacks: ki beams + dragon-fireball breath
 - Clear "dragon already alive" notice on /enddragon when one exists
 - Dragon ~200–300 matched hits via DEF + hit caps (not multi-million HP)
 - End mobs ~10–22 matched hits
 - /enddragon spawn (trigger 50) + /cleardragons cleanup (trigger 51)
 - Natural dragon respawn every 5 minutes if none exists
 - Dragon Egg item reward (clears podium egg block)
 - End crystals destroyed after each dragon kill

 INSTALL (TWO scripts — this is what made trigger 50 work before):
   1) THIS file → Global Player, OWN tab
      events: tick, kill, trigger, damagedEntity
   2) EndDragon-Forge-Trigger.js → Global Forge Scripts, OWN tab
      event: trigger
      CNPC skips Player triggers for FakeOp/console; the Forge bridge
      forwards 50/51 to the named player's scripts.

 COMMANDS:
   noppes script trigger 50 <playerName>   # spawn dragon
   noppes script trigger 51 <playerName>   # kill all ender dragons

 CMI (EndDragon-Alias.yml):
   asOp! noppes script trigger 50/51 [playerName]
   (prefer asOp!; Forge bridge also covers asFakeOp/console)
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var ConfigManager = Java.type("com.dragonminez.common.config.ConfigManager");
var TpSource = null;
try { TpSource = Java.type("com.dragonminez.common.config.TpSource"); } catch (eTp) { TpSource = null; }

/* ========================= CONFIG ========================= */

var TRIGGER_SPAWN_ID = 50;
var TRIGGER_CLEANUP_ID = 51;
/* Back-compat alias */
var TRIGGER_ID = TRIGGER_SPAWN_ID;

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
 * Dragon HP — TP-safe vanilla max_health MIRRORED from player DMZ maxHealth.
 * Never copy raw multi-million DMZ HP onto the entity (that breaks kill TP).
 * Log-map player DMZ HP into [BASE .. CAP]. Toughness comes from DEF.
 */
var DRAGON_BASE_HP = 12000;
var DRAGON_HP_CAP = 28000; /* kill TP ≈ HP * 0.25 before boosts */
var DRAGON_HP_LOG_REF = 10000000; /* player DMZ HP that maps near the cap */
var DRAGON_DAMAGE_BASE = 120;
var DRAGON_DAMAGE_PER_LEVEL = 2.5;
var DRAGON_MIN_HITS = 200;
var DRAGON_TARGET_HITS = 250;
var DRAGON_MAX_HITS = 300;

/*
 * Dragon DEF — the real toughness. Scale ABOVE the strongest player's
 * DMZ defense / melee so mitigation (not absurd HP) carries the fight.
 */
var DRAGON_DEF_ENABLED = true;
var DRAGON_DEF_BASE = 50000;
var DRAGON_DEF_FROM_PLAYER = 2.25; /* × player DMZ defense */
var DRAGON_DEF_FROM_MELEE = 1.75;  /* × player melee — sits above threat */
var DRAGON_DEF_PER_LEVEL = 750;
var DRAGON_DEF_PER_BP = 0.15;
var DRAGON_DEF_CAP = 25000000;
var DRAGON_DEF_NBT = "end_strength_entity_def";
var DRAGON_MIN_DAMAGE_FRACTION = 0.008; /* tiny chip when DEF is winning */

/* Re-scale living dragons to the strongest End-dimension player. */
var DRAGON_ALWAYS_SCALE_TO_STRONGEST = true;
var DRAGON_RESCALE_MS = 3000;
var DRAGON_SCALE_SCORE_EPSILON = 0.01;

/*
 * Vanilla max_health on the entity (TP-safe). DMZ StatsData cannot attach
 * to mobs — we only mirror player DMZ HP into this attribute.
 */
var USE_REAL_VANILLA_HEALTH = true;
var VHP_ENABLED = false;
var SHOW_VIRTUAL_HP_NAME = false;
var END_STRENGTH_HEALTH_MOD_UUID = "e5d57e10-6c3a-4f2b-9a11-e0d57e1197b1";
var END_STRENGTH_HEALTH_MOD_NAME = "End Strength Health";
var END_STRENGTH_MAX_NBT = "end_strength_real_max";
var END_STRENGTH_HITS_NBT = "end_strength_hit_target";
var END_STRENGTH_DMZ_HP_NBT = "end_strength_dmz_hp_src"; /* player DMZ HP we mirrored from */

/*
 * Cap each hit to maxHealth / hitTarget so ki/skills/other systems cannot
 * delete an End mob or dragon in a handful of oversized packets.
 */
var END_DAMAGE_HIT_CAP_ENABLED = true;
var END_DAMAGE_HIT_CAP_MULT = 1.0; /* 1.0 => ~exact hit-target length */

/* Enderman melee attribute — keep modest so pathing/teleport AI stays sane. */
var ENDERMAN_ATTACK_DAMAGE = 12;

/*
 * End mob tiers — short fights.
 * hp/hpCap = TP-safe vanilla pools (mirrored from player DMZ HP).
 * defense  = base DEF; real DEF scales from player DMZ defense/melee.
 */
var END_MOB_DEF_ENABLED = true;
var END_MOB_TIERS = {
    endermite: { tier: 1, hp: 1200, damage: 40, defense: 5000,  hits: 10, label: "Endermite", hpCap: 2200 },
    phantom:   { tier: 2, hp: 1800, damage: 70, defense: 9000,  hits: 14, label: "Phantom",   hpCap: 3200 },
    enderman:  { tier: 3, hp: 2400, damage: 12, defense: 14000, hits: 18, label: "Enderman",  hpCap: 4200 },
    shulker:   { tier: 4, hp: 3200, damage: 80, defense: 18000, hits: 22, label: "Shulker",   hpCap: 5500 }
};
var END_MOB_HP_GLOBAL_CAP = 5500;
var END_MOB_DEF_FROM_PLAYER = 1.10;
var END_MOB_DEF_FROM_MELEE = 0.85;
var END_MOB_DEF_PER_LEVEL = 120;
var END_MOB_DEF_SCALE_CAP = 8.0; /* allow DEF to grow with the player */
var END_MOB_MIN_DAMAGE_FRACTION = 0.03;
var END_MOB_HIT_BAND = 0.25;

/* Dragon mitigation — DEF does the work (near DMZ reduction ceiling). */
var END_FLAT_ABSORB_FRAC = 0.55;
var END_REDUCTION_CAP = 0.92;
var END_DEF_SCALE = 12.0;

/* End-mob mitigation — tougher than before, still shorter than the dragon. */
var END_MOB_FLAT_ABSORB_FRAC = 0.35;
var END_MOB_REDUCTION_CAP = 0.80;
var END_MOB_DEF_SCALE = 20.0;

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
var BUFF_TAG = "end_strength_v15"; /* v15 = preserve dragon AI; clearer already-alive */
var TEMP_SCAN = "end.strength.scan";
var TEMP_EGG_CLEAR = "end.strength.eggClear";
var TEMP_CRYSTAL_CLEAR = "end.strength.crystalClear";
var TEMP_NATURAL = "end.strength.naturalCheck";
var TEMP_DRAGON_RESCALE = "end.strength.dragonRescale";
var TEMP_DRAGON_SCALE_SCORE = "end.strength.dragonScaleScore";
var TEMP_DRAGON_SCALE_NAME = "end.strength.dragonScaleName";
var WORLD_EGG_LOCK = "end.strength.eggClaimed.";
var WORLD_LAST_NATURAL = "end.strength.lastNaturalSpawn";
var WORLD_NATURAL_LOCK = "end.strength.naturalLock";
var WORLD_ANNOUNCE_LOCK = "end.strength.announce.";
var WORLD_PENDING_DRAGON_BUFF = "end.strength.pendingDragonBuff";
var WORLD_CMD_SPAWN_REQUEST = "end.strength.cmdSpawnRequest";
var TEMP_TP_CLAWBACK = "end.strength.tpClawback";
var TEMP_CMD_SPAWN_LOCK = "end.strength.cmdSpawnLock";
var TEMP_DRAGON_ATTACK = "end.strength.dragonAtk";

/*
 * End kill TP settle (Sparring-inspired, dampened + softcaps):
 * DMZ awards health-based kill TP first; we settle to:
 *   base * dampened BP multiplier * kill boosts, then softcap by level.
 *
 * Target (after boosts): level ~4000 enderman ≈ 200k TP.
 * Dragon / shulker sit above that; phantom / endermite below.
 */
var END_TP_SETTLE_ENABLED = true;
var END_TP_SETTLE_DELAY_TICKS = 6;
var END_TP_FAIR_DRAGON = 8000;
var END_TP_FAIR_MOB = {
    endermite: 1000,
    phantom: 1400,
    enderman: 2200,
    shulker: 3000
};
/* Sparring BP curve is for repeating payouts — keep only a slice of bonus. */
var END_TP_BP_DAMPEN = 0.12;
/*
 * Softcaps are the real mid-game brake. Values are final settled TP
 * (after BP dampen + kill boosts).
 */
var END_TP_SOFTCAP_BY_KIND = {
    dragon: [
        { level: 1000, cap: 280000 },
        { level: 2500, cap: 450000 },
        { level: 4000, cap: 650000 },
        { level: 7000, cap: 950000 },
        { level: 10000, cap: 1400000 },
        { level: 20000, cap: 2200000 }
    ],
    enderman: [
        { level: 1000, cap: 70000 },
        { level: 2500, cap: 130000 },
        { level: 4000, cap: 200000 },
        { level: 7000, cap: 320000 },
        { level: 10000, cap: 450000 },
        { level: 20000, cap: 700000 }
    ],
    shulker: [
        { level: 1000, cap: 90000 },
        { level: 2500, cap: 160000 },
        { level: 4000, cap: 260000 },
        { level: 7000, cap: 400000 },
        { level: 10000, cap: 560000 },
        { level: 20000, cap: 850000 }
    ],
    phantom: [
        { level: 1000, cap: 50000 },
        { level: 2500, cap: 95000 },
        { level: 4000, cap: 150000 },
        { level: 7000, cap: 240000 },
        { level: 10000, cap: 340000 },
        { level: 20000, cap: 520000 }
    ],
    endermite: [
        { level: 1000, cap: 35000 },
        { level: 2500, cap: 65000 },
        { level: 4000, cap: 100000 },
        { level: 7000, cap: 160000 },
        { level: 10000, cap: 230000 },
        { level: 20000, cap: 360000 }
    ]
};
var END_TP_SOFTCAP_DEFAULT_MAX = 1000000;

/* Extra scripted dragon attacks (on top of vanilla perch/charge AI). */
var DRAGON_EXTRA_ATTACKS_ENABLED = true;
var DRAGON_ATTACK_INTERVAL_MS = 3200;
var DRAGON_ATTACK_RANGE = 96;
var DRAGON_ATTACK_WORLD_LOCK = "end.strength.dragonAtkLock";
var DRAGON_KI_BEAM_CHANCE = 0.55; /* else breath fireball */
var DRAGON_KI_BEAM_DAMAGE = 14;   /* vanilla-scale chip; DMZ DEF still applies elsewhere */
var DRAGON_KI_BEAM_HITS = 3;      /* multi-tick beam pulses */
var DRAGON_BREATH_SPEED = 0.85;

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

/* CMI asFakeOp / Forge FakePlayer — type 1 but not a real online player. */
function isFakePlayerEntity(entity) {
    if (entity == null) return false;
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return false;
        var FakePlayer = Java.type("net.minecraftforge.common.util.FakePlayer");
        if (mc instanceof FakePlayer) return true;
    } catch (e1) {}
    try {
        var n = str(entity.getName()).toLowerCase();
        if (n.indexOf("fake") >= 0) return true;
        if (n.indexOf("[cmi]") >= 0) return true;
    } catch (e2) {}
    return false;
}

function isRealOnlinePlayer(entity) {
    return isPlayer(entity) && !isFakePlayerEntity(entity);
}

function getMinecraftServer() {
    try {
        var ServerLifecycleHooks = Java.type("net.minecraftforge.server.ServerLifecycleHooks");
        var server = ServerLifecycleHooks.getCurrentServer();
        if (server != null) return server;
    } catch (e1) {}
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            var level = getMcServerLevel(worlds[i]);
            if (level == null) continue;
            try {
                var s = level.getServer();
                if (s != null) return s;
            } catch (e2) {
                try {
                    var s2 = level.m_7654_();
                    if (s2 != null) return s2;
                } catch (e3) {}
            }
        }
    } catch (e4) {}
    return null;
}

function getEndServerLevel() {
    var server = getMinecraftServer();
    if (server == null) return null;

    var endLevel = null;
    try {
        var Level = Java.type("net.minecraft.world.level.Level");
        try { endLevel = server.getLevel(Level.END); } catch (e1) {
            try { endLevel = server.m_129880_(Level.END); } catch (e2) {
                try { endLevel = server.m_129880_(Level.f_46430_); } catch (e3) {}
            }
        }
    } catch (e4) {}

    if (endLevel == null) {
        try {
            var ResourceKey = Java.type("net.minecraft.resources.ResourceKey");
            var ResourceLocation = Java.type("net.minecraft.resources.ResourceLocation");
            var Registries = Java.type("net.minecraft.core.registries.Registries");
            var dimReg = null;
            try { dimReg = Registries.DIMENSION; } catch (e5) {
                try { dimReg = Registries.f_256787_; } catch (e6) {}
            }
            var loc = null;
            try { loc = ResourceLocation.parse("minecraft:the_end"); } catch (e7) {
                loc = new ResourceLocation("minecraft", "the_end");
            }
            var key = ResourceKey.create(dimReg, loc);
            try { endLevel = server.getLevel(key); } catch (e8) {
                try { endLevel = server.m_129880_(key); } catch (e9) {}
            }
        } catch (e10) {}
    }

    if (endLevel == null) {
        try {
            var all = server.getAllLevels();
            var it = all.iterator();
            while (it.hasNext()) {
                var lvl = it.next();
                try {
                    var dim = str(lvl.dimension().location()).toLowerCase();
                    if (dim === "minecraft:the_end" || dim.indexOf("the_end") >= 0) {
                        endLevel = lvl;
                        break;
                    }
                } catch (e11) {
                    try {
                        var dim2 = str(lvl.m_46472_().m_135782_()).toLowerCase();
                        if (dim2.indexOf("the_end") >= 0) { endLevel = lvl; break; }
                    } catch (e12) {}
                }
            }
        } catch (e13) {}
    }
    return endLevel;
}

function forceLoadEndChunks(endLevel) {
    if (endLevel == null) return false;
    var ok = false;
    try {
        var ChunkPos = Java.type("net.minecraft.world.level.ChunkPos");
        var TicketType = Java.type("net.minecraft.server.level.TicketType");
        var source = null;
        try { source = endLevel.getChunkSource(); } catch (e1) {
            try { source = endLevel.m_7726_(); } catch (e2) {}
        }
        if (source != null) {
            var centers = [
                new ChunkPos(0, 0),
                new ChunkPos(0, -1),
                new ChunkPos(-1, 0),
                new ChunkPos(-1, -1)
            ];
            for (var i = 0; i < centers.length; i++) {
                try {
                    source.addRegionTicket(TicketType.PLAYER, centers[i], 3, centers[i]);
                    ok = true;
                } catch (e3) {
                    try {
                        source.m_8387_(TicketType.f_9442_, centers[i], 3, centers[i]);
                        ok = true;
                    } catch (e4) {}
                }
            }
        }
    } catch (e5) {}

    try {
        var ChunkStatus = Java.type("net.minecraft.world.level.chunk.ChunkStatus");
        var full = null;
        try { full = ChunkStatus.FULL; } catch (e6) {
            try { full = ChunkStatus.f_62349_; } catch (e7) {}
        }
        var coords = [[0, 0], [0, -1], [-1, 0], [-1, -1], [1, 0], [0, 1]];
        for (var c = 0; c < coords.length; c++) {
            try {
                if (full != null) {
                    endLevel.getChunk(coords[c][0], coords[c][1], full, true);
                } else {
                    endLevel.getChunk(coords[c][0], coords[c][1]);
                }
                ok = true;
            } catch (e8) {
                try {
                    endLevel.m_6522_(coords[c][0], coords[c][1], full, true);
                    ok = true;
                } catch (e9) {
                    try { endLevel.m_6325_(coords[c][0], coords[c][1]); ok = true; } catch (e10) {}
                }
            }
        }
    } catch (e11) {}

    /* Also poke the dragon perch chunk. */
    try {
        var BlockPos = Java.type("net.minecraft.core.BlockPos");
        endLevel.getChunkAt(new BlockPos(0, 128, 0));
        ok = true;
    } catch (e12) {
        try {
            var BlockPos2 = Java.type("net.minecraft.core.BlockPos");
            endLevel.m_46739_(new BlockPos2(0, 128, 0));
            ok = true;
        } catch (e13) {}
    }
    return ok;
}

function wrapEndWorld(endLevel) {
    if (endLevel == null) return null;
    try {
        var wrapped = NpcAPI.Instance().getIWorld(endLevel);
        if (wrapped != null) return wrapped;
    } catch (e1) {}
    try {
        var wrapped2 = NpcAPI.Instance().getIWorld("minecraft:the_end");
        if (wrapped2 != null) return wrapped2;
    } catch (e2) {}
    try {
        var wrapped3 = NpcAPI.Instance().getIWorld("the_end");
        if (wrapped3 != null) return wrapped3;
    } catch (e3) {}
    return null;
}

function getEndWorldFromNpc() {
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

function getEndWorld() {
    try {
        var endLevel = getEndServerLevel();
        if (endLevel != null) {
            var wrapped = wrapEndWorld(endLevel);
            if (wrapped != null) return wrapped;
        }
    } catch (e0) {}
    return getEndWorldFromNpc();
}

/* Force-load The End so EndDragonFight exists even when nobody is there yet. */
function forceLoadEndWorld() {
    var endLevel = null;
    try { endLevel = getEndServerLevel(); } catch (e1) {}
    if (endLevel != null) {
        try { forceLoadEndChunks(endLevel); } catch (e2) {}
        var wrapped = wrapEndWorld(endLevel);
        if (wrapped != null) return wrapped;
    }
    return getEndWorld();
}

function setObjectField(obj, field, value) {
    if (obj == null || field == null) return false;
    try {
        field.setAccessible(true);
        field.set(obj, value);
        return true;
    } catch (e1) {}
    try {
        var Unsafe = Java.type("sun.misc.Unsafe");
        var uf = Unsafe.class.getDeclaredField("theUnsafe");
        uf.setAccessible(true);
        var unsafe = uf.get(null);
        var offset = unsafe.objectFieldOffset(field);
        unsafe.putObject(obj, offset, value);
        return true;
    } catch (e2) {}
    return false;
}

function readDragonFightFromLevel(endLevel) {
    if (endLevel == null) return null;

    var methodNames = ["getDragonFight", "m_8850_", "m_8596_", "dragonFight"];
    for (var i = 0; i < methodNames.length; i++) {
        try {
            var m = endLevel.getClass().getMethod(methodNames[i]);
            var fight = m.invoke(endLevel);
            if (fight != null) return fight;
        } catch (e1) {}
        try {
            var m2 = endLevel.getClass().getDeclaredMethod(methodNames[i]);
            m2.setAccessible(true);
            var fight2 = m2.invoke(endLevel);
            if (fight2 != null) return fight2;
        } catch (e2) {}
    }

    /* Scan methods whose return type is EndDragonFight. */
    try {
        var methods = endLevel.getClass().getMethods();
        for (var mi = 0; mi < methods.length; mi++) {
            try {
                var rt = str(methods[mi].getReturnType().getName());
                if (rt.indexOf("EndDragonFight") < 0) continue;
                if (methods[mi].getParameterCount() !== 0) continue;
                var f3 = methods[mi].invoke(endLevel);
                if (f3 != null) return f3;
            } catch (e3) {}
        }
    } catch (e4) {}

    /* Field scan. */
    try {
        var cls = endLevel.getClass();
        while (cls != null) {
            var fields = cls.getDeclaredFields();
            for (var fi = 0; fi < fields.length; fi++) {
                try {
                    var ft = str(fields[fi].getType().getName());
                    if (ft.indexOf("EndDragonFight") < 0) continue;
                    fields[fi].setAccessible(true);
                    var f4 = fields[fi].get(endLevel);
                    if (f4 != null) return f4;
                } catch (e5) {}
            }
            cls = cls.getSuperclass();
        }
    } catch (e6) {}
    return null;
}

function findDragonFightField(endLevel) {
    if (endLevel == null) return null;
    try {
        var cls = endLevel.getClass();
        while (cls != null) {
            var fields = cls.getDeclaredFields();
            for (var i = 0; i < fields.length; i++) {
                try {
                    var ft = str(fields[i].getType().getName());
                    if (ft.indexOf("EndDragonFight") >= 0) return fields[i];
                } catch (e1) {}
            }
            cls = cls.getSuperclass();
        }
    } catch (e2) {}
    return null;
}

function createEndDragonFightInstance(endLevel) {
    if (endLevel == null) return null;
    var EndDragonFight = null;
    try {
        EndDragonFight = Java.type("net.minecraft.world.level.dimension.end.EndDragonFight");
    } catch (e0) { return null; }

    var server = null;
    try { server = endLevel.getServer(); } catch (e1) {
        try { server = endLevel.m_7654_(); } catch (e2) {}
    }

    var seed = 0;
    try { seed = server.getWorldData().worldGenOptions().seed(); } catch (e3) {
        try { seed = endLevel.getSeed(); } catch (e4) {
            try { seed = endLevel.m_7328_(); } catch (e5) {}
        }
    }

    var data = null;
    try { data = server.getWorldData().endDragonFightData(); } catch (e6) {
        try { data = server.getWorldData().m_223722_(); } catch (e7) {}
    }
    if (data == null) {
        try {
            var Data = Java.type("net.minecraft.world.level.dimension.end.EndDragonFight$Data");
            try { data = Data.DEFAULT; } catch (e8) {
                try { data = Data.f_287647_; } catch (e9) {}
            }
        } catch (e10) {}
    }

    /* Prefer public constructors via reflection (Data vs CompoundTag across mappings). */
    try {
        var LongCls = Java.type("java.lang.Long");
        var seedObj = LongCls.valueOf(seed);
        var ctors = EndDragonFight.class.getConstructors();
        for (var i = 0; i < ctors.length; i++) {
            var ctor = ctors[i];
            var params = ctor.getParameterTypes();
            if (params.length !== 3) continue;
            try {
                var args = Java.to([endLevel, seedObj, data], "java.lang.Object[]");
                var made = ctor.newInstance(args);
                if (made != null) return made;
            } catch (e11) {
                try {
                    var made2 = ctor.newInstance(endLevel, seedObj, data);
                    if (made2 != null) return made2;
                } catch (e12) {
                    try {
                        var made3 = ctor.newInstance(endLevel, seed, data);
                        if (made3 != null) return made3;
                    } catch (e12b) {}
                }
            }
        }
    } catch (e13) {}

    try {
        return new EndDragonFight(endLevel, seed, data);
    } catch (e14) {
        try { print("[EndStrength] EndDragonFight ctor failed: " + e14); } catch (e15) {}
    }
    return null;
}

function attachDragonFightToLevel(endLevel, fight) {
    if (endLevel == null || fight == null) return false;
    var field = findDragonFightField(endLevel);
    if (field == null) return false;
    return setObjectField(endLevel, field, fight);
}

/*
 * Authoritative fight lookup: real End ServerLevel from the Minecraft server,
 * force-loaded island chunks, then get-or-create EndDragonFight.
 */
function getOrCreateEndDragonFight() {
    var endLevel = getEndServerLevel();
    if (endLevel == null) {
        try { print("[EndStrength] getEndServerLevel() returned null"); } catch (e0) {}
        return { fight: null, level: null, world: null };
    }

    try {
        var dimName = "?";
        try { dimName = str(endLevel.dimension().location()); } catch (eDim) {
            try { dimName = str(endLevel.m_46472_().m_135782_()); } catch (eDim2) {}
        }
        print("[EndStrength] End ServerLevel=" + endLevel.getClass().getName() + " dim=" + dimName);
    } catch (eLog) {}

    try { forceLoadEndChunks(endLevel); } catch (eChunk) {
        try { print("[EndStrength] forceLoadEndChunks error: " + eChunk); } catch (eChunk2) {}
    }

    var fight = readDragonFightFromLevel(endLevel);
    if (fight == null) {
        try { print("[EndStrength] EndDragonFight missing — creating and attaching one"); } catch (e1) {}
        fight = createEndDragonFightInstance(endLevel);
        if (fight != null) {
            var attached = attachDragonFightToLevel(endLevel, fight);
            try {
                print("[EndStrength] Created EndDragonFight attach=" + attached +
                    " class=" + fight.getClass().getName());
            } catch (e2) {}
            /* Re-read in case attach replaced/wrapped it. */
            var again = readDragonFightFromLevel(endLevel);
            if (again != null) fight = again;
        } else {
            try { print("[EndStrength] Failed to construct EndDragonFight"); } catch (e3) {}
        }
    } else {
        try { print("[EndStrength] EndDragonFight ready class=" + fight.getClass().getName()); } catch (eReady) {}
    }

    var world = wrapEndWorld(endLevel);
    if (world == null) {
        try { print("[EndStrength] CNPC IWorld wrap failed — will spawn via ServerLevel directly"); } catch (eW) {}
    }

    return {
        fight: fight,
        level: endLevel,
        world: world
    };
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

function powerScore(power) {
    if (power == null) return -1;
    return num(power.melee, 0) * 100
        + num(power.bp, 0)
        + num(power.level, 1) * 1000
        + num(power.maxHp, 0)
        + num(power.defense, 0);
}

function strongestPlayerInEnd(world) {
    var best = null;
    var bestScore = -1;
    if (world == null) world = getEndWorld();
    if (world == null) return null;
    try {
        var players = world.getAllPlayers();
        for (var i = 0; i < players.length; i++) {
            if (!isPlayer(players[i])) continue;
            /* Prefer players actually in The End. */
            try {
                if (!isInTheEnd(players[i].getWorld())) continue;
            } catch (e0) {}
            var p = readPlayerPower(players[i]);
            var score = powerScore(p);
            if (score > bestScore) {
                bestScore = score;
                best = players[i];
            }
        }
    } catch (e) {}
    return best;
}

function strongestPowerInEnd(world, fallbackPlayer) {
    var player = strongestPlayerInEnd(world);
    if (player == null) player = fallbackPlayer;
    return {
        player: player,
        power: readPlayerPower(player)
    };
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

/*
 * Map a player's (possibly huge) DMZ maxHealth into a TP-safe vanilla pool.
 * log10 progression: low DMZ HP → near base; huge DMZ HP → approaches cap.
 * Never copies raw multi-million values onto the entity attribute.
 */
function mapDmzHpToTpSafe(playerDmzHp, baseHp, capHp, logRef) {
    baseHp = Math.max(1, num(baseHp, 1));
    capHp = Math.max(baseHp, num(capHp, baseHp));
    logRef = Math.max(1000, num(logRef, DRAGON_HP_LOG_REF));
    var src = Math.max(20, num(playerDmzHp, 20));
    var t = Math.log(src / 20) / Math.log(logRef / 20);
    if (!(t >= 0)) t = 0;
    if (t > 1) t = 1;
    return Math.floor(baseHp + (capHp - baseHp) * t);
}

/*
 * Vanilla max_health mirrored from the strongest player's DMZ maxHealth.
 * Fight length is carried by DEF mitigation + hit caps, not by huge HP.
 */
function calcDragonHp(power) {
    return mapDmzHpToTpSafe(
        num(power != null ? power.maxHp : 20, 20),
        DRAGON_BASE_HP,
        DRAGON_HP_CAP,
        DRAGON_HP_LOG_REF
    );
}

function tpSafeHpCap(kind) {
    if (kind === "dragon") return DRAGON_HP_CAP;
    if (kind != null && END_MOB_TIERS[kind] != null) {
        var tierCap = num(END_MOB_TIERS[kind].hpCap, END_MOB_HP_GLOBAL_CAP);
        if (tierCap > END_MOB_HP_GLOBAL_CAP) tierCap = END_MOB_HP_GLOBAL_CAP;
        return tierCap;
    }
    return END_MOB_HP_GLOBAL_CAP;
}

function clampTpSafeHp(kind, hp) {
    hp = Math.max(1, Math.floor(num(hp, 1)));
    var cap = tpSafeHpCap(kind);
    if (hp > cap) hp = cap;
    return hp;
}

function calcDragonDamage(power) {
    var dmg = DRAGON_DAMAGE_BASE + power.level * DRAGON_DAMAGE_PER_LEVEL;
    if (dmg < DRAGON_DAMAGE_BASE) dmg = DRAGON_DAMAGE_BASE;
    return Math.floor(dmg);
}

function calcDragonDefense(power) {
    /*
     * DEF is the toughness layer. Track ABOVE the strongest player's DMZ
     * defense and melee so mitigation absorbs most hits without needing
     * multi-million HP (which breaks kill TP).
     */
    var playerDef = num(power != null ? power.defense : 0, 0);
    var melee = num(power != null ? power.melee : 0, 0);
    var level = num(power != null ? power.level : 1, 1);
    var bp = num(power != null ? power.bp : 0, 0);

    var fromPlayer = playerDef * DRAGON_DEF_FROM_PLAYER;
    var fromMelee = melee * DRAGON_DEF_FROM_MELEE;
    var def = Math.max(DRAGON_DEF_BASE, fromPlayer, fromMelee);
    def += level * DRAGON_DEF_PER_LEVEL + bp * DRAGON_DEF_PER_BP;

    /* Floor: at least 1.5× player melee so DEF usually wins the trade. */
    var threatFloor = melee * 1.5 + DRAGON_DEF_BASE * 0.25;
    if (def < threatFloor) def = threatFloor;

    if (def < DRAGON_DEF_BASE) def = DRAGON_DEF_BASE;
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
        var attr = null;
        try { attr = ForgeRegistries.ATTRIBUTES.getValue(ResourceLocation.parse("minecraft:generic.max_health")); } catch (e0) {
            try { attr = ForgeRegistries.ATTRIBUTES.getValue(new ResourceLocation("minecraft", "generic.max_health")); } catch (e1) {}
        }
        if (attr != null) {
            try {
                var mixin = Java.type("com.dragonminez.mixin.common.RangedAttributeMixin");
                mixin.setMaxValue.call(attr, 3.4028234663852886E38);
                return true;
            } catch (e2) {}
            try {
                var methods = attr.getClass().getMethods();
                for (var i = 0; i < methods.length; i++) {
                    if (str(methods[i].getName()) === "setMaxValue") {
                        methods[i].invoke(attr, Java.type("java.lang.Double").valueOf(3.4028234663852886E38));
                        return true;
                    }
                }
            } catch (e3) {}
        }
    } catch (e4) {}
    try {
        var Attributes = Java.type("net.minecraft.world.entity.ai.attributes.Attributes");
        var attr2 = Attributes.MAX_HEALTH;
        var fields = attr2.getClass().getDeclaredFields();
        for (var f = 0; f < fields.length; f++) {
            var name = str(fields[f].getName()).toLowerCase();
            if (name.indexOf("max") >= 0 && (name.indexOf("value") >= 0 || name === "f_22308_")) {
                fields[f].setAccessible(true);
                try { fields[f].setDouble(attr2, 3.4028234663852886E38); return true; } catch (e5) {}
            }
        }
    } catch (e6) {}
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
    /* Final safety: never write a TP-breaking max_health value. */
    targetHp = Math.max(1, Math.floor(num(targetHp, 1)));
    if (targetHp > DRAGON_HP_CAP) targetHp = DRAGON_HP_CAP;

    /*
     * If max HP is already correct, do NOT remove/re-add modifiers.
     * Constant attribute rewrites break Ender Dragon phase / movement AI.
     */
    var curMax = getEntityMaxHealthSafe(entity);
    if (Math.abs(curMax - targetHp) < 1.0) {
        putNbtNumber(entity, END_STRENGTH_MAX_NBT, targetHp);
        return true;
    }

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
            putNbtNumber(entity, END_STRENGTH_MAX_NBT, targetHp);
            var applied = getEntityMaxHealthSafe(entity);
            if (applied + 1 >= targetHp) return true;
        }
    } catch (eMod) {}

    /* Fallback: set base value directly. */
    if (!setEntityMaxHealthSafe(entity, targetHp)) return false;
    setEntityHealthSafe(entity, targetHp);
    putNbtNumber(entity, END_STRENGTH_MAX_NBT, targetHp);
    return getEntityMaxHealthSafe(entity) + 1 >= targetHp;
}

/*
 * DMZ LivingEntityMixin derives battlePower from maxHealth when unset.
 * Inflated End HP would make BP insane and break other systems — pin it.
 */
function setEntityBattlePower(entity, battlePower) {
    battlePower = Math.max(5, Math.floor(num(battlePower, 5)));
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return false;
        try {
            var IBattlePower = Java.type("com.dragonminez.common.init.entities.IBattlePower");
            if (IBattlePower.class.isInstance(mc)) {
                IBattlePower.class.cast(mc).setBattlePower(battlePower);
                return true;
            }
        } catch (e1) {}
        try { mc.setBattlePower(battlePower); return true; } catch (e2) {}
        try {
            var f = mc.getClass().getDeclaredField("battlePower");
            f.setAccessible(true);
            f.setInt(mc, battlePower);
            return true;
        } catch (e3) {}
    } catch (e4) {}
    return false;
}

function calcEndBattlePower(kind, power, hp) {
    /*
     * Pin BP low/sane. DMZ LivingEntityMixin can derive BP from maxHealth when
     * unset; other scripts may also key off entity BP. Never echo multi-million HP.
     */
    var melee = num(power != null ? power.melee : 0, 0);
    var level = num(power != null ? power.level : 1, 1);
    var playerBp = num(power != null ? power.bp : 0, 0);
    var safeHp = clampTpSafeHp(kind, hp);
    var score = Math.floor(melee * 0.05 + level * 250 + Math.min(playerBp, 5000000) * 0.02 + safeHp * 0.05);
    if (kind === "dragon") score = Math.floor(score * 1.25 + 5000);
    if (score < 1000) score = 1000;
    if (score > 2500000) score = 2500000;
    return score;
}

function storeHitTarget(entity, hits) {
    putNbtNumber(entity, END_STRENGTH_HITS_NBT, Math.max(1, Math.floor(num(hits, 1))));
}

function readHitTarget(entity, kind) {
    var stored = readNbtNumber(entity, END_STRENGTH_HITS_NBT);
    if (stored > 0) return stored;
    if (kind === "dragon") return DRAGON_TARGET_HITS;
    if (kind != null && END_MOB_TIERS[kind] != null) return Math.max(3, num(END_MOB_TIERS[kind].hits, 10));
    return 10;
}

/*
 * Hard ceiling so oversized packets from ki/skills/other combat systems
 * cannot delete End content faster than the designed hit count.
 */
function capDamageForHitCount(entity, kind, damage) {
    if (END_DAMAGE_HIT_CAP_ENABLED !== true) return damage;
    damage = Math.max(0, num(damage, 0));
    if (!(damage > 0)) return 0;
    var maxH = getEntityMaxHealthSafe(entity);
    var storedMax = readNbtNumber(entity, END_STRENGTH_MAX_NBT);
    if (storedMax > maxH) maxH = storedMax;
    if (!(maxH > 0)) return damage;
    var hits = readHitTarget(entity, kind);
    var cap = (maxH / hits) * END_DAMAGE_HIT_CAP_MULT;
    if (!(cap > 0)) cap = maxH / 100;
    if (damage > cap) damage = cap;
    return damage;
}

function repairEndHealthIfStripped(entity, kind) {
    if (!alreadyBuffed(entity)) return false;
    var intended = readNbtNumber(entity, END_STRENGTH_MAX_NBT);
    if (!(intended > 0)) return false;
    intended = clampTpSafeHp(kind, intended);
    /* Rewrite NBT if an older build stored a TP-breaking max. */
    putNbtNumber(entity, END_STRENGTH_MAX_NBT, intended);
    var cur = getEntityMaxHealthSafe(entity);
    var needsShrink = cur > tpSafeHpCap(kind) + 1;
    var needsRepair = cur + 1 < intended * 0.9;
    if (!needsShrink && !needsRepair) return false;
    var ratio = 1;
    if (cur > 0) {
        var hpNow = getEntityHealthSafe(entity);
        ratio = hpNow / cur;
        if (!(ratio >= 0)) ratio = 1;
        if (ratio > 1) ratio = 1;
    }
    applyRealMaxHealth(entity, intended);
    setEntityHealthSafe(entity, Math.max(1, Math.floor(intended * ratio)));
    setEntityBattlePower(entity, calcEndBattlePower(kind, {
        level: 1, defense: 0, bp: 0, melee: 0, maxHp: 20, name: "?"
    }, intended));
    return true;
}

/*
 * Set real vanilla max_health. DMZ uncaps the attribute, so large values work
 * and the normal health / dragon boss bar updates as damage lands.
 */
function setAbsoluteHealth(entity, targetHp, kind) {
    targetHp = clampTpSafeHp(kind, targetHp);
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
        var who = (power != null && power.name) ? str(power.name) : "?";
        var src = num(power != null ? power.maxHp : 0, 0);
        entity.setName(COLOR + "cEnder Dragon " + COLOR + "8[Lv" +
            (power != null ? power.level : 1) + " / " + formatHpLabel(hp) +
            " HP / DEF " + formatHpLabel(def) +
            COLOR + "7 vs " + who +
            (src > 0 ? COLOR + "8 | DMZ " + formatHpLabel(src) : "") +
            COLOR + "8]");
    } catch (e) {}
}

function storeDmzHpSource(entity, playerDmzHp) {
    putNbtNumber(entity, END_STRENGTH_DMZ_HP_NBT, Math.max(0, num(playerDmzHp, 0)));
}

function fairEndKillTpBase(kind) {
    if (kind === "dragon") return END_TP_FAIR_DRAGON;
    if (kind != null && END_TP_FAIR_MOB[kind] != null) return END_TP_FAIR_MOB[kind];
    return 1200;
}

/*
 * Same logarithmic BP curve shape as Sparring Tp System.js, then dampened
 * for End lump-sum kills (see END_TP_BP_DAMPEN).
 */
function getSparringStyleBpMultiplier(bp) {
    var battlePower = Math.max(1, num(bp, 1));
    var bpAnchors = [
        1, 100000, 1000000, 10000000, 100000000, 1000000000,
        10000000000, 100000000000, 1000000000000, 10000000000000, 100000000000000
    ];
    var multiplierAnchors = [
        1.0, 2.0, 5.0, 12.0, 25.0, 50.0, 100.0, 150.0, 250.0, 400.0, 600.0
    ];
    if (battlePower <= bpAnchors[0]) return multiplierAnchors[0];
    for (var i = 0; i < bpAnchors.length - 1; i++) {
        var lowerBP = bpAnchors[i];
        var upperBP = bpAnchors[i + 1];
        if (battlePower <= upperBP) {
            var lowerMultiplier = multiplierAnchors[i];
            var upperMultiplier = multiplierAnchors[i + 1];
            var lowerLog = Math.log(lowerBP) / Math.log(10);
            var upperLog = Math.log(upperBP) / Math.log(10);
            var currentLog = Math.log(battlePower) / Math.log(10);
            var progress = (currentLog - lowerLog) / (upperLog - lowerLog);
            return lowerMultiplier + (upperMultiplier - lowerMultiplier) * progress;
        }
    }
    var finalBP = bpAnchors[bpAnchors.length - 1];
    var finalMultiplier = multiplierAnchors[multiplierAnchors.length - 1];
    var extraDecades = (Math.log(battlePower) - Math.log(finalBP)) / Math.log(10);
    return finalMultiplier + Math.max(0, extraDecades) * 200.0;
}

function getEndBpMultiplier(bp) {
    var raw = getSparringStyleBpMultiplier(bp);
    var dampen = num(END_TP_BP_DAMPEN, 0.18);
    if (dampen < 0) dampen = 0;
    if (dampen > 1) dampen = 1;
    /* Keep 1.0 floor; only scale the bonus above 1x. */
    return Math.max(1.0, 1.0 + (raw - 1.0) * dampen);
}

function interpolateSoftCapTable(table, level, fallbackMax) {
    level = Math.max(1, Math.floor(num(level, 1)));
    if (table == null || table.length <= 0) {
        return Math.floor(num(fallbackMax, END_TP_SOFTCAP_DEFAULT_MAX));
    }
    if (level <= table[0].level) return Math.floor(num(table[0].cap, table[0].cap));
    for (var i = 0; i < table.length - 1; i++) {
        var a = table[i];
        var b = table[i + 1];
        if (level <= b.level) {
            var t = (level - a.level) / Math.max(1, b.level - a.level);
            return Math.floor(num(a.cap, 0) + (num(b.cap, 0) - num(a.cap, 0)) * t);
        }
    }
    return Math.floor(num(table[table.length - 1].cap, fallbackMax));
}

function getEndKillTpSoftCap(level, kind) {
    var key = str(kind);
    var table = null;
    try {
        if (END_TP_SOFTCAP_BY_KIND != null && END_TP_SOFTCAP_BY_KIND[key] != null) {
            table = END_TP_SOFTCAP_BY_KIND[key];
        } else if (END_TP_SOFTCAP_BY_KIND != null) {
            table = END_TP_SOFTCAP_BY_KIND.enderman;
        }
    } catch (e1) {}
    return Math.max(1000, interpolateSoftCapTable(table, level, END_TP_SOFTCAP_DEFAULT_MAX));
}

function estimateDmzKillTpAward(player, maxHp) {
    maxHp = Math.max(0, num(maxHp, 0));
    var ratio = 0.25;
    var tpPerHit = 2;
    try {
        var gp = ConfigManager.getServerConfig().getGameplay();
        try { ratio = num(gp.getTpHealthRatio(), ratio); } catch (e1) {}
        try { tpPerHit = Math.floor(num(gp.getTpPerHit(), tpPerHit)); } catch (e2) {}
    } catch (e3) {}
    var base = tpPerHit + Math.round(maxHp * ratio);
    if (base < 0) base = 0;
    var data = getDmz(player);
    if (data == null) return base;
    try {
        if (TpSource != null && TpSource.KILL != null) {
            return Math.max(0, Math.floor(num(data.applyTpBoosts(TpSource.KILL, base), base)));
        }
    } catch (e4) {}
    try {
        return Math.max(0, Math.floor(num(data.calculateTPGain(base), base)));
    } catch (e5) {}
    return base;
}

function estimateFairEndKillTp(player, kind) {
    var fairBase = fairEndKillTpBase(kind);
    var power = readPlayerPower(player);
    var bpMult = getEndBpMultiplier(power.bp);
    fairBase = Math.max(1, Math.floor(fairBase * bpMult));
    var data = getDmz(player);
    var awarded = fairBase;
    if (data != null) {
        try {
            if (TpSource != null && TpSource.KILL != null) {
                awarded = Math.max(0, Math.floor(num(data.applyTpBoosts(TpSource.KILL, fairBase), fairBase)));
            } else {
                awarded = Math.max(0, Math.floor(num(data.calculateTPGain(fairBase), fairBase)));
            }
        } catch (e1) {
            try {
                awarded = Math.max(0, Math.floor(num(data.calculateTPGain(fairBase), fairBase)));
            } catch (e2) {}
        }
    }
    var cap = getEndKillTpSoftCap(power.level, kind);
    if (awarded > cap) awarded = cap;
    return awarded;
}

function getPlayerTrainingPoints(player) {
    try {
        var data = getDmz(player);
        if (data == null) return 0;
        return Math.max(0, num(data.getResources().getTrainingPoints(), 0));
    } catch (e) { return 0; }
}

function adjustPlayerTrainingPoints(player, delta) {
    delta = Math.floor(num(delta, 0));
    if (delta === 0) return false;
    var data = getDmz(player);
    if (data == null) return false;
    try {
        if (delta > 0) {
            data.getResources().addTrainingPoints(delta);
            return true;
        }
        data.getResources().removeTrainingPoints(-delta);
        return true;
    } catch (e1) {
        try {
            var cur = getPlayerTrainingPoints(player);
            data.getResources().setTrainingPoints(Math.max(0, cur + delta));
            return true;
        } catch (e2) {}
    }
    return false;
}

function scheduleEndKillTpClawback(player, kind, maxHp) {
    if (END_TP_SETTLE_ENABLED !== true || !isPlayer(player)) return;
    try {
        var temp = player.getTempdata();
        if (temp == null) return;
        /* delay|kind|maxHp|startedAt — wait so DMZ LivingDeath TP lands first */
        var delay = Math.max(1, Math.floor(num(END_TP_SETTLE_DELAY_TICKS, 6)));
        var payload = delay + "|" + str(kind) + "|" + Math.floor(num(maxHp, 0)) + "|" + nowMs();
        temp.put(TEMP_TP_CLAWBACK, payload);
    } catch (e) {}
}

function processEndKillTpClawback(player) {
    if (END_TP_SETTLE_ENABLED !== true || !isPlayer(player)) return false;
    var temp = null;
    var payload = null;
    try {
        temp = player.getTempdata();
        if (temp == null || !temp.has(TEMP_TP_CLAWBACK)) return false;
        payload = str(temp.get(TEMP_TP_CLAWBACK));
    } catch (e1) { return false; }
    if (payload === "" || payload.indexOf("|") < 0) return false;

    var parts = payload.split("|");
    if (parts.length < 3) {
        try { temp.remove(TEMP_TP_CLAWBACK); } catch (eR) {}
        return false;
    }

    var delay = Math.floor(num(parts[0], 0));
    if (delay > 0) {
        try {
            temp.put(TEMP_TP_CLAWBACK,
                (delay - 1) + "|" + parts[1] + "|" + parts[2] + "|" + (parts[3] || "0"));
        } catch (eD) {}
        return false;
    }

    try { temp.remove(TEMP_TP_CLAWBACK); } catch (eR2) {}

    var kind = parts[1];
    var maxHp = num(parts[2], 0);
    var awarded = estimateDmzKillTpAward(player, maxHp);
    var fair = estimateFairEndKillTp(player, kind);
    var delta = fair - awarded;
    if (Math.abs(delta) <= 1) {
        msg(player, COLOR + "6[End] " + COLOR + "e+" + formatHpLabel(fair) +
            COLOR + "7 TP" + COLOR + "8 (End payout)");
        return false;
    }

    if (!adjustPlayerTrainingPoints(player, delta)) return false;

    var label = kind === "dragon" ? "Ender Dragon" : str(kind);
    if (delta > 0) {
        msg(player, COLOR + "6[End] " + COLOR + "e+" + formatHpLabel(fair) +
            COLOR + "7 TP for defeating " + COLOR + "d" + label +
            COLOR + "8 (End payout; was " + formatHpLabel(awarded) + ")");
    } else {
        msg(player, COLOR + "7[End] Kill TP settled to End payout (" +
            formatHpLabel(fair) + " TP after boosts).");
    }
    return true;
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
    /*
     * Strong DMZ-style DEF scaled from the nearby player's stats.
     * Higher tiers get a larger share of player DEF/melee.
     */
    var base = num(tier.defense, 0);
    var tierFactor = Math.max(1, num(tier.tier, 1));
    var playerDef = num(power != null ? power.defense : 0, 0);
    var melee = num(power != null ? power.melee : 0, 0);
    var level = num(power != null ? power.level : 1, 1);

    var def = Math.max(
        base,
        playerDef * END_MOB_DEF_FROM_PLAYER * (0.55 + tierFactor * 0.2),
        melee * END_MOB_DEF_FROM_MELEE * (0.45 + tierFactor * 0.15)
    );
    def += level * END_MOB_DEF_PER_LEVEL * tierFactor;

    var maxDef = base * END_MOB_DEF_SCALE_CAP
        + playerDef * END_MOB_DEF_FROM_PLAYER * tierFactor
        + melee * END_MOB_DEF_FROM_MELEE * tierFactor;
    if (def > maxDef) def = maxDef;
    return Math.floor(def);
}

function calcMobHp(tier, power) {
    /* TP-safe pool mirrored from player DMZ maxHealth. */
    var base = num(tier.hp, 1);
    var cap = num(tier.hpCap, END_MOB_HP_GLOBAL_CAP);
    if (cap > END_MOB_HP_GLOBAL_CAP) cap = END_MOB_HP_GLOBAL_CAP;
    return mapDmzHpToTpSafe(
        num(power != null ? power.maxHp : 20, 20),
        base,
        cap,
        DRAGON_HP_LOG_REF
    );
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
    storeDmzHpSource(entity, num(power.maxHp, 0));
    storeHitTarget(entity, num(tier.hits, 10));
    setEntityBattlePower(entity, calcEndBattlePower(kind, power, hp));
    if (kind !== "enderman") setAttackDamage(entity, dmg);
    else setAttackDamage(entity, ENDERMAN_ATTACK_DAMAGE);
    if (END_MOB_DEF_ENABLED === true) storeEntityDefense(entity, def);
    try {
        entity.setName(COLOR + "d" + tier.label + COLOR + "8[" +
            formatHpLabel(hp) + " HP / DEF " + formatHpLabel(def) + "]");
    } catch (eName) {}
    return true;
}

function applyDragonStats(entity, power, sourceLabel) {
    var hp = clampTpSafeHp("dragon", calcDragonHp(power));
    var def = calcDragonDefense(power);
    var prevMax = getEntityMaxHealthSafe(entity);
    var prevHp = getEntityHealthSafe(entity);
    var newCurrent = hp;
    var score = powerScore(power);
    var overTpSafe = prevMax > DRAGON_HP_CAP + 1;
    var midFight = (sourceLabel === "rescale" || sourceLabel === "onhit" || sourceLabel === "strongest") && alreadyBuffed(entity);
    var touchHealth = true;

    /* Mid-fight: only rewrite max_health when HP must actually change. */
    if (midFight && prevMax > 20 && prevHp > 0) {
        var ratio = prevHp / prevMax;
        if (!(ratio >= 0)) ratio = 1;
        if (ratio > 1) ratio = 1;
        if (overTpSafe) {
            newCurrent = Math.max(1, Math.floor(hp * ratio));
            touchHealth = true;
        } else if (hp > prevMax + 500) {
            newCurrent = Math.max(1, Math.floor(hp * ratio));
            newCurrent = Math.max(newCurrent, prevHp + (hp - prevMax));
            touchHealth = true;
        } else {
            /* DEF/name rescale only — leave attributes alone (keeps dragon AI). */
            newCurrent = prevHp;
            hp = prevMax;
            touchHealth = false;
        }
        if (newCurrent > hp) newCurrent = hp;
        if (touchHealth === true) {
            applyRealMaxHealth(entity, hp);
            setEntityHealthSafe(entity, newCurrent);
        }
    } else {
        setAbsoluteHealth(entity, hp, "dragon");
        newCurrent = hp;
    }

    markBuffed(entity, "dragon:" + sourceLabel + ":hp" + hp + ":def" + def);
    storeEntityDefense(entity, def);
    storeDmzHpSource(entity, num(power != null ? power.maxHp : 0, 0));
    storeHitTarget(entity, DRAGON_TARGET_HITS);
    /* Pin BP once; avoid rewriting every rescale tick. */
    if (!midFight || touchHealth === true || !alreadyBuffed(entity)) {
        setEntityBattlePower(entity, calcEndBattlePower("dragon", power, hp));
    }
    try {
        var temp = entity.getTempdata();
        if (temp != null) {
            temp.put(TEMP_DRAGON_SCALE_SCORE, "" + score);
            temp.put(TEMP_DRAGON_SCALE_NAME, power != null ? str(power.name) : "?");
        }
    } catch (e1) {}
    updateDragonName(entity, power, hp, def);
    return { hp: hp, current: newCurrent, damage: 0, defense: def, power: power };
}

/*
 * Keep every living dragon matched to the strongest player in The End.
 * HP only grows to the new strongest (never shrinks mid-fight); DEF always tracks.
 */
function maybeRescaleDragon(entity, world, player) {
    if (entity == null) return false;
    if (world == null) world = getEndWorld();
    if (world == null) return false;
    if (DRAGON_ALWAYS_SCALE_TO_STRONGEST !== true) return false;

    var now = nowMs();
    try {
        var temp = entity.getTempdata();
        if (temp != null && temp.has(TEMP_DRAGON_RESCALE)) {
            var last = num(temp.get(TEMP_DRAGON_RESCALE), 0);
            if (now - last < DRAGON_RESCALE_MS) return false;
        }
        if (temp != null) temp.put(TEMP_DRAGON_RESCALE, "" + now);
    } catch (e1) {}

    var best = strongestPowerInEnd(world, player);
    if (best.player == null && best.power == null) return false;
    var power = best.power;
    var desiredHp = calcDragonHp(power);
    var desiredDef = calcDragonDefense(power);
    var desiredScore = powerScore(power);
    var curMax = getEntityMaxHealthSafe(entity);
    var curDef = readEntityDefense(entity);
    var lastScore = -1;
    try {
        var t2 = entity.getTempdata();
        if (t2 != null && t2.has(TEMP_DRAGON_SCALE_SCORE)) {
            lastScore = num(t2.get(TEMP_DRAGON_SCALE_SCORE), -1);
        }
    } catch (e2) {}

    var strongerArrived = desiredScore > lastScore * (1.0 + DRAGON_SCALE_SCORE_EPSILON) + 1;
    var needsHp = !alreadyBuffed(entity)
        || desiredHp > curMax + 500
        || curMax > DRAGON_HP_CAP + 1;
    var needsDef = !(curDef > 0) || Math.abs(desiredDef - curDef) > 100 || strongerArrived;

    if (!needsHp && !needsDef) return false;

    /* DEF-only updates must not rewrite max_health attributes. */
    if (!needsHp && needsDef) {
        storeEntityDefense(entity, desiredDef);
        try {
            var t3 = entity.getTempdata();
            if (t3 != null) {
                t3.put(TEMP_DRAGON_SCALE_SCORE, "" + desiredScore);
                t3.put(TEMP_DRAGON_SCALE_NAME, power != null ? str(power.name) : "?");
            }
        } catch (e3) {}
        updateDragonName(entity, power, curMax, desiredDef);
        return true;
    }

    var label = alreadyBuffed(entity) ? "strongest" : "scan";
    applyDragonStats(entity, power, label);
    return true;
}

function isLivingDragon(entity) {
    if (entity == null) return false;
    try {
        if (classifyEndEntity(entity) !== "dragon") return false;
    } catch (e0) { return false; }

    try {
        if (typeof entity.isAlive === "function" && entity.isAlive() === false) return false;
    } catch (e1) {}
    try {
        var hp = num(entity.getHealth(), -1);
        if (hp >= 0 && hp <= 0.01) return false;
    } catch (e2) {}

    try {
        var mc = entity.getMCEntity();
        if (mc != null) {
            try {
                if (mc.isAlive && mc.isAlive() === false) return false;
            } catch (e3) {
                try { if (mc.m_6084_ && mc.m_6084_() === false) return false; } catch (e4) {}
            }
            try {
                var mchp = -1;
                try { mchp = num(mc.getHealth(), -1); } catch (e5) {
                    try { mchp = num(mc.m_21223_(), -1); } catch (e6) {}
                }
                if (mchp >= 0 && mchp <= 0.01) return false;
            } catch (e7) {}
            try {
                if (mc.isRemoved && mc.isRemoved() === true) return false;
            } catch (e8) {
                try { if (mc.m_213877_ && mc.m_213877_() === true) return false; } catch (e9) {}
            }
            try {
                if (mc.isDeadOrDying && mc.isDeadOrDying() === true) return false;
            } catch (e10) {
                try { if (mc.m_21224_ && mc.m_21224_() === true) return false; } catch (e11) {}
            }
        }
    } catch (e12) {}
    return true;
}

function findDragons(world) {
    var found = [];
    var seen = {};
    if (world == null) return found;

    function pushDragon(ent) {
        if (ent == null) return;
        if (!isLivingDragon(ent)) return;
        var id = "";
        try { id = str(ent.getUUID()); } catch (e0) {
            try { id = str(ent.getMCEntity().m_20148_()); } catch (e1) {
                id = str(ent.getX()) + "," + str(ent.getY()) + "," + str(ent.getZ());
            }
        }
        if (seen[id] === true) return;
        seen[id] = true;
        found.push(ent);
    }

    try {
        var list = world.getAllEntities(-1);
        for (var i = 0; i < list.length; i++) {
            if (classifyEndEntity(list[i]) === "dragon") pushDragon(list[i]);
        }
    } catch (e) {}

    /* MC-level backup — CNPC scans sometimes miss the fight dragon. */
    try {
        var level = getMcServerLevel(world);
        if (level != null) {
            var EntityType = Java.type("net.minecraft.world.entity.EntityType");
            var AABB = Java.type("net.minecraft.world.phys.AABB");
            var box = new AABB(-600.0, 0.0, -600.0, 600.0, 320.0, 600.0);
            var mcList = null;
            try {
                mcList = level.getEntities(EntityType.ENDER_DRAGON, box, function (e) { return e != null && e.isAlive(); });
            } catch (e2) {
                try {
                    mcList = level.m_45976_(EntityType.f_20530_, box, function (e) { return e != null && e.m_6084_(); });
                } catch (e3) {}
            }
            if (mcList != null) {
                var it = mcList.iterator();
                while (it.hasNext()) {
                    pushDragon(wrapMcEntity(it.next()));
                }
            }
        }
    } catch (e4) {}

    return found;
}

function notifyDragonAlreadyAlive(player, dragons) {
    var n = dragons != null ? dragons.length : 0;
    var line = COLOR + "c[The End] " + COLOR + "eA dragon is already alive"
        + (n > 1 ? COLOR + "7 (" + n + ")" : "")
        + COLOR + "c — defeat it before spawning another.";
    msg(player, line);
    try { print("[EndStrength] " + str(player != null ? player.getName() : "?") + ": dragon already alive (" + n + ")"); } catch (e1) {}
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
    /* Prefer the real End ServerLevel from the dedicated server. */
    try {
        var bundle = getOrCreateEndDragonFight();
        if (bundle != null && bundle.fight != null) return bundle.fight;
    } catch (e0) {}

    var level = null;
    try { level = getEndServerLevel(); } catch (e1) {}
    if (level == null) level = getMcServerLevel(world);
    return readDragonFightFromLevel(level);
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
    var lastErr = null;
    for (var i = 0; i < names.length; i++) {
        try {
            var m = fight.getClass().getDeclaredMethod(names[i]);
            m.setAccessible(true);
            return m.invoke(fight);
        } catch (e1) { lastErr = e1; }
        try {
            var m0 = fight.getClass().getMethod(names[i]);
            return m0.invoke(fight);
        } catch (e2) { lastErr = e2; }
    }

    /* Scan private no-arg methods whose name mentions Dragon. */
    try {
        var methods = fight.getClass().getDeclaredMethods();
        for (var mi = 0; mi < methods.length; mi++) {
            try {
                var mn = str(methods[mi].getName());
                if (methods[mi].getParameterCount() !== 0) continue;
                var looksCreate = mn.toLowerCase().indexOf("createdragon") >= 0
                    || mn.toLowerCase().indexOf("newdragon") >= 0
                    || mn === "createNewDragon"
                    || mn === "m_64110_"
                    || mn === "m_64099_";
                if (!looksCreate) continue;
                methods[mi].setAccessible(true);
                var out = methods[mi].invoke(fight);
                try { print("[EndStrength] invokeFightMethod via scan: " + mn); } catch (eScan) {}
                return out;
            } catch (e3) { lastErr = e3; }
        }
    } catch (e4) { lastErr = e4; }

    if (lastErr != null) {
        try { print("[EndStrength] invokeFightMethod failed: " + lastErr); } catch (e5) {}
    }
    return null;
}

function findDragonsOnLevel(endLevel) {
    var out = [];
    if (endLevel == null) return out;
    try {
        var EntityType = Java.type("net.minecraft.world.entity.EntityType");
        var AABB = Java.type("net.minecraft.world.phys.AABB");
        var box = new AABB(-800.0, 0.0, -800.0, 800.0, 320.0, 800.0);
        var dragonType = null;
        try { dragonType = EntityType.ENDER_DRAGON; } catch (e1) {
            try { dragonType = EntityType.f_20530_; } catch (e2) {}
        }
        if (dragonType == null) return out;
        var mcList = null;
        try {
            mcList = endLevel.getEntities(dragonType, box, function (e) {
                try { return e != null && e.isAlive(); } catch (eA) {
                    try { return e != null && e.m_6084_(); } catch (eB) { return e != null; }
                }
            });
        } catch (e3) {
            try {
                mcList = endLevel.m_45976_(dragonType, box, function (e) {
                    try { return e != null && e.m_6084_(); } catch (eC) { return e != null; }
                });
            } catch (e4) {}
        }
        if (mcList == null) return out;
        var it = mcList.iterator();
        while (it.hasNext()) {
            var wrapped = wrapMcEntity(it.next());
            if (wrapped != null && isLivingDragon(wrapped)) out.push(wrapped);
        }
    } catch (e5) {}
    return out;
}

function resolveSpawnedDragon(mcDragon, world, endLevel) {
    var wrapped = wrapMcEntity(mcDragon);
    if (wrapped != null) return wrapped;

    var found = [];
    try { if (world != null) found = findDragons(world); } catch (e1) {}
    if (found.length > 0) return found[found.length - 1];

    found = findDragonsOnLevel(endLevel);
    if (found.length > 0) return found[found.length - 1];

    /* Dragon exists on ServerLevel even if CNPC wrap failed — keep a pending buff. */
    if (mcDragon != null) {
        try {
            print("[EndStrength] Dragon spawned on ServerLevel but CNPC wrap failed — entity is alive in The End");
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
    var bundle = null;
    try { bundle = getOrCreateEndDragonFight(); } catch (eBundle) {
        try { print("[EndStrength] getOrCreateEndDragonFight error: " + eBundle); } catch (eB2) {}
    }

    var endLevel = bundle != null ? bundle.level : null;
    var fight = bundle != null ? bundle.fight : null;
    if (bundle != null && bundle.world != null) world = bundle.world;
    if (world == null) world = forceLoadEndWorld();
    if (world == null && endLevel == null) {
        try { print("[EndStrength] No End world/level available for dragon spawn"); } catch (eNo) {}
        return null;
    }

    try { if (world != null) clearAllDragons(world); } catch (eClear) {}
    try {
        var existingLvl = findDragonsOnLevel(endLevel);
        for (var di = 0; di < existingLvl.length; di++) despawnDragonEntity(existingLvl[di]);
    } catch (eClear2) {}

    if (fight == null) {
        try { fight = getEndDragonFight(world); } catch (eFight) {}
    }
    if (fight == null) {
        try {
            print("[EndStrength] EndDragonFight is still null after get-or-create");
            print("[EndStrength] tip: visit The End once so the dimension initializes, then /enddragon");
        } catch (eNull) {}
        return null;
    }

    try { print("[EndStrength] Spawning dragon via EndDragonFight..."); } catch (eSp) {}
    try { forceLoadEndChunks(endLevel != null ? endLevel : getMcServerLevel(world)); } catch (eChunks) {}

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
    try { if (world != null) clearEndCrystals(world); } catch (eClr) {}
    try { fight.resetSpikeCrystals(); } catch (e3) {
        try { invokeFightMethod(fight, ["resetSpikeCrystals", "m_64101_", "resetEndCrystals"]); } catch (e4) {}
    }

    /* Re-place tower crystals so the dragon keeps normal heal/perch AI. */
    try { if (world != null) restoreTowerCrystals(world); } catch (eCrystal) {}

    var mcDragon = null;
    try {
        mcDragon = invokeFightMethod(fight, ["createNewDragon", "m_64110_", "m_64099_"]);
        if (mcDragon != null) {
            try { print("[EndStrength] createNewDragon OK"); } catch (eOk) {}
        } else {
            try { print("[EndStrength] createNewDragon returned null"); } catch (eN) {}
        }
    } catch (e5) {
        try { print("[EndStrength] createNewDragon error: " + e5); } catch (e5b) {}
        mcDragon = null;
    }

    if (mcDragon == null) {
        try {
            mcDragon = invokeFightMethod(fight, ["findOrCreateDragon", "m_64103_", "checkDragonSeen"]);
            if (mcDragon != null) {
                try { print("[EndStrength] findOrCreateDragon OK"); } catch (eOk2) {}
            }
        } catch (e6) {
            try { print("[EndStrength] findOrCreateDragon error: " + e6); } catch (e6b) {}
        }
    }

    /* Last resort: spawn entity on the End ServerLevel and link it to this fight. */
    if (mcDragon == null && endLevel != null) {
        try {
            mcDragon = spawnLinkedDragonOnLevel(endLevel, fight);
            if (mcDragon != null) {
                try { print("[EndStrength] Used linked ServerLevel dragon spawn fallback"); } catch (e7) {}
            } else {
                try { print("[EndStrength] Linked ServerLevel dragon spawn returned null"); } catch (e7b) {}
            }
        } catch (e8) {
            try { print("[EndStrength] Linked dragon fallback failed: " + e8); } catch (e9) {}
        }
    }

    if (mcDragon == null) {
        /* Maybe createNewDragon added it but returned void/null — scan level. */
        var scanned = findDragonsOnLevel(endLevel);
        if (scanned.length > 0) {
            try { print("[EndStrength] Found dragon on ServerLevel after spawn attempts"); } catch (eSc) {}
            return scanned[scanned.length - 1];
        }
        try { print("[EndStrength] All dragon spawn attempts failed"); } catch (eFail) {}
        return null;
    }

    setFightBoolean(fight,
        ["dragonKilled", "f_64068_", "field_13115"],
        false);

    var resolved = resolveSpawnedDragon(mcDragon, world, endLevel);
    if (resolved != null) return resolved;

    /*
     * Entity exists in The End even if CNPC cannot wrap it this tick.
     * Return a soft success marker via pending buff + level scan next tick.
     */
    try {
        var wPend = world != null ? world : wrapEndWorld(endLevel);
        if (wPend != null) {
            wPend.getStoreddata().put(WORLD_PENDING_DRAGON_BUFF, "command||" + nowMs());
        }
    } catch (ePend) {}
    var scanned2 = findDragonsOnLevel(endLevel);
    return scanned2.length > 0 ? scanned2[scanned2.length - 1] : null;
}

/* Spawn an EnderDragon on the End ServerLevel and bind it to EndDragonFight. */
function spawnLinkedDragonOnLevel(endLevel, fight) {
    if (endLevel == null) return null;
    var EntityType = Java.type("net.minecraft.world.entity.EntityType");
    var dragonType = null;
    try { dragonType = EntityType.ENDER_DRAGON; } catch (e1) {
        try { dragonType = EntityType.f_20530_; } catch (e2) {}
    }
    if (dragonType == null) return null;

    var dragon = null;
    try { dragon = dragonType.create(endLevel); } catch (e3) {
        try { dragon = dragonType.m_20615_(endLevel); } catch (e4) {}
    }
    if (dragon == null) return null;

    try {
        dragon.moveTo(0.0, 128.0, 0.0, endLevel.getRandom().nextFloat() * 360.0, 0.0);
    } catch (e5) {
        try { dragon.m_7678_(0.0, 128.0, 0.0, 0.0, 0.0); } catch (e6) {
            try { dragon.setPos(0.0, 128.0, 0.0); } catch (e7) {}
        }
    }

    if (fight != null) {
        try { dragon.setDragonFight(fight); } catch (e8) {
            try { dragon.m_64093_(fight); } catch (e9) {
                try {
                    var df = dragon.getClass().getDeclaredField("dragonFight");
                    setObjectField(dragon, df, fight);
                } catch (e10) {
                    try {
                        var df2 = dragon.getClass().getDeclaredField("f_64065_");
                        setObjectField(dragon, df2, fight);
                    } catch (e11) {}
                }
            }
        }
        try {
            var BlockPos = Java.type("net.minecraft.core.BlockPos");
            var origin = new BlockPos(0, 128, 0);
            try { dragon.setFightOrigin(origin); } catch (e12) {
                try { dragon.m_287185_(origin); } catch (e13) {}
            }
        } catch (e14a) {}

        /* Point fight UUID at this dragon when possible. */
        try {
            var uuidFieldNames = ["dragonUUID", "f_64067_", "field_13113"];
            for (var u = 0; u < uuidFieldNames.length; u++) {
                try {
                    var uf = fight.getClass().getDeclaredField(uuidFieldNames[u]);
                    setObjectField(fight, uf, dragon.getUUID());
                    break;
                } catch (e14) {}
            }
        } catch (e15) {}
    }

    try {
        endLevel.addFreshEntity(dragon);
    } catch (e16) {
        try { endLevel.m_7967_(dragon); } catch (e17) {
            try { endLevel.addWithUUID(dragon); } catch (e18) { return null; }
        }
    }
    return dragon;
}

function spawnDragonEntityFallback(world, x, y, z) {
    x = Math.floor(num(x, NATURAL_SPAWN_X));
    y = Math.floor(num(y, NATURAL_SPAWN_Y));
    z = Math.floor(num(z, NATURAL_SPAWN_Z));

    if (world != null) {
        try {
            var ent = world.createEntity("minecraft:ender_dragon");
            if (ent != null) {
                try { ent.setPosition(x, y, z); } catch (e1) {
                    try { ent.setPos(x, y, z); } catch (e2) {}
                }
                world.spawnEntity(ent);
                return ent;
            }
        } catch (e3) {}
    }

    /* Command summon — works even when CNPC createEntity fails. */
    try {
        var cmdWorld = world;
        if (cmdWorld == null) {
            try { cmdWorld = NpcAPI.Instance().getIWorlds()[0]; } catch (eW) {}
        }
        if (cmdWorld != null) {
            NpcAPI.Instance().executeCommand(cmdWorld,
                "execute in minecraft:the_end run summon minecraft:ender_dragon " +
                x + " " + y + " " + z);
        }
    } catch (e4) {
        try {
            if (world != null) {
                NpcAPI.Instance().executeCommand(world,
                    "summon minecraft:ender_dragon " + x + " " + y + " " + z);
            }
        } catch (e5) {}
    }

    var dragons = [];
    try { if (world != null) dragons = findDragons(world); } catch (e6) {}
    if (dragons.length <= 0) dragons = findDragonsOnLevel(getEndServerLevel());
    if (dragons.length > 0) return dragons[dragons.length - 1];
    return null;
}

function spawnDragonEntity(world, x, y, z) {
    /*
     * Prefer EndDragonFight (best AI). If that fails, fall back to
     * createEntity//summon like the earlier working versions so /enddragon
     * still produces a living dragon.
     */
    var viaFight = spawnDragonViaFight(world);
    if (viaFight != null) return viaFight;

    try {
        print("[EndStrength] EndDragonFight spawn failed; using fallback summon.");
    } catch (e1) {}

    try { if (world != null) clearAllDragons(world); } catch (e2) {}
    try {
        var onLevel = findDragonsOnLevel(getEndServerLevel());
        for (var i = 0; i < onLevel.length; i++) despawnDragonEntity(onLevel[i]);
    } catch (e3) {}

    var fallback = spawnDragonEntityFallback(world, x, y, z);
    if (fallback != null) {
        /* Best-effort: link fallback dragon to fight manager for better AI. */
        try {
            var bundle = getOrCreateEndDragonFight();
            if (bundle != null && bundle.fight != null && bundle.level != null) {
                var mc = null;
                try { mc = fallback.getMCEntity(); } catch (e4) {}
                if (mc != null) {
                    try { mc.setDragonFight(bundle.fight); } catch (e5) {
                        try { mc.m_64093_(bundle.fight); } catch (e6) {}
                    }
                }
            }
        } catch (e7) {}
        return fallback;
    }
    return null;
}

function spawnScaledDragon(world, powerPlayer, sourceLabel, x, y, z) {
    var endLevel = null;
    try { endLevel = getEndServerLevel(); } catch (e0) {}
    if (world == null) world = wrapEndWorld(endLevel);
    if (world == null && endLevel == null) return null;

    var existing = [];
    try { if (world != null) existing = findDragons(world); } catch (e1) {}
    if (existing.length <= 0) existing = findDragonsOnLevel(endLevel);
    if (existing.length > 0) return null;

    /* Always size from the strongest player currently in The End. */
    var best = strongestPowerInEnd(world, powerPlayer);
    var power = best.power;
    var scalePlayer = best.player != null ? best.player : powerPlayer;

    var dragon = spawnDragonEntity(world, x, y, z);
    if (dragon == null) {
        /* Fight/command summon may lag one tick */
        try { if (world != null) existing = findDragons(world); } catch (e2) {}
        if (existing.length <= 0) existing = findDragonsOnLevel(endLevel);
        if (existing.length > 0) dragon = existing[existing.length - 1];
    }
    if (dragon == null) {
        try {
            var storedWorld = world != null ? world : wrapEndWorld(endLevel);
            if (storedWorld != null) {
                storedWorld.getStoreddata().put(WORLD_PENDING_DRAGON_BUFF, sourceLabel + "|" +
                    (scalePlayer != null ? str(scalePlayer.getName()) : "") + "|" + nowMs());
            }
        } catch (e3) {}
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

function clearCmdSpawnRequests() {
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                var stored = worlds[i].getStoreddata();
                if (stored.has(WORLD_CMD_SPAWN_REQUEST)) stored.remove(WORLD_CMD_SPAWN_REQUEST);
            } catch (e1) {}
        }
    } catch (e2) {}
}

function readCmdSpawnRequest() {
    var best = null;
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                var stored = worlds[i].getStoreddata();
                if (!stored.has(WORLD_CMD_SPAWN_REQUEST)) continue;
                var raw = str(stored.get(WORLD_CMD_SPAWN_REQUEST));
                if (raw === "" || raw.indexOf("|") < 0) continue;
                var parts = raw.split("|");
                var at = parts.length > 1 ? num(parts[1], 0) : 0;
                if (best == null || at >= best.at) {
                    best = { name: str(parts[0]), at: at, raw: raw };
                }
            } catch (e1) {}
        }
    } catch (e2) {}
    return best;
}

function processCmdSpawnRequest(player) {
    if (!isPlayer(player)) return false;
    var req = readCmdSpawnRequest();
    if (req == null) return false;

    /* Expire stale requests (2 minutes). */
    if (req.at > 0 && nowMs() - req.at > 120000) {
        clearCmdSpawnRequests();
        return false;
    }

    /* Only the named player (or any player if name blank) should process. */
    var myName = str(player.getName());
    if (req.name !== "" && req.name.toLowerCase() !== myName.toLowerCase()) return false;

    try {
        var temp = player.getTempdata();
        var last = temp.has(TEMP_CMD_SPAWN_LOCK) ? num(temp.get(TEMP_CMD_SPAWN_LOCK), 0) : 0;
        if (nowMs() - last < 3000) return false;
        temp.put(TEMP_CMD_SPAWN_LOCK, "" + nowMs());
    } catch (eLock) {}

    clearCmdSpawnRequests();
    try {
        print("[EndStrength] Processing queued /enddragon for " + myName);
    } catch (eLog) {}
    msg(player, COLOR + "7[The End] Processing dragon spawn request...");
    cmdSpawnDragon(player, { queueRetry: false });
    return true;
}

function queueCmdSpawnRequest(player) {
    if (player == null) return false;
    var payload = str(player.getName()) + "|" + nowMs() + "|command";
    var wrote = 0;
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        for (var i = 0; i < worlds.length; i++) {
            try {
                worlds[i].getStoreddata().put(WORLD_CMD_SPAWN_REQUEST, payload);
                wrote++;
            } catch (e1) {}
        }
    } catch (e2) {}
    return wrote > 0;
}

function cmdSpawnDragon(player, opts) {
    if (opts == null) opts = {};
    var allowQueueRetry = opts.queueRetry !== false;

    if (!isRealOnlinePlayer(player) && !isPlayer(player)) {
        try { print("[EndStrength] cmdSpawnDragon: invalid player"); } catch (e0) {}
        return;
    }

    /* Consume any queued request so tick does not double-run this. */
    try { clearCmdSpawnRequests(); } catch (eClr) {}

    try { forceLoadEndWorld(); } catch (eForce) {}
    var world = getEndWorld();
    var endLevel = null;
    try { endLevel = getEndServerLevel(); } catch (eLvl) {}
    if (world == null) world = wrapEndWorld(endLevel);

    if (world == null && endLevel == null) {
        msg(player, COLOR + "c[The End] Could not find The End world.");
        try { print("[EndStrength] cmdSpawnDragon: End world null"); } catch (e1) {}
        return;
    }

    var existing = [];
    try { if (world != null) existing = findDragons(world); } catch (eEx1) {}
    if (existing.length <= 0) existing = findDragonsOnLevel(endLevel);
    if (existing.length > 0) {
        notifyDragonAlreadyAlive(player, existing);
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
    } catch (e2) {}

    msg(player, COLOR + "7[The End] Spawning Ender Dragon...");
    var result = spawnScaledDragon(world, player, "command", x, y, z);
    if (result == null) {
        existing = [];
        try { if (world != null) existing = findDragons(world); } catch (eEx2) {}
        if (existing.length <= 0) existing = findDragonsOnLevel(endLevel);
        if (existing.length > 0) {
            try {
                applyDragonStats(existing[existing.length - 1], readPlayerPower(player), "command");
            } catch (eStats) {}
            notifyDragonAlreadyAlive(player, existing);
            return;
        }
        if (allowQueueRetry) {
            try { queueCmdSpawnRequest(player); } catch (eQ) {}
            msg(player, COLOR + "c[The End] Dragon spawn did not return yet — retrying once...");
            try { print("[EndStrength] cmdSpawnDragon failed for " + str(player.getName()) + " (queued retry)"); } catch (e3) {}
        } else {
            msg(player, COLOR + "c[The End] Failed to spawn the dragon.");
            try { print("[EndStrength] cmdSpawnDragon failed for " + str(player.getName())); } catch (e4) {}
        }
        return;
    }

    msg(player, COLOR + "6[The End] " + COLOR + "eSpawned Ender Dragon with " +
        COLOR + "c" + result.hp + COLOR + "e HP / " +
        COLOR + "b" + result.defense + COLOR + "e DEF " +
        COLOR + "8(scaled to " + result.power.name + " / Lv" + result.power.level + ")");
    if (world != null) {
        broadcastOnce(world, "end.strength.cmdAnnounce." + nowMs(),
            COLOR + "5[The End] " + COLOR + "d" + str(player.getName()) +
            COLOR + "7 summoned an Ender Dragon! " +
            COLOR + "8(" + Math.floor(result.hp / 1000) + "k HP / " +
            Math.floor(result.defense / 1000) + "k DEF, scaled to " +
            result.power.name + ")");
    }
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

/* ========================= CLEANUP / DRAGON ATTACKS ========================= */

function cmdCleanupDragons(player) {
    if (!isRealOnlinePlayer(player) && !isPlayer(player)) {
        try { print("[EndStrength] cmdCleanupDragons: invalid player"); } catch (e0) {}
        return;
    }

    var world = forceLoadEndWorld() || getEndWorld();
    var endLevel = null;
    try { endLevel = getEndServerLevel(); } catch (e1) {}

    var removed = 0;
    try {
        if (world != null) removed += clearAllDragons(world);
    } catch (e2) {}

    try {
        var onLevel = findDragonsOnLevel(endLevel);
        for (var i = 0; i < onLevel.length; i++) {
            despawnDragonEntity(onLevel[i]);
            removed++;
        }
    } catch (e3) {}

    /* Command fallback in case entity handles miss anything. */
    try {
        if (world != null) {
            NpcAPI.Instance().executeCommand(world,
                "execute in minecraft:the_end run kill @e[type=minecraft:ender_dragon]");
        }
    } catch (e4) {
        try {
            if (world != null) {
                NpcAPI.Instance().executeCommand(world, "kill @e[type=minecraft:ender_dragon]");
            }
        } catch (e5) {}
    }

    try { clearCmdSpawnRequests(); } catch (e6) {}
    try {
        if (world != null) {
            var stored = world.getStoreddata();
            if (stored.has(WORLD_PENDING_DRAGON_BUFF)) stored.remove(WORLD_PENDING_DRAGON_BUFF);
            stored.put(WORLD_LAST_NATURAL, "" + nowMs());
        }
    } catch (e7) {}

    msg(player, COLOR + "6[The End] " + COLOR + "eCleared ender dragons" +
        (removed > 0 ? COLOR + "7 (" + removed + " removed)" : COLOR + "8 (none found / killall sent)") +
        COLOR + "e.");
    try {
        print("[EndStrength] cleanup trigger 51 by " + str(player.getName()) +
            " removed~" + removed);
    } catch (e8) {}
}

function vecLength(x, y, z) {
    return Math.sqrt(x * x + y * y + z * z);
}

function nearestPlayerToEntity(entity, world, range) {
    if (entity == null) return null;
    var best = null;
    var bestD = range * range;
    try {
        var list = null;
        if (world != null) {
            list = world.getNearbyEntities(
                Math.floor(entity.getX()),
                Math.floor(entity.getY()),
                Math.floor(entity.getZ()),
                Math.floor(range),
                1
            );
        }
        if (list == null) return null;
        for (var i = 0; i < list.length; i++) {
            if (!isRealOnlinePlayer(list[i])) continue;
            var dx = list[i].getX() - entity.getX();
            var dy = list[i].getY() - entity.getY();
            var dz = list[i].getZ() - entity.getZ();
            var d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD) {
                bestD = d2;
                best = list[i];
            }
        }
    } catch (e) {}
    return best;
}

function hurtPlayerVanilla(player, amount) {
    amount = Math.max(1, num(amount, 1));
    try { player.damage(amount); return true; } catch (e1) {}
    try {
        var mc = player.getMCEntity();
        if (mc == null) return false;
        var DamageSource = Java.type("net.minecraft.world.damagesource.DamageSource");
        var src = null;
        try { src = mc.damageSources().magic(); } catch (e2) {
            try { src = mc.m_269291_().m_269079_(); } catch (e3) {}
        }
        if (src != null) {
            try { mc.hurt(src, amount); return true; } catch (e4) {
                try { mc.m_6469_(src, amount); return true; } catch (e5) {}
            }
        }
    } catch (e6) {}
    return false;
}

function spawnDragonBreathFireball(world, dragon, target) {
    if (world == null || dragon == null || target == null) return false;
    var x = num(dragon.getX(), 0);
    var y = num(dragon.getY(), 0) - 1.5;
    var z = num(dragon.getZ(), 0);
    var tx = num(target.getX(), 0);
    var ty = num(target.getY(), 0) + 1.0;
    var tz = num(target.getZ(), 0);
    var dx = tx - x;
    var dy = ty - y;
    var dz = tz - z;
    var len = vecLength(dx, dy, dz);
    if (!(len > 0.001)) return false;
    var spd = num(DRAGON_BREATH_SPEED, 0.85);
    dx = (dx / len) * spd;
    dy = (dy / len) * spd;
    dz = (dz / len) * spd;

    try {
        var fb = world.createEntity("minecraft:dragon_fireball");
        if (fb != null) {
            try { fb.setPosition(x, y, z); } catch (e1) {
                try { fb.setPos(x, y, z); } catch (e2) {}
            }
            try {
                var mc = fb.getMCEntity();
                if (mc != null) {
                    try { mc.setDeltaMovement(dx, dy, dz); } catch (e3) {
                        try { mc.m_20334_(dx, dy, dz); } catch (e4) {}
                    }
                    /* power vector used by DragonFireball */
                    try {
                        mc.xPower = dx * 0.1;
                        mc.yPower = dy * 0.1;
                        mc.zPower = dz * 0.1;
                    } catch (e5) {
                        try {
                            mc.f_36864_ = dx * 0.1;
                            mc.f_36865_ = dy * 0.1;
                            mc.f_36866_ = dz * 0.1;
                        } catch (e6) {}
                    }
                }
            } catch (e7) {}
            world.spawnEntity(fb);
            return true;
        }
    } catch (e8) {}

    try {
        NpcAPI.Instance().executeCommand(world,
            "execute in minecraft:the_end run summon minecraft:dragon_fireball " +
            x.toFixed(2) + " " + y.toFixed(2) + " " + z.toFixed(2) +
            " {power:[" + dx.toFixed(3) + "," + dy.toFixed(3) + "," + dz.toFixed(3) + "]}");
        return true;
    } catch (e9) {}
    return false;
}

function fireDragonKiBeam(world, dragon, target) {
    if (world == null || dragon == null || target == null) return false;
    if (!isLivingDragon(dragon)) return false;

    var x0 = num(dragon.getX(), 0);
    var y0 = num(dragon.getY(), 0) - 1.0;
    var z0 = num(dragon.getZ(), 0);
    var x1 = num(target.getX(), 0);
    var y1 = num(target.getY(), 0) + 1.0;
    var z1 = num(target.getZ(), 0);
    var steps = 18;
    for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        var px = x0 + (x1 - x0) * t;
        var py = y0 + (y1 - y0) * t;
        var pz = z0 + (z1 - z0) * t;
        try {
            world.spawnParticle("minecraft:end_rod", px, py, pz, 0, 0, 0, 0.01, 2);
        } catch (e1) {
            try { world.spawnParticle("end_rod", px, py, pz, 0, 0, 0, 0.01, 2); } catch (e2) {}
        }
        try {
            world.spawnParticle("minecraft:dragon_breath", px, py, pz, 0, 0, 0, 0.02, 1);
        } catch (e3) {
            try { world.spawnParticle("dragon_breath", px, py, pz, 0, 0, 0, 0.02, 1); } catch (e4) {}
        }
    }

    var dmg = Math.max(4, num(DRAGON_KI_BEAM_DAMAGE, 14));
    var pulses = Math.max(1, Math.floor(num(DRAGON_KI_BEAM_HITS, 3)));
    for (var p = 0; p < pulses; p++) {
        hurtPlayerVanilla(target, dmg);
    }

    /*
     * Do NOT use world.playSoundAt / playsound here — CustomNPCs broadcasts
     * those as chat spam: [@CustomNPCs-API: Played sound ...].
     * Particles + damage are enough for the ki-beam feel.
     */
    return true;
}

function tickDragonExtraAttacks(world, player) {
    if (DRAGON_EXTRA_ATTACKS_ENABLED !== true) return;
    if (world == null || !isInTheEnd(world)) return;

    var dragons = [];
    try { dragons = findDragons(world); } catch (e1) {}
    if (dragons.length <= 0) {
        try { dragons = findDragonsOnLevel(getEndServerLevel()); } catch (e2) {}
    }

    /* Drop dead / dying dragons so attacks stop the moment the fight ends. */
    var living = [];
    for (var fi = 0; fi < dragons.length; fi++) {
        if (isLivingDragon(dragons[fi])) living.push(dragons[fi]);
    }
    if (living.length <= 0) return;

    var t = nowMs();
    try {
        var stored = world.getStoreddata();
        var last = stored.has(DRAGON_ATTACK_WORLD_LOCK)
            ? num(stored.get(DRAGON_ATTACK_WORLD_LOCK), 0) : 0;
        if (t - last < num(DRAGON_ATTACK_INTERVAL_MS, 3200)) return;
        stored.put(DRAGON_ATTACK_WORLD_LOCK, "" + t);
    } catch (eLock) {
        try {
            var temp = player.getTempdata();
            var lastP = temp.has(TEMP_DRAGON_ATTACK) ? num(temp.get(TEMP_DRAGON_ATTACK), 0) : 0;
            if (t - lastP < num(DRAGON_ATTACK_INTERVAL_MS, 3200)) return;
            temp.put(TEMP_DRAGON_ATTACK, "" + t);
        } catch (eLock2) { return; }
    }

    for (var d = 0; d < living.length; d++) {
        var dragon = living[d];
        if (!isLivingDragon(dragon)) continue;

        var target = nearestPlayerToEntity(dragon, world, DRAGON_ATTACK_RANGE);
        if (target == null) target = player;
        if (!isRealOnlinePlayer(target)) continue;

        var roll = Math.random();
        if (roll < num(DRAGON_KI_BEAM_CHANCE, 0.55)) {
            fireDragonKiBeam(world, dragon, target);
        } else {
            spawnDragonBreathFireball(world, dragon, target);
        }
    }
}

function resolveTriggerPlayer(event) {
    var playerName = "";
    try {
        if (event.arguments != null && event.arguments.length > 0) {
            playerName = str(event.arguments[0]).trim();
        }
    } catch (e1) {}
    try {
        if (playerName === "" && event.args != null && event.args.length > 0) {
            playerName = str(event.args[0]).trim();
        }
    } catch (e2) {}

    var player = null;
    if (playerName !== "") player = findOnlinePlayer(playerName);
    if (player == null) {
        try {
            if (isRealOnlinePlayer(event.entity)) player = event.entity;
        } catch (e3) {}
    }
    if (player == null) {
        try {
            if (isRealOnlinePlayer(event.player)) player = event.player;
        } catch (e4) {}
    }
    return { player: player, playerName: playerName };
}

/* ========================= EVENTS ========================= */

function tick(event) {
    try {
        var player = event.player;
        if (!isPlayer(player)) return;

        /* Runs in any dimension — DMZ kill TP may land a few ticks after death. */
        try { processEndKillTpClawback(player); } catch (eClaw) {}

        /* Retry /enddragon if fight spawn lagged after trigger 50. */
        try { processCmdSpawnRequest(player); } catch (eCmd) {}

        var world = player.getWorld();
        if (!isInTheEnd(world)) return;

        var temp = player.getTempdata();
        var t = nowMs();

        /* Scripted ki beam / breath attacks while a dragon is alive. */
        try { tickDragonExtraAttacks(world, player); } catch (eAtk) {}

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
                    /* Soft repair only — avoid thrashing attributes (breaks AI). */
                    try {
                        var intended = readNbtNumber(ent, END_STRENGTH_MAX_NBT);
                        var curMax = getEntityMaxHealthSafe(ent);
                        if (intended > 0 && curMax + 1 < intended * 0.5) {
                            repairEndHealthIfStripped(ent, "dragon");
                        }
                    } catch (eRep) {}
                    maybeRescaleDragon(ent, world, player);
                } else if (kind != null) {
                    repairEndHealthIfStripped(ent, kind);
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
        var kind = classifyEndEntity(victim);
        if (kind == null) return;

        /* Settle HP-scaled DMZ kill TP up/down to Sparring-scale End payout. */
        try {
            scheduleEndKillTpClawback(player, kind, getEntityMaxHealthSafe(victim));
        } catch (eTp) {}

        if (kind !== "dragon") return;

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
        if (isDragon) {
            /* Keep scaling to whichever End player is currently strongest. */
            try { maybeRescaleDragon(target, getEndWorld() || target.getWorld(), event.player); } catch (eScale) {}
            def = readEntityDefense(target);
        }
        if (!(def > 0)) {
            try {
                var world = target.getWorld();
                if (isDragon) {
                    var best = strongestPowerInEnd(world, isPlayer(event.player) ? event.player : null);
                    if (best.player != null || best.power != null) {
                        applyDragonStats(target, best.power, "onhit");
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

        /* Lock fight length even when other systems send enormous packets. */
        mitigated = capDamageForHitCount(target, kind, mitigated);

        /* Real HP path: let capped mitigated damage reduce vanilla health / boss bar. */
        event.damage = mitigated;
    } catch (error) {
        try { print("[EndStrength] damagedEntity: " + error); } catch (e) {}
    }
}

function trigger(event) {
    try {
        if (event == null) return;

        /*
         * Same pattern as Global TP Boost / Android conversion:
         * resolve the target from arguments[0], NOT event.entity.
         * With CMI asFakeOp!, event.entity is the FakePlayer — using it
         * makes spawn/messages hit the fake source and look like "nothing happened".
         */
        var id = -1;
        try { id = Number(event.id); } catch (eId) { id = -1; }
        if (id != TRIGGER_SPAWN_ID && id != TRIGGER_CLEANUP_ID) return;

        var resolved = resolveTriggerPlayer(event);
        var player = resolved.player;
        var playerName = resolved.playerName;

        if (player == null) {
            try {
                print("[EndStrength] trigger " + id + ": online player not found (" + playerName +
                    "). Use: noppes script trigger " + id + " <PlayerName>");
            } catch (e5) {}
            return;
        }

        if (id == TRIGGER_CLEANUP_ID) {
            try {
                print("[EndStrength] trigger 51 -> cmdCleanupDragons for " + str(player.getName()));
            } catch (e6) {}
            msg(player, COLOR + "7[The End] Trigger 51 received — clearing dragons...");
            cmdCleanupDragons(player);
            return;
        }

        try {
            print("[EndStrength] trigger 50 -> cmdSpawnDragon for " + str(player.getName()));
        } catch (e7) {}
        msg(player, COLOR + "7[The End] Trigger 50 received — spawning dragon...");
        cmdSpawnDragon(player);
    } catch (error) {
        try { print("[EndStrength] trigger: " + error); } catch (e) {}
    }
}

/*
 * ============================================================
 * DBZ LEGACY REBORN - MEDITATION SYSTEM
 * DragonMineZ 2.1.3 / CustomNPCs 1.20.1 / Nashorn ES5
 * ============================================================
 *
 * VERIFIED AGAINST dragonminez-2.1.3:
 * - StatsProvider.get(StatsCapability.INSTANCE, entity)
 * - StatsData.getResources().getCurrentEnergy()
 * - StatsData.getMaxEnergy()
 * - StatsData.getStatus().isChargingKi()
 * - StatsData.getSkills()
 * - Skills.getSkillLevel(String)
 * - Skills.getMaxSkillLevel(String)
 * - Skills.setSkillLevel(String, int)
 * - NetworkHandler.sendToTrackingEntityAndSelf(...)
 * - new StatsSyncS2C(ServerPlayer)
 *
 * Install as a CustomNPCs PLAYER script.
 */

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var System = Java.type("java.lang.System");
var BlockPos = Java.type("net.minecraft.core.BlockPos");
var FluidTags = Java.type("net.minecraft.tags.FluidTags");
var BuiltInRegistries = Java.type("net.minecraft.core.registries.BuiltInRegistries");

/* ============================================================
 * CONFIGURATION
 * ============================================================ */

var CONFIG = {
    DEBUG: false,
    SHOW_PROGRESS_CONFIRMATION: true,
    CHECK_INTERVAL_MS: 1000,
    TRIAL_DURATION_MS: 15 * 60 * 1000,
    TRIAL_WARNING_MS: 5 * 60 * 1000,
    ROTATION_LOCK_MS: 3000,
    FOCUS_WINDOW_MS: 10 * 1000,
    CONDITION_MESSAGE_COOLDOWN_MS: 5000,

    /* Wrong-biome warning */
    WRONG_BIOME_DELAY_MS: 10 * 1000,
    WRONG_BIOME_RELEASE_GRACE_MS: 2500,
    WRONG_BIOME_HARD_COOLDOWN_MS: 60 * 1000,

    MAX_MEDITATION_LEVEL: 10,

    /* Leave false unless you intentionally want to wipe old progress once. */
    CLEAR_OLD_PROGRESS_ONCE: false
};

var SKILL_ID = "meditation";

var REQUIRED_SECONDS = {
    2: 30,
    3: 60,
    4: 120,
    5: 240,
    6: 360,
    7: 480,
    8: 600,
    9: 720,
    10: 900
};

var TRIALS = [
    {
        id: "minecraft:plains",
        name: "Plains",
        type: "plains",
        condition: "Sneak while charging Ki below 50%."
    },
    {
        id: "minecraft:desert",
        name: "Desert",
        type: "desert",
        condition: "Charge Ki during daytime while below 40%."
    },
    {
        id: "minecraft:snowy_plains",
        name: "Snowy Plains",
        type: "snowy_plains",
        condition: "Sneak above Y 80 while charging Ki."
    },
    {
        id: "minecraft:nether_wastes",
        name: "Nether Wastes",
        type: "nether_wastes",
        condition: "Charge Ki below Y 64 while below 40%."
    },
    {
        id: "minecraft:warped_forest",
        name: "Warped Forest",
        type: "warped_forest",
        condition: "Sneak and remain within 1.5 blocks while charging."
    },
    {
        id: "minecraft:soul_sand_valley",
        name: "Soul Sand Valley",
        type: "soul_sand_valley",
        condition: "Remain within 1 block and avoid damage for 12 seconds while charging."
    },
    {
        id: "dragonminez:ajissa_plains",
        name: "Ajissa Plains",
        type: "ajissa_plains",
        condition: "Sneak while charging Ki below 50%."
    },
    {
        id: "dragonminez:namekian_rivers",
        name: "Namekian Rivers",
        type: "namekian_rivers",
        condition: "Charge Ki below 50% while inside the Namekian Rivers biome."
    },
    {
        id: "dragonminez:sacredkai_hills",
        name: "Sacred Kai Hills",
        type: "sacredkai_hills",
        condition: "Charge above Y 90 without taking damage for 10 seconds."
    },
    {
        id: "dragonminez:hyperbolic_time_chamber",
        name: "Hyperbolic Time Chamber",
        type: "htc",
        condition: "Remain within 1.5 blocks for 10 seconds while charging below 30%."
    }
];

/* ============================================================
 * STORAGE KEYS
 * ============================================================ */

var G_TRIAL_INDEX = "med2_global_trial_index";
var G_TRIAL_END = "med2_global_trial_end";
var G_TRIAL_WARNING = "med2_global_trial_warning";
var G_ROTATION_LOCK = "med2_global_rotation_lock";

var P_NEXT_CHECK = "med2_next_check";
var P_LAST_LEVEL = "med2_last_level";
var P_RESET_DONE = "med2_old_progress_reset_done";
var P_LAST_DAMAGE = "med2_last_damage";
var P_MSG_NEXT = "med2_message_next";
var P_DEBUG_NEXT = "med2_debug_next";

var P_FOCUS_WAS_CHARGING = "med2_focus_was_charging";
var P_FOCUS_STARTED = "med2_focus_started";
var P_FOCUS_WAIT_RELEASE = "med2_focus_wait_release";

var P_STILL_X = "med2_still_x";
var P_STILL_Z = "med2_still_z";
var P_STILL_STARTED = "med2_still_started";
var P_RADIUS_X = "med2_radius_x";
var P_RADIUS_Z = "med2_radius_z";
var P_RADIUS_TRIAL = "med2_radius_trial";

/* Wrong-biome state is intentionally independent from progression. */
var P_WRONG_STARTED = "med2_wrong_started";
var P_WRONG_LAST_TRUE = "med2_wrong_last_true";
var P_WRONG_WARNED = "med2_wrong_warned";
var P_WRONG_LAST_MESSAGE = "med2_wrong_last_message";

/* ============================================================
 * BASIC HELPERS
 * ============================================================ */

function nowMs() {
    return Number(System.currentTimeMillis());
}

function readNumber(data, key, fallback) {
    try {
        if (data != null && data.has(key)) {
            var value = Number("" + data.get(key));
            if (!isNaN(value)) return value;
        }
    } catch (err) {}
    return fallback;
}

function readBoolean(data, key, fallback) {
    try {
        if (data != null && data.has(key)) {
            return String(data.get(key)) == "true";
        }
    } catch (err) {}
    return fallback;
}

function putBoolean(data, key, value) {
    try {
        data.put(key, value ? "true" : "false");
    } catch (err) {}
}

function removeKey(data, key) {
    try {
        data.remove(key);
    } catch (err) {}
}

function formatDuration(milliseconds) {
    var total = Math.max(0, Math.floor(Number(milliseconds) / 1000));
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    if (minutes > 0) return minutes + "m " + seconds + "s";
    return seconds + "s";
}

function tell(player, text) {
    try {
        player.message("\u00A75\u00A7l[Meditation] \u00A7r" + text);
    } catch (err) {}
}

function tellCondition(player, text, now) {
    try {
        var temp = player.getTempdata();
        var next = readNumber(temp, P_MSG_NEXT, 0);
        if (now < next) return;
        temp.put(P_MSG_NEXT, "" + (now + CONFIG.CONDITION_MESSAGE_COOLDOWN_MS));
        tell(player, text);
    } catch (err) {}
}

/* ============================================================
 * GLOBAL WORLD STORAGE
 * ============================================================ */

function getGlobalStorage(player) {
    var api = null;
    var world = null;

    try {
        api = NpcAPI.Instance();
    } catch (err0) {}

    if (api != null) {
        try { world = api.getIWorld("minecraft:overworld"); } catch (err1) {}
        if (world == null) {
            try { world = api.getIWorld("overworld"); } catch (err2) {}
        }
        if (world == null) {
            try {
                var worlds = api.getIWorlds();
                if (worlds != null && worlds.length > 0) world = worlds[0];
            } catch (err3) {}
        }
    }

    if (world == null && player != null) {
        try { world = player.getWorld(); } catch (err4) {}
    }

    if (world == null) return null;
    try { return world.getStoreddata(); } catch (err5) { return null; }
}

function forEachOnlinePlayer(callback) {
    try {
        var worlds = NpcAPI.Instance().getIWorlds();
        var seen = {};
        var w;
        var p;

        for (w = 0; w < worlds.length; w++) {
            var players = null;
            try { players = worlds[w].getAllPlayers(); } catch (err1) {}
            if (players == null) continue;

            for (p = 0; p < players.length; p++) {
                var player = players[p];
                var name = String(player.getName()).toLowerCase();
                if (seen[name]) continue;
                seen[name] = true;
                try { callback(player); } catch (err2) {}
            }
        }
    } catch (err) {}
}

function broadcast(message) {
    forEachOnlinePlayer(function(player) {
        player.message(message);
    });
}

/* ============================================================
 * TRIAL ROTATION
 * ============================================================ */

function announceTrial(trial, remaining) {
    broadcast("\u00A75\u00A7l\u262F MEDITATION TRIAL");
    broadcast("\u00A77Current Trial: \u00A7e" + trial.name);
    broadcast("\u00A77Requirement: \u00A7f" + trial.condition);
    broadcast("\u00A77Changes in \u00A7f" + formatDuration(remaining) + "\u00A77.");
}

function chooseNewTrial(storage, now) {
    var previous = Math.floor(readNumber(storage, G_TRIAL_INDEX, -1));
    var index = Math.floor(Math.random() * TRIALS.length);

    if (TRIALS.length > 1 && index == previous) {
        index = (index + 1) % TRIALS.length;
    }

    storage.put(G_TRIAL_INDEX, "" + index);
    storage.put(G_TRIAL_END, "" + (now + CONFIG.TRIAL_DURATION_MS));
    putBoolean(storage, G_TRIAL_WARNING, false);

    announceTrial(TRIALS[index], CONFIG.TRIAL_DURATION_MS);
    return TRIALS[index];
}

function getCurrentTrial(player, now) {
    var storage = getGlobalStorage(player);
    if (storage == null) return null;

    var index = Math.floor(readNumber(storage, G_TRIAL_INDEX, -1));
    var end = readNumber(storage, G_TRIAL_END, 0);

    if (index < 0 || index >= TRIALS.length || end <= now) {
        var lock = readNumber(storage, G_ROTATION_LOCK, 0);
        if (now < lock) return null;

        storage.put(G_ROTATION_LOCK, "" + (now + CONFIG.ROTATION_LOCK_MS));

        index = Math.floor(readNumber(storage, G_TRIAL_INDEX, -1));
        end = readNumber(storage, G_TRIAL_END, 0);

        if (index < 0 || index >= TRIALS.length || end <= now) {
            return chooseNewTrial(storage, now);
        }
    }

    var remaining = end - now;
    if (remaining > 0 && remaining <= CONFIG.TRIAL_WARNING_MS) {
        if (!readBoolean(storage, G_TRIAL_WARNING, false)) {
            putBoolean(storage, G_TRIAL_WARNING, true);
            broadcast(
                "\u00A75[Meditation Trial] \u00A7f" + TRIALS[index].name +
                "\u00A77 remains active for \u00A7e5 more minutes\u00A77."
            );
        }
    }

    return TRIALS[index];
}

/* ============================================================
 * DMZ ACCESS
 * ============================================================ */

function getStatsData(player) {
    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        return StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);
    } catch (err) {
        return null;
    }
}

function getCurrentEnergy(data) {
    try {
        var resources = data.getResources();
        if (resources == null) return -1;
        return Number(resources.getCurrentEnergy());
    } catch (err) {
        return -1;
    }
}

function isChargingKi(data) {
    try {
        var status = data.getStatus();
        if (status == null) return false;

        /*
         * Keep the exact Nashorn conversion used by the known-working
         * Meditation script. DragonMineZ returns a Java boolean here.
         */
        return Boolean(status.isChargingKi());
    } catch (err) {
        return false;
    }
}

function syncStats(mcPlayer) {
    try {
        NetworkHandler.sendToTrackingEntityAndSelf(
            new StatsSyncS2C(mcPlayer),
            mcPlayer
        );
    } catch (err) {}
}

/* ============================================================
 * BIOME DETECTION
 * ============================================================ */

function normalizeBiomeId(value) {
    if (value == null || String(value) == "null") return "";

    var text = String(value).toLowerCase().trim();
    var colon = text.indexOf(":");

    if (colon >= 0) {
        var start = colon;
        while (start > 0 && /[a-z0-9_.-]/.test(text.charAt(start - 1))) start--;

        var end = colon + 1;
        while (end < text.length && /[a-z0-9_./-]/.test(text.charAt(end))) end++;

        text = text.substring(start, end);
    }

    return text
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_:./-]/g, "");
}

function biomeMatches(found, required) {
    found = normalizeBiomeId(found);
    required = normalizeBiomeId(required);

    if (found == "" || required == "") return false;
    if (found == required) return true;

    var foundPath = found.indexOf(":") >= 0
        ? found.substring(found.indexOf(":") + 1)
        : found;

    var requiredPath = required.indexOf(":") >= 0
        ? required.substring(required.indexOf(":") + 1)
        : required;

    return foundPath == requiredPath;
}

function getBiomeId(player) {
    try {
        var world = player.getWorld();
        if (world != null) {
            var x = Math.floor(Number(player.getX()));
            var z = Math.floor(Number(player.getZ()));
            var direct = normalizeBiomeId(world.getBiomeName(x, z));
            if (direct != "") return direct;
        }
    } catch (err1) {}

    try {
        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return "";

        var level = null;
        try { level = mcPlayer.level(); } catch (err2) {
            try { level = mcPlayer.m_9236_(); } catch (err3) {}
        }
        if (level == null) return "";

        var pos = null;
        try { pos = mcPlayer.blockPosition(); } catch (err4) {
            try { pos = mcPlayer.m_20183_(); } catch (err5) {}
        }
        if (pos == null) return "";

        var holder = level.getBiome(pos);
        if (holder == null) return "";

        var optional = holder.unwrapKey();
        if (optional != null && optional.isPresent()) {
            return normalizeBiomeId(optional.get().location().toString());
        }
    } catch (err6) {}

    return "";
}

/* ============================================================
 * WRONG-BIOME WARNING
 * ============================================================
 *
 * This state machine is read-only with respect to Meditation.
 * It never resets focus, changes energy, blocks progress, or changes levels.
 *
 * Guarantees:
 * - No message before 10 seconds.
 * - One message per charging attempt.
 * - Brief DMZ false samples do not instantly reset the attempt.
 * - Hard 60-second backstop prevents chat spam even if state data misbehaves.
 */

function resetWrongBiomeAttempt(data, preserveLastMessage) {
    removeKey(data, P_WRONG_STARTED);
    removeKey(data, P_WRONG_LAST_TRUE);
    putBoolean(data, P_WRONG_WARNED, false);
    if (!preserveLastMessage) removeKey(data, P_WRONG_LAST_MESSAGE);
}

function updateWrongBiomeWarning(player, trial, wrongBiome, charging, now) {
    var stored = null;
    try { stored = player.getStoreddata(); } catch (err0) { return; }
    if (stored == null) return;

    if (!wrongBiome) {
        resetWrongBiomeAttempt(stored, true);
        return;
    }

    var started = readNumber(stored, P_WRONG_STARTED, 0);
    var lastTrue = readNumber(stored, P_WRONG_LAST_TRUE, 0);
    var warned = readBoolean(stored, P_WRONG_WARNED, false);
    var lastMessage = readNumber(stored, P_WRONG_LAST_MESSAGE, 0);

    if (charging) {
        stored.put(P_WRONG_LAST_TRUE, "" + now);

        if (started <= 0) {
            started = now;
            stored.put(P_WRONG_STARTED, "" + started);
            putBoolean(stored, P_WRONG_WARNED, false);
            warned = false;
        }

        if (
            !warned &&
            now - started >= CONFIG.WRONG_BIOME_DELAY_MS &&
            now - lastMessage >= CONFIG.WRONG_BIOME_HARD_COOLDOWN_MS
        ) {
            tell(
                player,
                "\u00A77Current Trial: \u00A7e" + trial.name +
                "\u00A77. You are charging in the wrong biome."
            );

            putBoolean(stored, P_WRONG_WARNED, true);
            stored.put(P_WRONG_LAST_MESSAGE, "" + now);
        }

        return;
    }

    /* Ignore brief false samples from DMZ. */
    if (lastTrue > 0 && now - lastTrue <= CONFIG.WRONG_BIOME_RELEASE_GRACE_MS) {
        return;
    }

    /* A real release starts a new future attempt, while retaining anti-spam time. */
    resetWrongBiomeAttempt(stored, true);
}

/* ============================================================
 * PLAYER / WORLD CONDITIONS
 * ============================================================ */

function isSneaking(player) {
    try {
        var mcPlayer = player.getMCEntity();
        try { return mcPlayer.isShiftKeyDown() == true; } catch (err1) {
            return mcPlayer.m_6144_() == true;
        }
    } catch (err2) {
        return false;
    }
}

function isDaytime(player) {
    try {
        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return false;

        var level = null;
        try { level = mcPlayer.level(); } catch (err1) {
            try { level = mcPlayer.m_9236_(); } catch (err2) {}
        }
        if (level == null) return false;

        try { return level.isDay() == true; } catch (err3) {}
        try { return level.m_46461_() == true; } catch (err4) {}

        var dayTime = -1;
        try { dayTime = Number(level.getDayTime()); } catch (err5) {
            try { dayTime = Number(level.m_46468_()); } catch (err6) {}
        }

        if (isNaN(dayTime) || dayTime < 0) return false;
        dayTime = ((dayTime % 24000) + 24000) % 24000;
        return dayTime < 12000;
    } catch (err7) {
        return false;
    }
}

function isWaterFluidState(fluidState) {
    if (fluidState == null) return false;

    /* First use Minecraft's water tag. */
    try {
        if (fluidState.is(FluidTags.WATER)) return true;
    } catch (tagErr) {}

    /*
     * DragonMineZ Namek water uses custom fluid registry IDs.
     * Check the actual fluid ID directly so this still works if
     * CustomNPCs/Nashorn cannot resolve the water tag correctly.
     */
    try {
        var fluidType = fluidState.getType();
        var fluidKey = BuiltInRegistries.FLUID.getKey(fluidType);
        var fluidId = String(fluidKey);

        if (
            fluidId == "dragonminez:namek_water_fluid" ||
            fluidId == "dragonminez:flowing_namek_water_fluid" ||
            fluidId == "minecraft:water" ||
            fluidId == "minecraft:flowing_water"
        ) {
            return true;
        }
    } catch (registryErr) {}

    return false;
}

function isNearWater(player) {
    try {
        var mcPlayer = player.getMCEntity();
        var level = null;

        try { level = mcPlayer.level(); } catch (err1) {
            level = mcPlayer.m_9236_();
        }
        if (level == null) return false;

        var baseX = Math.floor(Number(player.getX()));
        var baseY = Math.floor(Number(player.getY()));
        var baseZ = Math.floor(Number(player.getZ()));

        /* Seven-block horizontal radius and three blocks vertically. */
        for (var x = -7; x <= 7; x++) {
            for (var y = -3; y <= 3; y++) {
                for (var z = -7; z <= 7; z++) {
                    var pos = new BlockPos(baseX + x, baseY + y, baseZ + z);
                    var fluidState = null;

                    try {
                        fluidState = level.getFluidState(pos);
                    } catch (fluidErr1) {
                        try {
                            fluidState = level.m_6425_(pos);
                        } catch (fluidErr2) {}
                    }

                    if (isWaterFluidState(fluidState)) return true;
                }
            }
        }
    } catch (err2) {
        debugLog(player, "Namek water check error: " + err2);
    }

    return false;
}

function markDamage(player) {
    try {
        player.getTempdata().put(P_LAST_DAMAGE, "" + nowMs());
    } catch (err) {}
}

function damaged(event) {
    if (event.player != null) markDamage(event.player);
}

function damagedEntity(event) {
    if (event.player != null) markDamage(event.player);
}

function avoidedDamage(player, requiredMs, now) {
    try {
        var last = readNumber(player.getTempdata(), P_LAST_DAMAGE, 0);
        return now - last >= requiredMs;
    } catch (err) {
        return false;
    }
}

function resetPositionState(player) {
    try {
        var temp = player.getTempdata();
        removeKey(temp, P_STILL_X);
        removeKey(temp, P_STILL_Z);
        removeKey(temp, P_STILL_STARTED);
        removeKey(temp, P_RADIUS_X);
        removeKey(temp, P_RADIUS_Z);
        removeKey(temp, P_RADIUS_TRIAL);
    } catch (err) {}
}

function remainedStill(player, radius, requiredMs, now) {
    try {
        var temp = player.getTempdata();
        var x = Number(player.getX());
        var z = Number(player.getZ());

        var anchorX = readNumber(temp, P_STILL_X, NaN);
        var anchorZ = readNumber(temp, P_STILL_Z, NaN);
        var started = readNumber(temp, P_STILL_STARTED, 0);

        if (isNaN(anchorX) || isNaN(anchorZ) || started <= 0) {
            temp.put(P_STILL_X, "" + x);
            temp.put(P_STILL_Z, "" + z);
            temp.put(P_STILL_STARTED, "" + now);
            return false;
        }

        var dx = x - anchorX;
        var dz = z - anchorZ;
        var distance = Math.sqrt(dx * dx + dz * dz);

        if (isNaN(distance) || distance > radius) {
            temp.put(P_STILL_X, "" + x);
            temp.put(P_STILL_Z, "" + z);
            temp.put(P_STILL_STARTED, "" + now);
            return false;
        }

        return now - started >= requiredMs;
    } catch (err) {
        return false;
    }
}

function insideRadius(player, radius, trialType) {
    try {
        var temp = player.getTempdata();
        var x = Number(player.getX());
        var z = Number(player.getZ());
        var oldTrial = temp.has(P_RADIUS_TRIAL) ? String(temp.get(P_RADIUS_TRIAL)) : "";

        if (oldTrial != String(trialType)) {
            temp.put(P_RADIUS_TRIAL, "" + trialType);
            temp.put(P_RADIUS_X, "" + x);
            temp.put(P_RADIUS_Z, "" + z);
            return true;
        }

        var anchorX = readNumber(temp, P_RADIUS_X, NaN);
        var anchorZ = readNumber(temp, P_RADIUS_Z, NaN);

        if (isNaN(anchorX) || isNaN(anchorZ)) {
            temp.put(P_RADIUS_X, "" + x);
            temp.put(P_RADIUS_Z, "" + z);
            return true;
        }

        var dx = x - anchorX;
        var dz = z - anchorZ;
        var distance = Math.sqrt(dx * dx + dz * dz);

        if (isNaN(distance) || distance > radius) {
            temp.put(P_RADIUS_X, "" + x);
            temp.put(P_RADIUS_Z, "" + z);
            return false;
        }

        return true;
    } catch (err) {
        return false;
    }
}

/* ============================================================
 * FOCUS SYSTEM
 * ============================================================ */

function resetFocus(player) {
    try {
        var temp = player.getTempdata();
        putBoolean(temp, P_FOCUS_WAS_CHARGING, false);
        putBoolean(temp, P_FOCUS_WAIT_RELEASE, false);
        temp.put(P_FOCUS_STARTED, "0");
    } catch (err) {}
}

function passesFocus(player, charging, now) {
    try {
        var temp = player.getTempdata();
        var wasCharging = readBoolean(temp, P_FOCUS_WAS_CHARGING, false);
        var waiting = readBoolean(temp, P_FOCUS_WAIT_RELEASE, false);
        var started = readNumber(temp, P_FOCUS_STARTED, 0);

        if (!charging) {
            putBoolean(temp, P_FOCUS_WAS_CHARGING, false);

            if (waiting) {
                putBoolean(temp, P_FOCUS_WAIT_RELEASE, false);
                temp.put(P_FOCUS_STARTED, "0");
            }

            return false;
        }

        if (!wasCharging) {
            putBoolean(temp, P_FOCUS_WAS_CHARGING, true);
            putBoolean(temp, P_FOCUS_WAIT_RELEASE, false);
            temp.put(P_FOCUS_STARTED, "" + now);
            return true;
        }

        if (waiting) {
            tellCondition(player, "\u00A7eRelease Ki and begin charging again to renew your focus.", now);
            return false;
        }

        if (started <= 0) {
            temp.put(P_FOCUS_STARTED, "" + now);
            return true;
        }

        if (now - started >= CONFIG.FOCUS_WINDOW_MS) {
            putBoolean(temp, P_FOCUS_WAIT_RELEASE, true);
            tellCondition(player, "\u00A7eRelease Ki and begin charging again to renew your focus.", now);
            return false;
        }

        return true;
    } catch (err) {
        return false;
    }
}

/* ============================================================
 * TRIAL CONDITION CHECKS
 * ============================================================ */

function passesTrialCondition(player, trial, currentEnergy, maxEnergy, now) {
    var percent = maxEnergy > 0 ? currentEnergy / maxEnergy : 1;
    var y = Number(player.getY());

    switch (String(trial.type)) {
        case "plains":
            return isSneaking(player) && percent <= 0.50;

        case "desert":
            return isDaytime(player) && percent <= 0.40;

        case "snowy_plains":
            return isSneaking(player) && y >= 80;

        case "nether_wastes":
            return y <= 64 && percent <= 0.40;

        case "warped_forest":
            return isSneaking(player) && insideRadius(player, 1.5, trial.type);

        case "soul_sand_valley":
            return avoidedDamage(player, 12000, now) && remainedStill(player, 1.0, 12000, now);

        case "ajissa_plains":
            return isSneaking(player) && percent <= 0.50;

        case "namekian_rivers":
            /*
             * The biome check is already performed before this function.
             * Do not require a second nearby-fluid scan because the custom
             * Namek water lookup is unreliable through CustomNPCs/Nashorn.
             */
            return percent <= 0.50;

        case "sacredkai_hills":
            return y >= 90 && avoidedDamage(player, 10000, now);

        case "htc":
            return percent <= 0.30 && remainedStill(player, 1.5, 10000, now);
    }

    return false;
}

/* ============================================================
 * PROGRESS
 * ============================================================ */

function clearProgress(player) {
    try {
        var stored = player.getStoreddata();
        var level;
        for (level = 2; level <= CONFIG.MAX_MEDITATION_LEVEL; level++) {
            removeKey(stored, "meditation_restore_progress_to_level_" + level);
            removeKey(stored, "meditation_progress_to_level_" + level);
            removeKey(stored, "meditation_training_progress_to_level_" + level);
        }
    } catch (err) {}
}

function clearOldProgressOnce(player, currentLevel) {
    if (!CONFIG.CLEAR_OLD_PROGRESS_ONCE) return;

    try {
        var stored = player.getStoreddata();
        if (stored.has(P_RESET_DONE)) return;

        clearProgress(player);
        putBoolean(stored, P_RESET_DONE, true);
        stored.put(P_LAST_LEVEL, "" + currentLevel);
        tell(player, "\u00A7eYour old Meditation progress was cleared for the new system.");
    } catch (err) {}
}

function handleLevelDrop(player, currentLevel) {
    try {
        var stored = player.getStoreddata();
        var previous = readNumber(stored, P_LAST_LEVEL, currentLevel);

        if (currentLevel < previous) {
            clearProgress(player);
            resetFocus(player);
            resetPositionState(player);
            tell(player, "\u00A7eStored progress was cleared because your Meditation level was reset.");
        }

        if (currentLevel != previous || !stored.has(P_LAST_LEVEL)) {
            stored.put(P_LAST_LEVEL, "" + currentLevel);
        }
    } catch (err) {}
}

function addProgress(player, mcPlayer, skills, currentLevel, maxLevel) {
    var nextLevel = currentLevel + 1;
    var required = REQUIRED_SECONDS[nextLevel];
    if (required == null) required = nextLevel * 120;

    var stored = player.getStoreddata();
    var key = "meditation_restore_progress_to_level_" + nextLevel;
    var progress = Math.floor(readNumber(stored, key, 0));
    progress++;

    /*
     * Temporary confirmation so the live server proves progress is moving.
     * Set SHOW_PROGRESS_CONFIRMATION to false after verification.
     */
    if (CONFIG.SHOW_PROGRESS_CONFIRMATION && (progress == 1 || progress % 5 == 0)) {
        tell(
            player,
            "\u00A77Progress: \u00A7e" + progress + "\u00A77/\u00A7e" + required +
            " \u00A77toward level \u00A7e" + nextLevel + "\u00A77."
        );
    }

    if (progress < required) {
        stored.put(key, "" + progress);
        return;
    }

    stored.put(key, "" + required);
    skills.setSkillLevel(SKILL_ID, nextLevel);

    var confirmed = Number(skills.getSkillLevel(SKILL_ID));
    if (isNaN(confirmed) || confirmed < nextLevel) {
        tell(player, "\u00A7cDragonMineZ rejected the Meditation level increase.");
        return;
    }

    stored.put(P_LAST_LEVEL, "" + confirmed);
    tell(player, "\u00A7aMeditation increased to level \u00A7e" + confirmed + "\u00A7a.");

    if (confirmed >= maxLevel) {
        tell(player, "\u00A76Meditation is now maxed.");
    }

    syncStats(mcPlayer);
}

/* ============================================================
 * DEBUG
 * ============================================================ */

function debug(player, trial, biome, charging, currentEnergy, maxEnergy, now) {
    if (!CONFIG.DEBUG) return;

    try {
        var temp = player.getTempdata();
        var next = readNumber(temp, P_DEBUG_NEXT, 0);
        if (now < next) return;
        temp.put(P_DEBUG_NEXT, "" + (now + 2000));

        var percent = maxEnergy > 0
            ? Math.floor((currentEnergy / maxEnergy) * 100)
            : 0;

        player.message(
            "\u00A78[Med Debug] biome=" + biome +
            " required=" + trial.id +
            " match=" + biomeMatches(biome, trial.id) +
            " charging=" + charging +
            " ki=" + percent + "%"
        );
    } catch (err) {}
}

/* ============================================================
 * MAIN PLAYER TICK
 * ============================================================ */

function tick(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var now = nowMs();
        var temp = player.getTempdata();
        var nextCheck = readNumber(temp, P_NEXT_CHECK, 0);

        if (now < nextCheck) return;
        temp.put(P_NEXT_CHECK, "" + (now + CONFIG.CHECK_INTERVAL_MS));

        var trial = getCurrentTrial(player, now);
        if (trial == null) return;

        var data = getStatsData(player);
        if (data == null) return;

        var skills = data.getSkills();
        if (skills == null) return;

        var level = Number(skills.getSkillLevel(SKILL_ID));
        if (isNaN(level)) level = 0;

        clearOldProgressOnce(player, level);
        handleLevelDrop(player, level);

        if (level < 1) return;

        var maxLevel = CONFIG.MAX_MEDITATION_LEVEL;
        try {
            var dmzMax = Number(skills.getMaxSkillLevel(SKILL_ID));
            if (!isNaN(dmzMax) && dmzMax > 0) {
                maxLevel = Math.min(dmzMax, CONFIG.MAX_MEDITATION_LEVEL);
            }
        } catch (err1) {}

        if (level >= maxLevel) return;

        var biome = getBiomeId(player);
        var charging = isChargingKi(data);
        var wrongBiome = !biomeMatches(biome, trial.id);

        /* Warning observer runs independently and cannot block progression. */
        updateWrongBiomeWarning(player, trial, wrongBiome, charging, now);

        var currentEnergy = getCurrentEnergy(data);
        var maxEnergy = Number(data.getMaxEnergy());

        debug(player, trial, biome, charging, currentEnergy, maxEnergy, now);

        if (wrongBiome) {
            resetPositionState(player);
            resetFocus(player);
            return;
        }

        if (currentEnergy < 0 || isNaN(maxEnergy) || maxEnergy <= 0) return;

        if (currentEnergy >= maxEnergy * 0.995) {
            resetFocus(player);
            tellCondition(player, "\u00A7eYour Ki must be below 100% before you can meditate.", now);
            return;
        }

        if (!passesFocus(player, charging, now)) return;
        if (!passesTrialCondition(player, trial, currentEnergy, maxEnergy, now)) return;

        addProgress(player, player.getMCEntity(), skills, level, maxLevel);

    } catch (err) {
        try {
            player.message("\u00A74[Meditation Error] \u00A7c" + err);
        } catch (ignored) {}
    }
}
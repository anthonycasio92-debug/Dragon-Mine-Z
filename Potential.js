/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var AbstractKiProjectile = Java.type("com.dragonminez.common.init.entities.ki.AbstractKiProjectile");
var GravityLogic = Java.type("com.dragonminez.server.util.GravityLogic");
var MCPlayerClass = Java.type("net.minecraft.world.entity.player.Player");
var System = Java.type("java.lang.System");
/* Optional — do not fail the whole Script tab if Bukkit bridge is missing. */
var Bukkit = null;
try { Bukkit = Java.type("org.bukkit.Bukkit"); } catch (eBukkit) { Bukkit = null; }


/*
 * ============================================================
 * POTENTIAL SETTINGS
 * ============================================================
 */

var POTENTIAL_UNLOCK = "potentialunlock";

var HARD_MAX_LEVEL = 30;
var NATURAL_POTENTIAL_CAP = 10;

var MAX_SAME_METHOD_STREAK = 5;
var DUPLICATE_EVENT_WINDOW_MS = 500;

/*
 * Final cap after gravity, weights, and Prestige are applied.
 */
var MAX_POTENTIAL_POINTS_PER_HIT = 30;

/*
 * ============================================================
 * CUSTOM GRAVITY / WEIGHT BALANCE
 * ============================================================
 *
 * Gravity stops increasing Potential gain at 1000G.
 * Effective weight stops increasing Potential gain at 1000.
 */
var MAX_GRAVITY_FOR_POTENTIAL = 1000.0;
var MAX_EFFECTIVE_WEIGHT_FOR_POTENTIAL = 1000.0;

var MAX_GRAVITY_POTENTIAL_MULTIPLIER = 5.0;
var MAX_WEIGHT_POTENTIAL_MULTIPLIER = 2.0;


/*
 * ============================================================
 * FABLED PRESTIGE SETTINGS
 * ============================================================
 */

var FABLED_PRESTIGE_CLASS_NAME = "Prestige";

/*
 * Your Fabled setup treats class level 1 as Prestige 0.
 *
 * Fabled level 1  = Prestige 0
 * Fabled level 2  = Prestige 1
 * Fabled level 11 = Prestige 10
 */
var FABLED_PRESTIGE_LEVEL_OFFSET = 1;
var MAX_PRESTIGE_LEVEL = 10;

/*
 * Each Prestige level adds 10% Potential progress.
 *
 * Prestige 0  = 1.00x
 * Prestige 5  = 1.50x
 * Prestige 10 = 2.00x
 */
var POTENTIAL_MULTIPLIER_PER_PRESTIGE = 0.10;


/*
 * ============================================================
 * MENTOR SETTINGS
 * ============================================================
 */

var MENTOR_TP_PER_VALID_PROGRESS = 50;
var MENTOR_TP_MESSAGE_COOLDOWN_MS = 10000;
var TP_PER_LEVEL_DIFFERENCE = 500;


/*
 * ============================================================
 * GURU / MOVEMENT SETTINGS
 * ============================================================
 */

var GURU_MESSAGE_COOLDOWN_MS = 10000;

var MIN_MOVEMENT_DISTANCE = 2.0;
var MOVEMENT_VALID_MS = 5000;
var MOVEMENT_WARNING_COOLDOWN_MS = 10000;


/*
 * ============================================================
 * DEBUG
 * ============================================================
 */

var DEBUG_MULTIPLIERS = false;
var DEBUG_MULTIPLIER_COOLDOWN_MS = 5000;

var DEBUG_MENTOR_TP = false;


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function readNumber(data, key, fallback) {
    try {
        if (data != null && data.has(key)) {
            var value = Number("" + data.get(key));

            if (!isNaN(value)) {
                return value;
            }
        }
    } catch (e) {}

    return fallback;
}


function resetPotentialProgressIfNeeded(player, currentLevel) {
    try {
        var stored = player.getStoreddata();
        var lastKnownKey = "potentialunlock_last_known_level";

        var lastKnown = currentLevel;

        if (stored.has(lastKnownKey)) {
            lastKnown = parseInt(
                "" + stored.get(lastKnownKey)
            );
        }

        if (isNaN(lastKnown)) {
            lastKnown = currentLevel;
        }

        if (currentLevel < lastKnown) {
            for (var i = 1; i <= HARD_MAX_LEVEL; i++) {
                stored.remove(
                    "potentialunlock_points_to_level_" + i
                );
            }

            stored.remove(
                "potentialunlock_last_method"
            );

            stored.remove(
                "potentialunlock_same_method_streak"
            );

            stored.remove(
                "potential_last_move_x"
            );

            stored.remove(
                "potential_last_move_z"
            );

            stored.remove(
                "potential_movement_valid_until"
            );

            stored.put(
                lastKnownKey,
                "" + currentLevel
            );

            player.message(
                "\u00A76[Potential Unlock] \u00A7eProgress requirements were reset because your Potential level was lowered."
            );

            return;
        }

        if (
            currentLevel > lastKnown ||
            !stored.has(lastKnownKey)
        ) {
            stored.put(
                lastKnownKey,
                "" + currentLevel
            );
        }

    } catch (e) {}
}


/*
 * ============================================================
 * GURU CAP
 * ============================================================
 */

function tellGuruCap(player) {
    try {
        var temp = player.getTempdata();
        var now = System.currentTimeMillis();
        var key = "potential_guru_message_cooldown";

        var next = readNumber(
            temp,
            key,
            0
        );

        if (now < next) {
            return;
        }

        temp.put(
            key,
            "" + (
                now +
                GURU_MESSAGE_COOLDOWN_MS
            )
        );

        player.message(
            "\u00A76[Potential Unlock] \u00A7eYou have reached level 10."
        );

        player.message(
            "\u00A7eSpeak to Guru to unlock your hidden potential further."
        );

    } catch (e) {}
}


/*
 * ============================================================
 * MOVEMENT REQUIREMENT
 * ============================================================
 */

function tellMovementRequired(player) {
    try {
        var temp = player.getTempdata();
        var now = System.currentTimeMillis();
        var key = "potential_move_warning_cooldown";

        var next = readNumber(
            temp,
            key,
            0
        );

        if (now < next) {
            return;
        }

        temp.put(
            key,
            "" + (
                now +
                MOVEMENT_WARNING_COOLDOWN_MS
            )
        );

        player.message(
            "\u00A76[Potential Unlock] \u00A7eMove at least \u00A7f" +
            MIN_MOVEMENT_DISTANCE +
            " blocks\u00A7e to keep gaining Potential progress."
        );

    } catch (e) {}
}


function hasMovedEnoughForPotential(player) {
    try {
        var stored = player.getStoreddata();
        var now = System.currentTimeMillis();

        var x = Number(
            player.getX()
        );

        var z = Number(
            player.getZ()
        );

        var keyX = "potential_last_move_x";
        var keyZ = "potential_last_move_z";
        var keyUntil = "potential_movement_valid_until";

        var validUntil = readNumber(
            stored,
            keyUntil,
            0
        );

        if (now < validUntil) {
            return true;
        }

        if (
            !stored.has(keyX) ||
            !stored.has(keyZ)
        ) {
            stored.put(
                keyX,
                "" + x
            );

            stored.put(
                keyZ,
                "" + z
            );

            tellMovementRequired(
                player
            );

            return false;
        }

        var oldX = parseFloat(
            "" + stored.get(keyX)
        );

        var oldZ = parseFloat(
            "" + stored.get(keyZ)
        );

        if (
            isNaN(oldX) ||
            isNaN(oldZ)
        ) {
            stored.put(
                keyX,
                "" + x
            );

            stored.put(
                keyZ,
                "" + z
            );

            tellMovementRequired(
                player
            );

            return false;
        }

        var dx = x - oldX;
        var dz = z - oldZ;

        var distance = Math.sqrt(
            (dx * dx) +
            (dz * dz)
        );

        if (
            distance <
            MIN_MOVEMENT_DISTANCE
        ) {
            tellMovementRequired(
                player
            );

            return false;
        }

        stored.put(
            keyX,
            "" + x
        );

        stored.put(
            keyZ,
            "" + z
        );

        stored.put(
            keyUntil,
            "" + (
                now +
                MOVEMENT_VALID_MS
            )
        );

        return true;

    } catch (e) {
        return false;
    }
}


/*
 * ============================================================
 * DUPLICATE EVENT PROTECTION
 * ============================================================
 */

function isDuplicateEvent(
    player,
    method,
    entityId
) {
    try {
        var temp = player.getTempdata();
        var now = System.currentTimeMillis();

        var key =
            "potentialunlock_duplicate_" +
            method +
            "_" +
            entityId;

        if (temp.has(key)) {
            var lastTime = parseInt(
                "" + temp.get(key)
            );

            if (
                !isNaN(lastTime) &&
                now - lastTime <
                DUPLICATE_EVENT_WINDOW_MS
            ) {
                return true;
            }
        }

        temp.put(
            key,
            "" + now
        );

        return false;

    } catch (e) {
        return false;
    }
}


/*
 * ============================================================
 * TRAINING METHOD LIMIT
 * ============================================================
 */

function allowPotentialMethod(
    player,
    method
) {
    try {
        var stored = player.getStoreddata();

        var lastMethod =
            stored.has(
                "potentialunlock_last_method"
            )
                ? "" + stored.get(
                    "potentialunlock_last_method"
                )
                : "";

        var streak =
            stored.has(
                "potentialunlock_same_method_streak"
            )
                ? parseInt(
                    "" + stored.get(
                        "potentialunlock_same_method_streak"
                    )
                )
                : 0;

        if (isNaN(streak)) {
            streak = 0;
        }

        if (lastMethod == method) {
            if (
                streak >=
                MAX_SAME_METHOD_STREAK
            ) {
                player.message(
                    "\u00A76[Potential Unlock] \u00A7eSwitch training methods to continue progressing."
                );

                return false;
            }

            streak++;

        } else {
            lastMethod = method;
            streak = 1;
        }

        stored.put(
            "potentialunlock_last_method",
            lastMethod
        );

        stored.put(
            "potentialunlock_same_method_streak",
            "" + streak
        );

        return true;

    } catch (e) {
        return false;
    }
}


/*
 * ============================================================
 * FABLED PRESTIGE
 * ============================================================
 */

function getFabledPrestigeLevel(player) {
    try {
        if (Bukkit == null) return 0;

        var plugin =
            Bukkit
                .getPluginManager()
                .getPlugin("Fabled");

        if (
            plugin == null ||
            !plugin.isEnabled()
        ) {
            return 0;
        }

        var bukkitPlayer =
            Bukkit.getPlayer(
                "" + player.getName()
            );

        if (bukkitPlayer == null) {
            return 0;
        }

        var methods =
            plugin
                .getClass()
                .getMethods();

        var getDataMethod = null;

        for (
            var i = 0;
            i < methods.length;
            i++
        ) {
            if (
                "" + methods[i].getName() ==
                "getData" &&
                methods[i]
                    .getParameterTypes()
                    .length == 1
            ) {
                getDataMethod =
                    methods[i];

                break;
            }
        }

        if (getDataMethod == null) {
            return 0;
        }

        var fabledData =
            getDataMethod.invoke(
                null,
                bukkitPlayer
            );

        if (fabledData == null) {
            return 0;
        }

        var prestigeClass =
            fabledData.getClass(
                FABLED_PRESTIGE_CLASS_NAME
            );

        if (prestigeClass == null) {
            return 0;
        }

        var fabledLevel =
            Number(
                prestigeClass.getLevel()
            );

        if (isNaN(fabledLevel)) {
            return 0;
        }

        var prestigeLevel =
            Math.floor(
                fabledLevel -
                FABLED_PRESTIGE_LEVEL_OFFSET
            );

        if (prestigeLevel < 0) {
            prestigeLevel = 0;
        }

        if (
            prestigeLevel >
            MAX_PRESTIGE_LEVEL
        ) {
            prestigeLevel =
                MAX_PRESTIGE_LEVEL;
        }

        return prestigeLevel;

    } catch (e) {
        return 0;
    }
}


/*
 * ============================================================
 * DMZ GRAVITY AND WEIGHTS
 * ============================================================
 */

function getTrainingGravityMultiplier(
    mcPlayer
) {
    try {
        var gravity =
            getNetGravity(
                mcPlayer
            );

        if (
            isNaN(gravity) ||
            gravity < 1.0
        ) {
            gravity = 1.0;
        }

        var cappedGravity =
            Math.min(
                gravity,
                MAX_GRAVITY_FOR_POTENTIAL
            );

        var gravityProgress =
            (
                cappedGravity - 1.0
            ) /
            (
                MAX_GRAVITY_FOR_POTENTIAL - 1.0
            );

        if (gravityProgress < 0) {
            gravityProgress = 0;
        }

        if (gravityProgress > 1) {
            gravityProgress = 1;
        }

        return 1.0 +
            (
                gravityProgress *
                (
                    MAX_GRAVITY_POTENTIAL_MULTIPLIER -
                    1.0
                )
            );

    } catch (e) {
        return 1.0;
    }
}


function getNetGravity(mcPlayer) {
    try {
        var value =
            Number(
                GravityLogic.getNetGravity(
                    mcPlayer
                )
            );

        if (isNaN(value)) {
            return 1.0;
        }

        return value;

    } catch (e) {
        return 1.0;
    }
}


function getTotalWeight(mcPlayer) {
    try {
        var value =
            Number(
                GravityLogic.getTotalWeight(
                    mcPlayer
                )
            );

        if (isNaN(value)) {
            return 0;
        }

        return Math.floor(
            value
        );

    } catch (e) {
        return 0;
    }
}


function getEffectiveWeight(mcPlayer) {
    try {
        var value =
            Number(
                GravityLogic.getEffectiveWeight(
                    mcPlayer
                )
            );

        if (isNaN(value)) {
            return 0;
        }

        return Math.floor(
            value
        );

    } catch (e) {
        return 0;
    }
}


function getPotentialWeightMultiplier(
    mcPlayer
) {
    try {
        var effectiveWeight =
            getEffectiveWeight(
                mcPlayer
            );

        if (
            isNaN(effectiveWeight) ||
            effectiveWeight < 0
        ) {
            effectiveWeight = 0;
        }

        var cappedWeight =
            Math.min(
                effectiveWeight,
                MAX_EFFECTIVE_WEIGHT_FOR_POTENTIAL
            );

        var weightProgress =
            cappedWeight /
            MAX_EFFECTIVE_WEIGHT_FOR_POTENTIAL;

        if (weightProgress < 0) {
            weightProgress = 0;
        }

        if (weightProgress > 1) {
            weightProgress = 1;
        }

        return 1.0 +
            (
                weightProgress *
                (
                    MAX_WEIGHT_POTENTIAL_MULTIPLIER -
                    1.0
                )
            );

    } catch (e) {
        return 1.0;
    }
}


function getIdealWeight(mcPlayer) {
    try {
        var value =
            Number(
                GravityLogic.getIdealWeight(
                    mcPlayer
                )
            );

        if (isNaN(value)) {
            return 0;
        }

        return Math.floor(
            value
        );

    } catch (e) {
        return 0;
    }
}


function getWeightTpMultiplier(mcPlayer) {
    try {
        var value =
            Number(
                GravityLogic.getWeightTpMultiplier(
                    mcPlayer
                )
            );

        if (
            isNaN(value) ||
            value <= 0
        ) {
            return 1.0;
        }

        return value;

    } catch (e) {
        return 1.0;
    }
}


/*
 * ============================================================
 * MULTIPLIER DEBUG
 * ============================================================
 */

function showMultiplierDebug(
    player,
    mcPlayer,
    basePoints,
    gravityMultiplier,
    prestigeLevel,
    prestigeMultiplier,
    calculatedPoints,
    finalPoints
) {
    if (!DEBUG_MULTIPLIERS) {
        return;
    }

    try {
        var temp =
            player.getTempdata();

        var now =
            System.currentTimeMillis();

        var key =
            "potential_multiplier_debug_cooldown";

        var next =
            readNumber(
                temp,
                key,
                0
            );

        if (now < next) {
            return;
        }

        temp.put(
            key,
            "" + (
                now +
                DEBUG_MULTIPLIER_COOLDOWN_MS
            )
        );

        player.message(
            "\u00A78[Potential Debug] \u00A77Base: \u00A7f" +
            basePoints +
            "\u00A77 | Training gravity: \u00A7f" +
            gravityMultiplier.toFixed(2) +
            "x"
        );

        player.message(
            "\u00A78[Potential Debug] \u00A77Net gravity: \u00A7f" +
            getNetGravity(mcPlayer).toFixed(2) +
            "\u00A77 | Weight: \u00A7f" +
            getTotalWeight(mcPlayer) +
            "\u00A77 | Effective: \u00A7f" +
            getEffectiveWeight(mcPlayer) +
            "\u00A77 | Ideal: \u00A7f" +
            getIdealWeight(mcPlayer)
        );

        player.message(
            "\u00A78[Potential Debug] \u00A77Weight TP: \u00A7f" +
            getWeightTpMultiplier(mcPlayer).toFixed(2) +
            "x" +
            "\u00A77 | Prestige: \u00A7f" +
            prestigeLevel +
            " (" +
            prestigeMultiplier.toFixed(2) +
            "x)"
        );

        player.message(
            "\u00A78[Potential Debug] \u00A77Calculated: \u00A7f" +
            calculatedPoints +
            "\u00A77 | Final after 30-point cap: \u00A7f" +
            finalPoints
        );

    } catch (e) {}
}


/*
 * ============================================================
 * FINAL POTENTIAL POINT CALCULATION
 * ============================================================
 */

function calculatePotentialPoints(
    player,
    mcPlayer,
    basePoints
) {
    var gravityMultiplier =
        getTrainingGravityMultiplier(
            mcPlayer
        );

    var weightMultiplier =
        getPotentialWeightMultiplier(
            mcPlayer
        );

    var prestigeLevel =
        getFabledPrestigeLevel(
            player
        );

    var prestigeMultiplier =
        1.0 +
        (
            prestigeLevel *
            POTENTIAL_MULTIPLIER_PER_PRESTIGE
        );

    var calculatedPoints =
        Math.floor(
            Number(basePoints) *
            gravityMultiplier *
            weightMultiplier *
            prestigeMultiplier
        );

    if (
        isNaN(calculatedPoints) ||
        calculatedPoints < 1
    ) {
        calculatedPoints = 1;
    }

    var finalPoints =
        Math.min(
            calculatedPoints,
            MAX_POTENTIAL_POINTS_PER_HIT
        );

    showMultiplierDebug(
        player,
        mcPlayer,
        basePoints,
        gravityMultiplier,
        prestigeLevel,
        prestigeMultiplier,
        calculatedPoints,
        finalPoints
    );

    if (DEBUG_MULTIPLIERS) {
        try {
            player.message(
                "\u00A78[Potential Debug] \u00A77Custom weight multiplier: \u00A7f" +
                weightMultiplier.toFixed(2) +
                "x"
            );
        } catch (e) {}
    }

    return finalPoints;
}


/*
 * ============================================================
 * MENTOR TP
 * ============================================================
 */

function giveMentorTrainingTP(
    player,
    playerData,
    otherEntity,
    otherMC,
    otherData
) {
    try {
        var playerLevel =
            Number(
                playerData.getLevel()
            );

        var otherLevel =
            Number(
                otherData.getLevel()
            );

        if (
            isNaN(playerLevel) ||
            isNaN(otherLevel) ||
            otherLevel <= playerLevel
        ) {
            return;
        }

        var resources =
            otherData.getResources();

        if (resources == null) {
            return;
        }

        resources.addTrainingPoints(
            MENTOR_TP_PER_VALID_PROGRESS
        );

        NetworkHandler
            .sendToTrackingEntityAndSelf(
                new StatsSyncS2C(
                    otherMC
                ),
                otherMC
            );

        try {
            var temp =
                otherEntity.getTempdata();

            var now =
                System.currentTimeMillis();

            var key =
                "potential_mentor_tp_message_cooldown";

            var next =
                readNumber(
                    temp,
                    key,
                    0
                );

            if (now >= next) {
                temp.put(
                    key,
                    "" + (
                        now +
                        MENTOR_TP_MESSAGE_COOLDOWN_MS
                    )
                );

                otherEntity.message(
                    "\u00A76[Potential Mentor] \u00A7eYou are gaining TP for helping train a lower-level player."
                );
            }

        } catch (msgErr) {}

    } catch (err) {
        if (DEBUG_MENTOR_TP) {
            player.message(
                "\u00A7c[Potential Mentor Debug] Training TP failed: " +
                err
            );
        }
    }
}


function giveMentorLevelUpTP(
    player,
    playerData,
    otherEntity,
    otherMC,
    otherData
) {
    try {
        var playerLevel =
            Number(
                playerData.getLevel()
            );

        var otherLevel =
            Number(
                otherData.getLevel()
            );

        if (
            isNaN(otherLevel) ||
            isNaN(playerLevel) ||
            otherLevel <= playerLevel
        ) {
            return;
        }

        var levelDifference =
            Math.floor(
                otherLevel -
                playerLevel
            );

        var tpReward =
            levelDifference *
            TP_PER_LEVEL_DIFFERENCE;

        if (tpReward <= 0) {
            return;
        }

        var resources =
            otherData.getResources();

        if (resources == null) {
            return;
        }

        resources.addTrainingPoints(
            tpReward
        );

        otherEntity.message(
            "\u00A76[Potential Mentor] Gained \u00A7e" +
            tpReward +
            " TP\u00A76 for helping unlock a lower-level player's potential."
        );

        NetworkHandler
            .sendToTrackingEntityAndSelf(
                new StatsSyncS2C(
                    otherMC
                ),
                otherMC
            );

    } catch (err) {
        if (DEBUG_MENTOR_TP) {
            player.message(
                "\u00A7c[Potential Mentor Debug] Level-up TP failed: " +
                err
            );
        }
    }
}


/*
 * ============================================================
 * APPLY POTENTIAL PROGRESS
 * ============================================================
 */

function applyPotentialProgress(
    player,
    mcPlayer,
    playerData,
    otherEntity,
    otherMC,
    otherData,
    method,
    basePoints
) {
    try {
        var skills =
            playerData.getSkills();

        if (skills == null) {
            return;
        }

        var currentLevel =
            Number(
                skills.getSkillLevel(
                    POTENTIAL_UNLOCK
                )
            );

        if (isNaN(currentLevel)) {
            currentLevel = 0;
        }

        resetPotentialProgressIfNeeded(
            player,
            currentLevel
        );

        if (
            currentLevel >=
            HARD_MAX_LEVEL
        ) {
            return;
        }

        if (
            currentLevel ==
            NATURAL_POTENTIAL_CAP
        ) {
            tellGuruCap(
                player
            );

            return;
        }

        if (
            !hasMovedEnoughForPotential(
                player
            )
        ) {
            return;
        }

        if (
            !allowPotentialMethod(
                player,
                method
            )
        ) {
            return;
        }

        var points =
            calculatePotentialPoints(
                player,
                mcPlayer,
                basePoints
            );

        var stored =
            player.getStoreddata();

        var nextLevel =
            currentLevel + 1;

        var requiredPoints =
            nextLevel * 100;

        var progressKey =
            "potentialunlock_points_to_level_" +
            nextLevel;

        var progress =
            stored.has(progressKey)
                ? parseInt(
                    "" + stored.get(
                        progressKey
                    )
                )
                : 0;

        if (isNaN(progress)) {
            progress = 0;
        }

        progress += points;

        if (
            progress >
            requiredPoints
        ) {
            progress =
                requiredPoints;
        }

        giveMentorTrainingTP(
            player,
            playerData,
            otherEntity,
            otherMC,
            otherData
        );

        if (
            progress <
            requiredPoints
        ) {
            stored.put(
                progressKey,
                "" + progress
            );

            return;
        }

        stored.put(
            progressKey,
            "" + requiredPoints
        );

        skills.setSkillLevel(
            POTENTIAL_UNLOCK,
            nextLevel
        );

        var confirmedLevel =
            Number(
                skills.getSkillLevel(
                    POTENTIAL_UNLOCK
                )
            );

        if (isNaN(confirmedLevel)) {
            confirmedLevel =
                currentLevel;
        }

        if (
            confirmedLevel <
            nextLevel
        ) {
            player.message(
                "\u00A7c[Potential Unlock] Level-up failed."
            );

            player.message(
                "\u00A77DMZ still reports Potential level \u00A7f" +
                confirmedLevel +
                "\u00A77."
            );

            player.message(
                "\u00A77Progress remains at \u00A7f" +
                requiredPoints +
                "/" +
                requiredPoints +
                "\u00A77."
            );

            return;
        }

        stored.put(
            "potentialunlock_last_known_level",
            "" + confirmedLevel
        );

        player.message(
            "\u00A75[Potential Unlock] Increased to level " +
            confirmedLevel +
            "."
        );

        giveMentorLevelUpTP(
            player,
            playerData,
            otherEntity,
            otherMC,
            otherData
        );

        if (
            confirmedLevel ==
            NATURAL_POTENTIAL_CAP
        ) {
            player.message(
                "\u00A76[Potential Unlock] \u00A7eYou have reached level 10."
            );

            player.message(
                "\u00A7eSpeak to Guru to unlock your hidden potential further."
            );
        }

        NetworkHandler
            .sendToTrackingEntityAndSelf(
                new StatsSyncS2C(
                    mcPlayer
                ),
                mcPlayer
            );

    } catch (err) {
        player.message(
            "\u00A74[Potential Progress Error] \u00A7c" +
            err
        );
    }
}


/*
 * ============================================================
 * PLAYER DAMAGES ANOTHER PLAYER
 * ============================================================
 */

function damagedEntity(event) {
    var player =
        event.player;

    if (player == null) {
        return;
    }

    try {
        var target =
            event.target;

        if (target == null) {
            return;
        }

        var targetMC =
            target.getMCEntity();

        if (
            targetMC == null ||
            !MCPlayerClass.class.isInstance(
                targetMC
            )
        ) {
            return;
        }

        var mcPlayer =
            player.getMCEntity();

        var playerData =
            StatsProvider
                .get(
                    StatsCapability.INSTANCE,
                    mcPlayer
                )
                .orElse(null);

        var targetData =
            StatsProvider
                .get(
                    StatsCapability.INSTANCE,
                    targetMC
                )
                .orElse(null);

        if (
            playerData == null ||
            targetData == null
        ) {
            return;
        }

        var method =
            "physical_hit";

        var points =
            3;

        var immediateMC =
            null;

        try {
            var immediate =
                event.damageSource != null
                    ? event.damageSource
                        .getImmediateSource()
                    : null;

            immediateMC =
                immediate != null
                    ? immediate.getMCEntity()
                    : null;

        } catch (e) {}

        if (
            immediateMC != null &&
            AbstractKiProjectile.class.isInstance(
                immediateMC
            )
        ) {
            method =
                "ki_attack";

            points =
                3;
        }

        var targetId =
            "unknown";

        try {
            targetId =
                String(
                    targetMC.m_19879_()
                );

        } catch (e2) {}

        if (
            isDuplicateEvent(
                player,
                method,
                targetId
            )
        ) {
            return;
        }

        applyPotentialProgress(
            player,
            mcPlayer,
            playerData,
            target,
            targetMC,
            targetData,
            method,
            points
        );

    } catch (err) {
        player.message(
            "\u00A74[Potential Hit Error] \u00A7c" +
            err
        );
    }
}


/*
 * ============================================================
 * PLAYER IS DAMAGED BY ANOTHER PLAYER
 * ============================================================
 */

function damaged(event) {
    var player =
        event.player;

    if (player == null) {
        return;
    }

    try {
        var source =
            event.source;

        if (source == null) {
            return;
        }

        var sourceMC =
            source.getMCEntity();

        if (
            sourceMC == null ||
            !MCPlayerClass.class.isInstance(
                sourceMC
            )
        ) {
            return;
        }

        var mcPlayer =
            player.getMCEntity();

        var playerData =
            StatsProvider
                .get(
                    StatsCapability.INSTANCE,
                    mcPlayer
                )
                .orElse(null);

        var sourceData =
            StatsProvider
                .get(
                    StatsCapability.INSTANCE,
                    sourceMC
                )
                .orElse(null);

        if (
            playerData == null ||
            sourceData == null
        ) {
            return;
        }

        var status =
            playerData.getStatus();

        if (status == null) {
            return;
        }

        var method =
            "getting_hit";

        var points =
            1;

        try {
            if (
                status.isBlocking()
            ) {
                method =
                    "blocking";

                points =
                    2;
            }

        } catch (e) {}

        var sourceId =
            "unknown";

        try {
            sourceId =
                String(
                    sourceMC.m_19879_()
                );

        } catch (e2) {}

        if (
            isDuplicateEvent(
                player,
                method,
                sourceId
            )
        ) {
            return;
        }

        applyPotentialProgress(
            player,
            mcPlayer,
            playerData,
            source,
            sourceMC,
            sourceData,
            method,
            points
        );

    } catch (err) {
        player.message(
            "\u00A74[Potential Damaged Error] \u00A7c" +
            err
        );
    }
}
var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var System = Java.type("java.lang.System");

var MainEffects = Java.type(
    "com.dragonminez.common.init.MainEffects"
);

var MobEffectInstance = Java.type(
    "net.minecraft.world.effect.MobEffectInstance"
);


/*
 * ============================================================
 * SETTINGS
 * ============================================================
 */

var TP_BOOST_TRIGGER_ID = 30;

var STORAGE_WORLD = "overworld";

/*
 * Check once per second.
 */
var CHECK_INTERVAL_TICKS = 20;

/*
 * Extra effect duration added whenever the effect is refreshed.
 */
var EFFECT_REFRESH_BUFFER_TICKS = 100;

/*
 * Add purchased time to the currently active boost.
 */
var EXTEND_ACTIVE_BOOST = true;

/*
 * Prevent duplicate processing by multiple global player scripts.
 */
var TRIGGER_LOCK_MS = 3000;
var END_LOCK_MS = 5000;


/*
 * The last four digits of the encoded number are minutes.
 *
 * This allows up to 9,999 minutes.
 */
var ENCODED_MINUTE_DIVISOR = 10000;


/*
 * ============================================================
 * GLOBAL STORED-DATA KEYS
 * ============================================================
 */

var KEY_ACTIVE =
    "dmz_global_tp_effect_active";

var KEY_MULTIPLIER =
    "dmz_global_tp_effect_multiplier";

var KEY_AMPLIFIER =
    "dmz_global_tp_effect_amplifier";

var KEY_END_TIME =
    "dmz_global_tp_effect_end_time";

var KEY_PURCHASER =
    "dmz_global_tp_effect_purchaser";

var KEY_TRIGGER_LOCK =
    "dmz_global_tp_effect_trigger_lock";

var KEY_TRIGGER_SIGNATURE =
    "dmz_global_tp_effect_trigger_signature";

var KEY_END_LOCK =
    "dmz_global_tp_effect_end_lock";


/*
 * ============================================================
 * PLAYER LOOKUP
 * ============================================================
 */

function getOnlinePlayerByName(name) {
    try {
        var worlds =
            NpcAPI.Instance().getIWorlds();

        for (var w = 0; w < worlds.length; w++) {
            try {
                var players =
                    worlds[w].getAllPlayers();

                for (var p = 0; p < players.length; p++) {
                    if (
                        String(players[p].getName())
                            .equalsIgnoreCase(String(name))
                    ) {
                        return players[p];
                    }
                }
            } catch (worldErr) {}
        }
    } catch (err) {}

    return null;
}


/*
 * ============================================================
 * GLOBAL STORAGE
 * ============================================================
 */

function getGlobalStoreddata() {
    try {
        var world =
            NpcAPI.Instance().getIWorld(STORAGE_WORLD);

        if (world == null) {
            return null;
        }

        return world.getStoreddata();

    } catch (err) {
        return null;
    }
}


function readStoredNumber(stored, key, fallback) {
    try {
        if (
            stored != null &&
            stored.has(key)
        ) {
            var value =
                Number("" + stored.get(key));

            if (!isNaN(value)) {
                return value;
            }
        }
    } catch (err) {}

    return fallback;
}


function readStoredString(stored, key, fallback) {
    try {
        if (
            stored != null &&
            stored.has(key)
        ) {
            return "" + stored.get(key);
        }
    } catch (err) {}

    return fallback;
}


/*
 * ============================================================
 * ONLINE PLAYER ITERATION
 * ============================================================
 */

function forEachOnlinePlayer(callback) {
    try {
        var worlds =
            NpcAPI.Instance().getIWorlds();

        var handled = {};

        for (var w = 0; w < worlds.length; w++) {
            try {
                var players =
                    worlds[w].getAllPlayers();

                for (var p = 0; p < players.length; p++) {
                    var player =
                        players[p];

                    var name =
                        String(player.getName())
                            .toLowerCase();

                    if (handled[name]) {
                        continue;
                    }

                    handled[name] = true;

                    try {
                        callback(player);
                    } catch (callbackErr) {}
                }
            } catch (worldErr) {}
        }
    } catch (err) {}
}


function broadcastToAll(message) {
    forEachOnlinePlayer(function(player) {
        player.message(message);
    });
}


/*
 * ============================================================
 * FORMATTING
 * ============================================================
 */

function formatMultiplier(value) {
    value = Number(value);

    if (isNaN(value)) {
        return "1";
    }

    if (Math.floor(value) == value) {
        return "" + Math.floor(value);
    }

    return "" + (
        Math.round(value * 100) / 100
    );
}


function formatDuration(milliseconds) {
    milliseconds =
        Math.max(0, Number(milliseconds));

    var totalSeconds =
        Math.floor(milliseconds / 1000);

    var days =
        Math.floor(totalSeconds / 86400);

    var hours =
        Math.floor(
            (totalSeconds % 86400) / 3600
        );

    var minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    var seconds =
        totalSeconds % 60;

    if (days > 0) {
        return days + "d " + hours + "h";
    }

    if (hours > 0) {
        return hours + "h " + minutes + "m";
    }

    if (minutes > 0) {
        return minutes + "m " + seconds + "s";
    }

    return seconds + "s";
}


/*
 * ============================================================
 * DECODE FABLED FORCECAST LEVEL
 *
 * Examples:
 *
 * 2000060 = 2.00x for 60 minutes
 * 3000060 = 3.00x for 60 minutes
 * 1500030 = 1.50x for 30 minutes
 * 1250120 = 1.25x for 120 minutes
 * ============================================================
 */

function decodeBoostValue(encoded) {
    encoded =
        Math.floor(Number(encoded));

    if (
        isNaN(encoded) ||
        encoded <= 0
    ) {
        return null;
    }

    var multiplierCode =
        Math.floor(
            encoded /
            ENCODED_MINUTE_DIVISOR
        );

    var durationMinutes =
        encoded %
        ENCODED_MINUTE_DIVISOR;

    var multiplier =
        multiplierCode / 100.0;

    if (
        multiplier <= 1 ||
        durationMinutes <= 0
    ) {
        return null;
    }

    return {
        encoded: encoded,
        multiplier: multiplier,
        durationMinutes: durationMinutes
    };
}


/*
 * ============================================================
 * MULTIPLIER TO DMZ EFFECT AMPLIFIER
 *
 * DMZ TP effect formula:
 *
 * 1 + ((amplifier + 1) × 0.25)
 *
 * Supported examples:
 *
 * 1.25x = amplifier 0
 * 1.50x = amplifier 1
 * 1.75x = amplifier 2
 * 2.00x = amplifier 3
 * 3.00x = amplifier 7
 * ============================================================
 */

function multiplierToAmplifier(multiplier) {
    multiplier =
        Number(multiplier);

    if (
        isNaN(multiplier) ||
        multiplier < 1.25
    ) {
        return -1;
    }

    var rawAmplifier =
        ((multiplier - 1.0) / 0.25) - 1.0;

    var amplifier =
        Math.round(rawAmplifier);

    var confirmedMultiplier =
        1.0 +
        (
            (amplifier + 1) *
            0.25
        );

    /*
     * Only allow exact 0.25 multiplier steps.
     */
    if (
        Math.abs(
            confirmedMultiplier -
            multiplier
        ) > 0.0001
    ) {
        return -1;
    }

    if (amplifier < 0) {
        return -1;
    }

    return amplifier;
}


/*
 * ============================================================
 * APPLY DMZ TP EFFECT
 * ============================================================
 */

function applyTpEffect(
    player,
    amplifier,
    durationTicks
) {
    try {
        if (player == null) {
            return false;
        }

        var mcPlayer =
            player.getMCEntity();

        if (mcPlayer == null) {
            return false;
        }

        var effect =
            MainEffects.TP_GAIN.get();

        if (effect == null) {
            return false;
        }

        amplifier =
            Math.max(
                0,
                Math.floor(amplifier)
            );

        durationTicks =
            Math.max(
                1,
                Math.floor(durationTicks)
            );

        var instance =
            new MobEffectInstance(
                effect,
                durationTicks,
                amplifier,
                false,
                false,
                true
            );

        try {
            mcPlayer.addEffect(instance);
            return true;
        } catch (mappedErr) {}

        try {
            mcPlayer.m_7292_(instance);
            return true;
        } catch (obfErr) {}

        return false;

    } catch (err) {
        return false;
    }
}


/*
 * ============================================================
 * REMOVE DMZ TP EFFECT
 * ============================================================
 */

function removeTpEffect(player) {
    try {
        if (player == null) {
            return;
        }

        var mcPlayer =
            player.getMCEntity();

        if (mcPlayer == null) {
            return;
        }

        var effect =
            MainEffects.TP_GAIN.get();

        if (effect == null) {
            return;
        }

        try {
            mcPlayer.removeEffect(effect);
            return;
        } catch (mappedErr) {}

        try {
            mcPlayer.m_21195_(effect);
        } catch (obfErr) {}

    } catch (err) {}
}


/*
 * ============================================================
 * APPLY BOOST TO ALL ONLINE PLAYERS
 * ============================================================
 */

function applyBoostToAll(
    amplifier,
    remainingMs
) {
    var durationTicks =
        Math.max(
            EFFECT_REFRESH_BUFFER_TICKS,
            Math.ceil(remainingMs / 50) +
            EFFECT_REFRESH_BUFFER_TICKS
        );

    forEachOnlinePlayer(function(player) {
        applyTpEffect(
            player,
            amplifier,
            durationTicks
        );
    });
}


/*
 * ============================================================
 * CLEAR GLOBAL DATA
 * ============================================================
 */

function clearGlobalBoostData(stored) {
    if (stored == null) {
        return;
    }

    try {
        stored.remove(KEY_ACTIVE);
    } catch (e1) {}

    try {
        stored.remove(KEY_MULTIPLIER);
    } catch (e2) {}

    try {
        stored.remove(KEY_AMPLIFIER);
    } catch (e3) {}

    try {
        stored.remove(KEY_END_TIME);
    } catch (e4) {}

    try {
        stored.remove(KEY_PURCHASER);
    } catch (e5) {}

    try {
        stored.remove(KEY_END_LOCK);
    } catch (e6) {}
}


/*
 * ============================================================
 * END BOOST
 * ============================================================
 */

function endGlobalTpBoost(stored) {
    if (stored == null) {
        return;
    }

    clearGlobalBoostData(stored);

    forEachOnlinePlayer(function(player) {
        removeTpEffect(player);
    });

    broadcastToAll(
        "\u00A76\u00A7lGLOBAL TP BOOST " +
        "\u00A7r\u00A77- " +
        "\u00A7cThe global TP boost has ended."
    );
}


/*
 * ============================================================
 * ACTIVATE BOOST
 * ============================================================
 */

function activateGlobalTpBoost(
    multiplier,
    durationMinutes,
    purchaser
) {
    var stored =
        getGlobalStoreddata();

    if (stored == null) {
        return {
            success: false,
            message:
                "Could not access global stored data."
        };
    }

    multiplier =
        Number(multiplier);

    durationMinutes =
        Math.floor(
            Number(durationMinutes)
        );

    var amplifier =
        multiplierToAmplifier(multiplier);

    if (amplifier < 0) {
        return {
            success: false,
            message:
                "Multiplier must be 1.25 or higher and use 0.25 steps."
        };
    }

    if (
        isNaN(durationMinutes) ||
        durationMinutes <= 0
    ) {
        return {
            success: false,
            message:
                "Duration must be greater than 0 minutes."
        };
    }

    var now =
        System.currentTimeMillis();

    var durationMs =
        durationMinutes *
        60000;

    var currentEndTime =
        readStoredNumber(
            stored,
            KEY_END_TIME,
            0
        );

    var currentlyActive =
        String(
            stored.has(KEY_ACTIVE)
                ? stored.get(KEY_ACTIVE)
                : "false"
        ) == "true" &&
        currentEndTime > now;

    var newEndTime;

    if (
        currentlyActive &&
        EXTEND_ACTIVE_BOOST
    ) {
        newEndTime =
            Math.max(
                now,
                currentEndTime
            ) +
            durationMs;
    } else {
        newEndTime =
            now +
            durationMs;
    }

    stored.put(
        KEY_ACTIVE,
        "true"
    );

    stored.put(
        KEY_MULTIPLIER,
        "" + multiplier
    );

    stored.put(
        KEY_AMPLIFIER,
        "" + amplifier
    );

    stored.put(
        KEY_END_TIME,
        "" + newEndTime
    );

    stored.put(
        KEY_PURCHASER,
        "" + purchaser
    );

    applyBoostToAll(
        amplifier,
        newEndTime - now
    );

    broadcastToAll(
        "\u00A76\u00A7lGLOBAL TP BOOST ACTIVATED!"
    );

    broadcastToAll(
        "\u00A7e" +
        purchaser +
        " \u00A77activated a \u00A7a" +
        formatMultiplier(multiplier) +
        "x TP Boost\u00A77!"
    );

    broadcastToAll(
        "\u00A77All online players receive boosted TP for \u00A7f" +
        formatDuration(newEndTime - now) +
        "\u00A77."
    );

    return {
        success: true,
        multiplier: multiplier,
        amplifier: amplifier,
        durationMinutes: durationMinutes,
        endTime: newEndTime
    };
}


/*
 * ============================================================
 * FABLED COMMAND TRIGGER
 *
 * Trigger ID: 30
 *
 * Arguments:
 *
 * 0 = player name
 * 1 = encoded Fabled cast level
 * 2 = purchaser/display name
 *
 * Command generated by Fabled:
 *
 * noppes script trigger 30 {player} {boost_encoded} {player}
 * ============================================================
 */

function trigger(event) {
    if (event.id != TP_BOOST_TRIGGER_ID) {
        return;
    }

    var commandPlayer = null;

    try {
        if (
            event.arguments == null ||
            event.arguments.length < 2
        ) {
            return;
        }

        var activatingName =
            String(event.arguments[0]);

        commandPlayer =
            getOnlinePlayerByName(
                activatingName
            );

        if (commandPlayer == null) {
            return;
        }

        var encoded =
            Number(
                String(event.arguments[1])
            );

        var decoded =
            decodeBoostValue(encoded);

        if (decoded == null) {
            commandPlayer.message(
                "\u00A7c[Global TP Boost] " +
                "Invalid encoded boost value: " +
                encoded
            );

            return;
        }

        var purchaser =
            event.arguments.length >= 3
                ? String(event.arguments[2])
                : commandPlayer.getName();

        var stored =
            getGlobalStoreddata();

        if (stored == null) {
            commandPlayer.message(
                "\u00A7c[Global TP Boost] " +
                "Could not access global stored data."
            );

            return;
        }

        var now =
            System.currentTimeMillis();

        var signature =
            activatingName.toLowerCase() +
            "|" +
            decoded.encoded +
            "|" +
            purchaser.toLowerCase();

        var lockUntil =
            readStoredNumber(
                stored,
                KEY_TRIGGER_LOCK,
                0
            );

        var oldSignature =
            readStoredString(
                stored,
                KEY_TRIGGER_SIGNATURE,
                ""
            );

        /*
         * Prevent duplicate global trigger processing.
         */
        if (
            now < lockUntil &&
            oldSignature == signature
        ) {
            return;
        }

        stored.put(
            KEY_TRIGGER_LOCK,
            "" + (
                now +
                TRIGGER_LOCK_MS
            )
        );

        stored.put(
            KEY_TRIGGER_SIGNATURE,
            signature
        );

        var result =
            activateGlobalTpBoost(
                decoded.multiplier,
                decoded.durationMinutes,
                purchaser
            );

        if (!result.success) {
            commandPlayer.message(
                "\u00A7c[Global TP Boost] " +
                result.message
            );

            return;
        }

        commandPlayer.message(
            "\u00A7a[Global TP Boost] " +
            formatMultiplier(
                result.multiplier
            ) +
            "x TP activated for " +
            formatDuration(
                result.durationMinutes *
                60000
            ) +
            "."
        );

    } catch (err) {
        if (commandPlayer != null) {
            commandPlayer.message(
                "\u00A7c[Global TP Boost Trigger Error] " +
                err
            );
        }
    }
}


/*
 * ============================================================
 * TIMER / EFFECT REFRESH
 * ============================================================
 */

function tick(event) {
    var player =
        event.player;

    if (player == null) {
        return;
    }

    try {
        var temp =
            player.getTempdata();

        var tickKey =
            "dmz_global_tp_effect_tick";

        var tickCount =
            temp.has(tickKey)
                ? parseInt(
                    "" + temp.get(tickKey)
                )
                : 0;

        if (isNaN(tickCount)) {
            tickCount = 0;
        }

        tickCount++;

        if (
            tickCount <
            CHECK_INTERVAL_TICKS
        ) {
            temp.put(
                tickKey,
                "" + tickCount
            );

            return;
        }

        temp.put(
            tickKey,
            "0"
        );

        var stored =
            getGlobalStoreddata();

        if (stored == null) {
            return;
        }

        var active =
            String(
                stored.has(KEY_ACTIVE)
                    ? stored.get(KEY_ACTIVE)
                    : "false"
            ) == "true";

        if (!active) {
            return;
        }

        var now =
            System.currentTimeMillis();

        var endTime =
            readStoredNumber(
                stored,
                KEY_END_TIME,
                0
            );

        if (endTime <= now) {
            var endLock =
                readStoredNumber(
                    stored,
                    KEY_END_LOCK,
                    0
                );

            if (now < endLock) {
                return;
            }

            stored.put(
                KEY_END_LOCK,
                "" + (
                    now +
                    END_LOCK_MS
                )
            );

            var recheckEnd =
                readStoredNumber(
                    stored,
                    KEY_END_TIME,
                    0
                );

            if (recheckEnd <= now) {
                endGlobalTpBoost(stored);
            }

            return;
        }

        var amplifier =
            Math.floor(
                readStoredNumber(
                    stored,
                    KEY_AMPLIFIER,
                    -1
                )
            );

        if (amplifier < 0) {
            return;
        }

        var remainingMs =
            endTime - now;

        var durationTicks =
            Math.max(
                EFFECT_REFRESH_BUFFER_TICKS,
                Math.ceil(
                    remainingMs / 50
                ) +
                EFFECT_REFRESH_BUFFER_TICKS
            );

        /*
         * Applies the effect to this player.
         *
         * This covers players who:
         * - join while the boost is active
         * - change dimensions
         * - lose the effect unexpectedly
         */
        applyTpEffect(
            player,
            amplifier,
            durationTicks
        );

    } catch (err) {}
}
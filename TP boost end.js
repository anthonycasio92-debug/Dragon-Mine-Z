var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");

var STORAGE_WORLD = "overworld";

var STOP_TRIGGER_ID = 31;

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

var KEY_END_LOCK =
    "dmz_global_tp_effect_end_lock";

var KEY_TRIGGER_LOCK =
    "dmz_global_tp_effect_trigger_lock";

var KEY_TRIGGER_SIGNATURE =
    "dmz_global_tp_effect_trigger_signature";

var MainEffects = Java.type(
    "com.dragonminez.common.init.MainEffects"
);


/*
 * ============================================================
 * GLOBAL STORAGE
 * ============================================================
 */

function getGlobalStoreddata() {
    try {
        var world =
            NpcAPI.Instance().getIWorld(
                STORAGE_WORLD
            );

        if (world == null) {
            return null;
        }

        return world.getStoreddata();

    } catch (err) {
        return null;
    }
}


/*
 * ============================================================
 * ONLINE PLAYERS
 * ============================================================
 */

function forEachOnlinePlayer(callback) {
    try {
        var worlds =
            NpcAPI.Instance().getIWorlds();

        var handled = {};

        for (
            var w = 0;
            w < worlds.length;
            w++
        ) {
            try {
                var players =
                    worlds[w].getAllPlayers();

                for (
                    var p = 0;
                    p < players.length;
                    p++
                ) {
                    var player =
                        players[p];

                    var name =
                        String(
                            player.getName()
                        ).toLowerCase();

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
 * CLEAR STORED BOOST DATA
 * ============================================================
 */

function clearBoostData(stored) {
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

    try {
        stored.remove(KEY_TRIGGER_LOCK);
    } catch (e7) {}

    try {
        stored.remove(KEY_TRIGGER_SIGNATURE);
    } catch (e8) {}
}


/*
 * ============================================================
 * STOP TRIGGER
 * ============================================================
 */

function trigger(event) {
    if (event.id != STOP_TRIGGER_ID) {
        return;
    }

    try {
        var stored =
            getGlobalStoreddata();

        if (stored == null) {
            /*
             * Only attempt a direct player message when the
             * trigger was executed by a player.
             */
            try {
                if (event.player != null) {
                    event.player.message(
                        "\u00A7cCould not access the global TP Boost data."
                    );
                }
            } catch (messageErr1) {}

            return;
        }

        /*
         * Disable the global boost so the main script no
         * longer reapplies it.
         */
        clearBoostData(stored);

        /*
         * Remove the DMZ TP Gain effect from every player
         * currently online.
         */
        forEachOnlinePlayer(
            function(player) {
                removeTpEffect(player);

                player.message(
                    "\u00A76\u00A7lGLOBAL TP BOOST \u00A7r\u00A77- " +
                    "\u00A7cThe global TP boost has been disabled by an administrator."
                );
            }
        );

        /*
         * This is optional and safely skipped when the trigger
         * is run from console.
         */
        try {
            if (event.player != null) {
                event.player.message(
                    "\u00A7aGlobal TP Boost disabled successfully."
                );
            }
        } catch (messageErr2) {}

    } catch (err) {
        /*
         * Console triggers do not have event.player, so never
         * reference it without checking first.
         */
        try {
            if (event.player != null) {
                event.player.message(
                    "\u00A7cGlobal TP Boost stop error: " +
                    err
                );
            }
        } catch (messageErr3) {}
    }
}
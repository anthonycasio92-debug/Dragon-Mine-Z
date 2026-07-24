/*
 * ============================================================
 * Saga Difficulty Reselect
 * ============================================================
 *
 * DMZ only accepts SetStoryDifficultyC2S while
 * PlayerQuestData.difficultyChosen is false. Resets
 * (dmzstats reset / Race Lock) do not clear that flag, so the
 * saga difficulty picker can get stuck forever.
 *
 * This script forces requestDifficultyReselect() and syncs
 * progression so the Quest Tree overlay works again.
 *
 * Install: CustomNPCs Player script tab (own tab)
 * Enable: Trigger
 *
 * Usage:
 *   /noppes script trigger 120
 *   /noppes script trigger 120 <player>
 *
 * Trigger ID is configurable below.
 */

var TRIGGER_ID = 120;

var C = "\u00A7";

var StatsProvider = Java.type(
    "com.dragonminez.common.stats.StatsProvider"
);

var StatsCapability = Java.type(
    "com.dragonminez.common.stats.StatsCapability"
);

var NetworkHandler = Java.type(
    "com.dragonminez.common.network.NetworkHandler"
);

var ProgressionSyncS2C = Java.type(
    "com.dragonminez.common.network.S2C.ProgressionSyncS2C"
);

var StatsSyncS2C = Java.type(
    "com.dragonminez.common.network.S2C.StatsSyncS2C"
);


function resolveTargetPlayer(event) {
    var player = event.player;

    try {
        if (
            event.arguments != null &&
            event.arguments.length > 0 &&
            event.arguments[0] != null &&
            ("" + event.arguments[0]).length > 0
        ) {
            var name = ("" + event.arguments[0]).trim();
            var world = player.getWorld();
            var found = world.getPlayer(name);
            if (found != null) {
                return found;
            }

            try {
                var all = world.getAllPlayers();
                for (var i = 0; i < all.length; i++) {
                    if (
                        ("" + all[i].getName())
                            .toLowerCase() ===
                        name.toLowerCase()
                    ) {
                        return all[i];
                    }
                }
            } catch (scanErr) {}
        }
    } catch (argErr) {}

    return player;
}

function syncProgression(mcPlayer) {
    if (mcPlayer == null) {
        return;
    }

    try {
        NetworkHandler.sendToPlayer(
            new ProgressionSyncS2C(mcPlayer),
            mcPlayer
        );
        return;
    } catch (err1) {}

    try {
        NetworkHandler.sendToTrackingEntityAndSelf(
            new StatsSyncS2C(mcPlayer),
            mcPlayer
        );
    } catch (err2) {}
}

function reselectDifficulty(player) {
    if (player == null) {
        return false;
    }

    var mcPlayer = player.getMCEntity
        ? player.getMCEntity()
        : player;

    var dmzData = StatsProvider
        .get(StatsCapability.INSTANCE, mcPlayer)
        .orElse(null);

    if (dmzData == null) {
        player.message(
            C + "c[Saga Difficulty] Could not read DMZ data."
        );
        return false;
    }

    var questData = dmzData.getPlayerQuestData();
    if (questData == null) {
        player.message(
            C + "c[Saga Difficulty] Quest data missing."
        );
        return false;
    }

    var before = false;
    try {
        before = questData.isDifficultyChosen() === true;
    } catch (readErr) {}

    try {
        questData.requestDifficultyReselect();
    } catch (reselectErr) {
        try {
            questData.setDifficultyChosen(false);
        } catch (setErr) {
            player.message(
                C + "c[Saga Difficulty] Reselect failed: " +
                setErr
            );
            return false;
        }
    }

    syncProgression(mcPlayer);

    player.message(
        C + "5[Saga Difficulty] " +
        C + "aDifficulty selection unlocked."
    );
    player.message(
        C + "7Open the Saga / Quest Tree menu and choose Easy, Normal, or Hard."
    );

    if (before) {
        player.message(
            C + "8Previously locked (difficultyChosen was true)."
        );
    }

    return true;
}

function trigger(event) {
    try {
        if (
            event.id != null &&
            Number(event.id) !== TRIGGER_ID
        ) {
            return;
        }
    } catch (idErr) {}

    try {
        var target = resolveTargetPlayer(event);
        reselectDifficulty(target);
    } catch (err) {
        try {
            event.player.message(
                C + "c[Saga Difficulty] Error: " + err
            );
        } catch (msgErr) {}
    }
}

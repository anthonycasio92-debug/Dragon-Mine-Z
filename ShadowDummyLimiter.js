var StatsProvider = Java.type(
    "com.dragonminez.common.stats.StatsProvider"
);

var StatsCapability = Java.type(
    "com.dragonminez.common.stats.StatsCapability"
);

var StatsSyncS2C = Java.type(
    "com.dragonminez.common.network.S2C.StatsSyncS2C"
);

var NetworkHandler = Java.type(
    "com.dragonminez.common.network.NetworkHandler"
);

var ShadowDummyEntity = Java.type(
    "com.dragonminez.common.init.entities.ShadowDummyEntity"
);

var ShadowDummyPacket = Java.type(
    "com.dragonminez.common.network.C2S.SummonPlayerShadowDummyC2S"
);

var System = Java.type(
    "java.lang.System"
);


/*
 * ============================================================
 * SETTINGS
 * ============================================================
 */

/*
 * Each player may successfully summon one minigame
 * Shadow Dummy every 30 seconds.
 */
var SHADOW_DUMMY_COOLDOWN_MS =
    30 * 1000;

/*
 * The dummy receives 50% of the owner's copied stats.
 */
var SHADOW_DUMMY_PERCENT =
    50;

/*
 * How often the script checks each player for a new dummy.
 * Keep this low — dummies spawn with default HP and can be
 * one-shot before copyStats/heal runs.
 */
var CHECK_INTERVAL_MS =
    100;

/*
 * While waiting for a brand-new dummy UUID / entity, check
 * every player tick so protection starts immediately.
 */
var FAST_CHECK_WHILE_PENDING_MS =
    0;

/*
 * God-mode + heal window after the dummy is first seen /
 * configured so it cannot die in the spawn second.
 */
var SPAWN_PROTECT_MS =
    3000;

/*
 * Prevent blocked-summon messages from spamming.
 */
var MESSAGE_COOLDOWN_MS =
    3000;

/*
 * Set this to true only while troubleshooting.
 */
var DEBUG =
    false;


/*
 * ============================================================
 * STORED-DATA KEYS
 * ============================================================
 */

var KEY_COOLDOWN_UNTIL =
    "dmz_minigame_shadow_dummy_cooldown_until";

var KEY_LAST_ACCEPTED_UUID =
    "dmz_minigame_shadow_dummy_last_accepted_uuid";


/*
 * ============================================================
 * TEMP-DATA KEYS
 * ============================================================
 */

var KEY_NEXT_CHECK =
    "dmz_minigame_shadow_dummy_next_check";

var KEY_LAST_SEEN_UUID =
    "dmz_minigame_shadow_dummy_last_seen_uuid";

var KEY_PROCESSING_UUID =
    "dmz_minigame_shadow_dummy_processing_uuid";

var KEY_MESSAGE_COOLDOWN =
    "dmz_minigame_shadow_dummy_message_cooldown";

var KEY_PROTECT_UNTIL =
    "dmz_minigame_shadow_dummy_protect_until";

var KEY_PROTECT_UUID =
    "dmz_minigame_shadow_dummy_protect_uuid";

var TAG_SPAWN_PROTECT =
    "dmz_minigame_spawn_protect";

var TAG_SPAWN_PROTECT_UNTIL =
    "dmz_minigame_spawn_protect_until";


/*
 * ============================================================
 * DATA HELPERS
 * ============================================================
 */

function readNumber(
    data,
    key,
    fallback
) {
    try {
        if (
            data != null &&
            data.has(key)
        ) {
            var value =
                Number(
                    "" + data.get(key)
                );

            if (
                !isNaN(value) &&
                isFinite(value)
            ) {
                return value;
            }
        }
    } catch (err) {}

    return fallback;
}


function readString(
    data,
    key,
    fallback
) {
    try {
        if (
            data != null &&
            data.has(key)
        ) {
            return String(
                data.get(key)
            );
        }
    } catch (err) {}

    return fallback;
}


/*
 * ============================================================
 * TIME FORMAT
 * ============================================================
 */

function formatRemainingTime(milliseconds) {
    var seconds =
        Math.max(
            0,
            Math.ceil(
                Number(milliseconds) /
                1000
            )
        );

    return seconds + "s";
}


/*
 * ============================================================
 * PLAYER MESSAGE
 * ============================================================
 */

function sendLimitedMessage(
    player,
    message,
    now
) {
    try {
        var temp =
            player.getTempdata();

        var nextMessage =
            readNumber(
                temp,
                KEY_MESSAGE_COOLDOWN,
                0
            );

        if (
            now <
            nextMessage
        ) {
            return;
        }

        temp.put(
            KEY_MESSAGE_COOLDOWN,
            "" +
            (
                now +
                MESSAGE_COOLDOWN_MS
            )
        );

        player.message(
            message
        );

    } catch (err) {}
}


/*
 * ============================================================
 * DMZ STAT SYNC
 * ============================================================
 */

function syncPlayerStats(
    mcPlayer
) {
    try {
        NetworkHandler
            .sendToTrackingEntityAndSelf(
                new StatsSyncS2C(
                    mcPlayer
                ),
                mcPlayer
            );

        return;
    } catch (err1) {}

    try {
        NetworkHandler.sendToPlayer(
            new StatsSyncS2C(
                mcPlayer
            ),
            mcPlayer
        );
    } catch (err2) {}
}


/*
 * ============================================================
 * ACTIVE DUMMY UUID
 * ============================================================
 */

function getActiveDummyUUID(status) {
    try {
        if (
            status == null ||
            !status.hasActiveShadowDummy()
        ) {
            return null;
        }

        return status
            .getActiveShadowDummyUUID();

    } catch (err) {
        return null;
    }
}


/*
 * ============================================================
 * FIND SHADOW DUMMY ENTITY
 * ============================================================
 */

function findShadowDummy(
    mcPlayer,
    dummyUUID
) {
    if (
        mcPlayer == null ||
        dummyUUID == null
    ) {
        return null;
    }

    try {
        var server =
            mcPlayer.m_20194_();

        if (server == null) {
            return null;
        }

        var levels =
            server.m_129785_();

        var iterator =
            levels.iterator();

        while (
            iterator.hasNext()
        ) {
            var level =
                iterator.next();

            if (level == null) {
                continue;
            }

            var entity =
                level.m_8791_(
                    dummyUUID
                );

            if (
                entity != null &&
                ShadowDummyEntity.class
                    .isInstance(entity)
            ) {
                return entity;
            }
        }

    } catch (err) {}

    return null;
}


/*
 * ============================================================
 * CLEAR TEMP STATE
 * ============================================================
 */

function clearActiveDummyTempState(
    player
) {
    try {
        var temp =
            player.getTempdata();

        temp.remove(
            KEY_LAST_SEEN_UUID
        );

        temp.remove(
            KEY_PROCESSING_UUID
        );

        temp.remove(
            KEY_PROTECT_UNTIL
        );

        temp.remove(
            KEY_PROTECT_UUID
        );

    } catch (err) {}
}


/*
 * ============================================================
 * SPAWN PROTECTION
 * ============================================================
 *
 * Dummies spawn with default monster HP. Until copyStats + heal
 * finish (and briefly after), keep them unkillable.
 */

function setDummyInvulnerable(
    dummy,
    enabled
) {
    if (dummy == null) {
        return;
    }

    try {
        dummy.setInvulnerable(
            enabled === true
        );
        return;
    } catch (err1) {}

    try {
        dummy.m_20331_(
            enabled === true
        );
    } catch (err2) {}
}


function bumpDummyHurtInvuln(
    dummy
) {
    if (dummy == null) {
        return;
    }

    try {
        dummy.invulnerableTime =
            40;
        return;
    } catch (err1) {}

    try {
        dummy.f_19802_ =
            40;
    } catch (err2) {}
}


function fullyHealDummy(
    dummy
) {
    if (dummy == null) {
        return;
    }

    try {
        dummy.m_21153_(
            dummy.m_21233_()
        );
        return;
    } catch (err1) {}

    try {
        dummy.setHealth(
            dummy.getMaxHealth()
        );
    } catch (err2) {}
}


function grantSpawnProtection(
    player,
    dummy,
    dummyUUID,
    now
) {
    if (
        dummy == null ||
        now == null
    ) {
        return;
    }

    var until =
        Number(now) +
        SPAWN_PROTECT_MS;

    setDummyInvulnerable(
        dummy,
        true
    );

    bumpDummyHurtInvuln(
        dummy
    );

    fullyHealDummy(
        dummy
    );

    try {
        var persistent =
            dummy.getPersistentData();

        persistent.m_128379_(
            TAG_SPAWN_PROTECT,
            true
        );

        persistent.m_128356_(
            TAG_SPAWN_PROTECT_UNTIL,
            until
        );

    } catch (tagErr) {}

    try {
        var temp =
            player.getTempdata();

        temp.put(
            KEY_PROTECT_UNTIL,
            "" + until
        );

        if (dummyUUID != null) {
            temp.put(
                KEY_PROTECT_UUID,
                "" + dummyUUID
            );
        }

    } catch (tempErr) {}
}


function clearSpawnProtection(
    dummy
) {
    if (dummy == null) {
        return;
    }

    setDummyInvulnerable(
        dummy,
        false
    );

    try {
        var persistent =
            dummy.getPersistentData();

        persistent.m_128379_(
            TAG_SPAWN_PROTECT,
            false
        );

        persistent.m_128356_(
            TAG_SPAWN_PROTECT_UNTIL,
            0
        );

    } catch (tagErr) {}
}


function isDummySpawnProtected(
    dummy,
    now
) {
    if (dummy == null) {
        return false;
    }

    try {
        var persistent =
            dummy.getPersistentData();

        if (
            !persistent.m_128471_(
                TAG_SPAWN_PROTECT
            )
        ) {
            return false;
        }

        var until =
            Number(
                persistent.m_128454_(
                    TAG_SPAWN_PROTECT_UNTIL
                )
            );

        if (
            isNaN(until) ||
            !isFinite(until)
        ) {
            return false;
        }

        return Number(now) < until;

    } catch (err) {
        return false;
    }
}


function maintainSpawnProtection(
    player,
    mcPlayer,
    now
) {
    try {
        var temp =
            player.getTempdata();

        var until =
            readNumber(
                temp,
                KEY_PROTECT_UNTIL,
                0
            );

        var protectUUID =
            readString(
                temp,
                KEY_PROTECT_UUID,
                ""
            );

        if (
            until <= 0 ||
            protectUUID === ""
        ) {
            return;
        }

        var uuidObj =
            null;

        try {
            var UUID =
                Java.type(
                    "java.util.UUID"
                );

            uuidObj =
                UUID.fromString(
                    protectUUID
                );

        } catch (uuidErr) {
            uuidObj =
                protectUUID;
        }

        var dummy =
            findShadowDummy(
                mcPlayer,
                uuidObj
            );

        if (dummy == null) {
            if (Number(now) >= until) {
                temp.remove(
                    KEY_PROTECT_UNTIL
                );

                temp.remove(
                    KEY_PROTECT_UUID
                );
            }

            return;
        }

        if (Number(now) >= until) {
            clearSpawnProtection(
                dummy
            );

            temp.remove(
                KEY_PROTECT_UNTIL
            );

            temp.remove(
                KEY_PROTECT_UUID
            );

            return;
        }

        setDummyInvulnerable(
            dummy,
            true
        );

        bumpDummyHurtInvuln(
            dummy
        );

        fullyHealDummy(
            dummy
        );

    } catch (err) {}
}


/*
 * ============================================================
 * BLOCK SUMMON DURING COOLDOWN
 * ============================================================
 */

function denyShadowDummySummon(
    player,
    mcPlayer,
    playerData,
    remainingMs,
    now
) {
    try {
        /*
         * Use DragonMineZ's cleanup method so the blocked
         * dummy and its owner penalties are both removed.
         */
        ShadowDummyPacket
            .clearPlayerShadowDummy(
                mcPlayer,
                playerData
            );

        syncPlayerStats(
            mcPlayer
        );

        clearActiveDummyTempState(
            player
        );

        sendLimitedMessage(
            player,
            "§5[Shadow Dummy] §cYou can only summon one Shadow Dummy every 30 seconds. §eTime remaining: §f" +
            formatRemainingTime(
                remainingMs
            ) +
            "§e.",
            now
        );

        if (DEBUG) {
            player.message(
                "§8[Shadow Dummy Debug] Blocked summon removed."
            );
        }

    } catch (err) {
        player.message(
            "§c[Shadow Dummy Error] Could not remove the blocked dummy: " +
            err
        );
    }
}


/*
 * ============================================================
 * CONFIGURE ACCEPTED DUMMY
 * ============================================================
 */

function configureShadowDummy(
    player,
    mcPlayer,
    playerData,
    status,
    dummy,
    dummyUUID,
    now
) {
    try {
        /*
         * Lock the dummy before any stat rewrite so it cannot
         * die mid-configure on default spawn HP.
         */
        grantSpawnProtection(
            player,
            dummy,
            dummyUUID,
            now
        );

        /*
         * Remove the original penalties before applying the
         * fixed 50% minigame configuration.
         */
        ShadowDummyPacket
            .removePenalties(
                mcPlayer,
                playerData
            );

        /*
         * Copy 50% of the player's health, defense, battle
         * power, melee damage, and Ki damage to the dummy.
         */
        dummy.copyStatsFromPlayerWithPercent(
            mcPlayer,
            SHADOW_DUMMY_PERCENT
        );

        /*
         * Apply the matching owner penalties.
         */
        ShadowDummyPacket
            .applyPenalties(
                mcPlayer,
                playerData,
                SHADOW_DUMMY_PERCENT
            );

        status.setShadowDummyPercent(
            SHADOW_DUMMY_PERCENT
        );

        status.setActiveShadowDummyUUID(
            dummyUUID
        );

        try {
            var persistent =
                dummy.getPersistentData();

            persistent.m_128379_(
                "dmz_player_shadow",
                true
            );

            persistent.m_128405_(
                "dmz_shadow_percent",
                SHADOW_DUMMY_PERCENT
            );

            persistent.m_128359_(
                "dmz_quest_owner",
                "" + mcPlayer.m_20148_()
            );

        } catch (tagErr) {}

        /*
         * Fully heal the dummy to its recalculated maximum,
         * then refresh spawn protection on the new max HP.
         */
        fullyHealDummy(
            dummy
        );

        grantSpawnProtection(
            player,
            dummy,
            dummyUUID,
            now
        );

        syncPlayerStats(
            mcPlayer
        );

        var stored =
            player.getStoreddata();

        var temp =
            player.getTempdata();

        /*
         * Begin the cooldown only after the dummy has been
         * found and successfully configured.
         */
        stored.put(
            KEY_COOLDOWN_UNTIL,
            "" +
            (
                now +
                SHADOW_DUMMY_COOLDOWN_MS
            )
        );

        stored.put(
            KEY_LAST_ACCEPTED_UUID,
            "" + dummyUUID
        );

        temp.put(
            KEY_LAST_SEEN_UUID,
            "" + dummyUUID
        );

        temp.remove(
            KEY_PROCESSING_UUID
        );

        player.message(
            "§5[Shadow Dummy] §dShadow Dummy summoned."
        );

        player.message(
            "§7Its maximum health and copied power are fixed at §f50%§7 of your normal stats."
        );

        player.message(
            "§7You may summon another Shadow Dummy in §f30 seconds§7."
        );

        if (DEBUG) {
            var dummyMaxHealth =
                0;

            var ownerMaxHealth =
                0;

            try {
                dummyMaxHealth =
                    Number(
                        dummy.m_21233_()
                    );

                ownerMaxHealth =
                    Number(
                        mcPlayer.m_21233_()
                    );

            } catch (healthDebugErr) {}

            player.message(
                "§8[Shadow Dummy Debug] Owner max health: " +
                ownerMaxHealth +
                " | Dummy max health: " +
                dummyMaxHealth +
                " | Percent: " +
                SHADOW_DUMMY_PERCENT
            );
        }

        return true;

    } catch (err) {
        /*
         * Never leave a partially configured dummy active.
         */
        try {
            ShadowDummyPacket
                .clearPlayerShadowDummy(
                    mcPlayer,
                    playerData
                );

        } catch (cleanupErr) {}

        clearActiveDummyTempState(
            player
        );

        player.message(
            "§c[Shadow Dummy Error] Could not configure the dummy: " +
            err
        );

        return false;
    }
}


/*
 * ============================================================
 * PROCESS NEW DUMMY
 * ============================================================
 */

function processNewShadowDummy(
    player,
    mcPlayer,
    playerData,
    status,
    dummyUUID,
    now
) {
    try {
        var stored =
            player.getStoreddata();

        var temp =
            player.getTempdata();

        var uuidText =
            "" + dummyUUID;

        var lastSeen =
            readString(
                temp,
                KEY_LAST_SEEN_UUID,
                ""
            );

        /*
         * This exact dummy has already been accepted.
         */
        if (
            lastSeen ==
            uuidText
        ) {
            return;
        }

        var processingUUID =
            readString(
                temp,
                KEY_PROCESSING_UUID,
                ""
            );

        if (
            processingUUID !=
            uuidText
        ) {
            temp.put(
                KEY_PROCESSING_UUID,
                uuidText
            );
        }

        var cooldownUntil =
            readNumber(
                stored,
                KEY_COOLDOWN_UNTIL,
                0
            );

        /*
         * Any newly created dummy during the cooldown is
         * immediately removed.
         */
        if (
            now <
            cooldownUntil
        ) {
            denyShadowDummySummon(
                player,
                mcPlayer,
                playerData,
                cooldownUntil - now,
                now
            );

            return;
        }

        /*
         * The UUID may become active before the entity enters
         * the world, so retry on later ticks until it exists.
         */
        var dummy =
            findShadowDummy(
                mcPlayer,
                dummyUUID
            );

        if (dummy == null) {
            if (DEBUG) {
                sendLimitedMessage(
                    player,
                    "§8[Shadow Dummy Debug] Waiting for the dummy entity.",
                    now
                );
            }

            return;
        }

        /*
         * Protect immediately on first sight — before stats copy.
         */
        grantSpawnProtection(
            player,
            dummy,
            dummyUUID,
            now
        );

        configureShadowDummy(
            player,
            mcPlayer,
            playerData,
            status,
            dummy,
            dummyUUID,
            now
        );

    } catch (err) {
        player.message(
            "§c[Shadow Dummy Error] Processing failed: " +
            err
        );
    }
}


/*
 * ============================================================
 * MAIN PLAYER TICK
 * ============================================================
 *
 * Install this as a CustomNPCs PLAYER script.
 * Enable events: Tick, DamagedEntity
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

        var now =
            System.currentTimeMillis();

        var mcPlayer =
            player.getMCEntity
                ? player.getMCEntity()
                : player;

        if (mcPlayer == null) {
            return;
        }

        /*
         * Keep protected dummies topped up every tick while
         * the spawn window is active (not throttled).
         */
        maintainSpawnProtection(
            player,
            mcPlayer,
            now
        );

        var nextCheck =
            readNumber(
                temp,
                KEY_NEXT_CHECK,
                0
            );

        var pendingUUID =
            readString(
                temp,
                KEY_PROCESSING_UUID,
                ""
            );

        var checkInterval =
            pendingUUID !== ""
                ? FAST_CHECK_WHILE_PENDING_MS
                : CHECK_INTERVAL_MS;

        if (
            now <
            nextCheck
        ) {
            return;
        }

        temp.put(
            KEY_NEXT_CHECK,
            "" +
            (
                now +
                checkInterval
            )
        );

        var playerData =
            StatsProvider
                .get(
                    StatsCapability.INSTANCE,
                    mcPlayer
                )
                .orElse(null);

        if (playerData == null) {
            return;
        }

        var status =
            playerData.getStatus();

        if (status == null) {
            return;
        }

        var dummyUUID =
            getActiveDummyUUID(
                status
            );

        /*
         * No active player-created Shadow Dummy.
         */
        if (dummyUUID == null) {
            clearActiveDummyTempState(
                player
            );

            return;
        }

        processNewShadowDummy(
            player,
            mcPlayer,
            playerData,
            status,
            dummyUUID,
            now
        );

    } catch (err) {
        player.message(
            "§c[Shadow Dummy Tick Error] " +
            err
        );
    }
}


/*
 * Cancel damage the player deals to a spawn-protected dummy.
 * Enable DamagedEntity on this Player script tab.
 */
function damagedEntity(event) {
    try {
        if (event == null) {
            return;
        }

        var target =
            event.target;

        if (target == null) {
            return;
        }

        var mcTarget =
            null;

        try {
            mcTarget =
                target.getMCEntity
                    ? target.getMCEntity()
                    : null;
        } catch (mcErr) {}

        if (
            mcTarget == null ||
            !ShadowDummyEntity.class
                .isInstance(
                    mcTarget
                )
        ) {
            return;
        }

        var now =
            System.currentTimeMillis();

        if (
            !isDummySpawnProtected(
                mcTarget,
                now
            )
        ) {
            return;
        }

        try {
            event.damage =
                0;
        } catch (dmgErr) {}

        try {
            if (
                typeof event.setCanceled ===
                "function"
            ) {
                event.setCanceled(
                    true
                );
            }
        } catch (cancelErr) {}

        setDummyInvulnerable(
            mcTarget,
            true
        );

        bumpDummyHurtInvuln(
            mcTarget
        );

        fullyHealDummy(
            mcTarget
        );

    } catch (err) {}
}

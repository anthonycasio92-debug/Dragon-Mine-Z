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
 *
 * Exploit this script closes:
 * Players could summon a Shadow Dummy and kill it in the
 * short window before the 500ms cooldown check removed it.
 * Kill credit / quest progress counted, cooldown often never
 * started.
 *
 * Fix:
 * 1) Check every player tick while a dummy UUID is active
 * 2) Immediately lock (invulnerable + no AI) any new dummy
 * 3) Only unlock after a legal configure, or discard if blocked
 * 4) Zero damage / reverse kill-count if a locked dummy is hit
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
 * Idle poll when no dummy is active.
 */
var CHECK_IDLE_MS =
    250;

/*
 * While a dummy is pending / active, check every tick.
 */
var CHECK_ACTIVE_MS =
    0;

/*
 * How long to keep hunting a blocked dummy UUID after clear.
 */
var PENDING_DENY_TTL_MS =
    10000;

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
 * Persistent NBT flag written onto locked dummies.
 */
var NBT_LIMITER_LOCKED =
    "dmz_shadow_limiter_locked";


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

var KEY_PENDING_DENY_UUID =
    "dmz_minigame_shadow_dummy_pending_deny_uuid";

var KEY_PENDING_DENY_UNTIL =
    "dmz_minigame_shadow_dummy_pending_deny_until";

var KEY_KILLCOUNT_SNAPSHOT =
    "dmz_minigame_shadow_dummy_killcount_snapshot";


/*
 * ============================================================
 * DATA HELPERS
 * ============================================================
 */

function readNumber(data, key, fallback) {
    try {
        if (data != null && data.has(key)) {
            var value = Number("" + data.get(key));
            if (!isNaN(value) && isFinite(value)) {
                return value;
            }
        }
    } catch (err) {}
    return fallback;
}

function readString(data, key, fallback) {
    try {
        if (data != null && data.has(key)) {
            return String(data.get(key));
        }
    } catch (err) {}
    return fallback;
}

function formatRemainingTime(milliseconds) {
    var seconds = Math.max(
        0,
        Math.ceil(Number(milliseconds) / 1000)
    );
    return seconds + "s";
}

function sendLimitedMessage(player, message, now) {
    try {
        var temp = player.getTempdata();
        var nextMessage = readNumber(temp, KEY_MESSAGE_COOLDOWN, 0);
        if (now < nextMessage) return;

        temp.put(
            KEY_MESSAGE_COOLDOWN,
            "" + (now + MESSAGE_COOLDOWN_MS)
        );
        player.message(message);
    } catch (err) {}
}


/*
 * ============================================================
 * DMZ STAT SYNC
 * ============================================================
 */

function syncPlayerStats(mcPlayer) {
    try {
        NetworkHandler.sendToTrackingEntityAndSelf(
            new StatsSyncS2C(mcPlayer),
            mcPlayer
        );
        return;
    } catch (err1) {}

    try {
        NetworkHandler.sendToPlayer(
            new StatsSyncS2C(mcPlayer),
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
        if (status == null || !status.hasActiveShadowDummy()) {
            return null;
        }
        return status.getActiveShadowDummyUUID();
    } catch (err) {
        return null;
    }
}

function uuidText(value) {
    if (value == null) return "";
    return "" + value;
}


/*
 * ============================================================
 * FIND / HARDEN / DISCARD
 * ============================================================
 */

function findShadowDummy(mcPlayer, dummyUUID) {
    if (mcPlayer == null || dummyUUID == null) return null;

    try {
        var server = mcPlayer.m_20194_();
        if (server == null) return null;

        var levels = server.m_129785_();
        var iterator = levels.iterator();

        while (iterator.hasNext()) {
            var level = iterator.next();
            if (level == null) continue;

            var entity = level.m_8791_(dummyUUID);
            if (
                entity != null &&
                ShadowDummyEntity.class.isInstance(entity)
            ) {
                return entity;
            }
        }
    } catch (err) {}

    return null;
}

function isShadowDummyEntity(entity) {
    try {
        return entity != null &&
            ShadowDummyEntity.class.isInstance(entity);
    } catch (err) {
        return false;
    }
}

function isDummyLocked(dummy) {
    try {
        return dummy.getPersistentData()
            .m_128471_(NBT_LIMITER_LOCKED) === true;
    } catch (err) {
        return false;
    }
}

/*
 * Freeze a dummy so it cannot be farmed before accept/deny.
 * Uses Mojang/SRG names with mapped fallbacks.
 */
function hardenDummy(dummy) {
    if (dummy == null) return false;

    try {
        try { dummy.m_20331_(true); }
        catch (e1) { try { dummy.setInvulnerable(true); } catch (e2) {} }

        try { dummy.m_21557_(true); }
        catch (e3) { try { dummy.setNoAi(true); } catch (e4) {} }

        try { dummy.m_6710_(null); }
        catch (e5) { try { dummy.setTarget(null); } catch (e6) {} }

        try {
            dummy.getPersistentData()
                .m_128379_(NBT_LIMITER_LOCKED, true);
        } catch (tagErr) {}

        /*
         * Keep it topped off while locked so chip damage
         * from the same tick cannot finish it.
         */
        try {
            dummy.m_21153_(dummy.m_21233_());
        } catch (healErr) {
            try { dummy.setHealth(dummy.getMaxHealth()); }
            catch (mappedHealErr) {}
        }

        return true;
    } catch (err) {
        return false;
    }
}

function unlockDummy(dummy) {
    if (dummy == null) return;

    try {
        try { dummy.m_20331_(false); }
        catch (e1) { try { dummy.setInvulnerable(false); } catch (e2) {} }

        try { dummy.m_21557_(false); }
        catch (e3) { try { dummy.setNoAi(false); } catch (e4) {} }

        try {
            dummy.getPersistentData()
                .m_128379_(NBT_LIMITER_LOCKED, false);
        } catch (tagErr) {}
    } catch (err) {}
}

function discardDummyEntity(dummy) {
    if (dummy == null) return false;
    try {
        hardenDummy(dummy);
        dummy.m_146870_();
        return true;
    } catch (err1) {
        try {
            dummy.discard();
            return true;
        } catch (err2) {
            try {
                ShadowDummyPacket.dismissByDummy(dummy);
                return true;
            } catch (err3) {
                return false;
            }
        }
    }
}


/*
 * ============================================================
 * TEMP STATE
 * ============================================================
 */

function clearActiveDummyTempState(player) {
    try {
        var temp = player.getTempdata();
        temp.remove(KEY_LAST_SEEN_UUID);
        temp.remove(KEY_PROCESSING_UUID);
    } catch (err) {}
}

function clearPendingDeny(player) {
    try {
        var temp = player.getTempdata();
        temp.remove(KEY_PENDING_DENY_UUID);
        temp.remove(KEY_PENDING_DENY_UNTIL);
        temp.remove(KEY_KILLCOUNT_SNAPSHOT);
    } catch (err) {}
}

function markPendingDeny(player, dummyUUID, now) {
    try {
        var temp = player.getTempdata();
        temp.put(KEY_PENDING_DENY_UUID, uuidText(dummyUUID));
        temp.put(
            KEY_PENDING_DENY_UNTIL,
            "" + (now + PENDING_DENY_TTL_MS)
        );
    } catch (err) {}
}

function snapshotKillCount(player, status) {
    try {
        var temp = player.getTempdata();
        var count = 0;
        try { count = Number(status.getShadowDummyKillCount()); }
        catch (e) { count = 0; }
        temp.put(KEY_KILLCOUNT_SNAPSHOT, "" + count);
    } catch (err) {}
}

function revertKillCountIfNeeded(player, mcPlayer, playerData, status) {
    try {
        if (status == null) return false;

        var temp = player.getTempdata();
        var snapshot = readNumber(temp, KEY_KILLCOUNT_SNAPSHOT, -1);
        if (snapshot < 0) return false;

        var current = Number(status.getShadowDummyKillCount());
        if (current > snapshot) {
            status.setShadowDummyKillCount(snapshot);
            syncPlayerStats(mcPlayer);
            if (DEBUG) {
                player.message(
                    "§8[Shadow Dummy Debug] Reverted blocked kill credit (" +
                    current + " -> " + snapshot + ")."
                );
            }
            return true;
        }
    } catch (err) {}
    return false;
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
    dummyUUID,
    remainingMs,
    now
) {
    try {
        var temp = player.getTempdata();
        markPendingDeny(player, dummyUUID, now);
        snapshotKillCount(player, playerData.getStatus());

        var dummy = findShadowDummy(mcPlayer, dummyUUID);
        if (dummy != null) {
            discardDummyEntity(dummy);
        }

        /*
         * Clear owner status / penalties. If the entity was not
         * found yet, pending-deny keeps hunting it every tick.
         */
        try {
            ShadowDummyPacket.clearPlayerShadowDummy(
                mcPlayer,
                playerData
            );
        } catch (clearErr) {}

        syncPlayerStats(mcPlayer);
        clearActiveDummyTempState(player);

        /*
         * Confirm the entity is gone. If not, keep pending deny.
         */
        var leftover = findShadowDummy(mcPlayer, dummyUUID);
        if (leftover == null) {
            clearPendingDeny(player);
        } else {
            discardDummyEntity(leftover);
        }

        sendLimitedMessage(
            player,
            "§5[Shadow Dummy] §cYou can only summon one Shadow Dummy every 30 seconds. §eTime remaining: §f" +
            formatRemainingTime(remainingMs) +
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

function processPendingDeny(player, mcPlayer, playerData, now) {
    try {
        var temp = player.getTempdata();
        var pending = readString(temp, KEY_PENDING_DENY_UUID, "");
        if (pending === "") return false;

        var until = readNumber(temp, KEY_PENDING_DENY_UNTIL, 0);
        if (now > until) {
            clearPendingDeny(player);
            return false;
        }

        var dummy = findShadowDummy(mcPlayer, pending);
        if (dummy != null) {
            discardDummyEntity(dummy);
        }

        try {
            var status = playerData.getStatus();
            var active = getActiveDummyUUID(status);
            if (
                active != null &&
                uuidText(active) === pending
            ) {
                ShadowDummyPacket.clearPlayerShadowDummy(
                    mcPlayer,
                    playerData
                );
                syncPlayerStats(mcPlayer);
            }
        } catch (clearErr) {}

        revertKillCountIfNeeded(
            player,
            mcPlayer,
            playerData,
            playerData.getStatus()
        );

        if (findShadowDummy(mcPlayer, pending) == null) {
            clearPendingDeny(player);
            clearActiveDummyTempState(player);
        }

        return true;
    } catch (err) {
        return false;
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
         * Stay locked until configuration finishes so the
         * dummy cannot die mid-setup.
         */
        hardenDummy(dummy);

        ShadowDummyPacket.removePenalties(
            mcPlayer,
            playerData
        );

        dummy.copyStatsFromPlayerWithPercent(
            mcPlayer,
            SHADOW_DUMMY_PERCENT
        );

        ShadowDummyPacket.applyPenalties(
            mcPlayer,
            playerData,
            SHADOW_DUMMY_PERCENT
        );

        status.setShadowDummyPercent(SHADOW_DUMMY_PERCENT);
        status.setActiveShadowDummyUUID(dummyUUID);

        try {
            var persistent = dummy.getPersistentData();
            persistent.m_128379_("dmz_player_shadow", true);
            persistent.m_128405_(
                "dmz_shadow_percent",
                SHADOW_DUMMY_PERCENT
            );
            persistent.m_128359_(
                "dmz_quest_owner",
                "" + mcPlayer.m_20148_()
            );
        } catch (tagErr) {}

        try {
            dummy.m_21153_(dummy.m_21233_());
        } catch (healthErr) {
            try { dummy.setHealth(dummy.getMaxHealth()); }
            catch (mappedHealthErr) {}
        }

        /*
         * Legal dummy is ready - allow combat.
         */
        unlockDummy(dummy);
        syncPlayerStats(mcPlayer);

        var stored = player.getStoreddata();
        var temp = player.getTempdata();

        stored.put(
            KEY_COOLDOWN_UNTIL,
            "" + (now + SHADOW_DUMMY_COOLDOWN_MS)
        );
        stored.put(
            KEY_LAST_ACCEPTED_UUID,
            uuidText(dummyUUID)
        );

        temp.put(KEY_LAST_SEEN_UUID, uuidText(dummyUUID));
        temp.remove(KEY_PROCESSING_UUID);
        clearPendingDeny(player);

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
            var dummyMaxHealth = 0;
            var ownerMaxHealth = 0;
            try {
                dummyMaxHealth = Number(dummy.m_21233_());
                ownerMaxHealth = Number(mcPlayer.m_21233_());
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
        try {
            discardDummyEntity(dummy);
            ShadowDummyPacket.clearPlayerShadowDummy(
                mcPlayer,
                playerData
            );
        } catch (cleanupErr) {}

        clearActiveDummyTempState(player);
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
        var stored = player.getStoreddata();
        var temp = player.getTempdata();
        var id = uuidText(dummyUUID);

        var lastSeen = readString(temp, KEY_LAST_SEEN_UUID, "");
        if (lastSeen === id) {
            return;
        }

        var processingUUID = readString(
            temp,
            KEY_PROCESSING_UUID,
            ""
        );
        if (processingUUID !== id) {
            temp.put(KEY_PROCESSING_UUID, id);
            snapshotKillCount(player, status);
        }

        /*
         * Lock the entity the instant we can see it so the
         * player cannot farm the pre-removal window.
         */
        var dummy = findShadowDummy(mcPlayer, dummyUUID);
        if (dummy != null) {
            hardenDummy(dummy);
        }

        var cooldownUntil = readNumber(
            stored,
            KEY_COOLDOWN_UNTIL,
            0
        );

        if (now < cooldownUntil) {
            denyShadowDummySummon(
                player,
                mcPlayer,
                playerData,
                dummyUUID,
                cooldownUntil - now,
                now
            );
            return;
        }

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
         * Arm cooldown as soon as we accept this UUID, before
         * configuration finishes. Prevents kill-and-resummon
         * if anything races the configure step.
         */
        stored.put(
            KEY_COOLDOWN_UNTIL,
            "" + (now + SHADOW_DUMMY_COOLDOWN_MS)
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
 * PLAYER HELPERS
 * ============================================================
 */

function resolveMcPlayer(player) {
    try {
        if (player.getMCEntity) return player.getMCEntity();
    } catch (err) {}
    return player;
}

function loadPlayerData(mcPlayer) {
    try {
        return StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);
    } catch (err) {
        return null;
    }
}

function resolveVictimEntity(event) {
    try {
        if (event.target != null) return event.target;
    } catch (e1) {}
    try {
        if (event.entity != null) return event.entity;
    } catch (e2) {}
    return null;
}

function resolveVictimMc(event) {
    try {
        var wrapped = resolveVictimEntity(event);
        if (wrapped == null) return null;
        if (wrapped.getMCEntity) return wrapped.getMCEntity();
        return wrapped;
    } catch (err) {
        return null;
    }
}

function isCurrentlyAccepting(player, dummyUUID) {
    try {
        var temp = player.getTempdata();
        var id = uuidText(dummyUUID);
        var processing = readString(temp, KEY_PROCESSING_UUID, "");
        var lastSeen = readString(temp, KEY_LAST_SEEN_UUID, "");
        return processing === id && lastSeen !== id;
    } catch (err) {
        return false;
    }
}

function shouldBlockDummyCombat(player, dummy) {
    if (!isShadowDummyEntity(dummy)) return false;
    if (isDummyLocked(dummy)) return true;

    try {
        var stored = player.getStoreddata();
        var temp = player.getTempdata();
        var id = uuidText(dummy.m_20148_());
        var pending = readString(temp, KEY_PENDING_DENY_UUID, "");
        if (pending !== "" && pending === id) return true;

        /*
         * Still being processed / not accepted yet.
         */
        if (isCurrentlyAccepting(player, id)) {
            return true;
        }

        var lastAccepted = readString(
            stored,
            KEY_LAST_ACCEPTED_UUID,
            ""
        );
        var now = System.currentTimeMillis();
        var cooldownUntil = readNumber(
            stored,
            KEY_COOLDOWN_UNTIL,
            0
        );
        if (now < cooldownUntil && id !== lastAccepted) {
            return true;
        }
    } catch (err) {}

    return false;
}

/*
 * Force-remove on hit only for cooldown abuse - never while we
 * are mid-accept on this same UUID (cooldown is armed early).
 */
function shouldForceDenyOnHit(player, dummy) {
    if (!isShadowDummyEntity(dummy)) return false;

    try {
        var id = uuidText(dummy.m_20148_());
        if (isCurrentlyAccepting(player, id)) return false;

        var temp = player.getTempdata();
        var pending = readString(temp, KEY_PENDING_DENY_UUID, "");
        if (pending === id) return true;

        var stored = player.getStoreddata();
        var lastAccepted = readString(
            stored,
            KEY_LAST_ACCEPTED_UUID,
            ""
        );
        var now = System.currentTimeMillis();
        var cooldownUntil = readNumber(
            stored,
            KEY_COOLDOWN_UNTIL,
            0
        );
        return now < cooldownUntil && id !== lastAccepted;
    } catch (err) {
        return false;
    }
}


/*
 * ============================================================
 * MAIN PLAYER TICK
 * ============================================================
 *
 * Install this as a CustomNPCs PLAYER script.
 * Enable: Tick, DamagedEntity, Kill (and/or KilledEntity)
 */

function tick(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var temp = player.getTempdata();
        var now = System.currentTimeMillis();

        var mcPlayer = resolveMcPlayer(player);
        if (mcPlayer == null) return;

        var playerData = loadPlayerData(mcPlayer);
        if (playerData == null) return;

        var status = playerData.getStatus();
        if (status == null) return;

        var dummyUUID = getActiveDummyUUID(status);
        var pendingDeny = readString(
            temp,
            KEY_PENDING_DENY_UUID,
            ""
        );
        var busy = dummyUUID != null || pendingDeny !== "";

        var nextCheck = readNumber(temp, KEY_NEXT_CHECK, 0);
        var interval = busy ? CHECK_ACTIVE_MS : CHECK_IDLE_MS;
        if (now < nextCheck) return;

        temp.put(
            KEY_NEXT_CHECK,
            "" + (now + interval)
        );

        if (pendingDeny !== "") {
            processPendingDeny(
                player,
                mcPlayer,
                playerData,
                now
            );
        }

        dummyUUID = getActiveDummyUUID(status);
        if (dummyUUID == null) {
            if (pendingDeny === "") {
                clearActiveDummyTempState(player);
            }
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
 * ============================================================
 * COMBAT GUARDS
 * ============================================================
 */

function damagedEntity(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var dummy = resolveVictimMc(event);
        if (!shouldBlockDummyCombat(player, dummy)) return;

        hardenDummy(dummy);

        try { event.damage = 0; } catch (e1) {}
        try {
            if (event.setCanceled) event.setCanceled(true);
        } catch (e2) {}

        if (shouldForceDenyOnHit(player, dummy)) {
            var mcPlayer = resolveMcPlayer(player);
            var playerData = loadPlayerData(mcPlayer);
            if (playerData != null) {
                var stored = player.getStoreddata();
                var now = System.currentTimeMillis();
                var cooldownUntil = readNumber(
                    stored,
                    KEY_COOLDOWN_UNTIL,
                    0
                );
                denyShadowDummySummon(
                    player,
                    mcPlayer,
                    playerData,
                    dummy.m_20148_(),
                    Math.max(0, cooldownUntil - now),
                    now
                );
            }
        }
    } catch (err) {}
}

function handleBlockedDummyKill(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var dummy = resolveVictimMc(event);
        if (!isShadowDummyEntity(dummy)) return;

        var shouldRevert = shouldBlockDummyCombat(player, dummy);
        var mcPlayer = resolveMcPlayer(player);
        var playerData = loadPlayerData(mcPlayer);
        if (playerData == null) return;

        var status = playerData.getStatus();
        var id = uuidText(dummy.m_20148_());

        if (shouldRevert) {
            /*
             * DMZ already incremented kill count in LivingDeath.
             * Roll it back for blocked / pre-accept kills.
             */
            try {
                var temp = player.getTempdata();
                var snapshot = readNumber(
                    temp,
                    KEY_KILLCOUNT_SNAPSHOT,
                    -1
                );
                var current = Number(status.getShadowDummyKillCount());
                if (snapshot >= 0 && current > snapshot) {
                    status.setShadowDummyKillCount(snapshot);
                } else if (current > 0) {
                    status.setShadowDummyKillCount(current - 1);
                }
            } catch (countErr) {}

            try {
                ShadowDummyPacket.clearPlayerShadowDummy(
                    mcPlayer,
                    playerData
                );
            } catch (clearErr) {}

            syncPlayerStats(mcPlayer);
            clearActiveDummyTempState(player);
            markPendingDeny(
                player,
                id,
                System.currentTimeMillis()
            );

            sendLimitedMessage(
                player,
                "§5[Shadow Dummy] §cBlocked Shadow Dummy kills do not count.",
                System.currentTimeMillis()
            );
        }
    } catch (err) {}
}

function kill(event) {
    handleBlockedDummyKill(event);
}

function killedEntity(event) {
    handleBlockedDummyKill(event);
}

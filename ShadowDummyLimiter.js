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
 * Use unicode escapes for Minecraft colors.
 * Literal section-sign characters often break in CNPC scripts.
 */
var C = "\u00A7";


/*
 * ============================================================
 * SETTINGS
 * ============================================================
 *
 * Spawn-second kill race:
 * DMZ adds the dummy already tagged + stat-copied, but player
 * scripts only run on later ticks. Melee/Ki can kill it before
 * Tick/DamagedEntity ever see it (Ki often does not resolve as
 * a Player source for damagedEntity).
 *
 * Fix:
 * 1) Optional Forge tab (ShadowDummyForgeProtect.js) locks the
 *    dummy inside addFreshEntity and cancels hurt/damage
 * 2) Keep invulnerable + heal for SPAWN_PROTECT_MS after accept
 * 3) damagedEntity / kill still act as backups
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
 * While a dummy is pending / protected, check every tick.
 */
var CHECK_ACTIVE_MS =
    0;

/*
 * God-mode + heal window after the dummy joins / is accepted.
 */
var SPAWN_PROTECT_MS =
    3000;

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
 * ============================================================
 * STORED / TEMP / NBT KEYS
 * ============================================================
 */

var KEY_COOLDOWN_UNTIL =
    "dmz_minigame_shadow_dummy_cooldown_until";

var KEY_LAST_ACCEPTED_UUID =
    "dmz_minigame_shadow_dummy_last_accepted_uuid";

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

var KEY_PENDING_DENY_UUID =
    "dmz_minigame_shadow_dummy_pending_deny_uuid";

var KEY_PENDING_DENY_UNTIL =
    "dmz_minigame_shadow_dummy_pending_deny_until";

var KEY_KILLCOUNT_SNAPSHOT =
    "dmz_minigame_shadow_dummy_killcount_snapshot";

var TAG_PLAYER_SHADOW =
    "dmz_player_shadow";

var TAG_SPAWN_PROTECT =
    "dmz_minigame_spawn_protect";

var TAG_SPAWN_PROTECT_UNTIL =
    "dmz_minigame_spawn_protect_until";

var NBT_LIMITER_LOCKED =
    "dmz_shadow_limiter_locked";


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

function uuidText(value) {
    try {
        if (value == null) {
            return "";
        }
        return "" + value;
    } catch (err) {
        return "";
    }
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
        var nextMessage = readNumber(
            temp,
            KEY_MESSAGE_COOLDOWN,
            0
        );

        if (now < nextMessage) {
            return;
        }

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
 * ENTITY HELPERS
 * ============================================================
 */

function resolveMcPlayer(player) {
    try {
        if (player.getMCEntity) {
            return player.getMCEntity();
        }
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

function isShadowDummyEntity(entity) {
    try {
        return entity != null &&
            ShadowDummyEntity.class.isInstance(entity);
    } catch (err) {
        return false;
    }
}

function isPlayerShadowDummy(entity) {
    if (!isShadowDummyEntity(entity)) {
        return false;
    }

    try {
        return entity.getPersistentData()
            .m_128471_(TAG_PLAYER_SHADOW) === true;
    } catch (err) {
        return false;
    }
}

function getActiveDummyUUID(status) {
    try {
        if (
            status == null ||
            !status.hasActiveShadowDummy()
        ) {
            return null;
        }
        return status.getActiveShadowDummyUUID();
    } catch (err) {
        return null;
    }
}

function findShadowDummy(mcPlayer, dummyUUID) {
    if (mcPlayer == null || dummyUUID == null) {
        return null;
    }

    try {
        var server = mcPlayer.m_20194_();
        if (server == null) {
            return null;
        }

        var levels = server.m_129785_();
        var iterator = levels.iterator();

        while (iterator.hasNext()) {
            var level = iterator.next();
            if (level == null) {
                continue;
            }

            var entity = level.m_8791_(dummyUUID);
            if (isShadowDummyEntity(entity)) {
                return entity;
            }
        }
    } catch (err) {}

    return null;
}

function resolveVictimEntity(event) {
    try {
        if (event.target != null) {
            return event.target;
        }
    } catch (e1) {}
    try {
        if (event.entity != null) {
            return event.entity;
        }
    } catch (e2) {}
    return null;
}

function resolveVictimMc(event) {
    try {
        var wrapped = resolveVictimEntity(event);
        if (wrapped == null) {
            return null;
        }
        if (wrapped.getMCEntity) {
            return wrapped.getMCEntity();
        }
        return wrapped;
    } catch (err) {
        return null;
    }
}


/*
 * ============================================================
 * SPAWN PROTECTION / HARDEN
 * ============================================================
 */

function setDummyInvulnerable(dummy, enabled) {
    if (dummy == null) {
        return;
    }

    try {
        dummy.m_20331_(enabled === true);
        return;
    } catch (err1) {}

    try {
        dummy.setInvulnerable(enabled === true);
    } catch (err2) {}
}

function bumpDummyHurtInvuln(dummy) {
    if (dummy == null) {
        return;
    }

    try {
        dummy.f_19802_ = 40;
        return;
    } catch (err1) {}

    try {
        dummy.invulnerableTime = 40;
    } catch (err2) {}
}

function setDummyNoAi(dummy, enabled) {
    if (dummy == null) {
        return;
    }

    try {
        dummy.m_21557_(enabled === true);
        return;
    } catch (err1) {}

    try {
        dummy.setNoAi(enabled === true);
    } catch (err2) {}
}

function clearDummyTarget(dummy) {
    if (dummy == null) {
        return;
    }

    try {
        dummy.m_6710_(null);
        return;
    } catch (err1) {}

    try {
        dummy.setTarget(null);
    } catch (err2) {}
}

function fullyHealDummy(dummy) {
    if (dummy == null) {
        return;
    }

    try {
        dummy.m_21153_(dummy.m_21233_());
        return;
    } catch (err1) {}

    try {
        dummy.setHealth(dummy.getMaxHealth());
    } catch (err2) {}
}

function grantSpawnProtection(dummy, untilMs) {
    if (dummy == null) {
        return;
    }

    var until = Number(untilMs);
    if (isNaN(until) || !isFinite(until)) {
        until = System.currentTimeMillis() + SPAWN_PROTECT_MS;
    }

    setDummyInvulnerable(dummy, true);
    bumpDummyHurtInvuln(dummy);
    setDummyNoAi(dummy, true);
    clearDummyTarget(dummy);
    fullyHealDummy(dummy);

    try {
        var persistent = dummy.getPersistentData();
        persistent.m_128379_(TAG_SPAWN_PROTECT, true);
        persistent.m_128356_(TAG_SPAWN_PROTECT_UNTIL, until);
        persistent.m_128379_(NBT_LIMITER_LOCKED, true);
    } catch (tagErr) {}
}

function clearSpawnProtection(dummy) {
    if (dummy == null) {
        return;
    }

    setDummyInvulnerable(dummy, false);
    setDummyNoAi(dummy, false);

    try {
        var persistent = dummy.getPersistentData();
        persistent.m_128379_(TAG_SPAWN_PROTECT, false);
        persistent.m_128356_(TAG_SPAWN_PROTECT_UNTIL, 0);
        persistent.m_128379_(NBT_LIMITER_LOCKED, false);
    } catch (tagErr) {}
}

function isDummySpawnProtected(dummy, now) {
    if (dummy == null) {
        return false;
    }

    try {
        var persistent = dummy.getPersistentData();

        if (persistent.m_128471_(NBT_LIMITER_LOCKED) === true) {
            return true;
        }

        if (!persistent.m_128471_(TAG_SPAWN_PROTECT)) {
            return false;
        }

        var until = Number(
            persistent.m_128454_(TAG_SPAWN_PROTECT_UNTIL)
        );

        if (isNaN(until) || !isFinite(until)) {
            return false;
        }

        return Number(now) < until;
    } catch (err) {
        return false;
    }
}

function rememberPlayerProtect(player, dummyUUID, until) {
    if (player == null) {
        return;
    }

    try {
        var temp = player.getTempdata();
        temp.put(KEY_PROTECT_UNTIL, "" + until);
        if (dummyUUID != null) {
            temp.put(KEY_PROTECT_UUID, uuidText(dummyUUID));
        }
    } catch (err) {}
}

function protectJoinedShadowDummy(dummy) {
    if (!isPlayerShadowDummy(dummy)) {
        return false;
    }

    var until = System.currentTimeMillis() + SPAWN_PROTECT_MS;
    grantSpawnProtection(dummy, until);
    return true;
}

function cancelDamageOnProtectedDummy(dummy, forgeEvent) {
    if (!isPlayerShadowDummy(dummy)) {
        return false;
    }

    var now = System.currentTimeMillis();
    if (!isDummySpawnProtected(dummy, now)) {
        /*
         * Brand-new join may race tag reads; if still unmarked
         * protect but only for player-shadow dummies under 3s
         * of age if we can read tick count, else skip.
         */
        return false;
    }

    grantSpawnProtection(
        dummy,
        dummy.getPersistentData().m_128454_(TAG_SPAWN_PROTECT_UNTIL)
    );

    try {
        if (forgeEvent.setAmount) {
            forgeEvent.setAmount(0);
        }
    } catch (amtErr) {}

    try {
        if (forgeEvent.setCanceled) {
            forgeEvent.setCanceled(true);
        }
    } catch (cancelErr) {}

    return true;
}


/*
 * ============================================================
 * FORGE ENTRY POINTS (optional Forge script tab)
 * ============================================================
 *
 * Do NOT register MinecraftForge.EVENT_BUS from Player scripts.
 * That can interfere with other systems and is fragile under
 * Nashorn. Install ShadowDummyForgeProtect.js as a CNPC Forge
 * tab instead (or paste these handlers there).
 *
 * Player-tab protect still runs via Tick / DamagedEntity.
 */

function entityJoinLevelEvent(e) {
    try {
        var entity = null;
        if (e != null && e.entity != null) {
            entity = e.entity.getMCEntity
                ? e.entity.getMCEntity()
                : e.entity;
        } else if (
            e != null &&
            e.event != null &&
            e.event.getEntity
        ) {
            entity = e.event.getEntity();
        }
        protectJoinedShadowDummy(entity);
    } catch (err) {}
}

function livingHurtEvent(e) {
    try {
        var forge = e != null ? e.event : null;
        if (forge == null || forge.getEntity == null) {
            return;
        }
        if (cancelDamageOnProtectedDummy(forge.getEntity(), forge)) {
            try {
                if (e.setCanceled) {
                    e.setCanceled(true);
                }
            } catch (cErr) {}
        }
    } catch (err) {}
}

function livingDamageEvent(e) {
    livingHurtEvent(e);
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
        temp.remove(KEY_PROTECT_UNTIL);
        temp.remove(KEY_PROTECT_UUID);
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
        try {
            count = Number(status.getShadowDummyKillCount());
        } catch (e) {
            count = 0;
        }
        temp.put(KEY_KILLCOUNT_SNAPSHOT, "" + count);
    } catch (err) {}
}

function revertKillCountIfNeeded(
    player,
    mcPlayer,
    playerData,
    status
) {
    try {
        if (status == null) {
            return false;
        }

        var temp = player.getTempdata();
        var snapshot = readNumber(
            temp,
            KEY_KILLCOUNT_SNAPSHOT,
            -1
        );
        if (snapshot < 0) {
            return false;
        }

        var current = Number(status.getShadowDummyKillCount());
        if (current > snapshot) {
            status.setShadowDummyKillCount(snapshot);
            syncPlayerStats(mcPlayer);
            return true;
        }
    } catch (err) {}
    return false;
}

function maintainSpawnProtection(player, mcPlayer, now) {
    try {
        var temp = player.getTempdata();
        var until = readNumber(temp, KEY_PROTECT_UNTIL, 0);
        var protectUUID = readString(temp, KEY_PROTECT_UUID, "");

        if (until <= 0 || protectUUID === "") {
            return;
        }

        var uuidObj = protectUUID;
        try {
            var UUID = Java.type("java.util.UUID");
            uuidObj = UUID.fromString(protectUUID);
        } catch (uuidErr) {}

        var dummy = findShadowDummy(mcPlayer, uuidObj);
        if (dummy == null) {
            if (Number(now) >= until) {
                temp.remove(KEY_PROTECT_UNTIL);
                temp.remove(KEY_PROTECT_UUID);
            }
            return;
        }

        if (Number(now) >= until) {
            clearSpawnProtection(dummy);
            temp.remove(KEY_PROTECT_UNTIL);
            temp.remove(KEY_PROTECT_UUID);
            return;
        }

        grantSpawnProtection(dummy, until);
    } catch (err) {}
}


/*
 * ============================================================
 * BLOCK SUMMON DURING COOLDOWN
 * ============================================================
 */

function discardDummyEntity(dummy) {
    if (dummy == null) {
        return false;
    }

    try {
        grantSpawnProtection(
            dummy,
            System.currentTimeMillis() + 1000
        );
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

function denyShadowDummySummon(
    player,
    mcPlayer,
    playerData,
    dummyUUID,
    remainingMs,
    now
) {
    try {
        markPendingDeny(player, dummyUUID, now);
        snapshotKillCount(player, playerData.getStatus());

        var dummy = findShadowDummy(mcPlayer, dummyUUID);
        if (dummy != null) {
            discardDummyEntity(dummy);
        }

        try {
            ShadowDummyPacket.clearPlayerShadowDummy(
                mcPlayer,
                playerData
            );
        } catch (clearErr) {}

        syncPlayerStats(mcPlayer);
        clearActiveDummyTempState(player);

        var leftover = findShadowDummy(mcPlayer, dummyUUID);
        if (leftover == null) {
            clearPendingDeny(player);
        } else {
            discardDummyEntity(leftover);
        }

        sendLimitedMessage(
            player,
            C + "5[Shadow Dummy] " +
            C + "cYou can only summon one Shadow Dummy every 30 seconds. " +
            C + "eTime remaining: " +
            C + "f" +
            formatRemainingTime(remainingMs) +
            C + "e.",
            now
        );

        if (DEBUG) {
            player.message(
                C + "8[Shadow Dummy Debug] Blocked summon removed."
            );
        }
    } catch (err) {
        player.message(
            C + "c[Shadow Dummy Error] Could not remove the blocked dummy: " +
            err
        );
    }
}

function processPendingDeny(player, mcPlayer, playerData, now) {
    try {
        var temp = player.getTempdata();
        var pending = readString(temp, KEY_PENDING_DENY_UUID, "");
        if (pending === "") {
            return false;
        }

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
        var protectUntil = Number(now) + SPAWN_PROTECT_MS;

        /*
         * Stay locked through the whole rewrite + for the
         * post-spawn protect window. Do not unlock on accept.
         */
        grantSpawnProtection(dummy, protectUntil);
        rememberPlayerProtect(player, dummyUUID, protectUntil);

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
            persistent.m_128379_(TAG_PLAYER_SHADOW, true);
            persistent.m_128405_(
                "dmz_shadow_percent",
                SHADOW_DUMMY_PERCENT
            );
            persistent.m_128359_(
                "dmz_quest_owner",
                "" + mcPlayer.m_20148_()
            );
        } catch (tagErr) {}

        fullyHealDummy(dummy);
        grantSpawnProtection(dummy, protectUntil);
        rememberPlayerProtect(player, dummyUUID, protectUntil);
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
            C + "5[Shadow Dummy] " +
            C + "dShadow Dummy summoned."
        );
        player.message(
            C + "7Its maximum health and copied power are fixed at " +
            C + "f50%" +
            C + "7 of your normal stats."
        );
        player.message(
            C + "7You may summon another Shadow Dummy in " +
            C + "f30 seconds" +
            C + "7."
        );

        if (DEBUG) {
            var dummyMaxHealth = 0;
            var ownerMaxHealth = 0;
            try {
                dummyMaxHealth = Number(dummy.m_21233_());
                ownerMaxHealth = Number(mcPlayer.m_21233_());
            } catch (healthDebugErr) {}

            player.message(
                C + "8[Shadow Dummy Debug] Owner max health: " +
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
            C + "c[Shadow Dummy Error] Could not configure the dummy: " +
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

        var dummy = findShadowDummy(mcPlayer, dummyUUID);
        if (dummy != null) {
            var until = Number(now) + SPAWN_PROTECT_MS;
            grantSpawnProtection(dummy, until);
            rememberPlayerProtect(player, dummyUUID, until);
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
                    C + "8[Shadow Dummy Debug] Waiting for the dummy entity.",
                    now
                );
            }
            return;
        }

        /*
         * Arm cooldown before configure finishes so a mid-setup
         * death cannot be instantly re-summoned.
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
            C + "c[Shadow Dummy Error] Processing failed: " +
            err
        );
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
    if (!isShadowDummyEntity(dummy)) {
        return false;
    }

    var now = System.currentTimeMillis();
    if (isDummySpawnProtected(dummy, now)) {
        return true;
    }

    try {
        var stored = player.getStoreddata();
        var temp = player.getTempdata();
        var id = uuidText(dummy.m_20148_());
        var pending = readString(temp, KEY_PENDING_DENY_UUID, "");
        if (pending !== "" && pending === id) {
            return true;
        }

        if (isCurrentlyAccepting(player, id)) {
            return true;
        }

        var lastAccepted = readString(
            stored,
            KEY_LAST_ACCEPTED_UUID,
            ""
        );
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

function shouldForceDenyOnHit(player, dummy) {
    if (!isShadowDummyEntity(dummy)) {
        return false;
    }

    try {
        var id = uuidText(dummy.m_20148_());
        if (isCurrentlyAccepting(player, id)) {
            return false;
        }

        var temp = player.getTempdata();
        var pending = readString(temp, KEY_PENDING_DENY_UUID, "");
        if (pending === id) {
            return true;
        }

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
 * PLAYER SCRIPT ENTRY POINTS
 * ============================================================
 *
 * Install as a CustomNPCs PLAYER script (own tab).
 * Enable: Tick, DamagedEntity, Kill (and/or KilledEntity)
 *
 * For same-tick Ki kill protection, also install
 * ShadowDummyForgeProtect.js as a CNPC Forge script tab.
 */

function tick(event) {
    var player = event.player;
    if (player == null) {
        return;
    }

    try {
        var temp = player.getTempdata();
        var now = System.currentTimeMillis();
        var mcPlayer = resolveMcPlayer(player);
        if (mcPlayer == null) {
            return;
        }

        maintainSpawnProtection(player, mcPlayer, now);

        var playerData = loadPlayerData(mcPlayer);
        if (playerData == null) {
            return;
        }

        var status = playerData.getStatus();
        if (status == null) {
            return;
        }

        var dummyUUID = getActiveDummyUUID(status);
        var pendingDeny = readString(
            temp,
            KEY_PENDING_DENY_UUID,
            ""
        );
        var protectUntil = readNumber(temp, KEY_PROTECT_UNTIL, 0);
        var busy =
            dummyUUID != null ||
            pendingDeny !== "" ||
            Number(now) < protectUntil;

        var nextCheck = readNumber(temp, KEY_NEXT_CHECK, 0);
        var interval = busy ? CHECK_ACTIVE_MS : CHECK_IDLE_MS;
        if (now < nextCheck) {
            return;
        }

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
                /*
                 * Keep protect UUID cleanup on its own timer via
                 * maintainSpawnProtection; only clear process keys.
                 */
                try {
                    temp.remove(KEY_LAST_SEEN_UUID);
                    temp.remove(KEY_PROCESSING_UUID);
                } catch (clearErr) {}
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
            C + "c[Shadow Dummy Tick Error] " +
            err
        );
    }
}

function damagedEntity(event) {
    var player = event.player;
    if (player == null) {
        return;
    }

    try {
        var dummy = resolveVictimMc(event);
        if (!shouldBlockDummyCombat(player, dummy)) {
            return;
        }

        var until = System.currentTimeMillis() + SPAWN_PROTECT_MS;
        try {
            var persistent = dummy.getPersistentData();
            var taggedUntil = Number(
                persistent.m_128454_(TAG_SPAWN_PROTECT_UNTIL)
            );
            if (
                !isNaN(taggedUntil) &&
                isFinite(taggedUntil) &&
                taggedUntil > until
            ) {
                until = taggedUntil;
            }
        } catch (tagErr) {}

        grantSpawnProtection(dummy, until);

        try {
            event.damage = 0;
        } catch (e1) {}

        try {
            if (event.setCanceled) {
                event.setCanceled(true);
            }
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
    if (player == null) {
        return;
    }

    try {
        var dummy = resolveVictimMc(event);
        if (!isShadowDummyEntity(dummy)) {
            return;
        }

        var shouldRevert = shouldBlockDummyCombat(player, dummy);
        if (!shouldRevert) {
            /*
             * Also revert if the dummy still carried protect tags
             * at death (script saw the corpse after protect ended).
             */
            try {
                shouldRevert = dummy.getPersistentData()
                    .m_128471_(TAG_SPAWN_PROTECT) === true;
            } catch (tagErr) {}
        }

        if (!shouldRevert) {
            return;
        }

        var mcPlayer = resolveMcPlayer(player);
        var playerData = loadPlayerData(mcPlayer);
        if (playerData == null) {
            return;
        }

        var status = playerData.getStatus();
        var id = uuidText(dummy.m_20148_());

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
            C + "5[Shadow Dummy] " +
            C + "cBlocked Shadow Dummy kills do not count.",
            System.currentTimeMillis()
        );
    } catch (err) {}
}

function kill(event) {
    handleBlockedDummyKill(event);
}

function killedEntity(event) {
    handleBlockedDummyKill(event);
}

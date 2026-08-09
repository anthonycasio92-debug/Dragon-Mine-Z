/*
 * ============================================================
 * Shadow Dummy Forge Protect — DEPRECATED (use KubeJS)
 * ============================================================
 *
 * PREFERRED: kubejs/startup_scripts/shadow_dummy_protect_hook.js
 * and DISABLE CustomNPCs Global Forge Scripts (stops CNPC
 * EntityConstructing/Size NPE spam).
 *
 * Same-tick spawn protection for player shadow dummies.
 * Fallback: CustomNPCs GLOBAL FORGE script (own tab) with:
 *   - entityJoinLevelEvent
 *   - livingHurtEvent
 *   - livingDamageEvent
 *
 * Keep ShadowDummyLimiter.js as the Player tab for cooldown /
 * configure / damagedEntity. Do not register EVENT_BUS from
 * Player scripts.
 */

var ShadowDummyEntity = Java.type(
    "com.dragonminez.common.init.entities.ShadowDummyEntity"
);

var System = Java.type(
    "java.lang.System"
);

var SPAWN_PROTECT_MS = 3000;

var TAG_PLAYER_SHADOW = "dmz_player_shadow";
var TAG_SPAWN_PROTECT = "dmz_minigame_spawn_protect";
var TAG_SPAWN_PROTECT_UNTIL = "dmz_minigame_spawn_protect_until";
var NBT_LIMITER_LOCKED = "dmz_shadow_limiter_locked";

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

function protectJoinedShadowDummy(dummy) {
    if (!isPlayerShadowDummy(dummy)) {
        return false;
    }
    grantSpawnProtection(
        dummy,
        System.currentTimeMillis() + SPAWN_PROTECT_MS
    );
    return true;
}

function cancelDamageOnProtectedDummy(dummy, forgeEvent) {
    if (!isPlayerShadowDummy(dummy)) {
        return false;
    }

    var now = System.currentTimeMillis();
    if (!isDummySpawnProtected(dummy, now)) {
        return false;
    }

    try {
        grantSpawnProtection(
            dummy,
            dummy.getPersistentData()
                .m_128454_(TAG_SPAWN_PROTECT_UNTIL)
        );
    } catch (tagErr) {
        grantSpawnProtection(
            dummy,
            now + SPAWN_PROTECT_MS
        );
    }

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

function init(event) {
    try {
        print(
            "[ShadowDummyForgeProtect] Loaded — join/hurt protect for player shadow dummies."
        );
    } catch (err) {}
}

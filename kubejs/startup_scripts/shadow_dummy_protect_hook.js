/*
 * DBZ Legacy Reborn - Shadow Dummy Protect (KubeJS startup)
 *
 * Pure ASCII. Replaces CustomNPCs Global Forge script
 * ShadowDummyForgeProtect.js so CNPC forge scripts can stay OFF
 * (avoids CNPC EntityConstructing/Size NPE spam).
 *
 * Same-tick spawn protection for player shadow dummies.
 * Keep ShadowDummyLimiter.js as the CNPC Global PLAYER script.
 *
 * Requires a FULL server restart (startup ForgeEvents).
 */

var SPAWN_PROTECT_MS = 3000;
var TAG_PLAYER_SHADOW = "dmz_player_shadow";
var TAG_SPAWN_PROTECT = "dmz_minigame_spawn_protect";
var TAG_SPAWN_PROTECT_UNTIL = "dmz_minigame_spawn_protect_until";
var NBT_LIMITER_LOCKED = "dmz_shadow_limiter_locked";

console.info("[ShadowDummy Protect] startup hook evaluating...");

function loadClass(name) {
    try {
        return Java.loadClass(name);
    } catch (e1) {
        try {
            return Java.type(name);
        } catch (e2) {
            return null;
        }
    }
}

var ShadowDummyEntity = loadClass(
    "com.dragonminez.common.init.entities.ShadowDummyEntity"
);

function eventEntity(event) {
    try {
        return event.getEntity();
    } catch (e1) {
        try {
            return event.entity;
        } catch (e2) {
            return null;
        }
    }
}

function isShadowDummy(entity) {
    if (entity == null) return false;
    try {
        if (ShadowDummyEntity != null) {
            return ShadowDummyEntity.isInstance(entity);
        }
    } catch (e1) {
        try {
            if (ShadowDummyEntity != null && ShadowDummyEntity.class) {
                return ShadowDummyEntity.class.isInstance(entity);
            }
        } catch (e2) {}
    }
    try {
        return (
            String(entity.getClass().getName()).indexOf("ShadowDummyEntity") >=
            0
        );
    } catch (e3) {
        return false;
    }
}

function isPlayerShadowDummy(entity) {
    if (!isShadowDummy(entity)) return false;
    try {
        return entity.getPersistentData().getBoolean(TAG_PLAYER_SHADOW) === true;
    } catch (e1) {
        try {
            return entity.getPersistentData().m_128471_(TAG_PLAYER_SHADOW) === true;
        } catch (e2) {
            return false;
        }
    }
}

function setInvulnerable(dummy, enabled) {
    try {
        dummy.setInvulnerable(enabled === true);
        return;
    } catch (e1) {}
    try {
        dummy.m_20331_(enabled === true);
    } catch (e2) {}
}

function bumpHurtInvuln(dummy) {
    try {
        dummy.invulnerableTime = 40;
        return;
    } catch (e1) {}
    try {
        dummy.f_19802_ = 40;
    } catch (e2) {}
}

function setNoAi(dummy, enabled) {
    try {
        dummy.setNoAi(enabled === true);
        return;
    } catch (e1) {}
    try {
        dummy.m_21557_(enabled === true);
    } catch (e2) {}
}

function clearTarget(dummy) {
    try {
        dummy.setTarget(null);
        return;
    } catch (e1) {}
    try {
        dummy.m_6710_(null);
    } catch (e2) {}
}

function fullyHeal(dummy) {
    try {
        dummy.setHealth(dummy.getMaxHealth());
        return;
    } catch (e1) {}
    try {
        dummy.m_21153_(dummy.m_21233_());
    } catch (e2) {}
}

function grantSpawnProtection(dummy, untilMs) {
    if (dummy == null) return;
    var until = Number(untilMs);
    if (isNaN(until) || !isFinite(until)) {
        until = Date.now() + SPAWN_PROTECT_MS;
    }

    setInvulnerable(dummy, true);
    bumpHurtInvuln(dummy);
    setNoAi(dummy, true);
    clearTarget(dummy);
    fullyHeal(dummy);

    try {
        var p = dummy.getPersistentData();
        try {
            p.putBoolean(TAG_SPAWN_PROTECT, true);
            p.putLong(TAG_SPAWN_PROTECT_UNTIL, until);
            p.putBoolean(NBT_LIMITER_LOCKED, true);
        } catch (eMoj) {
            p.m_128379_(TAG_SPAWN_PROTECT, true);
            p.m_128356_(TAG_SPAWN_PROTECT_UNTIL, until);
            p.m_128379_(NBT_LIMITER_LOCKED, true);
        }
    } catch (e) {}
}

function isSpawnProtected(dummy, now) {
    if (dummy == null) return false;
    try {
        var p = dummy.getPersistentData();
        var locked = false;
        var protect = false;
        var until = 0;
        try {
            locked = p.getBoolean(NBT_LIMITER_LOCKED) === true;
            protect = p.getBoolean(TAG_SPAWN_PROTECT) === true;
            until = Number(p.getLong(TAG_SPAWN_PROTECT_UNTIL));
        } catch (e1) {
            locked = p.m_128471_(NBT_LIMITER_LOCKED) === true;
            protect = p.m_128471_(TAG_SPAWN_PROTECT) === true;
            until = Number(p.m_128454_(TAG_SPAWN_PROTECT_UNTIL));
        }
        if (locked) return true;
        if (!protect) return false;
        if (isNaN(until) || !isFinite(until)) return false;
        return Number(now) < until;
    } catch (e) {
        return false;
    }
}

function onJoin(event) {
    try {
        var level = null;
        try {
            level = event.getLevel();
        } catch (eL) {
            level = event.level;
        }
        try {
            if (level != null) {
                if (typeof level.isClientSide === "function") {
                    if (level.isClientSide()) return;
                } else if (level.clientSide) {
                    return;
                }
            }
        } catch (eC) {}

        var entity = eventEntity(event);
        if (!isPlayerShadowDummy(entity)) return;
        grantSpawnProtection(entity, Date.now() + SPAWN_PROTECT_MS);
    } catch (err) {}
}

function onHurt(event) {
    try {
        var entity = eventEntity(event);
        if (!isPlayerShadowDummy(entity)) return;

        var now = Date.now();
        if (!isSpawnProtected(entity, now)) return;

        try {
            var until = Number(
                entity.getPersistentData().getLong(TAG_SPAWN_PROTECT_UNTIL)
            );
            grantSpawnProtection(
                entity,
                isNaN(until) ? now + SPAWN_PROTECT_MS : until
            );
        } catch (eRe) {
            grantSpawnProtection(entity, now + SPAWN_PROTECT_MS);
        }

        try {
            event.setAmount(0);
        } catch (eAmt) {
            try {
                event.amount = 0;
            } catch (eAmt2) {}
        }
        try {
            event.setCanceled(true);
        } catch (eCancel) {}
    } catch (err) {}
}

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.EntityJoinLevelEvent",
        onJoin
    );
    console.info("[ShadowDummy Protect] EntityJoinLevelEvent registered.");
} catch (err) {
    console.error("[ShadowDummy Protect] join register failed: " + err);
}

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.living.LivingHurtEvent",
        onHurt
    );
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.living.LivingDamageEvent",
        onHurt
    );
    console.info(
        "[ShadowDummy Protect] LivingHurt/Damage registered. Keep CNPC Global Forge Scripts DISABLED."
    );
} catch (err) {
    console.error("[ShadowDummy Protect] hurt register failed: " + err);
}

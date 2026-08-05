/*
 * DBZ Legacy Reborn - Hard-cap AttributesLib life steal at 5%.
 *
 * Apotheosis datapack/gem overrides only change NEW rolls. Existing gear
 * keeps old life_steal values in NBT. This script clamps the live attribute
 * every second so total life steal cannot exceed 5% in combat.
 *
 * Pure ASCII. Reload: /kubejs reload server_scripts
 */

var LIFE_STEAL_ATTR = "attributeslib:life_steal";
var CAP_MODIFIER_NAME = "dbz_lifesteal_cap";
var MAX_LIFE_STEAL = 0.05; /* 5% */
var TICK_INTERVAL = 20;

/* Stable UUID so the cap modifier is idempotent. */
var CAP_UUID = null;
var AttributeModifierClass = null;
var OperationClass = null;
var JavaReady = false;

console.info(
    "[DBZ Legacy Reborn] Life Steal hard cap loading (max " +
        MAX_LIFE_STEAL * 100 +
        "%)."
);

function ensureJava() {
    if (JavaReady) return AttributeModifierClass != null;
    JavaReady = true;
    try {
        var UUID = Java.loadClass("java.util.UUID");
        CAP_UUID = UUID.fromString("c4a1e8d2-5b73-4f0a-9d6e-2f8b1a0c7e55");
        AttributeModifierClass = Java.loadClass(
            "net.minecraft.world.entity.ai.attributes.AttributeModifier"
        );
        OperationClass = Java.loadClass(
            "net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation"
        );
        console.info("[Life Steal Cap] Java AttributeModifier ready.");
    } catch (err) {
        AttributeModifierClass = null;
        console.info(
            "[Life Steal Cap] Java AttributeModifier unavailable, using KubeJS API: " +
                err
        );
    }
    return AttributeModifierClass != null;
}

function getAttrInstance(entity) {
    try {
        return entity.getAttribute(LIFE_STEAL_ATTR);
    } catch (e1) {
        try {
            return entity.attributes.getInstance(
                Java.loadClass(
                    "net.minecraft.core.registries.BuiltInRegistries"
                ).ATTRIBUTE.get(LIFE_STEAL_ATTR)
            );
        } catch (e2) {
            return null;
        }
    }
}

function clampWithJava(entity) {
    if (!ensureJava()) return false;
    var inst = getAttrInstance(entity);
    if (inst == null) return false;

    try {
        inst.removeModifier(CAP_UUID);
    } catch (eRem) {}

    var value = 0;
    try {
        value = Number(inst.getValue());
    } catch (eVal) {
        return false;
    }

    if (!(value > MAX_LIFE_STEAL)) return false;

    try {
        var mod = new AttributeModifierClass(
            CAP_UUID,
            CAP_MODIFIER_NAME,
            MAX_LIFE_STEAL - value,
            OperationClass.ADDITION
        );
        try {
            inst.addTransientModifier(mod);
        } catch (eTrans) {
            inst.addPermanentModifier(mod);
        }
        return true;
    } catch (eAdd) {
        console.error("[Life Steal Cap] addModifier failed: " + eAdd);
        return false;
    }
}

function clampWithKubeJs(entity) {
    try {
        entity.removeAttribute(LIFE_STEAL_ATTR, CAP_MODIFIER_NAME);
    } catch (e1) {
        try {
            entity.removeAttributeModifier(LIFE_STEAL_ATTR, CAP_MODIFIER_NAME);
        } catch (e2) {}
    }

    var value = 0;
    try {
        var inst = entity.getAttribute(LIFE_STEAL_ATTR);
        if (inst == null) return false;
        value = Number(inst.getValue());
    } catch (e3) {
        try {
            value = Number(entity.getAttributeValue(LIFE_STEAL_ATTR));
        } catch (e4) {
            return false;
        }
    }

    if (!(value > MAX_LIFE_STEAL)) return false;

    try {
        entity.modifyAttribute(
            LIFE_STEAL_ATTR,
            CAP_MODIFIER_NAME,
            MAX_LIFE_STEAL - value,
            "addition"
        );
        return true;
    } catch (e5) {
        return false;
    }
}

function clampLifeSteal(entity) {
    if (entity == null) return false;
    if (clampWithJava(entity)) return true;
    return clampWithKubeJs(entity);
}

PlayerEvents.loggedIn(function (event) {
    try {
        if (clampLifeSteal(event.player)) {
            console.info(
                "[Life Steal Cap] Clamped " +
                    event.player.username +
                    " to " +
                    MAX_LIFE_STEAL * 100 +
                    "% on login."
            );
            try {
                event.player.tell(
                    "\u00A77Life Steal capped at 5% on this server."
                );
            } catch (eTell) {}
        }
    } catch (err) {
        console.error("[Life Steal Cap] login error: " + err);
    }
});

PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        if (player.age % TICK_INTERVAL !== 0) return;
        clampLifeSteal(player);
    } catch (err) {}
});

console.info(
    "[DBZ Legacy Reborn] Life Steal hard-capped at " +
        MAX_LIFE_STEAL * 100 +
        "% (runtime clamp)."
);

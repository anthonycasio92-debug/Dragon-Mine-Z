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
var CAP_MODIFIER_ID = "dbz_legacy:lifesteal_cap";
var MAX_LIFE_STEAL = 0.05; /* 5% */
var TICK_INTERVAL = 20;

console.info(
    "[DBZ Legacy Reborn] Life Steal hard cap loading (max " +
        MAX_LIFE_STEAL * 100 +
        "%)."
);

function removeCapModifier(entity) {
    try {
        entity.removeAttribute(LIFE_STEAL_ATTR, CAP_MODIFIER_ID);
        return true;
    } catch (e1) {
        try {
            entity.removeAttributeModifier(LIFE_STEAL_ATTR, CAP_MODIFIER_ID);
            return true;
        } catch (e2) {
            return false;
        }
    }
}

function readLifeSteal(entity) {
    try {
        var inst = entity.getAttribute(LIFE_STEAL_ATTR);
        if (inst != null) {
            try {
                return Number(inst.getValue());
            } catch (eGet) {
                return Number(inst.value);
            }
        }
    } catch (e1) {}
    try {
        return Number(entity.getAttributeValue(LIFE_STEAL_ATTR));
    } catch (e2) {}
    return 0;
}

function applyCapModifier(entity, amount) {
    try {
        entity.modifyAttribute(
            LIFE_STEAL_ATTR,
            CAP_MODIFIER_ID,
            amount,
            "addition"
        );
        return true;
    } catch (e1) {
        try {
            entity.modifyAttribute(
                LIFE_STEAL_ATTR,
                CAP_MODIFIER_ID,
                amount,
                "ADDITION"
            );
            return true;
        } catch (e2) {
            return false;
        }
    }
}

function clampLifeSteal(entity) {
    if (entity == null) return false;
    removeCapModifier(entity);
    var value = readLifeSteal(entity);
    if (!(value > MAX_LIFE_STEAL)) return false;
    var delta = MAX_LIFE_STEAL - value;
    return applyCapModifier(entity, delta);
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
        "% (runtime clamp + Affix/Gem datapack nerfs)."
);

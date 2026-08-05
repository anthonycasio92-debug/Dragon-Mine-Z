/*
 * DBZ Legacy Reborn - Combat event backup caps for healing attrs.
 *
 * Pure ASCII. ForgeEvents only work from startup_scripts on this KubeJS build.
 *
 * 1) LivingHealEvent: clamp Healing Received to +5% (max factor 1.05)
 * 2) LivingHurtEvent: clamp Overheal absorption gain to 5% of damage
 *
 * AttributesLib applies these at HIGH priority; we correct afterward.
 * Requires a full restart (or /kubejs reload startup_scripts) once.
 */

var MAX_HEALING_RECEIVED = 1.05;
var MAX_OVERHEAL = 0.05;
var MAX_LIFE_STEAL = 0.0; /* Apotheosis life steal removed */

console.info("[Heal Cap] startup heal/overheal event hooks evaluating...");

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

function isPlayerEntity(entity) {
    if (entity == null) return false;
    try {
        if (entity.isPlayer && entity.isPlayer()) return true;
    } catch (e1) {}
    try {
        if (entity.player) return true;
    } catch (e2) {}
    try {
        var cn = String(entity.getClass().getName());
        if (cn.indexOf("ServerPlayer") >= 0 || cn.indexOf("Player") >= 0) {
            return true;
        }
    } catch (e3) {}
    return false;
}

function readAttr(entity, attrId, fallback) {
    try {
        return Number(entity.getAttributeValue(attrId));
    } catch (e1) {
        try {
            var inst = entity.getAttribute(attrId);
            if (inst != null) return Number(inst.getValue());
        } catch (e2) {}
    }
    return fallback;
}

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.living.LivingHealEvent",
        function (event) {
            try {
                var entity = eventEntity(event);
                if (!isPlayerEntity(entity)) return;

                var factor = readAttr(
                    entity,
                    "attributeslib:healing_received",
                    1.0
                );
                if (!(factor > MAX_HEALING_RECEIVED)) return;

                var amount = 0;
                try {
                    amount = Number(event.getAmount());
                } catch (eAmt) {
                    amount = Number(event.amount);
                }
                if (!(amount > 0)) return;

                var scaled = amount * (MAX_HEALING_RECEIVED / factor);
                try {
                    event.setAmount(scaled);
                } catch (eSet) {
                    try {
                        event.amount = scaled;
                    } catch (eSet2) {}
                }
            } catch (err) {}
        }
    );
    console.info(
        "[Heal Cap] LivingHealEvent backup registered (Healing Received max +5%)."
    );
} catch (err) {
    console.error("[Heal Cap] LivingHealEvent register failed: " + err);
}

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.living.LivingHurtEvent",
        function (event) {
            try {
                var source = null;
                try {
                    source = event.getSource();
                } catch (eS) {
                    source = event.source;
                }
                if (source == null) return;

                var attacker = null;
                try {
                    attacker = source.getEntity();
                } catch (eE) {
                    try {
                        attacker = source.entity;
                    } catch (eE2) {}
                }
                if (!isPlayerEntity(attacker)) return;

                var dmg = 0;
                try {
                    dmg = Number(event.getAmount());
                } catch (eD) {
                    dmg = Number(event.amount);
                }
                if (!(dmg > 0)) return;

                /*
                 * AttributesLib already applied life steal heal and overheal
                 * absorption. Undo anything above pack caps.
                 */
                var lifesteal = readAttr(
                    attacker,
                    "attributeslib:life_steal",
                    0
                );
                if (lifesteal > MAX_LIFE_STEAL) {
                    var undo = dmg * (lifesteal - MAX_LIFE_STEAL);
                    if (undo > 0) {
                        try {
                            var hp = Number(attacker.getHealth());
                            var nextHp = hp - undo;
                            if (nextHp < 1) nextHp = 1;
                            attacker.setHealth(nextHp);
                        } catch (eHp) {}
                    }
                }

                var overheal = readAttr(attacker, "attributeslib:overheal", 0);
                if (overheal > MAX_OVERHEAL) {
                    var excess = dmg * (overheal - MAX_OVERHEAL);
                    if (excess > 0) {
                        var abs = 0;
                        try {
                            abs = Number(attacker.getAbsorptionAmount());
                        } catch (eA) {
                            try {
                                abs = Number(attacker.absorptionAmount);
                            } catch (eA2) {
                                abs = 0;
                            }
                        }
                        var nextAbs = abs - excess;
                        if (nextAbs < 0) nextAbs = 0;
                        try {
                            attacker.setAbsorptionAmount(nextAbs);
                        } catch (eSet) {
                            try {
                                attacker.absorptionAmount = nextAbs;
                            } catch (eSet2) {}
                        }
                    }
                }
            } catch (err) {}
        }
    );
    console.info(
        "[Heal Cap] LivingHurtEvent backup registered (Life Steal=0%, Overheal max 5%)."
    );
} catch (err) {
    console.error("[Heal Cap] LivingHurtEvent register failed: " + err);
}

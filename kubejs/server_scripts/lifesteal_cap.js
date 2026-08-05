/*
 * DBZ Legacy Reborn - Hard-cap healing attributes.
 *
 * Caps live AttributesLib values every second so old gear/gems cannot
 * exceed the nerfed band:
 *   attributeslib:life_steal        max 0.05  (5%)
 *   attributeslib:overheal          max 0.05  (5%)
 *   attributeslib:healing_received  max 1.05  (base 1.0 + 5%)
 *
 * Pure ASCII. Reload: /kubejs reload server_scripts
 */

var TICK_INTERVAL = 20;

var CAPS = [
    {
        attr: "attributeslib:life_steal",
        max: 0.05,
        name: "dbz_lifesteal_cap",
        uuid: "c4a1e8d2-5b73-4f0a-9d6e-2f8b1a0c7e55"
    },
    {
        attr: "attributeslib:overheal",
        max: 0.05,
        name: "dbz_overheal_cap",
        uuid: "d5b2f9e3-6c84-501b-ae7f-309c2b1d8f66"
    },
    {
        attr: "attributeslib:healing_received",
        max: 1.05,
        name: "dbz_healing_received_cap",
        uuid: "e6c3a0f4-7d95-612c-bf80-41ad3c2e9077"
    }
];

var AttributeModifierClass = null;
var OperationClass = null;
var UUIDClass = null;
var JavaReady = false;
var UuidCache = {};

console.info(
    "[DBZ Legacy Reborn] Healing attribute hard caps loading (life steal / overheal / healing received)."
);

function ensureJava() {
    if (JavaReady) return AttributeModifierClass != null;
    JavaReady = true;
    try {
        UUIDClass = Java.loadClass("java.util.UUID");
        AttributeModifierClass = Java.loadClass(
            "net.minecraft.world.entity.ai.attributes.AttributeModifier"
        );
        OperationClass = Java.loadClass(
            "net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation"
        );
        for (var i = 0; i < CAPS.length; i++) {
            UuidCache[CAPS[i].name] = UUIDClass.fromString(CAPS[i].uuid);
        }
        console.info("[Heal Cap] Java AttributeModifier ready.");
    } catch (err) {
        AttributeModifierClass = null;
        console.info(
            "[Heal Cap] Java AttributeModifier unavailable, using KubeJS API: " +
                err
        );
    }
    return AttributeModifierClass != null;
}

function getAttrInstance(entity, attrId) {
    try {
        return entity.getAttribute(attrId);
    } catch (e1) {
        return null;
    }
}

function clampOneJava(entity, cap) {
    var inst = getAttrInstance(entity, cap.attr);
    if (inst == null) return false;
    var uuid = UuidCache[cap.name];
    try {
        inst.removeModifier(uuid);
    } catch (eRem) {}

    var value = 0;
    try {
        value = Number(inst.getValue());
    } catch (eVal) {
        return false;
    }
    if (!(value > cap.max)) return false;

    try {
        var mod = new AttributeModifierClass(
            uuid,
            cap.name,
            cap.max - value,
            OperationClass.ADDITION
        );
        try {
            inst.addTransientModifier(mod);
        } catch (eTrans) {
            inst.addPermanentModifier(mod);
        }
        return true;
    } catch (eAdd) {
        return false;
    }
}

function clampOneKube(entity, cap) {
    try {
        entity.removeAttribute(cap.attr, cap.name);
    } catch (e1) {
        try {
            entity.removeAttributeModifier(cap.attr, cap.name);
        } catch (e2) {}
    }

    var value = 0;
    try {
        var inst = entity.getAttribute(cap.attr);
        if (inst == null) return false;
        value = Number(inst.getValue());
    } catch (e3) {
        try {
            value = Number(entity.getAttributeValue(cap.attr));
        } catch (e4) {
            return false;
        }
    }
    if (!(value > cap.max)) return false;

    try {
        entity.modifyAttribute(cap.attr, cap.name, cap.max - value, "addition");
        return true;
    } catch (e5) {
        return false;
    }
}

function clampAll(entity) {
    if (entity == null) return false;
    var any = false;
    var useJava = ensureJava();
    for (var i = 0; i < CAPS.length; i++) {
        var ok = false;
        if (useJava) ok = clampOneJava(entity, CAPS[i]);
        if (!ok) ok = clampOneKube(entity, CAPS[i]);
        if (ok) any = true;
    }
    return any;
}

PlayerEvents.loggedIn(function (event) {
    try {
        if (clampAll(event.player)) {
            console.info(
                "[Heal Cap] Clamped healing attrs for " + event.player.username
            );
            try {
                event.player.tell(
                    "\u00A77Healing attributes capped (Life Steal / Overheal / Healing Received)."
                );
            } catch (eTell) {}
        }
    } catch (err) {
        console.error("[Heal Cap] login error: " + err);
    }
});

PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        if (player.age % TICK_INTERVAL !== 0) return;
        clampAll(player);
    } catch (err) {}
});

console.info(
    "[DBZ Legacy Reborn] Healing attribute hard caps active (LS/OH <=5%, Healing Received <=+5%)."
);
